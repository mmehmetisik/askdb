import json

import httpx
from fastapi import APIRouter, HTTPException, Depends, Request

from backend.core.i18n import t as _t, get_lang
from backend.core.config import (
    logger, build_dynamic_schema,
    RAILWAY_API_TOKEN, RAILWAY_PROJECT_ID, RAILWAY_TRINO_SERVICE_ID, RAILWAY_TRINO_ENV_ID,
)
from backend.core.models import DBConnectionCreate, DBConnectionTest, TableProfileCreate
from backend.auth import get_current_user, require_admin
from backend.sql.execution.database import (
    get_auth_adapter, invalidate_dynamic_tables_cache, reinit_direct_adapters,
    activate_trino, deactivate_trino, is_trino_active, get_trino_status,
)
from backend.sql.cache.service import get_cache_stats, invalidate_all

router = APIRouter(tags=["admin"])


# ── Cache ──

@router.get("/cache-stats")
async def cache_stats(_admin: dict = Depends(require_admin)):
    """Cache istatistiklerini dondur (admin-only)."""
    return get_cache_stats()


@router.post("/cache-clear")
async def cache_clear(request: Request, _admin: dict = Depends(require_admin)):
    """Tum cache'i temizle (admin-only)."""
    invalidate_all()
    return {"success": True, "message": _t("cache.cleared", get_lang(request))}


# ── Trino Management ──

@router.post("/trino/activate/{conn_id}")
async def activate_trino_endpoint(conn_id: int, _admin: dict = Depends(require_admin)):
    """Trino baglantisini aktif et (admin-only)."""
    result = await activate_trino(conn_id)
    adapter = await get_auth_adapter()
    await adapter.execute_command(
        "UPDATE db_connections SET is_active = true WHERE id = $1", conn_id
    )
    invalidate_dynamic_tables_cache()
    await build_dynamic_schema()
    return result


@router.post("/trino/deactivate")
async def deactivate_trino_endpoint(request: Request, _admin: dict = Depends(require_admin)):
    """Trino baglantisini deaktif et (admin-only)."""
    status = get_trino_status()
    conn_id = status["conn_id"]
    await deactivate_trino()
    if conn_id:
        adapter = await get_auth_adapter()
        await adapter.execute_command(
            "UPDATE db_connections SET is_active = false WHERE id = $1", conn_id
        )
    invalidate_dynamic_tables_cache()
    await build_dynamic_schema()
    return {"success": True, "message": _t("trino.deactivated", get_lang(request))}


@router.post("/trino/restart")
async def restart_trino_endpoint(request: Request, _admin: dict = Depends(require_admin)):
    """Trino baglantisini yeniden baslat (deactivate + activate) (admin-only)."""
    status = get_trino_status()
    conn_id = status.get("conn_id")
    if not conn_id:
        raise HTTPException(status_code=400, detail="Aktif Trino baglantisi yok. Restart yapilamaz.")
    await deactivate_trino()
    invalidate_dynamic_tables_cache()
    result = await activate_trino(conn_id)
    await build_dynamic_schema()
    logger.info(f"Trino restarted: conn_id={conn_id}")
    return {"success": True, "message": "Trino baglantisi yeniden baslatildi.", "connection": result}


@router.get("/trino/status")
async def trino_status_endpoint(user: dict = Depends(get_current_user)):
    """Trino durumunu dondur."""
    status = get_trino_status()
    if user["role"] == "admin":
        status["user_has_access"] = True
    else:
        status["user_has_access"] = bool(user.get("trino_access", False))
    return status


# ── Railway Trino Service Control ──

RAILWAY_GQL_URL = "https://backboard.railway.app/graphql/v2"


async def _railway_gql(query: str, variables: dict = None) -> dict:
    """Railway GraphQL API call."""
    if not RAILWAY_API_TOKEN:
        return {"errors": [{"message": "RAILWAY_API_TOKEN not configured"}]}
    headers = {
        "Authorization": f"Bearer {RAILWAY_API_TOKEN}",
        "Content-Type": "application/json",
    }
    payload: dict = {"query": query}
    if variables:
        payload["variables"] = variables
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(RAILWAY_GQL_URL, json=payload, headers=headers)
        if resp.status_code != 200:
            logger.error(f"[RAILWAY] API HTTP {resp.status_code}: {resp.text[:500]}")
            return {"errors": [{"message": f"Railway API HTTP {resp.status_code}: {resp.text[:200]}"}]}
        try:
            return resp.json()
        except Exception:
            logger.error(f"[RAILWAY] Invalid JSON response: {resp.text[:500]}")
            return {"errors": [{"message": f"Railway API gecersiz yanit: {resp.text[:200]}"}]}


