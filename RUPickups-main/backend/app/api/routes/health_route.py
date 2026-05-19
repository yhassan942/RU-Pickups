"""Health-check route for validating API to Supabase connectivity."""

from fastapi import APIRouter
from app.db.supabase_client import get_supabase_client

router = APIRouter()

@router.get("/db")
def db_health():
    try:
        supabase = get_supabase_client()

        # simplest safe query
        response = supabase.table("users").select("user_id").limit(1).execute()

        return {
            "status": "connected",
            "rows_returned": len(response.data)
        }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }