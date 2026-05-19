from datetime import datetime
from typing import Optional

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

class PlayerStatsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    stat_id: UUID
    user_id: UUID
    sport: str
    
    matches_played: int = Field(ge=0)
    
    wins: int = Field(ge=0)
    losses: int = Field(ge=0)

    elo: int = Field(ge=0)
    
    current_streak: int
    
    created_at: datetime