async def _get_railway_environment_id() -> str:
    """Railway production environment ID'sini getir."""
    # Direkt env variable varsa API sorgusu yapmaya gerek yok
    if RAILWAY_TRINO_ENV_ID:
        return RAILWAY_TRINO_ENV_ID
    query = """
    query($projectId: String!) {
      project(id: $projectId) {
        environments {
          edges {
            node { id name }
          }
        }
      }
    }
    """
    result = await _railway_gql(query, {"projectId": RAILWAY_PROJECT_ID})
    edges = (
        result.get("data", {})
        .get("project", {})
        .get("environments", {})
        .get("edges", [])
    )
    for edge in edges:
        node = edge.get("node", {})
        if node.get("name", "").lower() == "production":
            return node["id"]
    return edges[0]["node"]["id"] if edges else ""


@router.get("/trino/railway/status")
async def trino_railway_status(_admin: dict = Depends(require_admin)):
    """Railway'deki Trino servisinin durumunu kontrol et (admin-only)."""
    if not RAILWAY_API_TOKEN:
        return {"success": True, "configured": False, "running": False}

    query = """
    query($serviceId: String!) {
      service(id: $serviceId) {
        name
        deployments(first: 1) {
          edges {
            node { id status createdAt }
          }
        }
      }
    }
    """
    result = await _railway_gql(query, {"serviceId": RAILWAY_TRINO_SERVICE_ID})

    if "errors" in result and not result.get("data"):
        return {"success": False, "configured": True, "running": False,
                "message": str(result["errors"])}

    service = result.get("data", {}).get("service", {})
    edges = service.get("deployments", {}).get("edges", [])

    if not edges:
        return {"success": True, "configured": True, "running": False,
                "status": "NO_DEPLOYMENT", "service_name": service.get("name", "")}

    latest = edges[0]["node"]
    status = latest["status"]
    running = status in ("SUCCESS",)
    deploying = status in ("DEPLOYING", "BUILDING", "INITIALIZING", "WAITING")

    return {
        "success": True,
        "configured": True,
        "running": running,
        "deploying": deploying,
        "status": status,
        "deployment_id": latest["id"],
        "service_name": service.get("name", ""),
        "created_at": latest.get("createdAt", ""),
    }


@router.post("/trino/railway/stop")
async def trino_railway_stop(_admin: dict = Depends(require_admin)):
    """Railway'deki Trino servisini durdur — para yazmayi keser (admin-only)."""
    if not RAILWAY_API_TOKEN:
        raise HTTPException(status_code=400, detail="Railway API token yapilandirilmamis.")

    # En son deployment'i bul
    status_query = """
    query($serviceId: String!) {
      service(id: $serviceId) {
        deployments(first: 1) {
          edges {
            node { id status }
          }
        }
      }
    }
    """
    result = await _railway_gql(status_query, {"serviceId": RAILWAY_TRINO_SERVICE_ID})
    edges = (
        result.get("data", {})
        .get("service", {})
        .get("deployments", {})
        .get("edges", [])
    )
    if not edges:
        raise HTTPException(status_code=400, detail="Aktif Trino deployment bulunamadi.")

    deployment_id = edges[0]["node"]["id"]

    # Deployment'i kaldir
    remove_mutation = """
    mutation($id: String!) {
      deploymentRemove(id: $id)
    }
    """
    result = await _railway_gql(remove_mutation, {"id": deployment_id})

    if "errors" in result and not result.get("data"):
        raise HTTPException(
            status_code=500,
            detail=f"Railway API hatasi: {result['errors']}",
        )

    # AskDB tarafinda da Trino'yu deaktif et
    try:
        trino_st = get_trino_status()
        if trino_st.get("active"):
            await deactivate_trino()
            invalidate_dynamic_tables_cache()
            await build_dynamic_schema()
    except Exception:
        pass

    logger.info("[RAILWAY] Trino service stopped on Railway")
    return {"success": True, "message": "Trino servisi durduruldu. Artik para yazmiyor."}


