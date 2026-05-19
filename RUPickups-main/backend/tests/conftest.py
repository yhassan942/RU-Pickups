# Shared pytest fixtures for backend tests.
# Provides a FastAPI TestClient fixture and clears dependency overrides
# between tests to avoid cross-test state leakage.
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
