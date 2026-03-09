# backend/admin/user_routes.py

## Amac

Kullanici yonetimi API rotalarini tanimlar. Yeni kullanici ekleme, listeleme, silme, Trino erisim kontrolu ve tablo erisim profili atama islemlerini saglar.

## Bagimliliklari

- `backend.core.config` -- logger
- `backend.core.models` -- UserCreate
- `backend.core.i18n` -- coklu dil destegi (t, get_lang)
- `backend.auth` -- hash_password, require_admin
- `backend.sql.execution.database` -- get_auth_adapter

## Fonksiyonlar / Endpointler

| Endpoint | Method | Parametreler | Aciklama |
|---|---|---|---|
| `/users` | POST | `UserCreate(username, password, role, trino_access)` | Yeni kullanici olusturur |
| `/users` | GET | - | Tum kullanicilari listeler |
| `/users/{user_id}` | DELETE | `user_id: int` | Kullaniciyi siler |
| `/users/{user_id}/trino-access` | PATCH | `trino_access: bool` | Trino erisimini ac/kapat |
| `/users/{user_id}/profile` | PATCH | `table_profile_id: int` | Tablo erisim profili atar |

## Ornek Kullanim

```python
# Yeni kullanici olusturma
# POST /api/admin/users
# Body: {"username": "analist1", "password": "guclu_sifre", "role": "analyst"}

# Kullaniciya profil atama
# PATCH /api/admin/users/5/profile
# Body: {"table_profile_id": 2}
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
