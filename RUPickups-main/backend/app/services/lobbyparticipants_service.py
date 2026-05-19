"""Service helpers for reading lobby participant rows."""

from uuid import UUID

from app.db.supabase_client import get_supabase_client

def get_lobby_participants() -> list[dict]:
    db = get_supabase_client()

    response = (
        db 
        .table("lobby_participants")
        .select("*")
        .execute()
    )

    return response.data or []