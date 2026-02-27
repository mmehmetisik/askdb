"""
middleware.py  —  Request ID middleware for tracing.
"""
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from .logging_config import request_id_var


class RequestIdMiddleware(BaseHTTPMiddleware):
    """
    Assign a unique request ID to every request.
    - Uses X-Request-ID header from client if present.
    - Otherwise generates a short UUID.
    - Propagates via contextvars for log correlation.
    - Returns X-Request-ID in response header.
    """
    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)

    async def dispatch(self, request: Request, call_next) -> Response:
        rid = request.headers.get("x-request-id", uuid.uuid4().hex[:8])
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = rid
            return response
        finally:
            request_id_var.reset(token)
