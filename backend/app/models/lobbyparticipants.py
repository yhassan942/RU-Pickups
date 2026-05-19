from datetime import datetime
from typing import Optional

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

class LobbyParticipantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    lobby_id: UUID
    player_id: UUID
    
    is_ready: bool = Field(default=False)
    current_team: Optional[str] = None

