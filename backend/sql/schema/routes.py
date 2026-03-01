import json

from fastapi import APIRouter, HTTPException, Depends, Request

from backend.core.config import logger, build_dynamic_schema, DB_MODE
from backend.auth import get_current_user, require_admin
from backend.sql.execution.database import (
    get_adapter, get_auth_adapter, get_schema_info, get_all_allowed_tables,
    invalidate_dynamic_tables_cache, is_trino_active,
    run_sql, run_sql_trino, get_trino_schema_info, get_trino_status,
)
from backend.sql.llm.service import get_llm_info
from backend.sql.cache.service import get_cache_stats
from backend.core.i18n import t as _t, get_lang

router = APIRouter(tags=["schema"])


def _user_has_trino(user: dict) -> bool:
    if user["role"] == "admin":
        return True
    return bool(user.get("trino_access", False))


@router.get("/schema")
async def get_schema(user: dict = Depends(get_current_user)):
    """Erisim izni verilen tablolarin kolon bilgilerini dondurur."""
    use_trino = is_trino_active() and _user_has_trino(user)
    adapter = await get_auth_adapter()

    if use_trino:
        trino_tables = await get_trino_schema_info()
        tables = trino_tables if trino_tables else await get_schema_info()
    else:
        tables = await get_schema_info()

    # Profile filter
    if user["role"] != "admin":
        user_row = await adapter.fetchrow(
            "SELECT table_profile_id FROM app_users WHERE username = $1", user["username"]
        )
        if user_row:
            profile_id = user_row["table_profile_id"] if isinstance(user_row, dict) else user_row[0]
            if profile_id:
                profile = await adapter.fetchrow(
                    "SELECT allowed_tables FROM table_profiles WHERE id = $1", profile_id
                )
                if profile:
                    pt_str = profile["allowed_tables"] if isinstance(profile, dict) else profile[0]
                    profile_tables = set(json.loads(pt_str)) if pt_str else set()
                    if profile_tables:
                        tables = [t for t in tables if
                                  t.get("name") in profile_tables or
                                  t.get("full_name") in profile_tables or
                                  any(pt in (t.get("name", ""), t.get("full_name", "")) for pt in profile_tables)]

    # Connection metadata
    connections = []
    conn_table_map = {}
    try:
        conn_rows = await adapter.fetch(
            "SELECT name, db_type, host, is_active, allowed_tables FROM db_connections WHERE db_type != 'trino' ORDER BY id"
        )
        for cr in conn_rows:
            c = cr if isinstance(cr, dict) else dict(cr)
            conn_name = c["name"]
            connections.append({
                "name": conn_name, "db_type": c["db_type"],
                "host": c["host"], "active": bool(c["is_active"]),
            })
            try:
                at = json.loads(c.get("allowed_tables") or "[]")
                for t in at:
                    conn_table_map[t] = conn_name
            except Exception:
                pass
    except Exception:
        pass

    for t in tables:
        if not t.get("catalog"):
            tname = t.get("full_name") or t.get("name", "")
            conn_name = conn_table_map.get(tname, "")
            if conn_name:
                t["catalog"] = conn_name
                t["schema"] = "public"

    return {
        "tables": tables,
        "db_mode": "trino" if use_trino else DB_MODE,
        "trino_active": is_trino_active(),
        "connections": connections,
    }


@router.post("/schema/refresh")
async def refresh_schema(request: Request, _admin: dict = Depends(require_admin)):
    """Schema bilgisini yeniden olustur (admin-only)."""
    invalidate_dynamic_tables_cache()
    schema = await build_dynamic_schema()
    tables = await get_schema_info()
    return {"success": True, "message": _t("schema.refreshed", get_lang(request)), "table_count": len(tables)}


@router.get("/table-preview/{table_name:path}")
async def table_preview(table_name: str, request: Request, user: dict = Depends(get_current_user)):
    """Izin verilen tablonun on izleme verisini dondurur (ilk 50 satir)."""
    use_trino = is_trino_active() and _user_has_trino(user)

    if not use_trino:
        all_tables = await get_all_allowed_tables()
        if table_name not in all_tables:
            raise HTTPException(status_code=403, detail=_t("schema.tableNoAccess", get_lang(request)))
    try:
        safe_name = ".".join(f'"{part}"' for part in table_name.split("."))
        if use_trino:
            db_result = await run_sql_trino(f"SELECT * FROM {safe_name}", limit=50)
        else:
            db_result = await run_sql(f"SELECT * FROM {safe_name}", limit=50, selected_tables=[table_name])

        from backend.sql.routes import _to_legacy_result
        return {
            "table_name": table_name,
            "result": _to_legacy_result(db_result, lang=get_lang(request)),
            "column_types": db_result.get("column_types", []),
            "total_count": db_result.get("total_count", 0),
        }
    except Exception as e:
        logger.error(f"[TABLE PREVIEW] {table_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """Sistem saglik kontrolu."""
    try:
        adapter = await get_adapter()
        await adapter.fetchval("SELECT 1")
        db_status = "connected"
    except Exception as e:
        db_status = str(e)

    auth_status = None
    if DB_MODE == "trino":
        try:
            auth = await get_auth_adapter()
            await auth.fetchval("SELECT 1")
            auth_status = "connected"
        except Exception as e:
            auth_status = str(e)

    llm_info = get_llm_info()
    trino_status = get_trino_status()
    return {
        "status": "ok" if db_status == "connected" else "error",
        "database": db_status,
        "auth_database": auth_status,
        "db_mode": "trino" if trino_status["active"] else DB_MODE,
        "trino_active": trino_status["active"],
        "llm": llm_info,
    }


@router.get("/system-info")
async def system_info(_admin: dict = Depends(require_admin)):
    """Sistem bilgisi (admin-only)."""
    from backend.core.config import DB_TYPE, LLM_PROVIDER
    llm_info = get_llm_info()
    cache_info = get_cache_stats()
    return {
        "db_type": DB_TYPE,
        "db_mode": DB_MODE,
        "llm_provider": LLM_PROVIDER,
        "llm_info": llm_info,
        "cache": cache_info,
    }
