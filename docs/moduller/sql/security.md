# backend/sql/execution/security.py

## Amac
LLM tarafindan uretilen SQL sorgularinin guvenligini dogrular. sqlglot AST parser ve regex ile cok katmanli kontrol uygular. Yalnizca SELECT ve izin verilen tablolara erisim saglar.

## Bagimliliklari
- `sqlglot` -- SQL AST parser
- `backend.core.config` -- ALLOWED_TABLES, DB_TYPE, get_all_allowed_tables_sync

## Fonksiyonlar / Class'lar

| Fonksiyon | Parametreler | Donus | Aciklama |
|---|---|---|---|
| `is_safe_sql` | `sql, db_type` | `bool` | SQL guvenlik kontrolu |
| `_extract_tables` | `parsed` | `set[str]` | AST'den tablo adlarini cikarir |
| `_check_blocked` | `parsed, db_type` | `bool` | Engelli schema/tablo kontrolu |

### Guvenlik Kontrolleri
1. Bos sorgu engelleme
2. Coklu statement engelleme (;)
3. Tehlikeli komut regex (DROP, DELETE, UPDATE, INSERT)
4. AST ile yalnizca SELECT kontrolu
5. Sistem tablo engeli (pg_catalog, information_schema, app_users)
6. Izin verilen tablo kontrolu

## Ornek Kullanim

```python
from backend.sql.execution.security import is_safe_sql
is_safe_sql("SELECT * FROM products")      # True
is_safe_sql("DROP TABLE products")         # False
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
