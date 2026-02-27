"""
Shared fixtures for the test suite.
Sets required env vars BEFORE any backend imports.
"""
import os

# Required env vars — must be set before backend modules load
os.environ.setdefault("GROQ_API_KEY", "test-key-not-real")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/testdb")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-testing-only")
os.environ.setdefault("CSRF_ENABLED", "false")
os.environ.setdefault("LOG_LEVEL", "WARNING")

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch

from backend.main import app
from backend.auth import create_token, hash_password


# ── Mock DB Adapter ──

class MockAdapter:
    """In-memory mock for database adapter."""

    def __init__(self, data: dict | None = None):
        self._data = data or {}
        self.fetch = AsyncMock(return_value=[])
        self.fetchrow = AsyncMock(return_value=None)
        self.fetchval = AsyncMock(return_value=1)
        self.execute_command = AsyncMock(return_value=None)


# ── Fixtures ──

@pytest_asyncio.fixture
async def client():
    """AsyncClient that talks directly to the ASGI app (no real server)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def admin_token() -> str:
    """JWT token for an admin user."""
    return create_token("testadmin", "admin", trino_access=True)


@pytest.fixture
def analyst_token() -> str:
    """JWT token for an analyst user."""
    return create_token("testanalyst", "analyst", trino_access=False)


@pytest.fixture
def reporter_token() -> str:
    """JWT token for a reporter user."""
    return create_token("testreporter", "reporter", trino_access=False)


@pytest.fixture
def mock_adapter():
    """Fresh MockAdapter instance."""
    return MockAdapter()


def auth_cookies(token: str) -> dict[str, str]:
    """Helper: return cookie dict for authenticated requests."""
    return {"access_token": token}
