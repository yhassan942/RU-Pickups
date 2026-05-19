"""Routes for reading user-facing notifications."""

from fastapi import APIRouter

from app.services.notifications_service import get_notifications
from app.models.notifications import NotificationResponse

router = APIRouter()

@router.get("/notification_manifest", response_model=list[NotificationResponse])
def get_list_of_notifications():
    return get_notifications()