@router.post("/trino/railway/start")
async def trino_railway_start(_admin: dict = Depends(require_admin)):
    """Railway'deki Trino servisini baslat (admin-only)."""
    if not RAILWAY_API_TOKEN:
        raise HTTPException(status_code=400, detail="Railway API token yapilandirilmamis.")

    env_id = await _get_railway_environment_id()
    if not env_id:
        raise HTTPException(status_code=500, detail="Railway environment ID bulunamadi.")

    redeploy_mutation = """
    mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }
    """
    result = await _railway_gql(redeploy_mutation, {
        "serviceId": RAILWAY_TRINO_SERVICE_ID,
        "environmentId": env_id,
    })

    if "errors" in result and not result.get("data"):
        raise HTTPException(
            status_code=500,
            detail=f"Railway API hatasi: {result['errors']}",
        )

    logger.info("[RAILWAY] Trino service started on Railway")
    return {"success": True, "message": "Trino servisi baslatildi. Deploy 1-2 dakika surebilir."}


# ── DB Connections ──

@router.get("/db-connections")
async def list_db_connections(_admin: dict = Depends(require_admin)):
    """Tum veritabani baglantilarini listele (admin-only). Sifreler maskelenir."""
    adapter = await get_auth_adapter()
    rows = await adapter.fetch(
        "SELECT id, name, db_type, host, port, database_name, username, ssl_enabled, is_active, allowed_tables, created_at FROM db_connections ORDER BY id"
    )
    return {"success": True, "connections": rows}


