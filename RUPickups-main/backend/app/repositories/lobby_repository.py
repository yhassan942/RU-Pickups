from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.core.lobby_unlock import hash_lobby_password
from app.db.supabase_client import get_supabase_client
from app.db.supabase_admin_client import get_supabase_admin_client
from app.models.lobby import LobbyCreate, LobbyUpdate
from app.repositories import playerstats_repository


def _normalize_min_elo(row: dict) -> None:
    v = row.get("min_elo")
    try:
        row["min_elo"] = int(v) if v is not None else 0
    except (TypeError, ValueError):
        row["min_elo"] = 0


def _enrich_lobby_row_with_participant_average_elo(row: dict) -> None:
    """Average ELO across host + all lobby_participants for this lobby's sport."""
    _normalize_min_elo(row)
    db = get_supabase_client()
    lobby_id = str(row["lobby_id"])
    host_id = str(row.get("host_user_id") or "")
    sport = str(row.get("sport") or playerstats_repository.DEFAULT_SPORT)
    p_resp = (
        db.table("lobby_participants")
        .select("player_id")
        .eq("lobby_id", lobby_id)
        .execute()
    )
    players: set[str] = {str(r["player_id"]) for r in (p_resp.data or [])}
    if host_id:
        players.add(host_id)
    if not players:
        row["participant_average_elo"] = None
        return
    elo_map = playerstats_repository.get_sport_elo_map_by_user_ids(
        user_ids=list(players),
        sport=sport,
    )
    elos: list[int] = []
    for uid in players:
        elos.append(int(elo_map.get(uid, playerstats_repository.DEFAULT_STARTING_ELO)))
    row["participant_average_elo"] = round(sum(elos) / len(elos), 1)


def _normalize_uuid(s: str) -> str:
    """Canonical UUID string so DB comparison matches (Postgres normalizes UUIDs)."""
    try:
        return str(UUID(str(s).strip()))
    except (TypeError, ValueError):
        return str(s).strip()


LOBBY_OVERLAP_WINDOW_MINUTES = 90
LOBBY_STALE_GRACE_MINUTES = 30


def _normalize_lobby_name(name: str) -> str:
    # trim + collapse internal whitespace + casefold
    return " ".join((name or "").split()).strip().casefold()


def _coerce_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value or "").strip()
        if text.endswith("Z"):
            text = f"{text[:-1]}+00:00"
        dt = datetime.fromisoformat(text)

    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def lobby_name_exists(*, lobby_name: str, exclude_lobby_id: UUID | None = None) -> bool:
    db = get_supabase_client()
    rows = db.table("lobby").select("lobby_id, lobby_name").execute().data or []
    target = _normalize_lobby_name(lobby_name)

    for row in rows:
        rid = str(row.get("lobby_id") or "")
        if exclude_lobby_id is not None and rid == str(exclude_lobby_id):
            continue
        existing = _normalize_lobby_name(str(row.get("lobby_name") or ""))
        if existing == target:
            return True
    return False


def location_time_overlap_exists(
    *,
    location_id: UUID,
    scheduled_start_time: datetime,
    exclude_lobby_id: UUID | None = None,
) -> bool:
    db = get_supabase_client()
    rows = (
        db.table("lobby")
        .select("lobby_id, scheduled_start_time, status")
        .eq("location_id", str(location_id))
        .execute()
        .data
        or []
    )

    target_start = _coerce_datetime(scheduled_start_time)
    target_end = target_start + timedelta(minutes=LOBBY_OVERLAP_WINDOW_MINUTES)

    for row in rows:
        rid = str(row.get("lobby_id") or "")
        if exclude_lobby_id is not None and rid == str(exclude_lobby_id):
            continue

        status = str(row.get("status") or "").lower()
        if status in {"cancelled", "completed"}:
            continue

        raw_start = row.get("scheduled_start_time")
        if not raw_start:
            continue

        try:
            existing_start = _coerce_datetime(raw_start)
        except ValueError:
            continue

        existing_end = existing_start + timedelta(minutes=LOBBY_OVERLAP_WINDOW_MINUTES)

        # overlap rule: A starts before B ends and A ends after B starts
        if target_start < existing_end and target_end > existing_start:
            return True

    return False


