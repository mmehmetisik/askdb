# ml/routes.py

## Amac

ML Studio icin FastAPI endpoint'leri. Model egitimi baslatma/polling, model yonetimi, tahmin calistirma ve tahmin gecmisi islemlerini HTTP API olarak sunar.

## Bagimliliklari

- `backend.ml.engine` -- run_training_job, save_model_file, predict_with_model
- `backend.auth` -- get_current_user, require_data_scientist
- `backend.sql.execution.database` -- get_auth_adapter
- `backend.core.models` -- MLTrainRequest, MLPredictRequest

## Fonksiyonlar / Endpointler

| Metot | Yol | Aciklama |
|-------|-----|----------|
| GET | `/tasks/{task_id}` | ML task detayi |
| POST | `/train` | Arka planda egitim baslatir |
| GET | `/train/{job_id}/status` | Egitim durumu sorgulama |
| POST | `/train/{job_id}/cancel` | Egitimi iptal eder |
| GET | `/models` | Kaydedilmis modelleri listeler |
| DELETE | `/models/{model_id}` | Model siler |
| POST | `/predict` | Model ile tahmin yapar |
| GET | `/predictions` | Son 50 tahmin gecmisi |
| DELETE | `/predictions` | Tahmin gecmisini temizler |
| GET | `/algorithms` | Kullanilabilir algoritma listesi |

## Ornek Kullanim

```bash
POST /ml/train
{"ml_task_id": 1, "problem_type": "classification",
 "target_column": "churn", "algorithms": ["random_forest"]}

GET /ml/train/42/status
POST /ml/predict {"model_id": 5, "data": [...], "explain": true}
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|-------|----------|
| 1 Mart 2026 | Ilk surum |
