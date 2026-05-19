# Authentication dependency unit tests.
# Covers user-id extraction for valid credentials, missing-token handling,
# and tolerant optional-auth behavior for invalid tokens.
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core import auth


def test_require_user_id_returns_user_id(monkeypatch: pytest.MonkeyPatch) -> None:
    # Verifies valid bearer credentials resolve to the Supabase user id.
    class FakeAuthClient:
        @staticmethod
        def get_user(token: str):
            assert token == "valid-token"
            return SimpleNamespace(user=SimpleNamespace(id="user-123"))

    class FakeClient:
        auth = FakeAuthClient()

    monkeypatch.setattr(auth, "get_supabase_client", lambda: FakeClient())
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-token")

    assert auth.require_user_id(creds) == "user-123"


def test_require_user_id_raises_for_missing_token() -> None:
    # Verifies strict auth dependency rejects requests without credentials.
    with pytest.raises(HTTPException) as exc:
        auth.require_user_id(None)
    assert exc.value.status_code == 401
    assert exc.value.detail == "Missing token"


def test_optional_user_id_returns_none_for_invalid_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Verifies optional auth dependency suppresses token validation failures.
    class FakeAuthClient:
        @staticmethod
        def get_user(token: str):
            raise RuntimeError(f"bad token: {token}")

    class FakeClient:
        auth = FakeAuthClient()

    monkeypatch.setattr(auth, "get_supabase_client", lambda: FakeClient())
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid")

    assert auth.optional_user_id(creds) is None


def test_require_user_id_raises_for_invalid_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeAuthClient:
        @staticmethod
        def get_user(token: str):
            raise RuntimeError(f"bad token: {token}")

    class FakeClient:
        auth = FakeAuthClient()

    monkeypatch.setattr(auth, "get_supabase_client", lambda: FakeClient())
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid")

    with pytest.raises(HTTPException) as exc:
        auth.require_user_id(creds)
    assert exc.value.status_code == 401
    assert exc.value.detail == "Invalid token"


def test_optional_user_id_returns_none_for_missing_token() -> None:
    assert auth.optional_user_id(None) is None
