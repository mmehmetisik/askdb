# auth/service.py

## Amac
JWT tabanli kimlik dogrulama servisi. Sifre hashleme, token uretme, cookie'den kullanici okuma ve rol bazli yetkilendirme saglar.

## Bagimliliklari
- `jose` (python-jose) -- JWT encode/decode
- `bcrypt` -- sifre hashleme
- `backend.core.config` -- JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRY_HOURS

## Fonksiyonlar / Class'lar

| Fonksiyon | Parametreler | Donus | Aciklama |
|---|---|---|---|
| `hash_password` | `password: str` | `str` | bcrypt ile sifre hashler |
| `verify_password` | `plain, hashed` | `bool` | Sifre dogrulamasi |
| `create_token` | `username, role, trino_access` | `str` | JWT token uretir |
| `get_current_user` | `request: Request` | `dict` | Cookie'den JWT okur |
| `require_admin` | `user: dict` | `dict` | Sadece admin (Depends) |
| `require_analyst` | `user: dict` | `dict` | admin + analyst (Depends) |
| `require_reporter` | `user: dict` | `dict` | admin + reporter + ds (Depends) |
| `require_data_scientist` | `user: dict` | `dict` | admin + data_scientist (Depends) |

## Ornek Kullanim

```python
from backend.auth.service import get_current_user, require_admin

@router.get("/protected")
async def protected(user=Depends(get_current_user)):
    return {"msg": f"Hosgeldin {user['username']}"}
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
