"""Singleton Supabase client factory for general backend data access."""

from dotenv import load_dotenv
load_dotenv()

import os
from supabase import create_client, Client

_supabase: Client | None = None

def get_supabase_client() -> Client:

    global _supabase
    if _supabase is not None:
        return _supabase

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL and a Supabase key (SERVICE_ROLE or ANON).")

    _supabase = create_client(url, key)
    return _supabase