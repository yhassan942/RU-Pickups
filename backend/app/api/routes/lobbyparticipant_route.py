"""Routes for reading lobby participant records."""

from fastapi import APIRouter

from app.services.lobbyparticipants_service import get_lobby_participants
from app.models.lobbyparticipants import LobbyParticipantResponse

router = APIRouter()

@router.get("/lobby_participant_manifest", response_model=list[LobbyParticipantResponse])
def get_list_of_lobby_participants():
    return get_lobby_participants()