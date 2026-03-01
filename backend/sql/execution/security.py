"""SQL security validation — sqlglot AST parser based."""
import re
from sqlglot import parse as sqlglot_parse, exp
from sqlglot.errors import ParseError
from backend.core.config import ALLOWED_TABLES, DB_TYPE, DB_MODE, logger, get_all_allowed_tables_sync


# Dialect mapping (config -> sqlglot)
_DIALECT_MAP = {
    "postgresql": "postgres",
    "postgres": "postgres",
    "mysql": "mysql",
    "mssql": "tsql",
    "trino": "trino",
}

# Dangerous SQL commands (fallback regex check)
_DANGEROUS_RE = re.compile(
    r"\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|GRANT|REVOKE|EXECUTE|EXEC|COPY|LOAD|MERGE|REPLACE)\b",
    re.IGNORECASE,
)

# Dialect-specific blocked system schemas/tables
_BLOCKED_SCHEMAS = {
    "postgres": {"information_schema", "pg_catalog", "pg_tables", "pg_stat", "pg_shadow", "pg_roles", "pg_user"},
    "mysql": {"information_schema", "mysql", "performance_schema", "sys"},
    "tsql": {"information_schema", "sys", "master", "msdb", "tempdb"},
    "trino": {"information_schema", "system"},
}

# Always-blocked tables (all dialects)
_BLOCKED_TABLES = {"app_users", "syslogins", "sysusers"}


def _get_dialect(db_type: str | None = None) -> str:
    """Determine sqlglot dialect from config or explicit db_type."""
    if DB_MODE == "trino":
        return "trino"
    effective = (db_type or DB_TYPE).lower()
    return _DIALECT_MAP.get(effective, "postgres")


def _extract_tables(parsed) -> set[str]:
    """Extract referenced table names from AST."""
    tables = set()
    try:
        for table in parsed.find_all(exp.Table):
            name = table.name
            if not name:
                continue

            if DB_MODE == "trino":
                parts = []
                if table.catalog:
                    parts.append(table.catalog)
                if table.db:
                    parts.append(table.db)
                parts.append(name)
                full_name = ".".join(parts).lower()
                tables.add(full_name)
                tables.add(name.lower())
            else:
                tables.add(name.lower())
    except Exception as e:
        logger.warning(f"[SECURITY] Table extraction error: {e}")
    return tables


def _check_blocked(parsed, db_type: str | None = None) -> bool:
    """Check for access to blocked system schemas or tables."""
    dialect = _get_dialect(db_type)
    blocked_schemas = _BLOCKED_SCHEMAS.get(dialect, set())

    try:
        for table in parsed.find_all(exp.Table):
            name = (table.name or "").lower()
            db = (table.db or "").lower()
            catalog = (table.catalog or "").lower()

            if name in _BLOCKED_TABLES:
                logger.warning(f"[SECURITY] Blocked table access: {name}")
                return True

            for schema_ref in (db, catalog):
                if schema_ref and schema_ref in blocked_schemas:
                    logger.warning(f"[SECURITY] Blocked schema access: {schema_ref}.{name}")
                    return True

            if name in blocked_schemas:
                logger.warning(f"[SECURITY] Blocked schema/table: {name}")
                return True
    except Exception as e:
        logger.warning(f"[SECURITY] Blocked check error: {e}")
        return True  # Fail safe: block on error

    return False


def _extract_tables_for_logging(sql: str) -> list[str]:
    """Extract table names for query logging (simple regex)."""
    pattern = re.compile(r"\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_.]*)", re.IGNORECASE)
    return pattern.findall(sql)


def is_safe_sql(sql: str, db_type: str | None = None) -> bool:
    """
    Validate SQL query safety (AST parser + regex).

    Checks:
    1. Block empty queries
    2. Block multiple statements
    3. AST statement type check (SELECT/WITH only)
    4. Dangerous keyword regex (fallback)
    5. Block system schema/table access
    6. Allow only permitted tables
    """
    stripped = sql.strip().rstrip(";").strip()

    # 1) Empty query
    if not stripped:
        logger.warning("[SECURITY] Empty query")
        return False

    # 2) Multiple statements
    if ";" in stripped:
        logger.warning("[SECURITY] Multiple statements detected")
        return False

    # 3) Dangerous keyword regex (fallback — before parser)
    if _DANGEROUS_RE.search(stripped):
        logger.warning(f"[SECURITY] Dangerous SQL command: {stripped[:80]}")
        return False

    # 4) Parse SQL to AST
    dialect = _get_dialect(db_type)
    try:
        statements = sqlglot_parse(stripped, dialect=dialect)
    except ParseError as e:
        logger.warning(f"[SECURITY] SQL parse error: {e}")
        return False
    except Exception as e:
        logger.error(f"[SECURITY] Unexpected parse error: {e}")
        return False

    # Must be single statement
    if len(statements) != 1:
        logger.warning(f"[SECURITY] Multiple statements parsed: {len(statements)}")
        return False

    parsed = statements[0]

    # 5) Statement type check — only SELECT allowed
    if not isinstance(parsed, exp.Select):
        logger.warning(f"[SECURITY] Disallowed statement type: {type(parsed).__name__}")
        return False

    # 6) Blocked schema/table check
    if _check_blocked(parsed, db_type):
        return False

    # 7) Allowed table check (static + dynamic from db_connections)
    referenced_tables = _extract_tables(parsed)
    if referenced_tables:
        common_aliases = {"src", "t", "t1", "t2", "tmp", "cte", "ranked", "base", "agg", "sub", "s", "r", "_sub"}
        real_tables = referenced_tables - common_aliases

        if real_tables:
            all_allowed = get_all_allowed_tables_sync()
            allowed_lower = {t.lower() for t in all_allowed}
            if DB_MODE == "trino":
                allowed_short = {t.split(".")[-1].lower() for t in all_allowed}
                unauthorized = {t for t in real_tables if t not in allowed_lower and t not in allowed_short}
            else:
                unauthorized = real_tables - allowed_lower

            if unauthorized:
                logger.warning(f"[SECURITY] Unauthorized table access: {unauthorized} (allowed: {len(allowed_lower)} tables)")
                return False

    return True
