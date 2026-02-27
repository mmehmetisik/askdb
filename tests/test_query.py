"""
Tests for the query endpoint (text-to-SQL + execute-sql).
"""
import pytest
from unittest.mock import AsyncMock, patch

from tests.conftest import auth_cookies


DB_RESULT = {
    "headers": ["name", "email"],
    "rows": [["Alice", "alice@test.com"], ["Bob", "bob@test.com"]],
    "total_count": 2,
    "truncated": False,
    "column_types": ["text", "text"],
}


def _patch_query_deps(generated_sql="SELECT name, email FROM customers"):
    """Context manager that patches LLM, DB, and rate limit for query tests."""
    from contextlib import contextmanager

    @contextmanager
    def _ctx():
        patches = [
            patch("backend.sql.routes.generate_sql", new_callable=AsyncMock, return_value=generated_sql),
            patch("backend.sql.routes.run_sql", new_callable=AsyncMock, return_value=DB_RESULT),
            patch("backend.sql.routes.log_query", new_callable=AsyncMock),
            patch("backend.sql.routes.check_rate_limit", return_value=(True, {"limit": 20, "remaining": 19, "reset_after": 60})),
            patch("backend.sql.routes.get_cached", return_value=None),
            patch("backend.sql.routes.set_cached"),
        ]
        entered = [p.__enter__() for p in patches]
        try:
            yield entered
        finally:
            for p in patches:
                p.__exit__(None, None, None)

    return _ctx()


class TestTextToSQL:
    @pytest.mark.asyncio
    async def test_query_success(self, client, analyst_token):
        with _patch_query_deps():
            resp = await client.post(
                "/api/query",
                json={"query": "Show me all customers"},
                cookies=auth_cookies(analyst_token),
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["sql"] == "SELECT name, email FROM customers"
        assert len(data["result"]) == 3  # headers + 2 rows

    @pytest.mark.asyncio
    async def test_query_no_auth(self, client):
        resp = await client.post("/api/query", json={"query": "test"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_query_rate_limited(self, client, analyst_token):
        with patch("backend.sql.routes.check_rate_limit",
                   return_value=(False, {"limit": 20, "remaining": 0, "reset_after": 30})):
            resp = await client.post(
                "/api/query",
                json={"query": "test"},
                cookies=auth_cookies(analyst_token),
            )
        assert resp.status_code == 429

    @pytest.mark.asyncio
    async def test_query_v1_prefix(self, client, analyst_token):
        with _patch_query_deps():
            resp = await client.post(
                "/api/v1/query",
                json={"query": "Show customers"},
                cookies=auth_cookies(analyst_token),
            )
        assert resp.status_code == 200


class TestExecuteSQL:
    @pytest.mark.asyncio
    async def test_execute_safe_sql(self, client, analyst_token):
        with patch("backend.sql.routes.run_sql", new_callable=AsyncMock, return_value=DB_RESULT), \
             patch("backend.sql.routes.check_rate_limit", return_value=(True, {"limit": 20, "remaining": 19, "reset_after": 60})), \
             patch("backend.sql.routes.log_query", new_callable=AsyncMock):
            resp = await client.post(
                "/api/execute-sql",
                json={"sql": "SELECT * FROM customers"},
                cookies=auth_cookies(analyst_token),
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "result" in data

    @pytest.mark.asyncio
    async def test_execute_unsafe_sql(self, client, analyst_token):
        with patch("backend.sql.routes.check_rate_limit",
                   return_value=(True, {"limit": 20, "remaining": 19, "reset_after": 60})):
            resp = await client.post(
                "/api/execute-sql",
                json={"sql": "DROP TABLE customers"},
                cookies=auth_cookies(analyst_token),
            )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_execute_no_auth(self, client):
        resp = await client.post("/api/execute-sql", json={"sql": "SELECT 1"})
        assert resp.status_code == 401
