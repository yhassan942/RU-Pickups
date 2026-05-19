# Health route integration tests.
# Covers successful database health responses and error payload
# shape when upstream DB access fails.
from types import SimpleNamespace

import pytest

from app.api.routes import health_route


def test_db_health_connected(client, monkeypatch: pytest.MonkeyPatch) -> None:
    # Verifies /health/db reports connected with row count on successful query.
    class FakeQuery:
        def select(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def execute(self):
            return SimpleNamespace(data=[{"user_id": "123"}])

    class FakeSupabase:
        def table(self, table_name: str):
            assert table_name == "users"
            return FakeQuery()

    monkeypatch.setattr(health_route, "get_supabase_client", lambda: FakeSupabase())

    response = client.get("/health/db")

    assert response.status_code == 200
    assert response.json() == {"status": "connected", "rows_returned": 1}


def test_db_health_error_payload(client, monkeypatch: pytest.MonkeyPatch) -> None:
    # Verifies /health/db returns structured error details when DB call fails.
    monkeypatch.setattr(
        health_route,
        "get_supabase_client",
        lambda: (_ for _ in ()).throw(RuntimeError("db unavailable")),
    )

    response = client.get("/health/db")

    assert response.status_code == 200
    assert response.json()["status"] == "error"
    assert "db unavailable" in response.json()["message"]
