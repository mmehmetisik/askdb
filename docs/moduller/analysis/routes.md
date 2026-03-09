# analysis/routes.py

## Amac

Analysis Workspace icin FastAPI endpoint'leri. Rapor verisi uzerinde sayfalama, EDA, veri temizleme, undo/reset ve export islemlerini HTTP API olarak sunar.

## Bagimliliklari

- `backend.analysis.engine` -- get_or_create_session, remove_session
- `backend.auth` -- get_current_user (JWT dogrulama)
- `backend.sql.execution.database` -- get_auth_adapter (DB erisimi)
- `backend.core.config` -- logger

## Fonksiyonlar / Endpointler

| Metot | Yol | Aciklama |
|-------|-----|----------|
| GET | `/{report_id}/data` | Sayfalanmis veri |
| GET | `/{report_id}/eda` | EDA ozet raporu |
| GET | `/{report_id}/duplicates` | Tekrarlayan satirlar |
| GET | `/{report_id}/column/{col_name}` | Tek kolon profili |
| POST | `/{report_id}/preview` | Islem onizlemesi |
| POST | `/{report_id}/apply` | Islemi uygula ve DB'ye kaydet |
| POST | `/{report_id}/undo` | Son islemi geri al |
| GET | `/{report_id}/history` | Islem gecmisi |
| POST | `/{report_id}/reset` | Tum islemleri sifirla |
| POST | `/{report_id}/export` | Temizlenmis veriyi dondur |

## Ornek Kullanim

```bash
GET /analysis/5/data?page=1&size=50&sort_col=yas&sort_dir=desc
POST /analysis/5/preview  {"operation": "fill_mean", "column": "maas"}
POST /analysis/5/apply    {"operation": "fill_mean", "column": "maas"}
POST /analysis/5/undo
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|-------|----------|
| 1 Mart 2026 | Ilk surum |