def is_user_in_lobby(lobby_id: UUID, user_id: str) -> bool:
    db = get_supabase_client()
    uid = _normalize_uuid(user_id)
    for candidate in {str(user_id).strip(), uid}:
        resp = (
            db.table("lobby_participants")
            .select("player_id")
            .eq("lobby_id", str(lobby_id))
            .eq("player_id", candidate)
            .limit(1)
            .execute()
        )
        if resp.data:
            return True
    return False


def get_lobby_ids_for_participant(user_id: str) -> set[str]:
    db = get_supabase_client()
    uid = _normalize_uuid(user_id)
    seen: set[str] = set()
    for candidate in {str(user_id).strip(), uid}:
        resp = db.table("lobby_participants").select("lobby_id").eq("player_id", candidate).execute()
        for r in resp.data or []:
            lid = r.get("lobby_id")
            if lid is not None:
                seen.add(str(lid))
    return seen


def get_lobby_by_id(lobby_id: UUID) -> dict | None:
    cleanup_expired_unstarted_lobbies()
    db = get_supabase_client()
    response = db.table("lobby").select("*").eq("lobby_id", str(lobby_id)).execute()
    if not response.data or len(response.data) == 0:
        return None
    row = response.data[0]
    if not isinstance(row.get("lobby_name"), str) or not str(row.get("lobby_name", "")).strip():
        row["lobby_name"] = f"{row.get('sport') or 'Pickup'} lobby"
    _enrich_lobby_row_with_participant_average_elo(row)
    return row


def get_upcoming_lobbies_for_user(user_id: str):
    """
    Return "upcoming" lobbies for the current user.

    Business rule (per app UX):
    - A lobby is considered "upcoming" if its status is "open",
      regardless of whether the scheduled_start_time is in the past
      or future.

    1. Match current user's user_id to player_id in lobby_participants -> get lobby_ids.
    2. Fetch full lobby rows for those lobby_ids.
    3. Filter to rows where status == "open" and return.
    """

    cleanup_expired_unstarted_lobbies()
    db = get_supabase_admin_client()
    if db is None:
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY is required for /lobbies/my/upcoming. "
            "Set it in backend .env to read lobby participants."
        )
    current_user_id = str(user_id).strip()
    current_user_id_normalized = _normalize_uuid(current_user_id)

    # Step 1: Find all lobby_ids where the current user is a participant (player_id = current user_id)
    participants_resp = (
        db.table("lobby_participants")
        .select("lobby_id, player_id")
        .execute()
    )
    all_participant_rows = participants_resp.data or []
    my_lobby_ids = []
    for r in all_participant_rows:
        pid = r.get("player_id")
        if pid is None:
            continue
        pid_str = str(pid)
        # Match current user: exact string or normalized UUID
        if pid_str == current_user_id or pid_str == current_user_id_normalized:
            lid = r.get("lobby_id")
            if lid is not None:
                my_lobby_ids.append(str(lid))
    my_lobby_ids = list(dict.fromkeys(my_lobby_ids))

    if not my_lobby_ids:
        return []

    # Step 2: Get full lobby info for those lobby_ids
    lobbies_resp = (
        db.table("lobby")
        .select("*")
        .in_("lobby_id", my_lobby_ids)
        .execute()
    )
    all_rows = lobbies_resp.data or []
    # Only keep lobbies whose status is "open" (case-insensitive)
    rows = [
        r
        for r in all_rows
        if str(r.get("status", "")).lower() == "open"
    ]

    # Sort by scheduled_start_time (if present) for a sensible order
    rows.sort(key=lambda r: r.get("scheduled_start_time") or "")

    # Add participant_count and backfill lobby_name
    lobby_ids = [str(r["lobby_id"]) for r in rows if r.get("lobby_id")]
    participant_counts = {}
    if lobby_ids:
        p_resp = (
            db.table("lobby_participants")
            .select("lobby_id, player_id")
            .in_("lobby_id", lobby_ids)
            .execute()
        )
        for r in p_resp.data or []:
            lid = str(r.get("lobby_id"))
            if not lid:
                continue
            entry = participant_counts.setdefault(lid, {"players": set(), "count": 0})
            pid = str(r.get("player_id"))
            if pid and pid not in entry["players"]:
                entry["players"].add(pid)
                entry["count"] += 1
    for row in rows:
        _normalize_min_elo(row)
        name = row.get("lobby_name")
        if not isinstance(name, str) or not name.strip():
            row["lobby_name"] = f"{row.get('sport') or 'Pickup'} lobby"
        lid = str(row.get("lobby_id") or "")
        host_id = str(row.get("host_user_id") or "")
        entry = participant_counts.get(lid)
        count = int(entry["count"]) if entry else 0
        if host_id and (not entry or host_id not in entry.get("players", set())):
            count += 1
        row["participant_count"] = count

    return rows


