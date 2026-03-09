# backend/sql/rate_limit.py

## Amac
Kullanici bazli sliding window rate limiter. Redis varsa Redis, yoksa in-memory backend kullanir.

## Bagimliliklari
- `backend.core.config` -- RATE_LIMIT_USER, RATE_LIMIT_ADMIN, RATE_LIMIT_WINDOW, REDIS_URL

## Fonksiyonlar / Class'lar

| Ad | Tip | Aciklama |
|---|---|---|
| `RateLimitBackend` | ABC | Soyut rate limit arayuzu |
| `MemoryRateLimitBackend` | Class | In-memory sliding window |
| `RedisRateLimitBackend` | Class | Redis sorted set tabanli |

### Public API

| Fonksiyon | Donus | Aciklama |
|---|---|---|
| `check_rate_limit(username, role)` | (bool, dict) | Rate limit kontrolu. (allowed, info) dondurur |
| `close_rate_limiter()` | None | Backend'i kapatir |

## Ornek Kullanim

```python
allowed, info = check_rate_limit("mehmet", "analyst")
if not allowed:
    raise HTTPException(429, f"{info['reset_after']}s bekleyin")
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
