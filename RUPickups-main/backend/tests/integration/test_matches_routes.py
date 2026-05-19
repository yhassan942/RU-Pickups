# Matches route integration tests.
# Covers route-level status code mapping for missing resources and
# domain errors, plus a successful match creation path.
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.api.routes import matches_route
from app.core.auth import require_user_id
from app.main import app


def _match_payload():
    return {
        "match_id": str(uuid4()),
        "lobby_id": str(uuid4()),
        "match_number": 1,
        "status": "scheduled",
        "started_at": None,
        "ended_at": None,
        "winner_team": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def _override_auth(user_id: str) -> None:
    app.dependency_overrides[require_user_id] = lambda: user_id


def test_get_active_match_returns_404_when_missing(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Verifies missing active match is surfaced as HTTP 404.
    _override_auth(str(uuid4()))
    monkeypatch.setattr(matches_route, "get_active_match_by_lobby", lambda _lobby_id: None)

    response = client.get(f"/matches/lobby/{uuid4()}/active")

    assert response.status_code == 404
    assert "No active match found" in response.json()["detail"]


def test_create_match_maps_permission_error(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Verifies host-only creation rule maps permission errors to HTTP 403.
    _override_auth(str(uuid4()))
    monkeypatch.setattr(
        matches_route,
        "create_match",
        lambda _lobby_id, _user_id: (_ for _ in ()).throw(
            PermissionError("Only host can create a match.")
        ),
    )

    response = client.post("/matches/", json={"lobby_id": str(uuid4())})

    assert response.status_code == 403
    assert "Only host can create a match." in response.json()["detail"]


def test_complete_match_maps_runtime_error(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Verifies domain runtime failures in completion map to HTTP 400.
    _override_auth(str(uuid4()))
    monkeypatch.setattr(
        matches_route,
        "complete_match",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("Match not found.")),
    )

    response = client.patch(f"/matches/{uuid4()}/complete")

    assert response.status_code == 400
    assert response.json()["detail"] == "Match not found."


def test_create_match_success(client, monkeypatch: pytest.MonkeyPatch) -> None:
    # Verifies successful create endpoint returns 201 and scheduled status.
    _override_auth(str(uuid4()))
    monkeypatch.setattr(matches_route, "create_match", lambda _lobby_id, _user_id: _match_payload())

    response = client.post("/matches/", json={"lobby_id": str(uuid4())})

    assert response.status_code == 201
    assert response.json()["status"] == "scheduled"


def test_start_match_maps_permission_error(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    _override_auth(str(uuid4()))
    monkeypatch.setattr(
        matches_route,
        "start_match",
        lambda **_kwargs: (_ for _ in ()).throw(
            PermissionError("Only host can start the match.")
        ),
    )

    response = client.patch(f"/matches/{uuid4()}/start")

    assert response.status_code == 403
    assert response.json()["detail"] == "Only host can start the match."


def test_start_match_maps_runtime_error(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    _override_auth(str(uuid4()))
    monkeypatch.setattr(
        matches_route,
        "start_match",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("Match not found.")),
    )

    response = client.patch(f"/matches/{uuid4()}/start")

    assert response.status_code == 400
    assert response.json()["detail"] == "Match not found."


def test_complete_match_maps_permission_error(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    _override_auth(str(uuid4()))
    monkeypatch.setattr(
        matches_route,
        "complete_match",
        lambda **_kwargs: (_ for _ in ()).throw(
            PermissionError("Only host can complete the match.")
        ),
    )

    response = client.patch(f"/matches/{uuid4()}/complete")

    assert response.status_code == 403
    assert response.json()["detail"] == "Only host can complete the match."
