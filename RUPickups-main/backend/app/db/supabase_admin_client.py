"""Cached Supabase admin client factory for privileged operations."""

from functools import lru_cache
from typing import Optional, TYPE_CHECKING

from app.core.config import settings

if TYPE_CHECKING:
    from supabase import Client

@lru_cache(maxsize=1)
def get_supabase_admin_client() -> Optional["Client"]:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return None

    from supabase import create_client

    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY
    )