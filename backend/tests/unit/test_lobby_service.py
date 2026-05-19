# Lobby service unit tests.
# Covers lobby creation guardrails (ELO and name conflicts) and
# join behavior when a lobby has reached capacity.
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.models.lobby import LobbyCreate
from app.services import lobby_service


def _lobby_payload(**overrides):
    base = LobbyCreate(
        lobby_name="Evening Run",
        sport="basketball",
        campus="busch",
        scheduled_start_time=datetime.now(timezone.utc),
        location_id=None,
        is_public=True,
        max_players=10,
        min_elo=0,
        lobby_password=None,
    )
    return base.model_copy(update=overrides)


def test_create_lobby_rejects_min_elo_above_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Verifies host cannot set lobby minimum ELO above their sport ELO.
    monkeypatch.setattr(lobby_service, "_user_sport_elo", lambda **_kwargs: 1200)
    payload = _lobby_payload(min_elo=1500)

    with pytest.raises(ValueError, match="Minimum ELO"):
        lobby_service.create_lobby(user_id=str(uuid4()), payload=payload)


def test_create_lobby_rejects_duplicate_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Verifies duplicate lobby names are rejected with conflict semantics.
    monkeypatch.setattr(lobby_service, "_user_sport_elo", lambda **_kwargs: 1200)
    monkeypatch.setattr(lobby_service.lobby_repository, "lobby_name_exists", lambda **_kwargs: True)
    payload = _lobby_payload()

    with pytest.raises(lobby_service.LobbyConflictError, match="already exists"):
        lobby_service.create_lobby(user_id=str(uuid4()), payload=payload)


def test_join_lobby_rejects_full_lobby(monkeypatch: pytest.MonkeyPatch) -> None:
    # Verifies join attempts fail when participant count reaches capacity.
    lobby_id = uuid4()
    monkeypatch.setattr(
        lobby_service.lobby_repository,
        "get_lobby_by_id",
        lambda _id: {"lobby_id": str(lobby_id), "is_public": True, "max_players": 2, "min_elo": 0},
    )
    monkeypatch.setattr(
        lobby_service.lobby_repository,
        "get_participants_for_lobby",
        lambda _id: [{"player_id": str(uuid4())}, {"player_id": str(uuid4())}],
    )

    with pytest.raises(RuntimeError, match="Lobby is full"):
        lobby_service.join_lobby(lobby_id=lobby_id, user_id=str(uuid4()), unlock_token=None)


def test_create_lobby_allows_min_elo_equal_to_host(monkeypatch: pytest.MonkeyPatch) -> None:
    host_id = str(uuid4())
    lobby_id = uuid4()
    monkeypatch.setattr(lobby_service, "_user_sport_elo", lambda **_kwargs: 1200)
    monkeypatch.setattr(
        lobby_service.lobby_repository, "lobby_name_exists", lambda **_kwargs: False
    )
    monkeypatch.setattr(
        lobby_service.lobby_repository,
        "create_lobby",
        lambda **_kwargs: {
            "lobby_id": str(lobby_id),
            "host_user_id": host_id,
            "lobby_name": "Evening Run",
            "sport": "basketball",
            "campus": "busch",
            "status": "open",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "scheduled_start_time": datetime.now(timezone.utc).isoformat(),
            "location_id": None,
            "is_public": True,
            "max_players": 10,
            "min_elo": 1200,
            "participant_count": 1,
            "participant_average_elo": 1200,
        },
    )
    monkeypatch.setattr(
        lobby_service.lobby_repository, "get_lobby_ids_for_participant", lambda _uid: set()
    )

    result = lobby_service.create_lobby(
        user_id=host_id,
        payload=_lobby_payload(min_elo=1200),
    )

    assert result.min_elo == 1200


def test_join_lobby_rejects_private_without_unlock_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lobby_id = uuid4()
    user_id = str(uuid4())
    monkeypatch.setattr(
        lobby_service.lobby_repository,
        "get_lobby_by_id",
        lambda _id: {
            "lobby_id": str(lobby_id),
            "is_public": False,
            "password_hash": "hash",
            "host_user_id": str(uuid4()),
            "max_players": 10,
            "min_elo": 0,
        },
    )
    monkeypatch.setattr(
        lobby_service.lobby_repository, "is_user_in_lobby", lambda *_args, **_kwargs: False
    )

    with pytest.raises(RuntimeError, match="unlock with the lobby password"):
        lobby_service.join_lobby(lobby_id=lobby_id, user_id=user_id, unlock_token=None)


def test_join_lobby_rejects_private_with_invalid_unlock_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lobby_id = uuid4()
    user_id = str(uuid4())
    monkeypatch.setattr(
        lobby_service.lobby_repository,
        "get_lobby_by_id",
        lambda _id: {
            "lobby_id": str(lobby_id),
            "is_public": False,
            "password_hash": "hash",
            "host_user_id": str(uuid4()),
            "max_players": 10,
            "min_elo": 0,
        },
    )
    monkeypatch.setattr(
        lobby_service.lobby_repository, "is_user_in_lobby", lambda *_args, **_kwargs: False
    )
    monkeypatch.setattr(
        lobby_service, "verify_unlock_token", lambda **_kwargs: False
    )

    with pytest.raises(RuntimeError, match="unlock with the lobby password"):
        lobby_service.join_lobby(lobby_id=lobby_id, user_id=user_id, unlock_token="bad")


def test_leave_lobby_passes_through_host_transfer_outcome(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lobby_id = uuid4()
    user_id = str(uuid4())
    monkeypatch.setattr(
        lobby_service.lobby_repository,
        "leave_lobby",
        lambda **_kwargs: {
            "result": "host_transferred",
            "new_host_user_id": str(uuid4()),
        },
    )

    result = lobby_service.leave_lobby(
        lobby_id=lobby_id, user_id=user_id, host_user_id=user_id
    )
    assert result["result"] == "host_transferred"


def test_leave_lobby_passes_through_lobby_deleted_outcome(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lobby_id = uuid4()
    user_id = str(uuid4())
    monkeypatch.setattr(
        lobby_service.lobby_repository,
        "leave_lobby",
        lambda **_kwargs: {"result": "lobby_deleted", "new_host_user_id": None},
    )

    result = lobby_service.leave_lobby(
        lobby_id=lobby_id, user_id=user_id, host_user_id=user_id
    )
    assert result == {"result": "lobby_deleted", "new_host_user_id": None}
