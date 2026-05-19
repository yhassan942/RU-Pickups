"""Core lobby business rules for visibility, access, and lifecycle actions."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from app.core.lobby_unlock import (
    create_unlock_token,
    verify_lobby_password,
    verify_unlock_token,
)
from app.models.lobby import LobbyCreate, LobbyResponse, LobbyUpdate
from app.repositories import lobby_repository, playerstats_repository


class LobbyConflictError(ValueError):
    """Raised when lobby creation/update violates uniqueness or schedule constraints."""
    pass


def _parse_datetime(value: object) -> datetime:
    """Parse ISO datetime strings (including trailing Z) into datetime objects."""
    if isinstance(value, datetime):
        return value
    text = str(value or "").strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    return datetime.fromisoformat(text)


def _user_sport_elo(*, user_id: str, sport: str) -> int:
    """Return user's Elo for a sport, defaulting when no stat row exists."""
    uid = str(user_id).strip()
    sport_name = str(sport or playerstats_repository.DEFAULT_SPORT)
    elo_map = playerstats_repository.get_sport_elo_map_by_user_ids(
        user_ids=[uid],
        sport=sport_name,
    )
    return int(elo_map.get(uid, playerstats_repository.DEFAULT_STARTING_ELO))


def _uids_match(a, b) -> bool:
    """Compare ids as UUIDs when possible, otherwise as normalized strings."""
    if a is None or b is None:
        return False
    try:
        return str(UUID(str(a))) == str(UUID(str(b)))
    except (TypeError, ValueError):
        return str(a).strip() == str(b).strip()


def _strip_secrets(row: dict) -> dict:
    """Remove secret fields before returning lobby data to callers."""
    return {k: v for k, v in row.items() if k != "password_hash"}


def _is_host(lobby: dict, user_id: str | None) -> bool:
    """Return True when provided user_id matches lobby host_user_id."""
    if not user_id:
        return False
    return _uids_match(lobby.get("host_user_id"), user_id)


def _roster_is_visible(
    lobby: dict,
    *,
    lobby_id: UUID,
    user_id: str | None,
    unlock_token: str | None,
    member_lobby_ids: set[str] | None = None,
) -> bool:
    """Determine whether participant details should be visible to the requester."""
    # UX requirement: private lobbies should display the same roster info as public lobbies
    # when someone opens the lobby. "Full access" (joining) is still protected by password.
    return True


def _to_lobby_response(
    row: dict,
    *,
    lobby_id: UUID,
    user_id: str | None,
    unlock_token: str | None,
    member_lobby_ids: set[str] | None = None,
) -> LobbyResponse:
    """Map raw repository row data into the API `LobbyResponse` model."""
    hidden = not _roster_is_visible(
        lobby=row,
        lobby_id=lobby_id,
        user_id=user_id,
        unlock_token=unlock_token,
        member_lobby_ids=member_lobby_ids,
    )
    d = _strip_secrets(row)
    if hidden:
        d["participant_count"] = None
        d["participant_average_elo"] = None
    d["participant_details_hidden"] = hidden
    return LobbyResponse.model_validate(d)


def get_all_lobbies(*, user_id: str | None, unlock_token: str | None) -> list[LobbyResponse]:
    """Return all lobbies shaped for the current viewer."""
    rows = lobby_repository.get_all_lobbies()
    member_ids = (
        lobby_repository.get_lobby_ids_for_participant(user_id) if user_id else set()
    )
    out: list[LobbyResponse] = []
    for row in rows:
        lid = UUID(str(row["lobby_id"]))
        out.append(
            _to_lobby_response(
                row,
                lobby_id=lid,
                user_id=user_id,
                unlock_token=unlock_token,
                member_lobby_ids=member_ids,
            )
        )
    return out


def get_my_upcoming_lobbies(user_id: str) -> list[LobbyResponse]:
    """Return future lobbies where the user is participating."""
    rows = lobby_repository.get_upcoming_lobbies_for_user(user_id)
    return [
        LobbyResponse.model_validate(
            {**_strip_secrets(r), "participant_details_hidden": False}
        )
        for r in rows
    ]


def get_lobby_by_id(lobby_id: UUID) -> dict | None:
    """Fetch a lobby row by id from the repository layer."""
    return lobby_repository.get_lobby_by_id(lobby_id)


