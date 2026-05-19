from app.db.supabase_admin_client import get_supabase_admin_client
from app.db.supabase_client import get_supabase_client

from app.repositories import playerstats_repository


def _merge_user_row_with_stats(user: dict, stats_map: dict[str, dict[str, int]]) -> dict:
    uid = str(user["user_id"])
    s = stats_map.get(
        uid,
        {
            "elo": playerstats_repository.DEFAULT_STARTING_ELO,
            "wins": 0,
            "losses": 0,
        },
    )
    merged = {**user}
    merged["elo"] = s["elo"]
    merged["wins"] = s["wins"]
    merged["losses"] = s["losses"]
    return merged


def get_all_users():
    db = get_supabase_client()

    response = (
        db
        .table("users")
        .select("*")
        .execute()
    )

    rows = response.data or []
    if not rows:
        return []
    user_ids = [str(r["user_id"]) for r in rows]
    playerstats_repository.ensure_basketball_rows_for_user_ids(user_ids)
    stats_map = playerstats_repository.get_aggregated_stats_map_by_user_ids(user_ids)
    return [_merge_user_row_with_stats(r, stats_map) for r in rows]


def get_leaderboard(limit: int = 10, sport: str | None = None):
    """
    Leaderboard ranked by ELO.

    If `sport` is provided, rank by that sport's ELO (default 400 if missing).
    Otherwise, rank by the aggregated/max ELO across sports (current behavior).
    """
    users = get_all_users()

    if sport:
        sport_name = str(sport).strip()
        user_ids = [str(u["user_id"]) for u in users]
        elo_map = playerstats_repository.get_sport_elo_map_by_user_ids(
            user_ids=user_ids,
            sport=sport_name,
        )
        for u in users:
            uid = str(u["user_id"])
            u["elo"] = int(elo_map.get(uid, playerstats_repository.DEFAULT_STARTING_ELO))
        users.sort(key=lambda u: int(u.get("elo") or 0), reverse=True)
        return users[:limit]

    users.sort(key=lambda u: int(u.get("elo") or 0), reverse=True)
    return users[:limit]


def get_user_by_id(user_id: str):
    db = get_supabase_client()

    response = (
        db.table("users")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    if not response.data:
        return None
    user = response.data[0]
    uid = str(user["user_id"])
    playerstats_repository.ensure_basketball_rows_for_user_ids([uid])
    stats_map = playerstats_repository.get_aggregated_stats_map_by_user_ids([uid])
    return _merge_user_row_with_stats(user, stats_map)


def upsert_user(user_id: str, username: str | None = None, preferred_campus: str | None = None, phone_number: str | None = None):
    admin_client = get_supabase_admin_client()

    payload = {
        "user_id": user_id,
        "username": username,
        "preferred_campus": preferred_campus,
        "phone_number": phone_number
    }

    (
        admin_client
        .table("users")
        .upsert(payload, on_conflict="user_id")
        .execute()
    )

    return get_user_by_id(user_id)
