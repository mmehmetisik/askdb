"""
Tests for SQL security validation (backend/sql/execution/security.py).
Pure function tests — no mocking or DB required.
"""
import pytest
from backend.sql.execution import is_safe_sql


# ── Safe queries (should pass) ──

class TestSafeSQLAllowed:
    def test_simple_select(self):
        assert is_safe_sql("SELECT * FROM customers") is True

    def test_select_with_where(self):
        assert is_safe_sql("SELECT name FROM customers WHERE customer_id = 1") is True

    def test_select_with_join(self):
        sql = "SELECT c.name, o.total_amount FROM customers c JOIN orders o ON c.customer_id = o.customer_id"
        assert is_safe_sql(sql) is True

    def test_select_with_aggregation(self):
        sql = "SELECT customer_id, COUNT(*) as cnt FROM orders GROUP BY customer_id"
        assert is_safe_sql(sql) is True

    def test_select_with_subquery(self):
        sql = "SELECT name FROM customers WHERE customer_id IN (SELECT customer_id FROM orders)"
        assert is_safe_sql(sql) is True

    def test_select_with_order_limit(self):
        sql = "SELECT * FROM orders ORDER BY order_date DESC LIMIT 10"
        assert is_safe_sql(sql) is True

    def test_select_with_cte(self):
        sql = "WITH ranked AS (SELECT name, ROW_NUMBER() OVER() as rn FROM customers) SELECT * FROM ranked"
        assert is_safe_sql(sql) is True

    def test_select_with_ilike(self):
        sql = "SELECT * FROM customers WHERE name ILIKE '%ali%'"
        assert is_safe_sql(sql) is True

    def test_select_three_table_join(self):
        sql = """SELECT c.name, o.order_id, oi.product_name
                 FROM customers c
                 JOIN orders o ON c.customer_id = o.customer_id
                 JOIN order_items oi ON o.order_id = oi.order_id"""
        assert is_safe_sql(sql) is True


# ── Dangerous queries (should block) ──

class TestSafeSQLBlocked:
    def test_empty_query(self):
        assert is_safe_sql("") is False
        assert is_safe_sql("  ") is False

    def test_drop_table(self):
        assert is_safe_sql("DROP TABLE customers") is False

    def test_delete_from(self):
        assert is_safe_sql("DELETE FROM customers WHERE customer_id = 1") is False

    def test_update_set(self):
        assert is_safe_sql("UPDATE customers SET name = 'hacked'") is False

    def test_insert_into(self):
        assert is_safe_sql("INSERT INTO customers (name) VALUES ('test')") is False

    def test_truncate(self):
        assert is_safe_sql("TRUNCATE customers") is False

    def test_alter_table(self):
        assert is_safe_sql("ALTER TABLE customers ADD COLUMN hacked TEXT") is False

    def test_multiple_statements(self):
        assert is_safe_sql("SELECT 1; DROP TABLE customers") is False

    def test_semicolon_injection(self):
        assert is_safe_sql("SELECT * FROM customers; DELETE FROM orders") is False

    def test_grant_revoke(self):
        assert is_safe_sql("GRANT ALL ON customers TO public") is False
        assert is_safe_sql("REVOKE ALL ON customers FROM public") is False


# ── Blocked tables and schemas ──

class TestSafeSQLBlockedTables:
    def test_app_users_blocked(self):
        assert is_safe_sql("SELECT * FROM app_users") is False

    def test_pg_catalog_blocked(self):
        assert is_safe_sql("SELECT * FROM pg_catalog.pg_tables") is False

    def test_information_schema_blocked(self):
        assert is_safe_sql("SELECT * FROM information_schema.tables") is False


# ── Unauthorized tables ──

class TestSafeSQLUnauthorizedTables:
    def test_unknown_table_blocked(self):
        assert is_safe_sql("SELECT * FROM secret_data") is False

    def test_allowed_table_ok(self):
        assert is_safe_sql("SELECT * FROM customers") is True
        assert is_safe_sql("SELECT * FROM orders") is True
        assert is_safe_sql("SELECT * FROM order_items") is True