def get_lobby_for_viewer(
    lobby_id: UUID, user_id: str, unlock_token: str | None
) -> LobbyResponse | None:
    """Return one lobby shaped for viewer permissions, or None if missing."""
    row = lobby_repository.get_lobby_by_id(lobby_id)
    if not row:
        return None
    member_ids = lobby_repository.get_lobby_ids_for_participant(user_id)
    return _to_lobby_response(
        row,
        lobby_id=lobby_id,
        user_id=user_id,
        unlock_token=unlock_token,
        member_lobby_ids=member_ids,
    )


def create_lobby(*, user_id: str, payload: LobbyCreate) -> LobbyResponse:
    """Create a lobby after validating name, Elo threshold, and schedule conflicts.

    Raises:
        ValueError: For invalid input (empty name, invalid min Elo).
        LobbyConflictError: For duplicate names or time/location conflicts.
    """
    lobby_name = payload.lobby_name.strip()
    if not lobby_name:
        raise ValueError("Lobby name is required")

    host_elo = _user_sport_elo(user_id=user_id, sport=payload.sport)
    if int(payload.min_elo) > host_elo:
        raise ValueError("Minimum ELO cannot be higher than your current ELO")

    if lobby_repository.lobby_name_exists(lobby_name=lobby_name):
        raise LobbyConflictError("A lobby with this name already exists.")

    if (
        payload.location_id is not None
        and lobby_repository.location_time_overlap_exists(
            location_id=payload.location_id,
            scheduled_start_time=payload.scheduled_start_time,
        )
    ):
        raise LobbyConflictError("This location is already booked for an overlapping time window.")

    sanitized_payload = payload.model_copy(update={"lobby_name": lobby_name})

    row = lobby_repository.create_lobby(host_user_id=user_id, payload=sanitized_payload)
    lid = UUID(str(row["lobby_id"]))
    return _to_lobby_response(
        row,
        lobby_id=lid,
        user_id=user_id,
        unlock_token=None,
        member_lobby_ids=lobby_repository.get_lobby_ids_for_participant(user_id),
    )


def update_lobby(*, lobby_id: UUID, user_id: str, payload: LobbyUpdate) -> LobbyResponse | None:
    """Update lobby fields when requested by host and constraints are satisfied.

    Returns None when lobby is missing or caller is not host.
    Raises:
        ValueError: For invalid field updates.
        LobbyConflictError: For duplicate names or booking conflicts.
    """
    lobby = lobby_repository.get_lobby_by_id(lobby_id)
    if not lobby or str(lobby.get("host_user_id")) != user_id:
        return None

    if payload.min_elo is not None:
        sport = payload.sport if payload.sport is not None else str(lobby.get("sport") or "")
        host_elo = _user_sport_elo(user_id=user_id, sport=sport)
        if int(payload.min_elo) > host_elo:
            raise ValueError("Minimum ELO cannot be higher than your current ELO")

    if payload.lobby_password is not None and len(payload.lobby_password.strip()) > 0:
        if len(payload.lobby_password.strip()) < 4:
            raise ValueError("Lobby password must be at least 4 characters")

    was_public = bool(lobby.get("is_public", True))
    if payload.is_public is False and was_public:
        pwd = (payload.lobby_password or "").strip()
        if len(pwd) < 4:
            raise ValueError(
                "Private lobbies require a password of at least 4 characters when switching from public"
            )
    if payload.is_public is False and not was_public:
        had_hash = bool(lobby.get("password_hash"))
        if not had_hash:
            pwd = (payload.lobby_password or "").strip()
            if len(pwd) < 4:
                raise ValueError(
                    "This private lobby does not have a password set yet. "
                    "Please set a password of at least 4 characters."
                )

    next_name = payload.lobby_name if payload.lobby_name is not None else str(lobby.get("lobby_name") or "")
    next_name = next_name.strip()
    if not next_name:
        raise ValueError("Lobby name is required")

    if lobby_repository.lobby_name_exists(
        lobby_name=next_name,
        exclude_lobby_id=lobby_id,
    ):
        raise LobbyConflictError("A lobby with this name already exists.")

    next_location = payload.location_id if payload.location_id is not None else lobby.get("location_id")
    next_start = (
        payload.scheduled_start_time
        if payload.scheduled_start_time is not None
        else _parse_datetime(lobby.get("scheduled_start_time"))
    )

    if next_location is not None and lobby_repository.location_time_overlap_exists(
        location_id=UUID(str(next_location)),
        scheduled_start_time=next_start,
        exclude_lobby_id=lobby_id,
    ):
        raise LobbyConflictError("This location is already booked for an overlapping time window.")

    normalized_payload = payload.model_copy(update={"lobby_name": next_name})
    updated = lobby_repository.update_lobby(lobby_id=lobby_id, payload=normalized_payload)
    if not updated:
        return None
    member_ids = lobby_repository.get_lobby_ids_for_participant(user_id)
    return _to_lobby_response(
        updated,
        lobby_id=lobby_id,
        user_id=user_id,
        unlock_token=None,
        member_lobby_ids=member_ids,
    )