def get_all_lobbies():
    cleanup_expired_unstarted_lobbies()
    db = get_supabase_client()

    response = (
        db
        .table("lobby")
        .select("*")
        .execute()
    )

    rows = response.data or []

    lobby_ids: list[str] = [str(row["lobby_id"]) for row in rows if row.get("lobby_id")]

    participant_counts: dict[str, dict[str, set[str] | int]] = {}

    if lobby_ids:
        participants_resp = (
            db.table("lobby_participants")
            .select("lobby_id, player_id")
            .in_("lobby_id", lobby_ids)
            .execute()
        )
        participant_rows = participants_resp.data or []
        for r in participant_rows:
            lobby_id = str(r.get("lobby_id"))
            player_id = str(r.get("player_id"))
            if not lobby_id or not player_id:
                continue
            entry = participant_counts.setdefault(
                lobby_id, {"players": set(), "count": 0}
            )
            players = entry["players"]
            if isinstance(players, set) and player_id not in players:
                players.add(player_id)
                entry["count"] = int(entry["count"]) + 1

    # Backfill lobby_name for existing rows that predate the column
    for row in rows:
        _normalize_min_elo(row)
        name = row.get("lobby_name")
        if not isinstance(name, str) or not name.strip():
            sport = row.get("sport") or "Pickup"
            row["lobby_name"] = f"{sport} lobby"

        lobby_id = str(row.get("lobby_id") or "")
        host_id = str(row.get("host_user_id") or "")
        entry = participant_counts.get(lobby_id)
        count = int(entry["count"]) if entry and "count" in entry else 0
        players_set = entry["players"] if entry and "players" in entry else set()
        if host_id and (not isinstance(players_set, set) or host_id not in players_set):
            count += 1
        row["participant_count"] = count

    all_player_ids: set[str] = set()
    for row in rows:
        lobby_id = str(row.get("lobby_id") or "")
        host_id = str(row.get("host_user_id") or "")
        entry = participant_counts.get(lobby_id)
        players_set = set(entry["players"]) if entry and isinstance(entry.get("players"), set) else set()
        if host_id:
            players_set.add(host_id)
        all_player_ids.update(players_set)

    stats_map = playerstats_repository.get_aggregated_stats_map_by_user_ids(list(all_player_ids))

    for row in rows:
        lobby_id = str(row.get("lobby_id") or "")
        host_id = str(row.get("host_user_id") or "")
        entry = participant_counts.get(lobby_id)
        players_set = set(entry["players"]) if entry and isinstance(entry.get("players"), set) else set()
        if host_id:
            players_set.add(host_id)
        if not players_set:
            row["participant_average_elo"] = None
            continue
        elos: list[int] = []
        for uid in players_set:
            s = stats_map.get(uid, {"elo": playerstats_repository.DEFAULT_STARTING_ELO})
            elos.append(int(s["elo"]))
        row["participant_average_elo"] = round(sum(elos) / len(elos), 1)

    return rows


def cleanup_expired_unstarted_lobbies() -> int:
    """
    Delete stale lobbies that are 30+ minutes past start time when no started
    match exists for them.

    A match is considered started if its status is in_progress or completed.
    """
    reader = get_supabase_admin_client() or get_supabase_client()
    writer = get_supabase_admin_client() or reader
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=LOBBY_STALE_GRACE_MINUTES)

    try:
        rows = (
            reader.table("lobby")
            .select("lobby_id, status, scheduled_start_time")
            .execute()
            .data
            or []
        )
    except Exception:
        return 0

    candidate_ids: list[str] = []
    for row in rows:
        lobby_id = row.get("lobby_id")
        if not lobby_id:
            continue
        status = str(row.get("status") or "").lower()
        if status not in {"open", "closed", "full"}:
            continue
        raw_start = row.get("scheduled_start_time")
        if not raw_start:
            continue
        try:
            start_at = _coerce_datetime(raw_start)
        except ValueError:
            continue
        if start_at <= cutoff:
            candidate_ids.append(str(lobby_id))

    if not candidate_ids:
        return 0

    try:
        match_rows = (
            reader.table("matches")
            .select("lobby_id, status")
            .in_("lobby_id", candidate_ids)
            .execute()
            .data
            or []
        )
    except Exception:
        match_rows = []

    started_lobby_ids = {
        str(row.get("lobby_id"))
        for row in match_rows
        if str(row.get("status") or "").lower() in {"in_progress", "completed"}
    }
    deletable_ids = [lid for lid in candidate_ids if lid not in started_lobby_ids]
    if not deletable_ids:
        return 0

    try:
        writer.table("lobby").delete().in_("lobby_id", deletable_ids).execute()
    except Exception:
        return 0
    return len(deletable_ids)


