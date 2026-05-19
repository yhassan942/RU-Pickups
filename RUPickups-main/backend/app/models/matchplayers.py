from datetime import datetime
from typing import Optional

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

class MatchPlayerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    match_id: str
    player_id: str

    team: str

class CreateMatchPlayersRequest(BaseModel):
    match_id: UUID
    team_A_player_ids: list[UUID]
    team_B_player_ids: list[UUID]
