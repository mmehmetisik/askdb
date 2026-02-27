"""Kullanici bazi sliding window rate limiter — Redis varsa Redis, yoksa in-memory."""
import time
from collections import defaultdict
from backend.core.config import logger, RATE_LIMIT_USER, RATE_LIMIT_ADMIN, RATE_LIMIT_WINDOW, REDIS_URL


# =================== ABSTRACT ===================
_backend: "RateLimitBackend | None" = None


class RateLimitBackend:
    """Soyut rate limit arayuzu."""

    def check(self, username: str, role: str) -> tuple[bool, dict]: ...
    async def close(self) -> None: ...


# =================== IN-MEMORY ===================
class MemoryRateLimitBackend(RateLimitBackend):
    def __init__(self):
        self._requests: dict[str, list[float]] = defaultdict(list)

    def check(self, username: str, role: str) -> tuple[bool, dict]:
        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW
        limit = RATE_LIMIT_ADMIN if role == "admin" else RATE_LIMIT_USER

        self._requests[username] = [
            ts for ts in self._requests[username] if ts > window_start
        ]

        current_count = len(self._requests[username])
        remaining = max(0, limit - current_count)

        reset_after = 0.0
        if self._requests[username]:
            oldest = min(self._requests[username])
            reset_after = max(0, oldest + RATE_LIMIT_WINDOW - now)

        info = {
            "limit": limit,
            "remaining": remaining,
            "reset_after": round(reset_after, 1),
            "window": RATE_LIMIT_WINDOW,
        }

        if current_count >= limit:
            return False, info

        self._requests[username].append(now)
        info["remaining"] = max(0, limit - current_count - 1)
        return True, info

    async def close(self) -> None:
        pass


# =================== REDIS ===================
class RedisRateLimitBackend(RateLimitBackend):
    def __init__(self, redis_client):
        self._redis = redis_client
        self._prefix = "t2s:rl:"

    def check(self, username: str, role: str) -> tuple[bool, dict]:
        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW
        limit = RATE_LIMIT_ADMIN if role == "admin" else RATE_LIMIT_USER
        key = f"{self._prefix}{username}"

        pipe = self._redis.pipeline()
        pipe.zremrangebyscore(key, 0, window_start)
        pipe.zcard(key)
        pipe.execute()

        current_count = self._redis.zcard(key)
        remaining = max(0, limit - current_count)

        oldest_items = self._redis.zrange(key, 0, 0, withscores=True)
        reset_after = 0.0
        if oldest_items:
            oldest_ts = oldest_items[0][1]
            reset_after = max(0, oldest_ts + RATE_LIMIT_WINDOW - now)

        info = {
            "limit": limit,
            "remaining": remaining,
            "reset_after": round(reset_after, 1),
            "window": RATE_LIMIT_WINDOW,
        }

        if current_count >= limit:
            return False, info

        self._redis.zadd(key, {str(now): now})
        self._redis.expire(key, RATE_LIMIT_WINDOW + 1)
        info["remaining"] = max(0, limit - current_count - 1)
        return True, info

    async def close(self) -> None:
        self._redis.close()


# =================== FACTORY ===================
def _init_backend() -> RateLimitBackend:
    if REDIS_URL:
        try:
            import redis
            client = redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=5)
            client.ping()
            logger.info("[RATE LIMIT] Redis backend active")
            return RedisRateLimitBackend(client)
        except Exception as e:
            logger.warning(f"[RATE LIMIT] Redis connection failed, in-memory fallback: {e}")
    logger.info("[RATE LIMIT] In-memory backend active")
    return MemoryRateLimitBackend()


def _get_backend() -> RateLimitBackend:
    global _backend
    if _backend is None:
        _backend = _init_backend()
    return _backend


# =================== PUBLIC API (eski arayuz korunuyor) ===================
def check_rate_limit(username: str, role: str) -> tuple[bool, dict]:
    """Kullanicinin rate limit durumunu kontrol et."""
    return _get_backend().check(username, role)


async def close_rate_limiter() -> None:
    """Rate limit backend'ini kapat (Redis icin)."""
    global _backend
    if _backend:
        await _backend.close()
        _backend = None
