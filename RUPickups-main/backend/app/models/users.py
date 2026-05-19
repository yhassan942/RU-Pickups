from datetime import datetime
from typing import Optional
import unicodedata
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

MAX_USERNAME_LENGTH = 30
MAX_PHONE_NUMBER_LENGTH = 20


def _contains_emoji(value: str) -> bool:
    for char in value:
        codepoint = ord(char)
        if (
            0x1F300 <= codepoint <= 0x1FAFF
            or 0x1F1E6 <= codepoint <= 0x1F1FF
            or 0x2600 <= codepoint <= 0x27BF
            or codepoint in {0x200D, 0xFE0F, 0x20E3}
            or unicodedata.category(char) == "So"
        ):
            return True
    return False


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=MAX_USERNAME_LENGTH)
    preferred_campus: Optional[str] = None
    phone_number: Optional[str] = Field(default=None, max_length=MAX_PHONE_NUMBER_LENGTH)

    @field_validator("username")
    @classmethod
    def validate_username_no_emoji(cls, value: str) -> str:
        if _contains_emoji(value):
            raise ValueError("Username cannot contain emojis")
        return value

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number_no_emoji(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if _contains_emoji(value):
            raise ValueError("Phone number cannot contain emojis")
        return value


class UserResponse(BaseModel):
    user_id: UUID
    username: str
    preferred_campus: Optional[str] = None
    phone_number: Optional[str] = None
    elo: int
    wins: int
    losses: int
    created_at: datetime


class PublicUserResponse(BaseModel):
    user_id: UUID
    username: str
    preferred_campus: Optional[str] = None
    elo: int
    wins: int
    losses: int


class SportStatsEntry(BaseModel):
    sport: str
    elo: int = Field(ge=0)
    wins: int = Field(ge=0)
    losses: int = Field(ge=0)
