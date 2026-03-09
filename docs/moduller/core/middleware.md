# middleware.py

## Amac
Her HTTP istegine benzersiz request ID atar ve log korelasyonu icin context degiskenine yazar. Yanit header'inda da dondurur.

## Bagimliliklari
- `uuid` -- kisa ID uretimi
- `starlette.middleware.base` -- BaseHTTPMiddleware
- `backend.core.logging_config` -- request_id_var context degiskeni

## Fonksiyonlar / Class'lar

| Oge | Aciklama |
|---|---|
| `RequestIdMiddleware` (class) | Starlette middleware; her istege request ID ekler |
| `dispatch(request, call_next)` | X-Request-ID header'dan okur veya UUID uretir, context'e yazar |

## Davranis
- Client X-Request-ID gondermezse uuid4().hex[:8] ile uretilir
- WebSocket istekleri atlanir

## Ornek Kullanim

```python
from backend.core.middleware import RequestIdMiddleware
app.add_middleware(RequestIdMiddleware)
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
