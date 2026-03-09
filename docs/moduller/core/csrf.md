# csrf.py

## Amac
Double-submit cookie yontemiyle CSRF korumasini saglar. CSRF_ENABLED=true env ile aktif edilir (varsayilan: kapali).

## Bagimliliklari
- `os`, `secrets` -- token uretimi ve env okuma
- `starlette.middleware.base` -- BaseHTTPMiddleware

## Fonksiyonlar / Class'lar

| Oge | Aciklama |
|---|---|
| `generate_csrf_token()` | 64 karakterlik hex token uretir |
| `CSRFMiddleware` (class) | Cookie ile header token'i karsilastirir |

## Sabitler

| Sabit | Deger | Aciklama |
|---|---|---|
| `CSRF_COOKIE_NAME` | `csrf_token` | Cookie adi |
| `CSRF_HEADER_NAME` | `x-csrf-token` | Beklenen header |
| `_SAFE_METHODS` | GET, HEAD, OPTIONS | Kontrolden muaf metotlar |
| `_EXEMPT_PATHS` | /api/login, /api/v1/login | Muaf endpoint'ler |

## Ornek Kullanim

```python
from backend.core.csrf import CSRFMiddleware
app.add_middleware(CSRFMiddleware)
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
