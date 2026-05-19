from datetime import datetime
from typing import Literal, Optional

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LobbyCreate(BaseModel):
    lobby_name: str = Field(min_length=1, max_length=100)
    sport: str
    campus: str
    scheduled_start_time: datetime
    location_id: Optional[UUID] = None
    is_public: bool = Field(default=True)
    max_players: int = Field(default=2, ge=2, le=100)
    min_elo: int = Field(default=0, ge=0)
    lobby_password: Optional[str] = None

    @model_validator(mode="after")
    def private_requires_password(self):
        if not self.is_public:
            pwd = (self.lobby_password or "").strip()
            if len(pwd) < 4:
                raise ValueError("Private lobbies require a password of at least 4 characters")
            self.lobby_password = pwd
        else:
            self.lobby_password = None
        return self


class LobbyUpdate(BaseModel):
    lobby_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    sport: Optional[str] = None
    campus: Optional[str] = None
    scheduled_start_time: Optional[datetime] = None
    location_id: Optional[UUID] = None
    is_public: Optional[bool] = None
    max_players: Optional[int] = Field(default=None, ge=2, le=100)
    min_elo: Optional[int] = Field(default=None, ge=0)
    lobby_password: Optional[str] = None


class LobbyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    lobby_id: UUID
    host_user_id: UUID
    lobby_name: str
    sport: str
    campus: str
    location_id: Optional[UUID] = None
    is_public: bool = Field(default=True)
    max_players: int = Field(default=2, ge=2, le=100)
    min_elo: int = Field(default=0, ge=0)
    status: str
    scheduled_start_time: datetime
    created_at: datetime
    participant_count: int | None = None
    participant_average_elo: float | None = None
    participant_details_hidden: bool = False


class LobbyUnlockRequest(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class LobbyUnlockResponse(BaseModel):
    unlock_token: str


class LeaveLobbyResponse(BaseModel):
    result: Literal["left", "host_transferred", "lobby_deleted"]
    new_host_user_id: UUID | None = None

