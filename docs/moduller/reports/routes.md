# backend/reports/routes.py

## Amac
Sorgu sonuclarinin rapor olarak kaydedilmesi, listelenmesi, guncellenmesi ve silinmesi icin CRUD endpoint'leri. ML Studio'ya veri aktarimi saglar.

## Bagimliliklari
- `backend.core.models` -- ReportCreate, ReportUpdate, MLTaskCreate
- `backend.auth` -- get_current_user
- `backend.sql.execution.database` -- get_auth_adapter
- `backend.ml.engine` -- delete_model_file

## Fonksiyonlar / Endpointler

| Endpoint | Metot | Aciklama |
|---|---|---|
| `/reports` | POST | Sorgu sonucunu rapor olarak kaydeder |
| `/reports` | GET | Kullanicinin raporlarini listeler |
| `/reports/{id}` | GET | Rapor detayi (veri dahil) |
| `/reports/{id}` | PUT | Rapor snapshot gunceller |
| `/reports/{id}/dependencies` | GET | ML bagimliliklarini kontrol eder |
| `/reports/{id}` | DELETE | Raporu siler (force=true ile cascade) |
| `/reporters` | GET | Reporter kullanicilari listeler |
| `/ml-tasks` | POST | Veriyi ML Studio icin kaydeder |
| `/ml-tasks` | GET | ML gorevlerini listeler |

### Rol Bazli Erisim
- admin: tum raporlar
- reporter/data_scientist: atanmis raporlar
- analyst: kendi raporlari

## Ornek Kullanim

```bash
POST /reports {"title": "Aylik Rapor", "original_sql": "SELECT ...", "result_data": [...]}
DELETE /reports/5?force=true
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
