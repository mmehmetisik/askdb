# backend/sql/routes.py

## Amac
Dogal dil sorgularini SQL'e cevirip veritabaninda calistiran ana sorgu API endpoint'leri. /query (text-to-SQL) ve /execute-sql (manuel SQL) sunar.

## Bagimliliklari
- `backend.sql.llm.service` -- generate_sql, retry_safe_sql, retry_fix_sql
- `backend.sql.execution.database` -- run_sql, run_sql_trino, log_query
- `backend.sql.execution.security` -- is_safe_sql
- `backend.sql.cache.service` -- cache_key, get_cached, set_cached
- `backend.sql.rate_limit` -- check_rate_limit
- `backend.auth` -- get_current_user

## Fonksiyonlar / Endpointler

| Endpoint | Metot | Aciklama |
|---|---|---|
| `/query` | POST | Dogal dil sorusunu SQL'e cevirir, calistirir, sonuc dondurur |
| `/execute-sql` | POST | Elle yazilmis SQL'i guvenlik kontrolunden gecirip calistirir |

### Yardimci Fonksiyonlar

| Fonksiyon | Aciklama |
|---|---|
| `_user_has_trino(user)` | Trino erisim kontrolu |
| `_to_legacy_result(db_result, lang)` | DB sonucunu frontend formatina cevirir |

## Ornek Kullanim

```bash
POST /query {"query": "En cok satan 5 urun", "selected_tables": ["products"]}
POST /execute-sql {"sql": "SELECT * FROM products LIMIT 10"}
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
