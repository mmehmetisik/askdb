# auth/routes.py

## Amac
Kimlik dogrulama API endpoint'leri: giris, cikis ve mevcut kullanici bilgisi sorgulama.

## Bagimliliklari
- `backend.core.config` -- logger, SECURE_COOKIE, JWT_EXPIRY_HOURS
- `backend.core.models` -- LoginRequest
- `backend.auth.service` -- create_token, verify_password, get_current_user
- `backend.core.csrf` -- CSRF token yonetimi
- `backend.sql.execution.database` -- get_auth_adapter
- `backend.core.i18n` -- coklu dil destegi

## Fonksiyonlar / Endpointler

| Endpoint | Metot | Yetki | Aciklama |
|---|---|---|---|
| `/login` | POST | Herkese acik | Kullanici dogrular, JWT cookie set eder |
| `/logout` | POST | Herkese acik | access_token cookie'sini siler |
| `/me` | GET | Giris yapmis | Kullanici bilgisi dondurur |

## Ornek Kullanim

```python
from backend.auth.routes import router
app.include_router(router, prefix="/api")
# POST /api/login  { username, password }
# POST /api/logout
# GET  /api/me
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
