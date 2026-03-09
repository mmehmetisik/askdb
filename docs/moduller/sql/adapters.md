# backend/sql/execution/adapters.py

## Amac
Coklu veritabani destegi icin adapter pattern. PostgreSQL, MySQL, MSSQL ve Trino icin ortak arayuz saglar.

## Bagimliliklari
- `asyncpg` -- PostgreSQL async driver
- `aiomysql` -- MySQL async driver
- `pymssql` -- MSSQL senkron driver
- `trino` -- Trino DBAPI2 driver

## Fonksiyonlar / Class'lar

| Ad | Tip | Aciklama |
|---|---|---|
| `DatabaseAdapter` | ABC | Soyut veritabani adapter arayuzu |
| `PostgreSQLAdapter` | Class | asyncpg tabanli (connection pool, pgbouncer uyumlu) |
| `MySQLAdapter` | Class | aiomysql tabanli (SSL destekli) |
| `MSSQLAdapter` | Class | pymssql tabanli (async wrapper) |
| `TrinoAdapter` | Class | Trino DBAPI2 (read-only, catalog/schema destekli) |
| `create_adapter(db_type, url)` | Factory | Tipe gore uygun adapter olusturur |

### Ortak Metotlar

| Metot | Donus | Aciklama |
|---|---|---|
| `init()` | None | Baglanti havuzunu baslatir |
| `close()` | None | Baglantilari kapatir |
| `fetch(sql)` | list[dict] | Birden fazla satir dondurur |
| `run_query(sql, max_rows)` | dict | Limitli sorgu calistirir |
| `get_schema_info(tables)` | list | Tablo/kolon bilgisi |
| `dialect()` | str | SQL dialect adi |

## Ornek Kullanim

```python
adapter = create_adapter("postgresql", "postgresql://user:pass@localhost/db")
await adapter.init()
result = await adapter.run_query("SELECT * FROM users", max_rows=100)
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
