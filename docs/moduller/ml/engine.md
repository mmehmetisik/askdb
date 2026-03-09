# ml/engine.py

## Amac

Scikit-learn tabanli ML egitim motoru. Veri on-isleme (impute, encode, scale), model egitimi (classification/regression), hyperparameter tuning, tahmin ve model dosya yonetimi saglar.

## Bagimliliklari

- `scikit-learn` -- model egitimi, metrikler, preprocessing
- `numpy` -- numerik islemler
- `joblib` -- model kaydetme/yukleme

## Fonksiyonlar / Class'lar

| Fonksiyon | Parametreler | Donus | Aciklama |
|-----------|-------------|-------|----------|
| `preprocess_data` | `data_2d, target_col, feature_cols, train_split` | `dict` | Impute, encode, scale + train/test split |
| `train_single_model` | `algo_key, model_class, X, y, ...` | `dict` | Tek model egitir; metrik ve CV hesaplar |
| `run_training_job` | `task_data_json, config` | `dict` | Tam pipeline: preprocess + coklu model egitimi |
| `save_model_file` | `model_object, preprocessor_info, ...` | `str` | Modeli joblib ile diske kaydeder |
| `load_model_file` | `filepath` | `dict` | Kaydedilmis modeli yukler |
| `delete_model_file` | `filepath` | - | Model dosyasini siler |
| `predict_with_model` | `filepath, input_data_2d` | `list` | Model ile tahmin yapar |
| `predict_with_explanation` | `filepath, input_data_2d` | `(list, list)` | Tahmin + feature katki aciklamasi |

### Sabitler

- `CLASSIFICATION_ALGORITHMS` -- 6 siniflandirma algoritmasi (LogReg, RF, GB, SVM, KNN, DT)
- `REGRESSION_ALGORITHMS` -- 6 regresyon algoritmasi (Linear, Ridge, Lasso, RF, GB, SVR)
- `HYPERPARAM_GRIDS` -- Her algoritma icin tuning parametre araliklari

## Ornek Kullanim

```python
from backend.ml.engine import run_training_job

config = {"problem_type": "classification", "target_column": "churn",
          "algorithms": ["random_forest"], "train_split": 0.8}
result = run_training_job(data_2d, config)
```

## Degisiklik Gecmisi

| Tarih | Aciklama |
|-------|----------|
| 1 Mart 2026 | Ilk surum |
