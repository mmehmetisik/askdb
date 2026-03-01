import asyncio
import time as _time

from fastapi import APIRouter, HTTPException, Depends, Response, Request

from backend.core.config import logger
from backend.core.models import QueryRequest, ExecuteSQLRequest
from backend.auth import get_current_user
from backend.sql.execution.database import (
    run_sql, is_trino_active, run_sql_trino, log_query, get_db_type_for_tables,
)
from backend.sql.execution.security import is_safe_sql
from backend.sql.llm.service import generate_sql, retry_safe_sql, retry_fix_sql
from backend.sql.cache.service import cache_key, get_cached, set_cached
from backend.sql.rate_limit import check_rate_limit
from backend.core.i18n import t as _t, get_lang
from backend.sql.websocket.progress import emit_progress

router = APIRouter(tags=["query"])


def _user_has_trino(user: dict) -> bool:
    """Kullanicinin Trino erisimi var mi? (admin her zaman true)"""
    if user["role"] == "admin":
        return True
    return bool(user.get("trino_access", False))


def _to_legacy_result(db_result: dict, lang: str = "tr") -> list:
    """
    run_sql() dict formatini eski [headers, row1, row2, ...] formatina donustur.
    Frontend uyumlulugu icin.
    """
    if not db_result["rows"]:
        return [[_t("query.noResult", lang)]]
    table = [db_result["headers"]]
    for row in db_result["rows"]:
        table.append(row)
    return table


@router.post("/query")
async def text_to_sql(req: QueryRequest, request: Request, response: Response, user: dict = Depends(get_current_user)):
    question = req.query.strip()

    # Rate limit
    allowed, rate_info = check_rate_limit(user["username"], user["role"])
    response.headers["X-RateLimit-Limit"] = str(rate_info["limit"])
    response.headers["X-RateLimit-Remaining"] = str(rate_info["remaining"])
    response.headers["X-RateLimit-Reset"] = str(rate_info["reset_after"])
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=_t("query.rateLimited", get_lang(request), seconds=rate_info['reset_after']),
        )

    # Session ID for WebSocket progress
    session_id = request.headers.get("X-Session-ID")

    # Cache
    tables_filter = req.selected_tables or []
    ck = cache_key(question, tables_filter or None)
    await emit_progress(session_id, "cache_check", progress=10)
    cached = get_cached(ck)
    if cached:
        response.headers["X-Cache"] = "HIT"
        asyncio.create_task(log_query(
            username=user["username"], question=question, generated_sql=cached.get("sql", ""),
            execution_time_ms=0, row_count=0, is_trino=is_trino_active() and _user_has_trino(user),
            is_cached=True, tables_used=tables_filter,
        ))
        return {**cached, "cached": True}

    response.headers["X-Cache"] = "MISS"
    _start_time = _time.time()

    try:
        # Hedef veritabani tipini coz (mysql, postgresql, vb.)
        target_db_type = get_db_type_for_tables(tables_filter or None)
        logger.info(f"[QUERY] user={user['username']} | question={question}" +
                     (f" | tables={tables_filter}" if tables_filter else "") +
                     f" | db_type={target_db_type}")
        await emit_progress(session_id, "llm_generating", progress=30)
        sql = await generate_sql(question, selected_tables=tables_filter or None,
                                 db_type=target_db_type)
        logger.info(f"[SQL GENERATED] {sql}")

        # Security check + retry
        await emit_progress(session_id, "sql_validating", progress=60)
        attempts = 0
        while not is_safe_sql(sql, db_type=target_db_type) and attempts < 3:
            attempts += 1
            logger.warning(f"[UNSAFE SQL] attempt {attempts}/3 - rejected: {sql}")
            sql = await retry_safe_sql(question, sql, db_type=target_db_type)
            logger.info(f"[SQL RETRY] attempt {attempts} -> {sql}")

        if not is_safe_sql(sql, db_type=target_db_type):
            logger.error("[FAILED] Could not generate safe SQL in 3 attempts")
            elapsed_ms = int((_time.time() - _start_time) * 1000)
            asyncio.create_task(log_query(
                username=user["username"], question=question, generated_sql=sql,
                execution_time_ms=elapsed_ms, row_count=0, is_trino=False,
                is_cached=False, status="error", error_message=_t("query.couldNotGenerate", get_lang(request)),
                tables_used=tables_filter,
            ))
            return {
                "question": question,
                "sql": sql,
                "result": [[_t("query.errorHeader", get_lang(request))], [_t("query.unsafeSqlRetry", get_lang(request))]],
                "column_types": [],
                "truncated": False,
            }

        # Execute via Trino or direct (with retry on failure)
        await emit_progress(session_id, "executing", progress=80)
        use_trino = is_trino_active() and _user_has_trino(user)

        exec_attempts = 0
        max_exec_retries = 2
        last_exec_error = None

        while exec_attempts <= max_exec_retries:
            try:
                if use_trino:
                    db_result = await run_sql_trino(sql)
                    logger.info("[TRINO] Query executed via Trino")
                else:
                    db_result = await run_sql(sql, selected_tables=tables_filter or None)
                last_exec_error = None
                break  # Basarili
            except Exception as exec_err:
                exec_attempts += 1
                last_exec_error = exec_err
                err_name = type(exec_err).__name__
                logger.warning(f"[SQL EXEC RETRY] attempt {exec_attempts}/{max_exec_retries} - {err_name}: {exec_err}")
                if exec_attempts <= max_exec_retries:
                    # LLM'den hataya gore SQL duzeltmesini iste
                    sql = await retry_fix_sql(question, sql, f"{err_name}: {exec_err}",
                                              selected_tables=tables_filter or None,
                                              db_type=target_db_type)
                    logger.info(f"[SQL RETRY FIX] new SQL: {sql}")
                    if not is_safe_sql(sql, db_type=target_db_type):
                        logger.error(f"[SQL RETRY FIX] Retried SQL is unsafe, stopping")
                        break

        if last_exec_error:
            raise last_exec_error

        result = _to_legacy_result(db_result, lang=get_lang(request))
        row_count = db_result["total_count"]
        logger.info(f"[OK] {row_count} rows returned" +
                     (" (truncated)" if db_result["truncated"] else ""))

        await emit_progress(session_id, "complete", progress=100)

        elapsed_ms = int((_time.time() - _start_time) * 1000)
        asyncio.create_task(log_query(
            username=user["username"], question=question, generated_sql=sql,
            execution_time_ms=elapsed_ms, row_count=row_count, is_trino=use_trino,
            is_cached=False, tables_used=tables_filter,
        ))

    except Exception as e:
        logger.error(f"[ERROR] {type(e).__name__}: {e}")
        elapsed_ms = int((_time.time() - _start_time) * 1000)
        asyncio.create_task(log_query(
            username=user["username"], question=question, generated_sql="HATA",
            execution_time_ms=elapsed_ms, row_count=0, is_trino=False,
            is_cached=False, status="error", error_message=str(e)[:500],
            tables_used=tables_filter,
        ))
        return {
            "question": question,
            "sql": "HATA",
            "result": [[_t("query.errorHeader", get_lang(request))], [_t("query.processingError", get_lang(request), error=type(e).__name__)]],
            "column_types": [],
            "truncated": False,
        }

    response_data = {
        "question": question,
        "sql": sql,
        "result": result,
        "column_types": db_result.get("column_types", []),
        "truncated": db_result.get("truncated", False),
    }

    set_cached(ck, response_data)
    return response_data


@router.post("/execute-sql")
async def execute_raw_sql(req: ExecuteSQLRequest, request: Request, response: Response, user: dict = Depends(get_current_user)):
    """Kullanici tarafindan duzenlenmis SQL sorgusunu calistir (guvenlik kontrolu ile)."""
    sql = req.sql.strip()

    # Rate limit
    allowed, rate_info = check_rate_limit(user["username"], user["role"])
    response.headers["X-RateLimit-Limit"] = str(rate_info["limit"])
    response.headers["X-RateLimit-Remaining"] = str(rate_info["remaining"])
    if not allowed:
        raise HTTPException(status_code=429, detail=_t("query.rateLimitedShort", get_lang(request)))

    if not is_safe_sql(sql):
        raise HTTPException(status_code=400, detail=_t("query.unsafeSql", get_lang(request)))

    _start_time = _time.time()
    try:
        use_trino = is_trino_active() and _user_has_trino(user)
        if use_trino:
            db_result = await run_sql_trino(sql)
        else:
            db_result = await run_sql(sql)
        result = _to_legacy_result(db_result, lang=get_lang(request))
        elapsed_ms = int((_time.time() - _start_time) * 1000)
        asyncio.create_task(log_query(
            username=user["username"], question="[MANUAL SQL]", generated_sql=sql,
            execution_time_ms=elapsed_ms, row_count=db_result.get("total_count", 0),
            is_trino=use_trino, is_cached=False,
        ))
        return {
            "sql": sql,
            "result": result,
            "column_types": db_result.get("column_types", []),
            "truncated": db_result.get("truncated", False),
        }
    except Exception as e:
        logger.error(f"[SQL EXEC ERROR] {type(e).__name__}: {e}")
        elapsed_ms = int((_time.time() - _start_time) * 1000)
        asyncio.create_task(log_query(
            username=user["username"], question="[MANUAL SQL]", generated_sql=sql,
            execution_time_ms=elapsed_ms, row_count=0, is_trino=False,
            is_cached=False, status="error", error_message=str(e)[:500],
        ))
        raise HTTPException(status_code=400, detail=_t("query.sqlError", get_lang(request), error=f"{type(e).__name__}: {e}"))
