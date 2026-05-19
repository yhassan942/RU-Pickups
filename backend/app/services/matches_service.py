"""Business logic for match creation, state transitions, and team balancing."""

from datetime import datetime, timezone
from uuid import UUID

from app.db.supabase_client import get_supabase_client
from app.repositories.matches_repository import player_ids_and_elos


def get_matches() -> list[dict]:
    """Return all matches from persistence."""
    db = get_supabase_client()

    response = (
        db
        .table("matches")
        .select("*")
        .execute()
    )

    return response.data or []


def get_match_by_id(match_id: UUID) -> dict | None:
    """Return a single match by id, or None if it does not exist."""
    db = get_supabase_client()

    response = (
        db
        .table("matches")
        .select("*")
        .eq("match_id", str(match_id))
        .limit(1)
        .execute()
    )

    rows = response.data or []
    return rows[0] if rows else None


def get_active_match_by_lobby(lobby_id: UUID) -> dict | None:
    """Return the newest scheduled/in-progress match for a lobby."""
    db = get_supabase_client()

    response = (
        db
        .table("matches")
        .select("*")
        .eq("lobby_id", str(lobby_id))
        .in_("status", ["scheduled", "in_progress"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    rows = response.data or []
    return rows[0] if rows else None


def _get_lobby_host_user_id(lobby_id: UUID) -> str:
    """Resolve the host user id for the given lobby id."""
    db = get_supabase_client()
    response = (
        db
        .table("lobby")
        .select("host_user_id")
        .eq("lobby_id", str(lobby_id))
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise RuntimeError("Lobby not found.")
    return str(rows[0]["host_user_id"])


def create_match(lobby_id: UUID, user_id: str) -> dict:
    """Create the next scheduled match for a lobby if caller is the host.

    Returns an existing active match when one already exists.
    Raises:
        PermissionError: If caller is not the lobby host.
        RuntimeError: If lobby is missing or insert fails.
    """
    db = get_supabase_client()

    host_user_id = _get_lobby_host_user_id(lobby_id)
    if str(host_user_id) != str(user_id):
        raise PermissionError("Only host can create a match.")

    existing = get_active_match_by_lobby(lobby_id)
    if existing:
        return existing

    latest = (
        db
        .table("matches")
        .select("match_number")
        .eq("lobby_id", str(lobby_id))
        .order("match_number", desc=True)
        .limit(1)
        .execute()
    )

    latest_rows = latest.data or []
    next_match_number = (latest_rows[0]["match_number"] + 1) if latest_rows else 1

    created = (
        db
        .table("matches")
        .insert(
            {
                "lobby_id": str(lobby_id),
                "match_number": next_match_number,
                "status": "scheduled",
            }
        )
        .execute()
    )

    created_rows = created.data or []
    if not created_rows:
        raise RuntimeError("Failed to create match.")

    return created_rows[0]


def start_match(match_id: UUID, user_id: str) -> dict:
    """Mark a scheduled match as in-progress.

    Raises:
        PermissionError: If caller is not the lobby host.
        RuntimeError: If match does not exist, is completed, or update fails.
    """
    db = get_supabase_client()

    match = get_match_by_id(match_id)
    if not match:
        raise RuntimeError("Match not found.")

    host_user_id = _get_lobby_host_user_id(UUID(str(match["lobby_id"])))
    if str(host_user_id) != str(user_id):
        raise PermissionError("Only host can start the match.")

    current_status = str(match.get("status") or "").lower()
    if current_status == "in_progress":
        return match
    if current_status == "completed":
        raise RuntimeError("Match already completed.")

    response = (
        db
        .table("matches")
        .update(
            {
                "status": "in_progress",
                "started_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("match_id", str(match_id))
        .execute()
    )

    rows = response.data or []
    if not rows:
        raise RuntimeError("Failed to start match.")

    return rows[0]


def complete_match(match_id: UUID, user_id: str, winner_team: str | None = None) -> dict:
    """Mark a match as completed and optionally persist winner metadata.

    Raises:
        PermissionError: If caller is not the lobby host.
        RuntimeError: If match does not exist or update fails.
    """
    db = get_supabase_client()

    match = get_match_by_id(match_id)
    if not match:
        raise RuntimeError("Match not found.")

    host_user_id = _get_lobby_host_user_id(UUID(str(match["lobby_id"])))
    if str(host_user_id) != str(user_id):
        raise PermissionError("Only host can complete the match.")

    current_status = str(match.get("status") or "").lower()
    if current_status == "completed":
        return match

    payload: dict[str, str] = {
        "status": "completed",
        "ended_at": datetime.now(timezone.utc).isoformat(),
    }
    if winner_team:
        payload["winner_team"] = winner_team

    response = (
        db
        .table("matches")
        .update(payload)
        .eq("match_id", str(match_id))
        .execute()
    )

    rows = response.data or []
    if not rows:
        raise RuntimeError("Failed to complete match.")

    return rows[0]


def create_balanced_teams(match_players: list[str], match_sport: str):
    """Split players into two teams using a greedy Elo balancing strategy."""
    list_of_player_ids_and_elos = player_ids_and_elos(match_players=match_players, match_sport=match_sport)

    sorted_greatest_to_least_elos = sorted(
        list_of_player_ids_and_elos,
        key=lambda x: x[1],
        reverse=True
    )

    team_a = []
    team_b = []

    sum_a = 0
    sum_b = 0

    for player in sorted_greatest_to_least_elos:
        if sum_a <= sum_b:
            team_a.append(player)
            sum_a += player[1]
        else:
            team_b.append(player)
            sum_b += player[1]

    print("PLAYERS INPUT:", match_players)
    print("RPC RESULT:", list_of_player_ids_and_elos)

    return team_a, team_b