def delete_lobby(*, lobby_id: UUID, user_id: str) -> bool:
    """Delete a lobby when caller is the host; otherwise return False."""
    lobby = lobby_repository.get_lobby_by_id(lobby_id)
    if not lobby or str(lobby.get("host_user_id")) != user_id:
        return False
    lobby_repository.delete_lobby(lobby_id=lobby_id)
    return True


def _player_id_key(player_id) -> str:
    """Normalize player ids for reliable equality checks."""
    try:
        return str(UUID(str(player_id).strip()))
    except (TypeError, ValueError):
        return str(player_id).strip()


def unlock_private_lobby(*, lobby_id: UUID, user_id: str, password: str) -> str | None:
    """Return an unlock token for private lobbies when password validation passes."""
    lobby = lobby_repository.get_lobby_by_id(lobby_id)
    if not lobby:
        return None
    if lobby.get("is_public", True):
        return create_unlock_token(lobby_id=lobby_id, user_id=user_id)
    ph = lobby.get("password_hash")
    if not ph:
        return create_unlock_token(lobby_id=lobby_id, user_id=user_id)
    if verify_lobby_password(password.strip(), ph):
        return create_unlock_token(lobby_id=lobby_id, user_id=user_id)
    return None


def join_lobby(*, lobby_id: UUID, user_id: str, unlock_token: str | None) -> dict:
    """Join a lobby after access, capacity, duplication, and Elo checks.

    Raises:
        RuntimeError: If lobby is missing, locked, full, duplicate, or Elo-gated.
    """
    lobby = lobby_repository.get_lobby_by_id(lobby_id)
    if not lobby:
        raise RuntimeError("Lobby not found")

    if not lobby.get("is_public", True) and lobby.get("password_hash"):
        if _is_host(lobby, user_id):
            pass
        elif lobby_repository.is_user_in_lobby(lobby_id, user_id):
            pass
        else:
            tok = (unlock_token or "").strip()
            if not tok or not verify_unlock_token(token=tok, lobby_id=lobby_id, user_id=user_id):
                raise RuntimeError(
                    "Private lobby: unlock with the lobby password before joining"
                )

    participants = lobby_repository.get_participants_for_lobby(lobby_id)
    user_key = _player_id_key(user_id)
    for row in participants:
        if _player_id_key(row.get("player_id")) == user_key:
            raise RuntimeError("Already in this lobby")

    max_players = int(lobby.get("max_players") or 0)
    if max_players > 0 and len(participants) >= max_players:
        raise RuntimeError("Lobby is full")

    min_elo = int(lobby.get("min_elo") or 0)
    if min_elo > 0:
        user_elo = _user_sport_elo(user_id=user_id, sport=str(lobby.get("sport") or ""))
        if user_elo < min_elo:
            raise RuntimeError("Your ELO is below this lobby's minimum")

    return lobby_repository.join_lobby(lobby_id=lobby_id, player_id=user_id)


def leave_lobby(*, lobby_id: UUID, user_id: str, host_user_id: str) -> dict:
    """Remove a player from a lobby and handle host departure behavior."""
    return lobby_repository.leave_lobby(
        lobby_id=lobby_id, player_id=user_id, host_user_id=host_user_id
    )


def is_lobby_roster_visible(
    lobby: dict,
    *,
    lobby_id: UUID,
    user_id: str,
    unlock_token: str | None,
) -> bool:
    """Public helper that evaluates lobby roster visibility for a user."""
    member_ids = lobby_repository.get_lobby_ids_for_participant(user_id)
    return _roster_is_visible(
        lobby,
        lobby_id=lobby_id,
        user_id=user_id,
        unlock_token=unlock_token,
        member_lobby_ids=member_ids,
    )