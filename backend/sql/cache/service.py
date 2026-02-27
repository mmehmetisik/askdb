"""Sorgu cache sistemi — Redis varsa Redis, yoksa in-memory (TTL + LRU)."""
import hashlib
import json
import time
from backend.core.config import logger, CACHE_TTL_SECONDS, MAX_CACHE_SIZE, REDIS_URL

CACHE_TTL = CACHE_TTL_SECONDS

# =================== ABSTRACT ===================
_backend: "CacheBackend | None" = None


class CacheBackend:
    """Soyut cache arayuzu."""

    def get(self, key: str) -> dict | None: ...
    def set(self, key: str, data: dict) -> None: ...
    def clear(self) -> None: ...
    def stats(self) -> dict: ...
    async def close(self) -> None: ...


# =================== IN-MEMORY ===================
class MemoryCacheBackend(CacheBackend):
    def __init__(self):
        self._cache: dict[str, dict] = {}
        self._stats = {"hits": 0, "misses": 0, "evictions": 0}

    def get(self, key: str) -> dict | None:
        entry = self._cache.get(key)
        if entry is None:
            self._stats["misses"] += 1
            return None
        if time.time() > entry["expires_at"]:
            del self._cache[key]
            self._stats["misses"] += 1
            return None
        entry["hit_count"] += 1
        self._stats["hits"] += 1
        logger.info(f"[CACHE HIT] key={key[:12]}... hit_count={entry['hit_count']}")
        return entry["data"]

    def set(self, key: str, data: dict) -> None:
        if len(self._cache) >= MAX_CACHE_SIZE and key not in self._cache:
            oldest_key = min(self._cache, key=lambda k: self._cache[k]["created_at"])
            del self._cache[oldest_key]
            self._stats["evictions"] += 1
        self._cache[key] = {
            "data": data,
            "expires_at": time.time() + CACHE_TTL,
            "created_at": time.time(),
            "hit_count": 0,
        }

    def clear(self) -> None:
        self._cache.clear()
        logger.info("[CACHE] Tum cache temizlendi")

    def stats(self) -> dict:
        now = time.time()
        expired = [k for k, v in self._cache.items() if now > v["expires_at"]]
        for k in expired:
            del self._cache[k]
        total = self._stats["hits"] + self._stats["misses"]
        return {
            "backend": "memory",
            "size": len(self._cache),
            "max_size": MAX_CACHE_SIZE,
            "ttl_seconds": CACHE_TTL,
            "hits": self._stats["hits"],
            "misses": self._stats["misses"],
            "evictions": self._stats["evictions"],
            "hit_rate": round(self._stats["hits"] / max(total, 1) * 100, 1),
        }

    async def close(self) -> None:
        pass


# =================== REDIS ===================
class RedisCacheBackend(CacheBackend):
    def __init__(self, redis_client):
        self._redis = redis_client
        self._prefix = "t2s:cache:"
        self._stats_key = "t2s:cache_stats"

    def _full_key(self, key: str) -> str:
        return f"{self._prefix}{key}"

    def get(self, key: str) -> dict | None:
        raw = self._redis.get(self._full_key(key))
        if raw is None:
            self._redis.hincrby(self._stats_key, "misses", 1)
            return None
        self._redis.hincrby(self._stats_key, "hits", 1)
        data = json.loads(raw)
        logger.info(f"[CACHE HIT] key={key[:12]}... (redis)")
        return data

    def set(self, key: str, data: dict) -> None:
        self._redis.setex(self._full_key(key), CACHE_TTL, json.dumps(data, default=str))

    def clear(self) -> None:
        keys = self._redis.keys(f"{self._prefix}*")
        if keys:
            self._redis.delete(*keys)
        logger.info("[CACHE] Tum cache temizlendi (redis)")

    def stats(self) -> dict:
        raw = self._redis.hgetall(self._stats_key)
        hits = int(raw.get("hits", 0))
        misses = int(raw.get("misses", 0))
        total = hits + misses
        size = len(self._redis.keys(f"{self._prefix}*"))
        return {
            "backend": "redis",
            "size": size,
            "max_size": "unlimited",
            "ttl_seconds": CACHE_TTL,
            "hits": hits,
            "misses": misses,
            "evictions": 0,
            "hit_rate": round(hits / max(total, 1) * 100, 1),
        }

    async def close(self) -> None:
        self._redis.close()


# =================== FACTORY ===================
def _init_backend() -> CacheBackend:
    """Redis varsa Redis, yoksa in-memory backend olustur."""
    if REDIS_URL:
        try:
            import redis
            client = redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=5)
            client.ping()
            logger.info(f"[CACHE] Redis backend active: {REDIS_URL}")
            return RedisCacheBackend(client)
        except Exception as e:
            logger.warning(f"[CACHE] Redis connection failed, in-memory fallback: {e}")
    logger.info("[CACHE] In-memory backend active")
    return MemoryCacheBackend()


def _get_backend() -> CacheBackend:
    global _backend
    if _backend is None:
        _backend = _init_backend()
    return _backend


# =================== PUBLIC API (eski arayuz korunuyor) ===================
def cache_key(question: str, selected_tables: list[str] | None = None) -> str:
    """Sorgu + tablo listesinden benzersiz cache anahtari olustur."""
    tables_str = "|".join(sorted(selected_tables)) if selected_tables else ""
    raw = f"{question.strip().lower()}|{tables_str}"
    return hashlib.sha256(raw.encode()).hexdigest()


def get_cached(key: str) -> dict | None:
    """Cache'ten veri getir."""
    return _get_backend().get(key)


def set_cached(key: str, data: dict) -> None:
    """Sonucu cache'e yaz."""
    _get_backend().set(key, data)


def invalidate_all() -> None:
    """Tum cache'i temizle."""
    _get_backend().clear()


def get_cache_stats() -> dict:
    """Cache istatistiklerini dondur."""
    return _get_backend().stats()


async def close_cache() -> None:
    """Cache backend'ini kapat (Redis icin)."""
    global _backend
    if _backend:
        await _backend.close()
        _backend = None