@router.post("/db-connections")
async def create_db_connection(req: DBConnectionCreate, request: Request, _admin: dict = Depends(require_admin)):
    """Yeni veritabani baglantisi ekle (admin-only)."""
    adapter = await get_auth_adapter()
    await adapter.execute_command(
        """INSERT INTO db_connections (name, db_type, host, port, database_name, username, password, ssl_enabled)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
        req.name, req.db_type, req.host, req.port,
        req.database_name, req.username, req.password, req.ssl_enabled,
    )
    invalidate_dynamic_tables_cache()
    await reinit_direct_adapters()
    logger.info(f"[DB CONN] New connection added: {req.name} ({req.db_type})")
    return {"success": True, "message": _t("connections.created", get_lang(request))}


@router.put("/db-connections/{conn_id}")
async def update_db_connection(conn_id: int, req: DBConnectionCreate, request: Request, _admin: dict = Depends(require_admin)):
    """Veritabani baglantisini guncelle (admin-only)."""
    adapter = await get_auth_adapter()
    existing = await adapter.fetchrow("SELECT id FROM db_connections WHERE id = $1", conn_id)
    if not existing:
        raise HTTPException(status_code=404, detail=_t("connections.notFound", get_lang(request)))
    await adapter.execute_command(
        """UPDATE db_connections SET name=$1, db_type=$2, host=$3, port=$4,
           database_name=$5, username=$6, password=$7, ssl_enabled=$8, updated_at=NOW()
           WHERE id=$9""",
        req.name, req.db_type, req.host, req.port,
        req.database_name, req.username, req.password, req.ssl_enabled, conn_id,
    )
    invalidate_dynamic_tables_cache()
    await reinit_direct_adapters()
    logger.info(f"[DB CONN] Connection updated: {req.name} (id={conn_id})")
    return {"success": True, "message": _t("connections.updated", get_lang(request))}


@router.delete("/db-connections/{conn_id}")
async def delete_db_connection(conn_id: int, request: Request, _admin: dict = Depends(require_admin)):
    """Veritabani baglantisini sil (admin-only)."""
    adapter = await get_auth_adapter()
    existing = await adapter.fetchrow("SELECT id FROM db_connections WHERE id = $1", conn_id)
    if not existing:
        raise HTTPException(status_code=404, detail=_t("connections.notFound", get_lang(request)))
    await adapter.execute_command("DELETE FROM db_connections WHERE id = $1", conn_id)
    invalidate_dynamic_tables_cache()
    await reinit_direct_adapters()
    await build_dynamic_schema()
    logger.info(f"[DB CONN] Connection deleted: id={conn_id}")
    return {"success": True, "message": _t("connections.deleted", get_lang(request))}


@router.post("/db-connections/test")
async def test_db_connection(req: DBConnectionTest, request: Request, _admin: dict = Depends(require_admin)):
    """Verilen bilgilerle veritabanina baglanti testi yap (admin-only)."""
    from backend.sql.execution.adapters import create_adapter

    from urllib.parse import quote_plus
    _pw = quote_plus(req.password) if req.password else ""
    _user = quote_plus(req.username) if req.username else ""

    if req.db_type == "trino":
        url = f"trino://{_user}@{req.host}:{req.port}/{req.database_name}"
    elif req.db_type == "postgresql":
        ssl_suffix = "?sslmode=require" if req.ssl_enabled else ""
        url = f"postgresql://{_user}:{_pw}@{req.host}:{req.port}/{req.database_name}{ssl_suffix}"
    elif req.db_type in ("mysql", "mariadb"):
        url = f"mysql://{_user}:{_pw}@{req.host}:{req.port}/{req.database_name}"
    elif req.db_type == "mssql":
        url = f"mssql://{_user}:{_pw}@{req.host}:{req.port}/{req.database_name}"
    else:
        raise HTTPException(status_code=400, detail=_t("connections.unsupportedType", get_lang(request), type=req.db_type))

    adapter_type = "mysql" if req.db_type == "mariadb" else req.db_type

    try:
        test_adapter = create_adapter(adapter_type, url, ssl_enabled=req.ssl_enabled)
        await test_adapter.init()
        result = await test_adapter.fetchval("SELECT 1")
        await test_adapter.close()
        return {"success": True, "message": _t("connections.testSuccess", get_lang(request)), "result": result}
    except Exception as e:
        logger.warning(f"[DB CONN TEST] Failed: {req.db_type}://{req.host}:{req.port} - {e}")
        return {"success": False, "message": _t("connections.testFailed", get_lang(request), error=f"{type(e).__name__}: {e}")}


@router.post("/db-connections/{conn_id}/discover")
async def discover_tables(conn_id: int, request: Request, _admin: dict = Depends(require_admin)):
    """Veritabanindaki tablolari kesfet (admin-only)."""
    adapter = await get_auth_adapter()
    conn = await adapter.fetchrow("SELECT * FROM db_connections WHERE id = $1", conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail=_t("connections.notFound", get_lang(request)))

    c = conn if isinstance(conn, dict) else dict(conn)
    from backend.sql.execution.adapters import create_adapter
    from urllib.parse import quote_plus

    db_type = c["db_type"]
    _pw = quote_plus(c["password"]) if c.get("password") else ""
    _user = quote_plus(c["username"]) if c.get("username") else ""
    ssl_enabled = bool(c.get("ssl_enabled", False))

    if db_type == "trino":
        url = f"trino://{_user}@{c['host']}:{c['port']}/{c['database_name']}"
    elif db_type == "postgresql":
        ssl_suffix = "?sslmode=require" if ssl_enabled else ""
        url = f"postgresql://{_user}:{_pw}@{c['host']}:{c['port']}/{c['database_name']}{ssl_suffix}"
    elif db_type in ("mysql", "mariadb"):
        url = f"mysql://{_user}:{_pw}@{c['host']}:{c['port']}/{c['database_name']}"
    elif db_type == "mssql":
        url = f"mssql://{_user}:{_pw}@{c['host']}:{c['port']}/{c['database_name']}"
    else:
        raise HTTPException(status_code=400, detail=_t("connections.unsupportedType", get_lang(request), type=db_type))

    adapter_type = "mysql" if db_type == "mariadb" else db_type

    try:
        test_adapter = create_adapter(adapter_type, url, ssl_enabled=ssl_enabled)
        await test_adapter.init()

        if db_type == "trino":
            catalogs_raw = await test_adapter.fetch("SHOW CATALOGS")
            tables = []
            for cat_row in catalogs_raw:
                cat = cat_row["Catalog"] if isinstance(cat_row, dict) else cat_row[0]
                if cat in ("system", "jmx", "memory"):
                    continue
                try:
                    schemas_raw = await test_adapter.fetch(f"SHOW SCHEMAS FROM \"{cat}\"")
                    for sch_row in schemas_raw:
                        schema = sch_row["Schema"] if isinstance(sch_row, dict) else sch_row[0]
                        if schema == "information_schema":
                            continue
                        try:
                            tables_raw = await test_adapter.fetch(f"SHOW TABLES FROM \"{cat}\".\"{schema}\"")
                            for t_row in tables_raw:
                                tbl = t_row["Table"] if isinstance(t_row, dict) else t_row[0]
                                tables.append({"catalog": cat, "schema": schema, "table": tbl, "full_name": f"{cat}.{schema}.{tbl}"})
                        except Exception:
                            pass
                except Exception:
                    pass
        else:
            if db_type == "postgresql":
                rows = await test_adapter.fetch(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name",
                    "public"
                )
            else:
                rows = await test_adapter.fetch(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name",
                    c["database_name"]
                )
            tables = []
            for r in rows:
                if isinstance(r, dict):
                    # MySQL TABLE_NAME (buyuk harf), PostgreSQL table_name (kucuk harf)
                    tbl = r.get("table_name") or r.get("TABLE_NAME") or list(r.values())[0]
                else:
                    tbl = r[0]
                tables.append({"table": tbl, "full_name": tbl})

        await test_adapter.close()
        return {"success": True, "tables": tables}
    except Exception as e:
        logger.error(f"[DB DISCOVER] Error: {e}")
        return {"success": False, "message": _t("connections.discoverError", get_lang(request), error=f"{type(e).__name__}: {e}"), "tables": []}


@router.put("/db-connections/{conn_id}/tables")
async def update_allowed_tables(conn_id: int, body: dict, request: Request, _admin: dict = Depends(require_admin)):
    """Baglantinin izinli tablolarini guncelle (admin-only)."""
    adapter = await get_auth_adapter()
    existing = await adapter.fetchrow("SELECT id FROM db_connections WHERE id = $1", conn_id)
    if not existing:
        raise HTTPException(status_code=404, detail=_t("connections.notFound", get_lang(request)))

    tables = body.get("allowed_tables", [])
    await adapter.execute_command(
        "UPDATE db_connections SET allowed_tables = $1, updated_at = NOW() WHERE id = $2",
        json.dumps(tables, ensure_ascii=False), conn_id,
    )

    invalidate_dynamic_tables_cache()
    await reinit_direct_adapters()
    await build_dynamic_schema()
    logger.info(f"[DB CONN] Table list updated, schema refreshed (conn_id={conn_id}, {len(tables)} tables)")

    return {"success": True, "message": _t("connections.tablesUpdated", get_lang(request))}


# ── Query Statistics ──

@router.get("/stats/overview")
async def stats_overview(_admin: dict = Depends(require_admin)):
    """Genel sorgu istatistikleri."""
    adapter = await get_auth_adapter()
    row = await adapter.fetchrow("""
        SELECT
            COUNT(*) as total_queries,
            COALESCE(AVG(execution_time_ms), 0) as avg_time_ms,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
            SUM(CASE WHEN is_trino = true THEN 1 ELSE 0 END) as trino_count,
            SUM(CASE WHEN is_cached = true THEN 1 ELSE 0 END) as cached_count
        FROM query_logs
    """)
    r = row if isinstance(row, dict) else dict(row)
    total = int(r.get("total_queries", 0) or 0)
    return {
        "success": True,
        "total_queries": total,
        "avg_time_ms": round(float(r.get("avg_time_ms", 0) or 0), 1),
        "error_count": int(r.get("error_count", 0) or 0),
        "error_rate": round(int(r.get("error_count", 0) or 0) / max(total, 1) * 100, 1),
        "trino_count": int(r.get("trino_count", 0) or 0),
        "trino_rate": round(int(r.get("trino_count", 0) or 0) / max(total, 1) * 100, 1),
        "cached_count": int(r.get("cached_count", 0) or 0),
        "cache_rate": round(int(r.get("cached_count", 0) or 0) / max(total, 1) * 100, 1),
    }


@router.get("/stats/by-user")
async def stats_by_user(_admin: dict = Depends(require_admin)):
    """Kullanici bazli istatistikler."""
    adapter = await get_auth_adapter()
    rows = await adapter.fetch("""
        SELECT username,
               COUNT(*) as query_count,
               COALESCE(AVG(execution_time_ms), 0) as avg_time_ms,
               SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
               SUM(CASE WHEN is_trino = true THEN 1 ELSE 0 END) as trino_count,
               MAX(created_at) as last_query_at
        FROM query_logs
        GROUP BY username
        ORDER BY query_count DESC
    """)
    stats = []
    for r in rows:
        r = r if isinstance(r, dict) else dict(r)
        qc = int(r.get("query_count", 0) or 0)
        stats.append({
            "username": r["username"],
            "query_count": qc,
            "avg_time_ms": round(float(r.get("avg_time_ms", 0) or 0), 1),
            "error_count": int(r.get("error_count", 0) or 0),
            "error_rate": round(int(r.get("error_count", 0) or 0) / max(qc, 1) * 100, 1),
            "trino_count": int(r.get("trino_count", 0) or 0),
            "last_query_at": str(r.get("last_query_at", "")),
        })
    return {"success": True, "stats": stats}


@router.get("/stats/by-table")
async def stats_by_table(_admin: dict = Depends(require_admin)):
    """En cok sorgulanan tablolar (tables_used JSON'dan parse)."""
    adapter = await get_auth_adapter()
    rows = await adapter.fetch(
        "SELECT tables_used FROM query_logs WHERE tables_used IS NOT NULL AND tables_used != '[]'"
    )
    table_counts = {}
    for r in rows:
        tu = r["tables_used"] if isinstance(r, dict) else r[0]
        if tu:
            try:
                tables = json.loads(tu) if isinstance(tu, str) else tu
                for t in tables:
                    table_counts[t] = table_counts.get(t, 0) + 1
            except Exception:
                pass
    sorted_tables = sorted(table_counts.items(), key=lambda x: x[1], reverse=True)[:20]
    return {"success": True, "tables": [{"name": t, "count": c} for t, c in sorted_tables]}


# ── Table Profiles ──

@router.get("/table-profiles")
async def list_table_profiles(_admin: dict = Depends(require_admin)):
    """Tum tablo erisim profillerini listele."""
    adapter = await get_auth_adapter()
    rows = await adapter.fetch(
        "SELECT id, name, description, allowed_tables, created_at FROM table_profiles ORDER BY id"
    )
    profiles = []
    for r in rows:
        r = r if isinstance(r, dict) else dict(r)
        at = r.get("allowed_tables", "[]")
        tables = json.loads(at) if isinstance(at, str) else at
        profiles.append({
            "id": r["id"], "name": r["name"], "description": r.get("description", ""),
            "allowed_tables": tables, "table_count": len(tables),
            "created_at": str(r.get("created_at", "")),
        })
    return {"success": True, "profiles": profiles}


@router.post("/table-profiles")
async def create_table_profile(req: TableProfileCreate, request: Request, admin: dict = Depends(require_admin)):
    """Yeni tablo erisim profili olustur."""
    adapter = await get_auth_adapter()
    me = await adapter.fetchrow("SELECT id FROM app_users WHERE username = $1", admin["username"])
    my_id = me["id"] if isinstance(me, dict) else me[0]
    tables_json = json.dumps(req.allowed_tables, ensure_ascii=False)
    try:
        await adapter.execute_command(
            "INSERT INTO table_profiles (name, description, allowed_tables, created_by) VALUES ($1, $2, $3, $4)",
            req.name, req.description, tables_json, my_id,
        )
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=400, detail=_t("profiles.alreadyExists", get_lang(request)))
        raise
    return {"success": True, "message": _t("profiles.created", get_lang(request))}


@router.put("/table-profiles/{profile_id}")
async def update_table_profile(profile_id: int, req: TableProfileCreate, request: Request, _admin: dict = Depends(require_admin)):
    """Tablo erisim profilini guncelle."""
    adapter = await get_auth_adapter()
    existing = await adapter.fetchrow("SELECT id FROM table_profiles WHERE id = $1", profile_id)
    if not existing:
        raise HTTPException(status_code=404, detail=_t("profiles.notFound", get_lang(request)))
    tables_json = json.dumps(req.allowed_tables, ensure_ascii=False)
    await adapter.execute_command(
        "UPDATE table_profiles SET name=$1, description=$2, allowed_tables=$3, updated_at=NOW() WHERE id=$4",
        req.name, req.description, tables_json, profile_id,
    )
    return {"success": True, "message": _t("profiles.updated", get_lang(request))}


@router.delete("/table-profiles/{profile_id}")
async def delete_table_profile(profile_id: int, request: Request, _admin: dict = Depends(require_admin)):
    """Tablo erisim profilini sil."""
    adapter = await get_auth_adapter()
    existing = await adapter.fetchrow("SELECT id FROM table_profiles WHERE id = $1", profile_id)
    if not existing:
        raise HTTPException(status_code=404, detail=_t("profiles.notFound", get_lang(request)))
    await adapter.execute_command(
        "UPDATE app_users SET table_profile_id = NULL WHERE table_profile_id = $1", profile_id
    )
    await adapter.execute_command("DELETE FROM table_profiles WHERE id = $1", profile_id)
    return {"success": True, "message": _t("profiles.deleted", get_lang(request))}
