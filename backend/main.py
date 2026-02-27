import json
import pathlib
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.core.config import CORS_ORIGINS, logger, build_dynamic_schema
from backend.core.middleware import RequestIdMiddleware
from backend.core.csrf import CSRFMiddleware, CSRF_ENABLED
from backend.sql.execution.database import init_pool, close_pool, get_auth_adapter
from backend.sql.cache.service import close_cache
from backend.sql.rate_limit import close_rate_limiter
from backend.sql.websocket.progress import progress_manager

# Router imports
from backend.auth.routes import router as auth_router
from backend.sql.routes import router as query_router
from backend.sql.schema.routes import router as schema_router
from backend.admin.routes import router as admin_router
from backend.admin.user_routes import router as user_router
from backend.reports.routes import router as report_router
from backend.analysis.routes import analysis_router
from backend.ml.routes import ml_router


# =================== LIFESPAN ===================
async def _cleanup_stuck_ml_jobs():
    """Mark ML jobs stuck as 'running' to 'failed' on server restart."""
    try:
        adapter = await get_auth_adapter()
        result = await adapter.fetch(
            "SELECT id FROM ml_jobs WHERE status = $1", "running"
        )
        if result:
            for row in result:
                job_id = row["id"] if isinstance(row, dict) else row[0]
                await adapter.execute_command(
                    "UPDATE ml_jobs SET status = $1, results = $2 WHERE id = $3",
                    "failed",
                    json.dumps({"error": "Sunucu yeniden baslatildi, egitim iptal edildi."}),
                    job_id,
                )
            logger.info(f"[ML] {len(result)} stuck jobs marked as 'failed'")
    except Exception as e:
        logger.warning(f"[ML] Stuck job cleanup error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    logger.info("Database pool started")
    await build_dynamic_schema()
    await _cleanup_stuck_ml_jobs()
    yield
    await close_cache()
    await close_rate_limiter()
    await close_pool()
    logger.info("Database pool closed")


# =================== APP ===================
app = FastAPI(title="AskDB API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Cache", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-Request-ID"],
)

app.add_middleware(RequestIdMiddleware)

if CSRF_ENABLED:
    app.add_middleware(CSRFMiddleware)

# =================== ROUTERS ===================
# Dual-mount: /api/v1/* (versioned) + /api/* (legacy)
for _prefix in ["/api/v1", "/api"]:
    app.include_router(auth_router, prefix=_prefix)
    app.include_router(query_router, prefix=_prefix)
    app.include_router(schema_router, prefix=_prefix)
    app.include_router(admin_router, prefix=_prefix)
    app.include_router(user_router, prefix=_prefix)
    app.include_router(report_router, prefix=_prefix)
    app.include_router(analysis_router, prefix=_prefix)
    app.include_router(ml_router, prefix=_prefix)

# =================== WEBSOCKET ===================
@app.websocket("/ws/progress/{session_id}")
async def ws_progress(ws: WebSocket, session_id: str):
    await progress_manager.connect(session_id, ws)
    try:
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        progress_manager.disconnect(session_id)


# =================== STATIC FILES ===================
_frontend_dir = pathlib.Path(__file__).parent.parent / "frontend"
if _frontend_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_dir), html=True), name="frontend")
