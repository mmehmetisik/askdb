# backend/sql/schema/routes.py

## Amac
Schema bilgisi, tablo on izleme, saglik kontrolu ve sistem bilgisi endpoint'leri. Frontend'in tablo/kolon listesini almasini saglar.

## Bagimliliklari
- `backend.sql.execution.database` -- get_schema_info, run_sql, get_trino_schema_info
- `backend.sql.llm.service` -- get_llm_info
- `backend.auth` -- get_current_user, require_admin

## Fonksiyonlar / Endpointler

| Endpoint | Metot | Aciklama |
|---|---|---|
| `/schema` | GET | Izinli tablolarin kolon bilgilerini dondurur |
| `/schema/refresh` | POST | Schema'yi yeniden olusturur (admin) |
| `/table-preview/{name}` | GET | Tablonun ilk 50 satirini gosterir |
| `/health` | GET | DB, LLM, Trino saglik durumu |
| `/system-info` | GET | Sistem bilgisi (admin) |

## Ornek Kullanim

```bash
GET /schema
GET /table-preview/products
GET /health
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
