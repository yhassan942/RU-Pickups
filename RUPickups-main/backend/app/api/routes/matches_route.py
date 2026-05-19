"""Routes for match lifecycle and matchmaking operations."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import require_user_id
from app.models.matches import MatchCreateRequest, MatchResponse
from app.services.matches_service import (
    complete_match,
    create_balanced_teams,
    create_match,
    get_active_match_by_lobby,
    get_match_by_id,
    get_matches,
    start_match,
)

router = APIRouter()


@router.get("/match_manifest", response_model=list[MatchResponse])
def get_list_of_matches():
    return get_matches()


@router.get("/matchmaking")
def get_balanced_teams(
    match_players: list[str] = Query(...),
    match_sport: str = Query(...)
):
    team_a, team_b = create_balanced_teams(match_players=match_players, match_sport=match_sport)

    return {
        "team_a": team_a,
        "team_b": team_b
    }


@router.get("/lobby/{lobby_id}/active", response_model=MatchResponse)
def get_active_match_for_lobby(
    lobby_id: UUID,
    user_id: str = Depends(require_user_id),
):
    _ = user_id
    match = get_active_match_by_lobby(lobby_id)
    if not match:
        raise HTTPException(status_code=404, detail="No active match found for lobby.")
    return match


@router.get("/{match_id}", response_model=MatchResponse)
def get_match(match_id: UUID):
    match = get_match_by_id(match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found.")
    return match


@router.post("/", response_model=MatchResponse, status_code=201)
def create_new_match(payload: MatchCreateRequest, user_id: str = Depends(require_user_id)):
    try:
        return create_match(payload.lobby_id, user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/{match_id}/start", response_model=MatchResponse)
def start_match_route(match_id: UUID, user_id: str = Depends(require_user_id)):
    try:
        return start_match(match_id=match_id, user_id=user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.patch("/{match_id}/complete", response_model=MatchResponse)
def complete_match_route(
    match_id: UUID,
    winner_team: str | None = Query(None),
    user_id: str = Depends(require_user_id),
):
    try:
        return complete_match(match_id=match_id, user_id=user_id, winner_team=winner_team)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))