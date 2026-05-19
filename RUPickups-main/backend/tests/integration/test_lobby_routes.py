# Lobby route integration tests.
# Covers join-route error mapping (unlock/full states) and successful
# unlock token responses for private lobbies.
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.api.routes import lobby_route
from app.core.auth import require_user_id
from app.main import app


@pytest.fixture
def authed_user() -> str:
    return str(uuid4())


def _override_auth(user_id: str) -> None:
    app.dependency_overrides[require_user_id] = lambda: user_id


def _lobby_payload(lobby_id):
    return {
        "lobby_id": str(lobby_id),
        "host_user_id": str(uuid4()),
        "lobby_name": "Evening Run",
        "sport": "basketball",
        "campus": "busch",
        "location_id": None,
        "is_public": True,
        "max_players": 10,
        "min_elo": 0,
        "status": "open",
        "scheduled_start_time": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "participant_count": 0,
        "participant_average_elo": 0,
        "participant_details_hidden": False,
    }


def test_join_lobby_requires_unlock_token(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    # Verifies private-lobby join failures map to 403 unlock-required responses.
    lobby_id = uuid4()
    _override_auth(authed_user)
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "get_lobby_by_id",
        lambda _lobby_id: {"lobby_id": str(lobby_id)},
    )
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "join_lobby",
        lambda **_kwargs: (_ for _ in ()).throw(
            RuntimeError("Private lobby: unlock with the lobby password before joining")
        ),
    )

    response = client.post(f"/lobbies/{lobby_id}/join")

    assert response.status_code == 403
    assert "unlock" in response.json()["detail"].lower()


def test_join_lobby_maps_full_lobby_error(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    # Verifies "Lobby is full" domain errors map to HTTP 409 responses.
    lobby_id = uuid4()
    _override_auth(authed_user)
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "get_lobby_by_id",
        lambda _lobby_id: {"lobby_id": str(lobby_id)},
    )
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "join_lobby",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("Lobby is full")),
    )

    response = client.post(f"/lobbies/{lobby_id}/join")

    assert response.status_code == 409
    assert response.json()["detail"] == "Lobby is full"


def test_unlock_lobby_returns_token(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    # Verifies successful unlock returns unlock token payload contract.
    lobby_id = uuid4()
    _override_auth(authed_user)
    monkeypatch.setattr(
        lobby_route.lobby_repository,
        "get_lobby_by_id",
        lambda _lobby_id: {"lobby_id": str(lobby_id)},
    )
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "unlock_private_lobby",
        lambda **_kwargs: "unlock-token",
    )

    response = client.post(f"/lobbies/{lobby_id}/unlock", json={"password": "secret123"})

    assert response.status_code == 200
    assert response.json() == {"unlock_token": "unlock-token"}


def test_join_lobby_returns_404_when_lobby_missing(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    lobby_id = uuid4()
    _override_auth(authed_user)
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "get_lobby_by_id",
        lambda _lobby_id: None,
    )

    response = client.post(f"/lobbies/{lobby_id}/join")

    assert response.status_code == 404
    assert response.json()["detail"] == "Lobby not found"


def test_leave_lobby_returns_left_result(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    lobby_id = uuid4()
    _override_auth(authed_user)
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "get_lobby_by_id",
        lambda _lobby_id: {"lobby_id": str(lobby_id), "host_user_id": str(uuid4())},
    )
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "leave_lobby",
        lambda **_kwargs: {"result": "left", "new_host_user_id": None},
    )

    response = client.post(f"/lobbies/{lobby_id}/leave")

    assert response.status_code == 200
    assert response.json() == {"result": "left", "new_host_user_id": None}


def test_leave_lobby_returns_host_transferred_result(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    lobby_id = uuid4()
    next_host = str(uuid4())
    _override_auth(authed_user)
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "get_lobby_by_id",
        lambda _lobby_id: {"lobby_id": str(lobby_id), "host_user_id": authed_user},
    )
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "leave_lobby",
        lambda **_kwargs: {"result": "host_transferred", "new_host_user_id": next_host},
    )

    response = client.post(f"/lobbies/{lobby_id}/leave")

    assert response.status_code == 200
    assert response.json() == {
        "result": "host_transferred",
        "new_host_user_id": next_host,
    }


def test_leave_lobby_returns_lobby_deleted_result(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    lobby_id = uuid4()
    _override_auth(authed_user)
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "get_lobby_by_id",
        lambda _lobby_id: {"lobby_id": str(lobby_id), "host_user_id": authed_user},
    )
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "leave_lobby",
        lambda **_kwargs: {"result": "lobby_deleted", "new_host_user_id": None},
    )

    response = client.post(f"/lobbies/{lobby_id}/leave")

    assert response.status_code == 200
    assert response.json() == {"result": "lobby_deleted", "new_host_user_id": None}


