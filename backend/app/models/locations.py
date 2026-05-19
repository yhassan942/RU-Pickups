from datetime import datetime
from typing import Optional

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

class LocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    location_id: UUID
    name: str
    campus: str
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime

