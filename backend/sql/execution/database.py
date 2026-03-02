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
import backend.core.config as _cfg

# Active adapter instances
_adapter = None       # Query adapter (Trino or direct)
_auth_adapter = None  # Auth adapter (always writable)

# Dynamic Trino connection (admin panel toggle)
_trino_adapter = None
_trino_conn_id = None  # Active Trino db_connections ID

# Dynamic direct-mode adapters (each db_connection gets its own adapter)
_direct_adapters: dict = {}     # conn_id → adapter instance
_table_conn_map: dict = {}      # table_name → conn_id
_conn_metadata: dict = {}       # conn_id → {name, db_type, ...}

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

    # Initialize direct-mode adapters for each db_connection
    if DB_MODE != "trino":
        await init_direct_adapters()

    # Auto-activate Trino if an active connection exists
    await _auto_activate_trino()


async def close_pool():
    global _adapter, _auth_adapter
    await close_direct_adapters()
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

async def run_sql(sql: str, limit: int | None = None,
                  selected_tables: list[str] | None = None) -> dict:
    """Execute a SELECT query, routing to the correct adapter."""
    adapter = await resolve_adapter_for_tables(selected_tables)
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
    # Guvenlik modulunun de gorebilmesi icin sync set'i guncelle
    _cfg.DYNAMIC_ALLOWED_TABLES = dynamic
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

    # DIRECT MODE: Query each adapter for its own tables
    # 1. Main adapter tables (those NOT in any dynamic connection)
    main_tables = {t for t in all_tables if t not in _table_conn_map}
    result = []

    if main_tables:
        try:
            result.extend(await adapter.get_schema_info(main_tables))
        except Exception as e:
            logger.warning(f"[SCHEMA] Main adapter schema error: {e}")

    # 2. Dynamic adapter tables (grouped by conn_id)
    conn_tables: dict[int, set] = {}
    for t in all_tables:
        if t in _table_conn_map:
            cid = _table_conn_map[t]
            conn_tables.setdefault(cid, set()).add(t)

    for conn_id, tables in conn_tables.items():
        dyn_adapter = _direct_adapters.get(conn_id)
        if not dyn_adapter:
            logger.warning(f"[SCHEMA] No adapter for conn_id={conn_id}, skipping {len(tables)} tables")
            continue
        try:
            schema_info = await dyn_adapter.get_schema_info(tables)
            conn_name = _conn_metadata.get(conn_id, {}).get("name", f"conn_{conn_id}")
            conn_db_type = _conn_metadata.get(conn_id, {}).get("db_type", "unknown")
            for t_info in schema_info:
                if not t_info.get("catalog"):
                    t_info["catalog"] = conn_name
                    t_info["schema"] = "public"
                t_info["db_type"] = conn_db_type
            result.extend(schema_info)
        except Exception as e:
            logger.warning(f"[SCHEMA] Dynamic adapter schema error (conn_id={conn_id}): {e}")

    return result


# =================== COLUMN VALUE PROFILING ===================

_TEXT_TYPES = frozenset({
    "character varying", "varchar", "text", "nvarchar", "char", "nchar",
    "character", "enum", "set", "ntext", "longtext", "mediumtext", "tinytext",
})


async def profile_column_values(schema_info: list, max_distinct: int = 25) -> dict:
    """Profile text/varchar columns to discover categorical values for LLM context.

    Returns: {table_full_name: {col_name: [val1, val2, ...]}}
    Only includes columns with <= max_distinct unique non-null values.
    """
    profiles: dict[str, dict[str, list[str]]] = {}

    for table in schema_info:
        tbl_full = table.get("full_name") or table["name"]
        tbl_name = table["name"]
        text_cols = [c["name"] for c in table["columns"]
                     if c["type"].lower() in _TEXT_TYPES]
        if not text_cols:
            continue

        # Resolve adapter for this table
        try:
            adapter = await resolve_adapter_for_tables([tbl_full])
        except Exception:
            continue

        dialect = adapter.dialect()
        table_profiles: dict[str, list[str]] = {}

        for col_name in text_cols:
            try:
                sql = _build_distinct_sql(
                    dialect, tbl_name, col_name, max_distinct + 1, table,
                )
                rows = await adapter.fetch(sql)
                values = []
                for r in rows:
                    v = list(r.values())[0] if isinstance(r, dict) else r[0]
                    if v is not None:
                        values.append(str(v))

                if len(values) <= max_distinct and values:
                    table_profiles[col_name] = sorted(values)
            except Exception as e:
                logger.debug(f"[PROFILE] {tbl_full}.{col_name}: {e}")
                continue

        if table_profiles:
            profiles[tbl_full] = table_profiles

    profiled_count = sum(len(v) for v in profiles.values())
    if profiled_count:
        logger.info(f"[PROFILE] {profiled_count} categorical columns profiled across {len(profiles)} tables")
    return profiles


def _build_distinct_sql(dialect: str, table_name: str, col_name: str,
                        limit: int, table_meta: dict) -> str:
    """Build dialect-specific SELECT DISTINCT query."""
    if dialect == "postgresql":
        return (f'SELECT DISTINCT "{col_name}" FROM "{table_name}" '
                f'WHERE "{col_name}" IS NOT NULL ORDER BY "{col_name}" LIMIT {limit}')
    elif dialect == "mysql":
        return (f"SELECT DISTINCT `{col_name}` FROM `{table_name}` "
                f"WHERE `{col_name}` IS NOT NULL ORDER BY `{col_name}` LIMIT {limit}")
    elif dialect == "mssql":
        return (f"SELECT DISTINCT TOP {limit} [{col_name}] FROM [{table_name}] "
                f"WHERE [{col_name}] IS NOT NULL ORDER BY [{col_name}]")
    elif dialect == "trino":
        catalog = table_meta.get("catalog", "")
        schema = table_meta.get("schema", "")
        if catalog and schema:
            fqn = f'"{catalog}"."{schema}"."{table_name}"'
        else:
            fqn = f'"{table_name}"'
        return (f'SELECT DISTINCT "{col_name}" FROM {fqn} '
                f'WHERE "{col_name}" IS NOT NULL ORDER BY "{col_name}" LIMIT {limit}')
    else:
        return (f'SELECT DISTINCT "{col_name}" FROM "{table_name}" '
                f'WHERE "{col_name}" IS NOT NULL ORDER BY "{col_name}" LIMIT {limit}')


# =================== DIRECT-MODE MULTI-DB ADAPTERS ===================

def _build_adapter_from_conn(c: dict):
    """Build adapter from db_connections row dict."""
    from .adapters import create_adapter
    from urllib.parse import quote_plus

    db_type = c["db_type"]
    _pw = quote_plus(str(c["password"])) if c.get("password") else ""
    _user = quote_plus(str(c["username"])) if c.get("username") else ""
    ssl_enabled = bool(c.get("ssl_enabled", False))

    if db_type == "postgresql":
        ssl_suffix = "?sslmode=require" if ssl_enabled else ""
        url = f"postgresql://{_user}:{_pw}@{c['host']}:{c['port']}/{c['database_name']}{ssl_suffix}"
    elif db_type in ("mysql", "mariadb"):
        url = f"mysql://{_user}:{_pw}@{c['host']}:{c['port']}/{c['database_name']}"
    elif db_type == "mssql":
        url = f"mssql://{_user}:{_pw}@{c['host']}:{c['port']}/{c['database_name']}"
    else:
        raise ValueError(f"Unsupported db_type for direct adapter: {db_type}")

    adapter_type = "mysql" if db_type == "mariadb" else db_type
    return create_adapter(adapter_type, url, ssl_enabled=ssl_enabled)


async def init_direct_adapters():
    """Initialize adapters for all active non-Trino db_connections (direct mode)."""
    global _direct_adapters, _table_conn_map, _conn_metadata
    if not _auth_adapter:
        return

    try:
        rows = await _auth_adapter.fetch(
            "SELECT id, name, db_type, host, port, database_name, "
            "username, password, ssl_enabled, allowed_tables "
            "FROM db_connections WHERE is_active = true AND db_type != 'trino'"
        )
    except Exception as e:
        logger.warning(f"[DIRECT] Failed to read db_connections: {e}")
        return

    for row in rows:
        c = row if isinstance(row, dict) else dict(row)
        conn_id = c["id"]
        try:
            adapter = _build_adapter_from_conn(c)
            await adapter.init()
            _direct_adapters[conn_id] = adapter
            _conn_metadata[conn_id] = {
                "name": c["name"], "db_type": c["db_type"],
                "host": c.get("host", ""), "database_name": c.get("database_name", ""),
            }
            # Map each allowed table to this connection
            tables_str = c.get("allowed_tables") or "[]"
            if tables_str and tables_str != "[]":
                tables = _json.loads(tables_str)
                for t in (tables if isinstance(tables, list) else []):
                    _table_conn_map[t] = conn_id
            logger.info(f"[DIRECT] Adapter initialized: {c['name']} ({c['db_type']}, id={conn_id})")
        except Exception as e:
            logger.warning(f"[DIRECT] Failed to init adapter for {c['name']}: {e}")

    # Guvenlik modulune tum dinamik tablolari bildir
    all_dynamic = set(_table_conn_map.keys())
    _cfg.DYNAMIC_ALLOWED_TABLES = all_dynamic
    logger.info(f"[DIRECT] DYNAMIC_ALLOWED_TABLES updated: {len(all_dynamic)} tables")


async def close_direct_adapters():
    """Close all dynamic direct-mode adapters."""
    global _direct_adapters, _table_conn_map, _conn_metadata
    for conn_id, adapter in _direct_adapters.items():
        try:
            await adapter.close()
        except Exception:
            pass
    _direct_adapters.clear()
    _table_conn_map.clear()
    _conn_metadata.clear()


async def reinit_direct_adapters():
    """Re-initialize all direct adapters (called after admin changes)."""
    if DB_MODE == "trino":
        return
    await close_direct_adapters()
    await init_direct_adapters()
    invalidate_dynamic_tables_cache()


def get_db_type_for_tables(selected_tables: list[str] | None = None) -> str:
    """Secilen tablolarin ait oldugu veritabani tipini dondur.

    Eger tablo bir db_connection'a aitse o baglantinin db_type'ini dondurur.
    Aksi halde ana DB_TYPE (postgresql) doner.
    """
    if not selected_tables:
        return DB_TYPE
    for table in selected_tables:
        if table in _table_conn_map:
            conn_id = _table_conn_map[table]
            meta = _conn_metadata.get(conn_id, {})
            return meta.get("db_type", DB_TYPE)
    return DB_TYPE


async def resolve_adapter_for_tables(selected_tables: list[str] | None = None):
    """Determine which adapter handles the given tables.

    - None or empty → main adapter
    - All tables in one connection → that connection's adapter
    - Tables span multiple connections → HTTP 400 error
    """
    if not selected_tables:
        return await get_adapter()

    conn_ids = set()
    has_main_tables = False

    for table in selected_tables:
        if table in _table_conn_map:
            conn_ids.add(_table_conn_map[table])
        else:
            has_main_tables = True

    if has_main_tables and conn_ids:
        raise HTTPException(
            status_code=400,
            detail="Bu sorgu birden fazla veritabanindaki tablolari kullaniyor. "
                   "Cross-database sorgular icin Trino modunu aktif edin.",
        )
    if len(conn_ids) > 1:
        raise HTTPException(
            status_code=400,
            detail="Bu sorgu birden fazla veritabanindaki tablolari kullaniyor. "
                   "Cross-database sorgular icin Trino modunu aktif edin.",
        )

    if len(conn_ids) == 1:
        conn_id = conn_ids.pop()
        adapter = _direct_adapters.get(conn_id)
        if not adapter:
            raise HTTPException(
                status_code=503,
                detail=f"Veritabani baglantisi hazir degil (conn_id={conn_id})",
            )
        return adapter

    return await get_adapter()


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