def test_unlock_lobby_returns_401_for_wrong_password(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    lobby_id = uuid4()
    _override_auth(authed_user)
    monkeypatch.setattr(
        lobby_route.lobby_repository,
        "get_lobby_by_id",
        lambda _lobby_id: {"lobby_id": str(lobby_id), "is_public": False},
    )
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "unlock_private_lobby",
        lambda **_kwargs: None,
    )

    response = client.post(f"/lobbies/{lobby_id}/unlock", json={"password": "wrong"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect lobby password"


def test_get_all_lobbies_returns_service_rows(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    lobby_id = uuid4()
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "get_all_lobbies",
        lambda **_kwargs: [_lobby_payload(lobby_id)],
    )

    response = client.get("/lobbies")

    assert response.status_code == 200
    assert response.json()[0]["lobby_id"] == str(lobby_id)


def test_get_my_upcoming_lobbies_maps_runtime_error(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    _override_auth(authed_user)
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "get_my_upcoming_lobbies",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("db down")),
    )

    response = client.get("/lobbies/my/upcoming")

    assert response.status_code == 503
    assert response.json()["detail"] == "db down"


def test_get_lobby_returns_404_when_missing(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    _override_auth(authed_user)
    monkeypatch.setattr(lobby_route.lobby_service, "get_lobby_for_viewer", lambda *_args, **_kwargs: None)

    response = client.get(f"/lobbies/{uuid4()}")

    assert response.status_code == 404
    assert response.json()["detail"] == "Lobby not found"


def test_get_participants_returns_404_when_lobby_missing(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    _override_auth(authed_user)
    monkeypatch.setattr(lobby_route.lobby_repository, "get_lobby_by_id", lambda _id: None)

    response = client.get(f"/lobbies/{uuid4()}/participants")

    assert response.status_code == 404


def test_join_lobby_maps_minimum_elo_error(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    lobby_id = uuid4()
    _override_auth(authed_user)
    monkeypatch.setattr(lobby_route.lobby_service, "get_lobby_by_id", lambda _id: {"lobby_id": str(lobby_id)})
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "join_lobby",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("Your ELO is below this lobby's minimum")),
    )

    response = client.post(f"/lobbies/{lobby_id}/join")
    assert response.status_code == 403


def test_join_lobby_maps_generic_runtime_error(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    lobby_id = uuid4()
    _override_auth(authed_user)
    monkeypatch.setattr(lobby_route.lobby_service, "get_lobby_by_id", lambda _id: {"lobby_id": str(lobby_id)})
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "join_lobby",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("unexpected")),
    )

    response = client.post(f"/lobbies/{lobby_id}/join")
    assert response.status_code == 400
    assert response.json()["detail"] == "unexpected"


def test_update_lobby_maps_conflict_and_validation_errors(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    lobby_id = uuid4()
    _override_auth(authed_user)
    payload = {"lobby_name": "Updated Name"}
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "update_lobby",
        lambda **_kwargs: (_ for _ in ()).throw(lobby_route.lobby_service.LobbyConflictError("name used")),
    )
    conflict_resp = client.patch(f"/lobbies/{lobby_id}", json=payload)
    assert conflict_resp.status_code == 409

    monkeypatch.setattr(
        lobby_route.lobby_service,
        "update_lobby",
        lambda **_kwargs: (_ for _ in ()).throw(ValueError("bad request")),
    )
    bad_resp = client.patch(f"/lobbies/{lobby_id}", json=payload)
    assert bad_resp.status_code == 400


def test_update_lobby_returns_403_when_not_host(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    lobby_id = uuid4()
    _override_auth(authed_user)
    monkeypatch.setattr(lobby_route.lobby_service, "update_lobby", lambda **_kwargs: None)

    response = client.patch(f"/lobbies/{lobby_id}", json={"lobby_name": "Updated Name"})
    assert response.status_code == 403


def test_delete_lobby_returns_403_when_not_host(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    _override_auth(authed_user)
    monkeypatch.setattr(lobby_route.lobby_service, "delete_lobby", lambda **_kwargs: False)

    response = client.delete(f"/lobbies/{uuid4()}")
    assert response.status_code == 403


def test_create_lobby_maps_conflict_and_value_errors(
    client, monkeypatch: pytest.MonkeyPatch, authed_user: str
) -> None:
    _override_auth(authed_user)
    payload = {
        "lobby_name": "Evening Run",
        "sport": "basketball",
        "campus": "busch",
        "scheduled_start_time": datetime.now(timezone.utc).isoformat(),
        "location_id": None,
        "is_public": True,
        "max_players": 10,
        "min_elo": 0,
    }
    monkeypatch.setattr(
        lobby_route.lobby_service,
        "create_lobby",
        lambda **_kwargs: (_ for _ in ()).throw(lobby_route.lobby_service.LobbyConflictError("conflict")),
    )
    conflict_resp = client.post("/lobbies", json=payload)
    assert conflict_resp.status_code == 409

    monkeypatch.setattr(
        lobby_route.lobby_service,
        "create_lobby",
        lambda **_kwargs: (_ for _ in ()).throw(ValueError("invalid")),
    )
    invalid_resp = client.post("/lobbies", json=payload)
    assert invalid_resp.status_code == 400
