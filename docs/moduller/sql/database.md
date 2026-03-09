# backend/sql/execution/database.py

## Amac
Veritabani baglanti yasam dongusu, sorgu calistirma ve dinamik multi-DB adapter yonetimi. Direct mode ve Trino modunda coklu veritabani destegi saglar.

## Bagimliliklari
- `backend.core.config` -- DATABASE_URL, MAX_QUERY_ROWS, ALLOWED_TABLES, DB_MODE, TRINO_URL
- `backend.sql.execution.adapters` -- create_adapter
- `backend.sql.execution.migrations` -- ensure_all_tables

## Fonksiyonlar / Class'lar

| Fonksiyon | Donus | Aciklama |
|---|---|---|
| `init_pool()` | None | DB_MODE'a gore adapter'leri baslatir |
| `close_pool()` | None | Tum adapter'leri kapatir |
| `get_adapter()` | DatabaseAdapter | Sorgu adapter'ini dondurur |
| `get_auth_adapter()` | DatabaseAdapter | Auth (yazma) adapter'ini dondurur |
| `run_sql(sql, limit, tables)` | dict | SELECT sorgusunu dogru adapter'de calistirir |
| `run_sql_trino(sql, limit)` | dict | Sorguyu Trino uzerinden calistirir |
| `log_query(...)` | None | Sorgu logunu DB'ye yazar |
| `get_schema_info()` | list | Tablo/kolon bilgilerini dondurur |
| `resolve_adapter_for_tables(tables)` | DatabaseAdapter | Tablolara gore adapter secer |
| `activate_trino(conn_id)` | dict | Trino baglantisini aktif eder |
| `deactivate_trino()` | None | Trino'yu kapatir |
| `init_direct_adapters()` | None | db_connections'a adapter olusturur |

## Ornek Kullanim

```python
await init_pool()
result = await run_sql("SELECT * FROM products LIMIT 10")
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
