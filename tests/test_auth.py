"""
Tests for authentication endpoints (login, logout, me).
"""
import pytest
from unittest.mock import AsyncMock, patch

from backend.auth import hash_password
from tests.conftest import auth_cookies


MOCK_USER = {
    "id": 1,
    "username": "testadmin",
    "password": hash_password("Admin123!"),
    "role": "admin",
    "trino_access": True,
    "table_profile_id": None,
}


def _mock_adapter(user_row=None):
    """Return a mock adapter whose fetchrow returns user_row."""
    adapter = AsyncMock()
    adapter.fetchrow = AsyncMock(return_value=user_row)
    adapter.fetch = AsyncMock(return_value=[])
    adapter.fetchval = AsyncMock(return_value=1)
    adapter.execute_command = AsyncMock()
    return adapter


# ── Login ──

class TestLogin:
    @pytest.mark.asyncio
    async def test_login_success(self, client):
        with patch("backend.auth.routes.get_auth_adapter", return_value=_mock_adapter(MOCK_USER)):
            resp = await client.post("/api/login", json={"username": "testadmin", "password": "Admin123!"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["role"] == "admin"
        assert data["username"] == "testadmin"
        assert "access_token" in resp.cookies

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client):
        with patch("backend.auth.routes.get_auth_adapter", return_value=_mock_adapter(MOCK_USER)):
            resp = await client.post("/api/login", json={"username": "testadmin", "password": "wrong"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_login_no_user(self, client):
        with patch("backend.auth.routes.get_auth_adapter", return_value=_mock_adapter(None)):
            resp = await client.post("/api/login", json={"username": "nobody", "password": "test"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_login_empty_fields(self, client):
        resp = await client.post("/api/login", json={"username": "", "password": ""})
        assert resp.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_login_v1_prefix(self, client):
        with patch("backend.auth.routes.get_auth_adapter", return_value=_mock_adapter(MOCK_USER)):
            resp = await client.post("/api/v1/login", json={"username": "testadmin", "password": "Admin123!"})
        assert resp.status_code == 200
        assert resp.json()["success"] is True


# ── Logout ──

class TestLogout:
    @pytest.mark.asyncio
    async def test_logout(self, client):
        resp = await client.post("/api/logout")
        assert resp.status_code == 200
        assert resp.json()["success"] is True


# ── Me ──

class TestMe:
    @pytest.mark.asyncio
    async def test_me_authenticated(self, client, admin_token):
        resp = await client.get("/api/me", cookies=auth_cookies(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "testadmin"
        assert data["role"] == "admin"

    @pytest.mark.asyncio
    async def test_me_no_token(self, client):
        resp = await client.get("/api/me")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_me_analyst(self, client, analyst_token):
        resp = await client.get("/api/me", cookies=auth_cookies(analyst_token))
        assert resp.status_code == 200
        assert resp.json()["role"] == "analyst"

    @pytest.mark.asyncio
    async def test_me_v1_prefix(self, client, admin_token):
        resp = await client.get("/api/v1/me", cookies=auth_cookies(admin_token))
        assert resp.status_code == 200
        assert resp.json()["username"] == "testadmin"
