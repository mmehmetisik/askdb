"""
database.py  —  Connection lifecycle, query execution, and Trino management.
Table creation / seeding lives in migrations.py.
"""
import json as _json
import time as _time
from decimal import Decimal
from datetime import date, datetime, time, timedelta
from fastapi import HTTPException
from backend.core.config import DATABASE_URL, MAX_QUERY_ROWS, ALLOWED_TABLES, DB_TYPE, DB_MODE, TRINO_URL, AUTH_DATABASE_URL, AUTH_DB_TYPE, logger

# Active adapter instances
_adapter = None       # Query adapter (Trino or direct)
_auth_adapter = None  # Auth adapter (always writable)

# Dynamic Trino connection (admin panel toggle)
_trino_adapter = None
_trino_conn_id = None  # Active Trino db_connections ID

# Dynamic table cache (from db_connections)
_dynamic_tables_cache: dict = {"tables": set(), "timestamp": 0}
_DYNAMIC_CACHE_TTL = 60  # seconds


def _serialize_value(v):
    """Convert DB value to JSON-compatible format, preserving type info."""
    if v is None:
        return None
    if isinstance(v, Decimal):
        return int(v) if v == int(v) else float(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, time):
        return v.isoformat()
    if isinstance(v, timedelta):
        return str(v)
    if isinstance(v, (int, float, bool)):
        return v
    return str(v)


# =================== CONNECTION LIFECYCLE ===================

async def init_pool():
    """Create and start adapters based on DB_MODE."""
    global _adapter, _auth_adapter
    from .adapters import create_adapter

    if DB_MODE == "trino":
        _adapter = create_adapter("trino", TRINO_URL)
        try:
            await _adapter.init()
            logger.info("[TRINO] Query adapter started")
        except Exception as e:
            logger.error(f"Trino connection error: {type(e).__name__}: {e}")
            _adapter = None
            raise

        _auth_adapter = create_adapter(AUTH_DB_TYPE, AUTH_DATABASE_URL)
        try:
            await _auth_adapter.init()
            logger.info(f"[AUTH] Auth adapter started (type: {AUTH_DB_TYPE})")
        except Exception as e:
            logger.error(f"Auth DB connection error: {type(e).__name__}: {e}")
            _auth_adapter = None
            raise
    else:
        _adapter = create_adapter(DB_TYPE, DATABASE_URL)
        try:
            await _adapter.init()
            logger.info(f"Database connection successful (type: {DB_TYPE})")
        except Exception as e:
            logger.error(f"Database connection error: {type(e).__name__}: {e}")
            _adapter = None
            raise
        _auth_adapter = _adapter  # Same instance

    # Create tables & seed admin via migrations module
    try:
        from .migrations import ensure_all_tables
        await ensure_all_tables(_auth_adapter)
    except Exception as e:
        logger.error(f"Table creation error: {e}")

    # Auto-activate Trino if an active connection exists
    await _auto_activate_trino()


async def close_pool():
    global _adapter, _auth_adapter
    if _adapter:
        await _adapter.close()
    if _auth_adapter and _auth_adapter is not _adapter:
        await _auth_adapter.close()
    _adapter = None
    _auth_adapter = None


async def get_pool():
    """Return adapter. Backwards-compatible alias for get_adapter."""
    if _adapter is None:
        raise HTTPException(status_code=503, detail="Veritabani baglantisi kurulamadi")
    return _adapter


async def get_adapter():
    """Return query adapter (Trino or direct)."""
    if _adapter is None:
        raise HTTPException(status_code=503, detail="Veritabani baglantisi kurulamadi")
    return _adapter


async def get_auth_adapter():
    """Return auth adapter (always writable DB)."""
    if _auth_adapter is None:
        raise HTTPException(status_code=503, detail="Auth veritabani baglantisi kurulamadi")
    return _auth_adapter


# =================== QUERY EXECUTION ===================

async def run_sql(sql: str, limit: int | None = None) -> dict:
    """Execute a SELECT query and return serialized results."""
    adapter = await get_adapter()
    max_rows = limit or MAX_QUERY_ROWS
    clean_sql = sql.rstrip("; \n\t")

    result = await adapter.run_query(clean_sql, max_rows)

    serialized_rows = []
    for row in result["rows"]:
        serialized_rows.append([_serialize_value(v) for v in row])
    result["rows"] = serialized_rows

    return result


async def log_query(username: str, question: str, generated_sql: str,
                    execution_time_ms: int, row_count: int, is_trino: bool,
                    is_cached: bool, status: str = "success",
                    error_message: str = "", tables_used: list = None):
    """Log a query execution (fire-and-forget)."""
    try:
        user = await _auth_adapter.fetchrow(
            "SELECT id FROM app_users WHERE username = $1", username
        )
        user_id = user["id"] if user else None
        tables_json = _json.dumps(tables_used or [])
        await _auth_adapter.execute_command(
            """INSERT INTO query_logs
               (user_id, username, question, generated_sql, execution_time_ms,
                row_count, is_trino, is_cached, status, error_message, tables_used)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)""",
            user_id, username, question[:1000], generated_sql[:5000], execution_time_ms,
            row_count, is_trino, is_cached, status, error_message[:500], tables_json,
        )
    except Exception as e:
        logger.warning(f"[QUERY LOG] Failed to save: {e}")


# =================== DYNAMIC TABLE MANAGEMENT ===================

async def _get_dynamic_allowed_tables() -> set:
    """Read allowed tables from active db_connections (with cache)."""
    global _dynamic_tables_cache
    now = _time.time()
    if now - _dynamic_tables_cache["timestamp"] < _DYNAMIC_CACHE_TTL:
        return _dynamic_tables_cache["tables"]

    dynamic = set()
    try:
        if _auth_adapter:
            rows = await _auth_adapter.fetch(
                "SELECT allowed_tables FROM db_connections WHERE is_active = true"
            )
            for row in rows:
                tables_str = row["allowed_tables"] if isinstance(row, dict) else row[0]
                if isinstance(tables_str, str) and tables_str.strip() and tables_str != "[]":
                    tables = _json.loads(tables_str)
                    if isinstance(tables, list):
                        dynamic.update(tables)
    except Exception as e:
        logger.warning(f"[SCHEMA] Failed to read db_connections: {e}")

    _dynamic_tables_cache = {"tables": dynamic, "timestamp": now}
    return dynamic


def invalidate_dynamic_tables_cache():
    """Clear dynamic table cache (called when admin updates table list)."""
    global _dynamic_tables_cache
    _dynamic_tables_cache = {"tables": set(), "timestamp": 0}


async def get_all_allowed_tables() -> set:
    """Static ALLOWED_TABLES + dynamic tables from db_connections."""
    dynamic = await _get_dynamic_allowed_tables()
    return set(ALLOWED_TABLES) | dynamic


async def get_schema_info() -> list:
    """Return column info for ALLOWED_TABLES + db_connections tables."""
    adapter = await get_adapter()
    all_tables = await get_all_allowed_tables()

    if not all_tables:
        return []

    if DB_MODE == "trino":
        from backend.core.config import parse_tables_by_catalog
        import backend.core.config as cfg
        old_catalog = cfg.ALLOWED_TABLES_BY_CATALOG
        cfg.ALLOWED_TABLES_BY_CATALOG = parse_tables_by_catalog(all_tables)
        try:
            return await adapter.get_schema_info(all_tables)
        finally:
            cfg.ALLOWED_TABLES_BY_CATALOG = old_catalog

    return await adapter.get_schema_info(all_tables)


# =================== DYNAMIC TRINO MANAGEMENT ===================

async def _auto_activate_trino():
    """Auto-activate Trino connection at startup if one exists."""
    try:
        if _auth_adapter:
            conn = await _auth_adapter.fetchrow(
                "SELECT id, name, host, port, database_name, username, password FROM db_connections WHERE db_type = 'trino' AND is_active = true LIMIT 1"
            )
            if conn:
                c = conn if isinstance(conn, dict) else dict(conn)
                conn_id = c["id"]
                try:
                    await activate_trino(conn_id)
                    logger.info(f"[TRINO] Auto-activate successful: conn_id={conn_id}")
                except Exception as activate_err:
                    logger.warning(f"[TRINO] Auto-activate failed, deactivating in DB: {activate_err}")
                    # Deactivate in DB so it doesn't retry on next restart
                    try:
                        await _auth_adapter.execute_command(
                            "UPDATE db_connections SET is_active = false WHERE id = $1", conn_id
                        )
                    except Exception:
                        pass
    except Exception as e:
        logger.warning(f"[TRINO] Auto-activate check failed: {e}")


