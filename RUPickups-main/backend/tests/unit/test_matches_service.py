# Match service unit tests.
# Covers host-only match creation, status-based start constraints,
# and balanced-team generation invariants.
from uuid import uuid4

import pytest

from app.services import matches_service


def test_create_match_requires_host(monkeypatch: pytest.MonkeyPatch) -> None:
    # Verifies only the lobby host can create a new match.
    lobby_id = uuid4()
    monkeypatch.setattr(matches_service, "_get_lobby_host_user_id", lambda _lobby_id: "host-user")

    with pytest.raises(PermissionError, match="Only host can create"):
        matches_service.create_match(lobby_id=lobby_id, user_id="other-user")


def test_start_match_rejects_completed(monkeypatch: pytest.MonkeyPatch) -> None:
    # Verifies completed matches cannot be transitioned back to started.
    match_id = uuid4()
    lobby_id = uuid4()
    monkeypatch.setattr(
        matches_service,
        "get_match_by_id",
        lambda _match_id: {"match_id": str(match_id), "lobby_id": str(lobby_id), "status": "completed"},
    )
    monkeypatch.setattr(matches_service, "_get_lobby_host_user_id", lambda _lobby_id: "host-user")

    with pytest.raises(RuntimeError, match="already completed"):
        matches_service.start_match(match_id=match_id, user_id="host-user")


def test_create_balanced_teams_distributes_all_players(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Verifies team balancer assigns every player and keeps ELO totals close.
    players = ["a", "b", "c", "d"]
    monkeypatch.setattr(
        matches_service,
        "player_ids_and_elos",
        lambda **_kwargs: [("a", 1000), ("b", 900), ("c", 800), ("d", 700)],
    )

    team_a, team_b = matches_service.create_balanced_teams(players, "basketball")

    picked = [pid for pid, _elo in team_a + team_b]
    assert sorted(picked) == sorted(players)
    assert abs(sum(elo for _, elo in team_a) - sum(elo for _, elo in team_b)) <= 300


def test_start_match_requires_host(monkeypatch: pytest.MonkeyPatch) -> None:
    match_id = uuid4()
    lobby_id = uuid4()
    monkeypatch.setattr(
        matches_service,
        "get_match_by_id",
        lambda _match_id: {
            "match_id": str(match_id),
            "lobby_id": str(lobby_id),
            "status": "scheduled",
        },
    )
    monkeypatch.setattr(matches_service, "_get_lobby_host_user_id", lambda _lobby_id: "host-user")

    with pytest.raises(PermissionError, match="Only host can start"):
        matches_service.start_match(match_id=match_id, user_id="other-user")


def test_complete_match_requires_host(monkeypatch: pytest.MonkeyPatch) -> None:
    match_id = uuid4()
    lobby_id = uuid4()
    monkeypatch.setattr(
        matches_service,
        "get_match_by_id",
        lambda _match_id: {
            "match_id": str(match_id),
            "lobby_id": str(lobby_id),
            "status": "in_progress",
        },
    )
    monkeypatch.setattr(matches_service, "_get_lobby_host_user_id", lambda _lobby_id: "host-user")

    with pytest.raises(PermissionError, match="Only host can complete"):
        matches_service.complete_match(match_id=match_id, user_id="other-user")


def test_start_match_rejects_missing_match(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(matches_service, "get_match_by_id", lambda _match_id: None)

    with pytest.raises(RuntimeError, match="Match not found"):
        matches_service.start_match(match_id=uuid4(), user_id="host-user")


def test_complete_match_returns_existing_when_already_completed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    match_id = uuid4()
    lobby_id = uuid4()
    existing = {"match_id": str(match_id), "lobby_id": str(lobby_id), "status": "completed"}
    monkeypatch.setattr(matches_service, "get_match_by_id", lambda _match_id: existing)
    monkeypatch.setattr(matches_service, "_get_lobby_host_user_id", lambda _lobby_id: "host-user")

    result = matches_service.complete_match(match_id=match_id, user_id="host-user")
    assert result == existing


def test_create_balanced_teams_handles_odd_player_count(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    players = ["a", "b", "c", "d", "e"]
    monkeypatch.setattr(
        matches_service,
        "player_ids_and_elos",
        lambda **_kwargs: [
            ("a", 1500),
            ("b", 1400),
            ("c", 1300),
            ("d", 1200),
            ("e", 1100),
        ],
    )

    team_a, team_b = matches_service.create_balanced_teams(players, "basketball")
    assert abs(len(team_a) - len(team_b)) <= 1
    picked = [pid for pid, _elo in team_a + team_b]
    assert sorted(picked) == sorted(players)
