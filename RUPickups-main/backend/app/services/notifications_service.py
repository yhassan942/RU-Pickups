"""Service helpers for fetching notifications from persistence."""

from uuid import UUID
from app.db.supabase_client import get_supabase_client

def get_notifications() -> list[dict]:
    db = get_supabase_client()

    response = (
        db
        .table("notifications")
        .select("*")
        .execute()
    )

    return response.data or []