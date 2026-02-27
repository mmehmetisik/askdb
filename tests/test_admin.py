"""
Tests for admin-only endpoints (role-based access control).
"""
import pytest
from unittest.mock import AsyncMock, patch

from tests.conftest import auth_cookies


class TestRoleBasedAccess:
    """Verify that admin endpoints reject non-admin users."""

    ADMIN_ENDPOINTS = [
        ("GET", "/api/cache-stats"),
        ("POST", "/api/cache-clear"),
        ("GET", "/api/users"),
        ("GET", "/api/stats/overview"),
        ("GET", "/api/db-connections"),
        ("GET", "/api/system-info"),
        ("GET", "/api/table-profiles"),
    ]

    @pytest.mark.asyncio
    @pytest.mark.parametrize("method,path", ADMIN_ENDPOINTS)
    async def test_analyst_blocked(self, client, analyst_token, method, path):
        """Analyst role should get 403 on admin endpoints."""
        resp = await client.request(method, path, cookies=auth_cookies(analyst_token))
        assert resp.status_code == 403, f"{method} {path} should be 403 for analyst"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("method,path", ADMIN_ENDPOINTS)
    async def test_no_auth_blocked(self, client, method, path):
        """No token should get 401."""
        resp = await client.request(method, path)
        assert resp.status_code == 401, f"{method} {path} should be 401 without auth"

    @pytest.mark.asyncio
    async def test_admin_can_access_cache_stats(self, client, admin_token):
        """Admin role should be allowed."""
        resp = await client.get("/api/cache-stats", cookies=auth_cookies(admin_token))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_admin_users_list(self, client, admin_token):
        mock_adapter = AsyncMock()
        mock_adapter.fetch = AsyncMock(return_value=[])
        with patch("backend.admin.user_routes.get_auth_adapter", return_value=mock_adapter):
            resp = await client.get("/api/users", cookies=auth_cookies(admin_token))
        assert resp.status_code == 200
        assert resp.json()["success"] is True


class TestHealthEndpoint:
    """Health endpoint should be accessible without auth."""

    @pytest.mark.asyncio
    async def test_health_no_auth(self, client):
        with patch("backend.sql.schema.routes.get_adapter", new_callable=AsyncMock) as mock_get:
            mock_adapter = AsyncMock()
            mock_adapter.fetchval = AsyncMock(return_value=1)
            mock_get.return_value = mock_adapter
            resp = await client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"

    @pytest.mark.asyncio
    async def test_health_v1(self, client):
        with patch("backend.sql.schema.routes.get_adapter", new_callable=AsyncMock) as mock_get:
            mock_adapter = AsyncMock()
            mock_adapter.fetchval = AsyncMock(return_value=1)
            mock_get.return_value = mock_adapter
            resp = await client.get("/api/v1/health")
        assert resp.status_code == 200