def _build_trino_schema_cache(tables: list):
    """Trino schema text ve table map cache'le (LLM prompt icin).

    get_trino_schema_info() sonucu bu fonksiyona verilir.
    full_name'li CREATE TABLE satirlari olusturulur.
    """
    import backend.core.config as cfg

    if not tables:
        cfg.TRINO_DYNAMIC_SCHEMA = ""
        cfg.TRINO_TABLE_MAP = {}
        return

    lines = []
    _temp_map: dict[str, str] = {}
    _duplicates: set[str] = set()

    for table in tables:
        tbl_name = table.get("full_name") or table["name"]
        bare_name = table.get("name")
        cols = []
        for col in table.get("columns", []):
            pk = " PRIMARY KEY" if col.get("is_pk") else ""
            nullable = "" if col.get("nullable") else " NOT NULL"
            cols.append(f"  {col['name']} {col['type'].upper()}{pk}{nullable}")
        lines.append(f"CREATE TABLE {tbl_name} (\n" + ",\n".join(cols) + "\n);")

        # Table map: bare_name -> full_name
        fn = table.get("full_name")
        if fn and bare_name and fn.count(".") == 2:
            if bare_name in _temp_map and _temp_map[bare_name] != fn:
                _duplicates.add(bare_name)
            _temp_map[bare_name] = fn

    cfg.TRINO_DYNAMIC_SCHEMA = "\n\n".join(lines)
    cfg.TRINO_TABLE_MAP = {k: v for k, v in _temp_map.items() if k not in _duplicates}

    if _duplicates:
        logger.warning(f"[TRINO SCHEMA] Table name conflicts (skipped from map): {_duplicates}")
    logger.info(f"[TRINO SCHEMA] Cached schema ({len(tables)} tables), "
                f"table map ({len(cfg.TRINO_TABLE_MAP)} entries): {list(cfg.TRINO_TABLE_MAP.keys())}")


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
    #    ONEMLI: Tablo isimlerini Trino catalog.schema.table formatina donustur
    #    Aksi halde duz isimler "hive" kataloğuna atanir ve hata olusur
    if not tables and _auth_adapter:
        try:
            rows = await _auth_adapter.fetch(
                "SELECT name, db_type, database_name, allowed_tables "
                "FROM db_connections WHERE is_active = true AND db_type != 'trino'"
            )
            for r in rows:
                r = r if isinstance(r, dict) else dict(r)
                conn_name = r["name"]
                db_type = r.get("db_type", "postgresql")
                db_name = r.get("database_name", "public")
                ts = r.get("allowed_tables", "[]")
                if ts and ts != "[]":
                    try:
                        table_list = _json.loads(ts)
                        for t in (table_list if isinstance(table_list, list) else []):
                            if t.count(".") >= 2:
                                # Zaten tam nitelikli (catalog.schema.table)
                                tables.add(t)
                            elif t.count(".") == 1:
                                # schema.table → catalog ekle
                                tables.add(f"{conn_name}.{t}")
                            else:
                                # Duz tablo adi → catalog + schema ekle
                                if db_type in ("mysql", "mariadb"):
                                    schema = db_name  # MySQL'de schema = database adi
                                else:
                                    schema = "public"  # PostgreSQL varsayilan
                                tables.add(f"{conn_name}.{schema}.{t}")
                    except Exception:
                        pass
        except Exception as e:
            logger.warning(f"[TRINO SCHEMA] Failed to read other connections: {e}")

    if not tables:
        logger.warning("[TRINO SCHEMA] No tables found for Trino schema")
        return []

    from backend.core.config import parse_tables_by_catalog
    import backend.core.config as cfg
    old = cfg.ALLOWED_TABLES_BY_CATALOG
    by_catalog = parse_tables_by_catalog(tables)
    logger.info(f"[TRINO SCHEMA] Tables: {len(tables)}, Catalogs: {list(by_catalog.keys())}")
    cfg.ALLOWED_TABLES_BY_CATALOG = by_catalog
    try:
        result = await _trino_adapter.get_schema_info(tables)
        logger.info(f"[TRINO SCHEMA] Result: {len(result)} tables with columns")

        # Trino schema text + table map cache'le (LLM prompt icin)
        _build_trino_schema_cache(result)

        return result
    except Exception as e:
        logger.error(f"[TRINO SCHEMA] get_schema_info failed: {type(e).__name__}: {e}")
        raise
    finally:
        cfg.ALLOWED_TABLES_BY_CATALOG = old
