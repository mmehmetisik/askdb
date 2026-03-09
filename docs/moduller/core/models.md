# models.py

## Amac
API request/response dogrulamasi icin Pydantic modellerini tanimlar. Kullanici, sorgu, rapor, ML ve DB baglanti islemleri icin veri siniflari icerir.

## Bagimliliklari
- `pydantic` -- BaseModel, Field, field_validator

## Fonksiyonlar / Class'lar

| Model | Alanlar | Aciklama |
|---|---|---|
| `LoginRequest` | username, password | Giris istegi |
| `UserCreate` | username, password, role, trino_access | Kullanici olusturma |
| `QueryRequest` | query, selected_tables? | Dogal dil sorgusu (max 1000 kar.) |
| `ExecuteSQLRequest` | sql | Duzenlenmis SQL calistirma |
| `ReportCreate` | title, original_sql, result_data, ... | Rapor kaydetme |
| `ReportUpdate` | filters_applied?, hidden_columns?, ... | Rapor guncelleme |
| `MLTaskCreate` | source_report_id, title, data, ... | ML Studio'ya veri gonderme |
| `MLTrainRequest` | ml_task_id, problem_type, algorithms, ... | Model egitim istegi |
| `MLPredictRequest` | model_id, data, explain? | Tahmin istegi |
| `DBConnectionCreate` | name, db_type, host, port, ... | DB baglantisi olusturma |
| `TableProfileCreate` | name, description, allowed_tables | Tablo erisim profili |

## Gecerli Roller
`admin`, `analyst`, `reporter`, `data_scientist`

## Ornek Kullanim

```python
from backend.core.models import QueryRequest, LoginRequest
login = LoginRequest(username="admin", password="Admin123!")
query = QueryRequest(query="Son 7 gundeki siparisler")
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|---|---|
| 1 Mart 2026 | Ilk surum |
