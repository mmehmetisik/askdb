"""
csrf.py  —  Double-submit cookie CSRF protection.
Opt-in via CSRF_ENABLED=true env var (default: disabled).
"""
import os
import secrets
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse
from .logging_config import setup_logging

logger = setup_logging()

CSRF_ENABLED = os.getenv("CSRF_ENABLED", "false").lower() == "true"
CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "x-csrf-token"
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_EXEMPT_PATHS = {"/api/login", "/api/v1/login"}


def generate_csrf_token() -> str:
    return secrets.token_hex(32)


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    Double-submit cookie pattern:
    - Server sets csrf_token cookie (readable by JS) on login.
    - Client sends cookie value as X-CSRF-Token header on state-changing requests.
    - Middleware compares cookie vs header.
    """
    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)

    async def dispatch(self, request: Request, call_next) -> Response:
        if not CSRF_ENABLED:
            return await call_next(request)

        if request.method in _SAFE_METHODS:
            return await call_next(request)

        if request.url.path in _EXEMPT_PATHS:
            return await call_next(request)

        cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
        header_token = request.headers.get(CSRF_HEADER_NAME)

        if not cookie_token or not header_token:
            logger.warning(f"[CSRF] Missing token on {request.method} {request.url.path}")
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token eksik. Sayfayi yenileyip tekrar deneyin."}
            )

        if not secrets.compare_digest(cookie_token, header_token):
            logger.warning(f"[CSRF] Token mismatch on {request.method} {request.url.path}")
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token uyusmuyor."}
            )

        return await call_next(request)
