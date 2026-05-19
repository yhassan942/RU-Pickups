"""Utilities for lobby password hashing and signed unlock tokens."""

import base64
import hashlib
import hmac
import time
from uuid import UUID

import bcrypt

from app.core.config import settings


def hash_lobby_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_lobby_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except (ValueError, TypeError):
        return False


def create_unlock_token(*, lobby_id: UUID, user_id: str, ttl_seconds: int = 86400) -> str:
    secret = settings.SUPABASE_JWT_SECRET
    lid = str(lobby_id)
    uid = str(user_id).strip()
    exp = int(time.time()) + int(ttl_seconds)
    payload = f"v1|{lid}|{uid}|{exp}"
    sig = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    token = f"{payload}|{sig}"
    return base64.urlsafe_b64encode(token.encode("ascii")).decode("ascii")


def verify_unlock_token(*, token: str, lobby_id: UUID, user_id: str) -> bool:
    secret = settings.SUPABASE_JWT_SECRET
    try:
        raw = base64.urlsafe_b64decode(token.encode("ascii")).decode("ascii")
        parts = raw.split("|")
        if len(parts) != 5 or parts[0] != "v1":
            return False
        lid, uid, exp_s, sig = parts[1], parts[2], parts[3], parts[4]
        if lid != str(lobby_id) or uid != str(user_id).strip():
            return False
        if int(exp_s) < int(time.time()):
            return False
        payload = f"v1|{lid}|{uid}|{exp_s}"
        expected = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, sig)
    except (ValueError, TypeError, UnicodeError, IndexError):
        return False
