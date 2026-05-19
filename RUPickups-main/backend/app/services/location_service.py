"""Service helpers for retrieving location records."""

from uuid import UUID

from app.db.supabase_client import get_supabase_client

def get_locations() -> list[dict]:
    db = get_supabase_client()

    response = (
        db
        .table("locations")
        .select("*")
        .execute()
    )

    return response.data or []