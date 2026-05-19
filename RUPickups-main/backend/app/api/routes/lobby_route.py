"""Routes for lobby browsing, membership, and host actions."""

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core.auth import optional_user_id, require_user_id
from app.repositories import lobby_repository
from app.services import lobby_service
from app.models.lobby import (
    LeaveLobbyResponse,
    LobbyCreate,
    LobbyResponse,
    LobbyUnlockRequest,
    LobbyUnlockResponse,
    LobbyUpdate,
)


router = APIRouter()


@router.get("", response_model=list[LobbyResponse])
def get_all_lobbies(
    user_id: str | None = Depends(optional_user_id),
    x_lobby_unlock: str | None = Header(None),
):
    return lobby_service.get_all_lobbies(user_id=user_id, unlock_token=x_lobby_unlock)


@router.get("/my/upcoming", response_model=list[LobbyResponse])
def get_my_upcoming_lobbies(user_id: str = Depends(require_user_id)):
    try:
        return lobby_service.get_my_upcoming_lobbies(user_id=user_id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/{lobby_id}", response_model=LobbyResponse)
def get_lobby(
    lobby_id: UUID,
    user_id: str = Depends(require_user_id),
    x_lobby_unlock: str | None = Header(None),
):
    lobby = lobby_service.get_lobby_for_viewer(
        lobby_id, user_id=user_id, unlock_token=x_lobby_unlock
    )
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    return lobby


@router.get("/{lobby_id}/participants")
def get_lobby_participants(
    lobby_id: UUID,
    user_id: str = Depends(require_user_id),
    x_lobby_unlock: str | None = Header(None),
):
    lobby = lobby_repository.get_lobby_by_id(lobby_id)
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    return lobby_repository.get_participants_for_lobby(lobby_id)


@router.post("/{lobby_id}/unlock", response_model=LobbyUnlockResponse)
def unlock_lobby(
    lobby_id: UUID,
    payload: LobbyUnlockRequest,
    user_id: str = Depends(require_user_id),
):
    lobby = lobby_repository.get_lobby_by_id(lobby_id)
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    token = lobby_service.unlock_private_lobby(
        lobby_id=lobby_id, user_id=user_id, password=payload.password
    )
    if token is None:
        raise HTTPException(status_code=401, detail="Incorrect lobby password")
    return LobbyUnlockResponse(unlock_token=token)


@router.post("/{lobby_id}/join", status_code=status.HTTP_201_CREATED)
def join_lobby(
    lobby_id: UUID,
    user_id: str = Depends(require_user_id),
    x_lobby_unlock: str | None = Header(None),
):
    lobby = lobby_service.get_lobby_by_id(lobby_id)
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    try:
        return lobby_service.join_lobby(
            lobby_id=lobby_id, user_id=user_id, unlock_token=x_lobby_unlock
        )
    except RuntimeError as e:
        err = str(e).lower()
        if "private lobby" in err and "unlock" in err:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=str(e),
            ) from e
        if "lobby is full" in err:
            raise HTTPException(status_code=409, detail="Lobby is full") from e
        if "already in this lobby" in err:
            raise HTTPException(status_code=409, detail="Already in this lobby") from e
        if "duplicate" in err or "unique" in err:
            raise HTTPException(status_code=409, detail="Already in this lobby") from e
        if "below" in err and "minimum" in err:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=str(e),
            ) from e
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{lobby_id}/leave", response_model=LeaveLobbyResponse)
def leave_lobby(lobby_id: UUID, user_id: str = Depends(require_user_id)):
    lobby = lobby_service.get_lobby_by_id(lobby_id)
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    return lobby_service.leave_lobby(
        lobby_id=lobby_id,
        user_id=user_id,
        host_user_id=str(lobby.get("host_user_id") or ""),
    )


@router.patch("/{lobby_id}", response_model=LobbyResponse)
def update_lobby(
    lobby_id: UUID,
    payload: LobbyUpdate,
    user_id: str = Depends(require_user_id),
):
    try:
        result = lobby_service.update_lobby(lobby_id=lobby_id, user_id=user_id, payload=payload)
    except lobby_service.LobbyConflictError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if not result:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the host can update this lobby",
        )
    return result


@router.delete("/{lobby_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lobby(lobby_id: UUID, user_id: str = Depends(require_user_id)):
    if not lobby_service.delete_lobby(lobby_id=lobby_id, user_id=user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the host can delete this lobby",
        )


@router.post("", response_model=LobbyResponse, status_code=status.HTTP_201_CREATED)
def create_lobby(payload: LobbyCreate, user_id: str = Depends(require_user_id)):
    try:
        return lobby_service.create_lobby(user_id=user_id, payload=payload)
    except lobby_service.LobbyConflictError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e