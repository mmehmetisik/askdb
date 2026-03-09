# backend/admin/routes.py

## Amac

Admin panelinin ana API rotalarini tanimlar. Cache yonetimi, Trino baglanti kontrolu, Railway servis yonetimi, veritabani baglantilari (CRUD), sorgu istatistikleri ve tablo erisim profilleri islemlerini saglar.

## Bagimliliklari

- `backend.core.config` -- logger, build_dynamic_schema, Railway env degiskenleri
- `backend.core.models` -- DBConnectionCreate, DBConnectionTest, TableProfileCreate
- `backend.core.i18n` -- coklu dil destegi (t, get_lang)
- `backend.auth` -- get_current_user, require_admin
- `backend.sql.execution.database` -- get_auth_adapter, Trino islemleri, cache invalidation
- `backend.sql.execution.adapters` -- create_adapter (baglanti testi ve kesif icin)
- `backend.sql.cache.service` -- get_cache_stats, invalidate_all
- `httpx` -- Railway GraphQL API cagrilari

## Fonksiyonlar / Endpointler

| Endpoint | Method | Aciklama |
|---|---|---|
| `/cache-stats` | GET | Cache istatistiklerini dondurur |
| `/cache-clear` | POST | Tum cache'i temizler |
| `/trino/activate/{conn_id}` | POST | Trino baglantisini aktif eder |
| `/trino/deactivate` | POST | Trino baglantisini deaktif eder |
| `/trino/restart` | POST | Trino'yu yeniden baslatir |
| `/trino/status` | GET | Trino durumunu dondurur |
| `/trino/railway/status` | GET | Railway Trino servis durumu |
| `/trino/railway/stop` | POST | Railway Trino servisini durdurur |
| `/trino/railway/start` | POST | Railway Trino servisini baslatir |
| `/db-connections` | GET | Tum DB baglantilarini listeler |
| `/db-connections` | POST | Yeni DB baglantisi ekler |
| `/db-connections/{conn_id}` | PUT | DB baglantisini gunceller |
| `/db-connections/{conn_id}` | DELETE | DB baglantisini siler |
| `/db-connections/test` | POST | Baglanti testi yapar |
| `/db-connections/{conn_id}/discover` | POST | Tablolari kesfeder |
| `/stats/overview` | GET | Genel sorgu istatistikleri |
| `/stats/by-user` | GET | Kullanici bazli istatistikler |
| `/table-profiles` | GET/POST | Tablo profillerini listele/olustur |
| `/table-profiles/{id}` | PUT/DELETE | Profili guncelle/sil |

## Ornek Kullanim

```python
# Cache temizleme
# POST /api/admin/cache-clear  (Header: Authorization: Bearer <token>)

# DB baglanti testi
# POST /api/admin/db-connections/test
# Body: {"db_type": "postgresql", "host": "localhost", "port": 5432, ...}
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
