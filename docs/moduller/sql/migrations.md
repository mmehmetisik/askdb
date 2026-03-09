# backend/sql/execution/migrations.py

## Amac
Uygulama baslatildiginda gerekli DB tablolarini olusturur ve varsayilan admin kullaniciyi seed eder. Tum islemler idempotent'tir.

## Bagimliliklari
- `backend.core.config` -- DEFAULT_ADMIN_PASSWORD, logger
- `backend.auth` -- hash_password

## Fonksiyonlar / Class'lar

| Fonksiyon | Aciklama |
|---|---|
| `ensure_all_tables(auth_adapter)` | Tum tablolari olusturur, admin seed eder |
| `seed_admin(auth_adapter)` | Varsayilan admin yoksa olusturur |

### Olusturulan Tablolar
app_users, saved_reports, ml_tasks, ml_jobs, ml_models, db_connections, analysis_operations, query_logs, table_profiles, ml_predictions

## Ornek Kullanim

```python
await ensure_all_tables(auth_adapter)
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
