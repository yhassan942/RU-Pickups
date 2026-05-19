"""Routes for retrieving playable location metadata."""

from fastapi import APIRouter

from app.models.locations import LocationResponse
from app.services.location_service import get_locations

router = APIRouter()

@router.get("/location_manifest", response_model=list[LocationResponse])
def get_list_of_locations():
    return get_locations()