def create_lobby(*, host_user_id: str, payload: LobbyCreate) -> dict:
    db = get_supabase_client()

    insert_data: dict = {
        "host_user_id": host_user_id,
        "lobby_name": payload.lobby_name,
        "scheduled_start_time": payload.scheduled_start_time.isoformat(),
        "location_id": str(payload.location_id) if payload.location_id else None,
        "is_public": payload.is_public,
        "max_players": payload.max_players,
        "sport": payload.sport,
        "campus": payload.campus,
        "min_elo": int(payload.min_elo),
    }
    if not payload.is_public and payload.lobby_password:
        insert_data["password_hash"] = hash_lobby_password(payload.lobby_password)

    # Remove keys with None values so database defaults can apply
    insert_data = {key: value for key, value in insert_data.items() if value is not None}

    response = db.table("lobby").insert(insert_data).execute()

    if not response.data:
        raise RuntimeError("Failed to create lobby")

    lobby_row = response.data[0]

    # Add host as a lobby participant
    try:
        db.table("lobby_participants").insert({
            "lobby_id": str(lobby_row["lobby_id"]),
            "player_id": host_user_id,
        }).execute()
    except Exception:
        pass

    _enrich_lobby_row_with_participant_average_elo(lobby_row)
    return lobby_row


def update_lobby(*, lobby_id: UUID, payload: LobbyUpdate) -> dict | None:
    db = get_supabase_client()
    update_data: dict = {}
    if payload.lobby_name is not None:
        update_data["lobby_name"] = payload.lobby_name
    if payload.sport is not None:
        update_data["sport"] = payload.sport
    if payload.campus is not None:
        update_data["campus"] = payload.campus
    if payload.scheduled_start_time is not None:
        update_data["scheduled_start_time"] = payload.scheduled_start_time.isoformat()
    if payload.location_id is not None:
        update_data["location_id"] = str(payload.location_id)
    if payload.is_public is not None:
        update_data["is_public"] = payload.is_public
    if payload.max_players is not None:
        update_data["max_players"] = payload.max_players
    if payload.min_elo is not None:
        update_data["min_elo"] = int(payload.min_elo)
    if payload.is_public is True:
        update_data["password_hash"] = None
    elif payload.lobby_password is not None:
        pwd = payload.lobby_password.strip()
        if len(pwd) >= 4:
            update_data["password_hash"] = hash_lobby_password(pwd)
    if not update_data:
        return get_lobby_by_id(lobby_id)
    response = (
        db.table("lobby")
        .update(update_data)
        .eq("lobby_id", str(lobby_id))
        .execute()
    )
    if not response.data or len(response.data) == 0:
        return None
    updated = response.data[0]
    # If max players changed, recalculate open/closed by capacity.
    if payload.max_players is not None:
        sync_lobby_status_with_capacity(lobby_id=lobby_id)
        refreshed = get_lobby_by_id(lobby_id)
        if refreshed:
            updated = refreshed
    _enrich_lobby_row_with_participant_average_elo(updated)
    return updated


def delete_lobby(*, lobby_id: UUID) -> None:
    db = get_supabase_client()
    db.table("lobby").delete().eq("lobby_id", str(lobby_id)).execute()


def sync_lobby_status_with_capacity(*, lobby_id: UUID) -> None:
    """
    Auto-toggle lobby status based on capacity:
    - full  -> closed
    - has spot -> open

    Only applies to lobbies currently in "open"/"closed" states so we do not
    override future status flows (e.g. in_progress/completed).
    """
    db = get_supabase_client()
    lobby = get_lobby_by_id(lobby_id)
    if not lobby:
        return

    current_status = str(lobby.get("status") or "").lower()
    if current_status not in {"open", "closed"}:
        return

    max_players = int(lobby.get("max_players") or 0)
    if max_players <= 0:
        return

    participants = get_participants_for_lobby(lobby_id)
    is_full = len(participants) >= max_players
    target_status = "closed" if is_full else "open"

    if target_status == current_status:
        return

    db.table("lobby").update({"status": target_status}).eq("lobby_id", str(lobby_id)).execute()


def join_lobby(*, lobby_id: UUID, player_id: str) -> dict:
    db = get_supabase_client()
    insert_data = {
        "lobby_id": str(lobby_id),
        "player_id": player_id,
    }
    response = db.table("lobby_participants").insert(insert_data).execute()
    if not response.data:
        raise RuntimeError("Failed to join lobby")
    sync_lobby_status_with_capacity(lobby_id=lobby_id)
    return response.data[0]


def leave_lobby(*, lobby_id: UUID, player_id: str, host_user_id: str) -> dict:
    """
    Remove player from lobby_participants. If the leaver is the host, either transfer
    host to the earliest joined_at participant or delete the lobby if none remain.

    Note: Multiple Supabase round-trips are not one atomic transaction. Concurrent
    leaves could theoretically race (e.g. next host selected then leaves before update).
    A future improvement is a single Postgres function with row locking (SELECT FOR UPDATE).
    """
    db = get_supabase_client()
    host_id = str(host_user_id or "").strip()
    is_host_leaving = bool(host_id) and _normalize_uuid(host_id) == _normalize_uuid(player_id)

    db.table("lobby_participants").delete().eq("lobby_id", str(lobby_id)).eq(
        "player_id", player_id
    ).execute()

    if not is_host_leaving:
        sync_lobby_status_with_capacity(lobby_id=lobby_id)
        return {"result": "left", "new_host_user_id": None}

    remaining_resp = (
        db.table("lobby_participants")
        .select("player_id, joined_at")
        .eq("lobby_id", str(lobby_id))
        .order("joined_at")
        .order("player_id")
        .limit(1)
        .execute()
    )
    remaining_rows = remaining_resp.data or []

    if not remaining_rows:
        delete_lobby(lobby_id=lobby_id)
        return {"result": "lobby_deleted", "new_host_user_id": None}

    next_host_id = str(remaining_rows[0].get("player_id") or "").strip()
    if not next_host_id:
        delete_lobby(lobby_id=lobby_id)
        return {"result": "lobby_deleted", "new_host_user_id": None}

    update_resp = (
        db.table("lobby")
        .update({"host_user_id": next_host_id})
        .eq("lobby_id", str(lobby_id))
        .execute()
    )
    updated_rows = update_resp.data or []
    if not updated_rows:
        raise RuntimeError(
            f"Failed to transfer host for lobby {lobby_id}: no rows were updated"
        )
    sync_lobby_status_with_capacity(lobby_id=lobby_id)
    return {"result": "host_transferred", "new_host_user_id": next_host_id}


def get_participants_for_lobby(lobby_id: UUID) -> list[dict]:
    db = get_supabase_client()
    lobby = get_lobby_by_id(lobby_id)
    if not lobby:
        return []

    response = (
        db.table("lobby_participants")
        .select("player_id, is_ready, current_team")
        .eq("lobby_id", str(lobby_id))
        .execute()
    )
    rows = response.data or []
    player_ids = [r["player_id"] for r in rows]
    host_id = str(lobby.get("host_user_id", ""))

    # Include host as participant if not already in the list
    if host_id and host_id not in player_ids:
        player_ids.append(host_id)
        rows.insert(0, {"player_id": host_id, "is_ready": False, "current_team": None})

    users_resp = db.table("users").select("user_id, username").in_("user_id", player_ids).execute()
    users_by_id = {u["user_id"]: u for u in (users_resp.data or [])}
    out = []
    for r in rows:
        u = users_by_id.get(r["player_id"], {})
        out.append({
            "player_id": r["player_id"],
            "username": u.get("username") or "Unknown",
            "is_ready": r.get("is_ready", False),
            "current_team": r.get("current_team"),
        })
    return out