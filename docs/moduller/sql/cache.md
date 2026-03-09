# backend/sql/cache/service.py

## Amac
Sorgu sonuclarini onbellege alarak tekrarlayan sorgularda performans saglar. Redis varsa Redis, yoksa in-memory (TTL + LRU) backend kullanir.

## Bagimliliklari
- `backend.core.config` -- CACHE_TTL_SECONDS, MAX_CACHE_SIZE, REDIS_URL
- `redis` -- Redis client (opsiyonel)

## Fonksiyonlar / Class'lar

| Ad | Tip | Aciklama |
|---|---|---|
| `CacheBackend` | ABC | Soyut cache arayuzu |
| `MemoryCacheBackend` | Class | In-memory (TTL + LRU eviction) |
| `RedisCacheBackend` | Class | Redis tabanli (otomatik TTL) |

### Public API

| Fonksiyon | Donus | Aciklama |
|---|---|---|
| `cache_key(question, tables)` | str | SHA-256 cache anahtari uretir |
| `get_cached(key)` | dict/None | Cache'ten veri getirir |
| `set_cached(key, data)` | None | Sonucu cache'e yazar |
| `invalidate_all()` | None | Tum cache'i temizler |
| `get_cache_stats()` | dict | Hit/miss istatistikleri |

## Ornek Kullanim

```python
key = cache_key("En cok satan urun", ["products"])
cached = get_cached(key)
if not cached:
    set_cached(key, result)
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
