"""Authentication helpers for extracting user identity from bearer tokens."""

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.db.supabase_client import get_supabase_client

bearer = HTTPBearer(auto_error=False)

def require_user_id(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> str:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Missing token")

    token = creds.credentials
    supabase = get_supabase_client()

    try:
        res = supabase.auth.get_user(token)
        return res.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def optional_user_id(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> str | None:
    """Like require_user_id, but returns None when missing/invalid (for optional-auth routes)."""
    if not creds or not creds.credentials:
        return None
    token = creds.credentials
    supabase = get_supabase_client()
    try:
        res = supabase.auth.get_user(token)
        return res.user.id
    except Exception:
        return None