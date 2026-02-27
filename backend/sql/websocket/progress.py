"""
WebSocket-based live query progress manager.
Provides fire-and-forget progress updates during query execution.
"""

import asyncio
from typing import Optional

from fastapi import WebSocket
from backend.core.config import logger


class ProgressManager:
    """Singleton managing WebSocket connections by session_id."""

    def __init__(self):
        self._connections: dict[str, WebSocket] = {}

    async def connect(self, session_id: str, ws: WebSocket):
        await ws.accept()
        self._connections[session_id] = ws
        logger.debug(f"[WS] Connected: {session_id}")

    def disconnect(self, session_id: str):
        self._connections.pop(session_id, None)
        logger.debug(f"[WS] Disconnected: {session_id}")

    async def send_progress(
        self,
        session_id: str,
        step: str,
        detail: str = "",
        progress: int = 0,
    ):
        """Fire-and-forget progress push. Never raises."""
        ws = self._connections.get(session_id)
        if not ws:
            return
        try:
            await ws.send_json({
                "type": "progress",
                "step": step,
                "detail": detail,
                "progress": progress,
            })
        except Exception:
            # Connection lost — silently remove
            self._connections.pop(session_id, None)

    @property
    def active_count(self) -> int:
        return len(self._connections)


# Global singleton
progress_manager = ProgressManager()


async def emit_progress(
    session_id: Optional[str],
    step: str,
    detail: str = "",
    progress: int = 0,
):
    """Convenience wrapper. No-op if session_id is None."""
    if not session_id:
        return
    await progress_manager.send_progress(session_id, step, detail, progress)