async def activate_trino(conn_id: int) -> dict:
    """Activate a Trino connection from db_connections."""
    global _trino_adapter, _trino_conn_id

    if _trino_adapter:
        try:
            await _trino_adapter.close()
        except Exception:
            pass
        _trino_adapter = None
        _trino_conn_id = None

    conn = await _auth_adapter.fetchrow(
        "SELECT id, name, host, port, database_name, username, password FROM db_connections WHERE id = $1 AND db_type = 'trino'",
        conn_id,
    )
    if not conn:
        raise HTTPException(status_code=404, detail="Trino baglantisi bulunamadi")

    c = conn if isinstance(conn, dict) else dict(conn)

    from .adapters import create_adapter
    db_name = c.get("database_name") or ""
    url = f"trino://{c['username']}@{c['host']}:{c['port']}/{db_name}"

    try:
        adapter = create_adapter("trino", url)
        await adapter.init()
        _trino_adapter = adapter
        _trino_conn_id = conn_id
        logger.info(f"[TRINO] Dynamic connection activated: {c['host']}:{c['port']}")
        return {"success": True, "message": "Trino baglantisi aktif edildi"}
    except Exception as e:
        logger.error(f"[TRINO] Connection error: {e}")
        raise HTTPException(status_code=500, detail=f"Trino baglanti hatasi: {e}")


async def deactivate_trino():
    """Deactivate the dynamic Trino connection."""
    global _trino_adapter, _trino_conn_id
    if _trino_adapter:
        try:
            await _trino_adapter.close()
        except Exception:
            pass
    _trino_adapter = None
    _trino_conn_id = None
    logger.info("[TRINO] Dynamic Trino connection deactivated")


def is_trino_active() -> bool:
    """Check if dynamic Trino connection is active."""
    return _trino_adapter is not None


def get_trino_status() -> dict:
    """Return Trino status."""
    return {
        "active": _trino_adapter is not None,
        "conn_id": _trino_conn_id,
    }


async def run_sql_trino(sql: str, limit: int | None = None) -> dict:
    """Execute query via Trino."""
    if not _trino_adapter:
        raise HTTPException(status_code=400, detail="Trino baglantisi aktif degil")

    max_rows = limit or MAX_QUERY_ROWS
    clean_sql = sql.rstrip("; \n\t")
    result = await _trino_adapter.run_query(clean_sql, max_rows)

    serialized_rows = []
    for row in result["rows"]:
        serialized_rows.append([_serialize_value(v) for v in row])
    result["rows"] = serialized_rows
    return result


async def get_trino_schema_info() -> list:
    """Get schema info via Trino (filtered by allowed_tables).

    Trino federation tablolari su kaynaklardan toplanir:
    1. trino_federation baglantisinin kendi allowed_tables'i
    2. Bos ise, TUM aktif (non-Trino) baglantilarin allowed_tables'i birlestirilir
    Boylece admin tek tek Trino kesfetmese bile, diger baglantilarda kesif
    yapildiysa tablolar Trino uzerinden gorulur.
    """
    if not _trino_adapter:
        return []

    tables = set()

    # 1. Trino baglantisinin kendi allowed_tables'i
    if _trino_conn_id and _auth_adapter:
        row = await _auth_adapter.fetchrow(
            "SELECT allowed_tables FROM db_connections WHERE id = $1", _trino_conn_id
        )
        if row:
            tables_str = row["allowed_tables"] if isinstance(row, dict) else row[0]
            if tables_str and tables_str != "[]":
                try:
                    tables = set(_json.loads(tables_str))
                except Exception:
                    pass

    # 2. Bos ise, tum aktif non-Trino baglantilarin tablolarini topla
    if not tables and _auth_adapter:
        try:
            rows = await _auth_adapter.fetch(
                "SELECT allowed_tables FROM db_connections WHERE is_active = true AND db_type != 'trino'"
            )
            for r in rows:
                ts = r["allowed_tables"] if isinstance(r, dict) else r[0]
                if ts and ts != "[]":
                    try:
                        tables.update(_json.loads(ts))
                    except Exception:
                        pass
        except Exception as e:
            logger.warning(f"[TRINO SCHEMA] Failed to read other connections: {e}")

    if not tables:
        return []

    from backend.core.config import parse_tables_by_catalog
    import backend.core.config as cfg
    old = cfg.ALLOWED_TABLES_BY_CATALOG
    cfg.ALLOWED_TABLES_BY_CATALOG = parse_tables_by_catalog(tables)
    try:
        return await _trino_adapter.get_schema_info(tables)
    finally:
        cfg.ALLOWED_TABLES_BY_CATALOG = old
