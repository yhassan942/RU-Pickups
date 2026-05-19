"""Data access for `player_stats` (per user / sport)."""
from uuid import UUID

from app.db.supabase_admin_client import get_supabase_admin_client
from app.db.supabase_client import get_supabase_client

# Default row created for each user (Basketball); must match DB trigger / schema default
DEFAULT_SPORT = "Basketball"
DEFAULT_STARTING_ELO = 400

db = get_supabase_admin_client()

def aggregate_stats_rows(rows: list[dict]) -> dict[str, int]:
    """Combine per-sport rows into headline wins, losses, and elo."""
    if not rows:
        return {"elo": DEFAULT_STARTING_ELO, "wins": 0, "losses": 0}
    total_wins = sum(int(r.get("wins") or 0) for r in rows)
    total_losses = sum(int(r.get("losses") or 0) for r in rows)
    max_elo = max((int(r.get("elo") or 0) for r in rows), default=0)
    return {"elo": max_elo, "wins": total_wins, "losses": total_losses}


def get_aggregated_stats_map_by_user_ids(user_ids: list[str]) -> dict[str, dict[str, int]]:
    """
    Returns map: user_id -> { elo, wins, losses } aggregated from all sport rows
    in player_stats for each user.
    """
    if not user_ids:
        return {}
    response = (
        db.table("player_stats")
        .select("user_id,wins,losses,elo")
        .in_("user_id", user_ids)
        .execute()
    )
    grouped: dict[str, list[dict]] = {}
    for row in response.data or []:
        uid = str(row.get("user_id"))
        grouped.setdefault(uid, []).append(row)
    return {uid: aggregate_stats_rows(rows) for uid, rows in grouped.items()}


def get_sport_elo_map_by_user_ids(*, user_ids: list[str], sport: str) -> dict[str, int]:
    """
    Returns map: user_id -> elo for a specific sport.

    If a user has no row for that sport, they are omitted from the map
    (callers should default to DEFAULT_STARTING_ELO).
    """
    if not user_ids:
        return {}
    db = get_supabase_client()
    response = (
        db.table("player_stats")
        .select("user_id,elo")
        .in_("user_id", user_ids)
        .eq("sport", sport)
        .execute()
    )
    out: dict[str, int] = {}
    for row in response.data or []:
        uid = str(row.get("user_id"))
        try:
            out[uid] = int(row.get("elo") or DEFAULT_STARTING_ELO)
        except (TypeError, ValueError):
            out[uid] = DEFAULT_STARTING_ELO
    return out


def get_all_player_stats() -> list[dict]:
    """Raw rows from player_stats (all columns)."""
    response = db.table("player_stats").select("*").execute()
    return response.data or []


def get_sport_stats_rows_for_user(user_id: str) -> list[dict]:
    """Per-sport ELO and record for one user (columns that exist on player_stats)."""
    db = get_supabase_client()
    response = (
        db.table("player_stats")
        .select("sport,elo,wins,losses")
        .eq("user_id", str(user_id).strip())
        .execute()
    )
    return response.data or []


def ensure_basketball_rows_for_user_ids(user_ids: list[str]) -> None:
    """
    Insert a Basketball player_stats row (elo 400, 0W / 0L) for any user_id that
    does not have one. Uses the service role so this works even when signup DB
    trigger did not run or RLS blocked the insert.
    """
    if not user_ids:
        return
    admin = get_supabase_admin_client()
    if admin is None:
        return
    resp = (
        admin.table("player_stats")
        .select("user_id")
        .in_("user_id", user_ids)
        .eq("sport", DEFAULT_SPORT)
        .execute()
    )
    have = {str(r["user_id"]) for r in (resp.data or [])}
    missing = [uid for uid in user_ids if uid not in have]
    for uid in missing:
        admin.table("player_stats").insert(
            {
                "user_id": uid,
                "sport": DEFAULT_SPORT,
                "elo": DEFAULT_STARTING_ELO,
                "wins": 0,
                "losses": 0,
            }
        ).execute()

def process_match_player_stats_in_db(winner_ids: list[str], loser_ids: list[str], sport: str):
    db.rpc("process_match", {
        "p_winner_ids": winner_ids,
        "p_loser_ids": loser_ids,
        "p_sport": sport
    }).execute()