from datetime import datetime
from typing import Optional

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    notification_id: UUID
    recipient_id: UUID

    message: str
    type: str
    
    is_read: bool = Field(default=False)

    created_at: datetime

