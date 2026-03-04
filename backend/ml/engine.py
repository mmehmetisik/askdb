"""
ml_engine.py — ML Egitim Motoru
Scikit-learn tabanli preprocessing, training ve prediction.
Tum fonksiyonlar senkron — FastAPI'den run_in_executor ile cagrilir.
"""

import os
import json
import math
import logging
import traceback
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score, RandomizedSearchCV
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, roc_auc_score,
    confusion_matrix, roc_curve,
    r2_score, mean_absolute_error, mean_squared_error,
)
from sklearn.linear_model import LogisticRegression, LinearRegression, Ridge, Lasso
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, RandomForestRegressor, GradientBoostingRegressor
from sklearn.svm import SVC, SVR
from sklearn.neighbors import KNeighborsClassifier
from sklearn.tree import DecisionTreeClassifier
import joblib

logger = logging.getLogger("ml_engine")

# =================== ALGORITMA HARITASI ===================

CLASSIFICATION_ALGORITHMS = {
    "logistic_regression": ("Logistic Regression", LogisticRegression, {"max_iter": 1000, "random_state": 42}),
    "random_forest": ("Random Forest", RandomForestClassifier, {"n_estimators": 100, "random_state": 42}),
    "gradient_boosting": ("Gradient Boosting", GradientBoostingClassifier, {"n_estimators": 100, "random_state": 42}),
    "svm": ("SVM", SVC, {"probability": True, "random_state": 42}),
    "knn": ("KNN", KNeighborsClassifier, {"n_neighbors": 5}),
    "decision_tree": ("Decision Tree", DecisionTreeClassifier, {"random_state": 42}),
}

REGRESSION_ALGORITHMS = {
    "linear_regression": ("Linear Regression", LinearRegression, {}),
    "ridge": ("Ridge Regression", Ridge, {"random_state": 42}),
    "lasso": ("Lasso Regression", Lasso, {"random_state": 42}),
    "random_forest_regressor": ("Random Forest Regressor", RandomForestRegressor, {"n_estimators": 100, "random_state": 42}),
    "gradient_boosting_regressor": ("Gradient Boosting Regressor", GradientBoostingRegressor, {"n_estimators": 100, "random_state": 42}),
    "svr": ("SVR", SVR, {}),
}

ML_MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ml_models")


# =================== HYPERPARAM GRIDS (AutoTune) ===================

HYPERPARAM_GRIDS = {
    "logistic_regression": {"C": [0.01, 0.1, 1, 10], "solver": ["lbfgs", "liblinear"]},
    "random_forest": {"n_estimators": [50, 100, 200], "max_depth": [None, 10, 20, 30], "min_samples_split": [2, 5, 10]},
    "gradient_boosting": {"n_estimators": [50, 100, 200], "learning_rate": [0.01, 0.05, 0.1, 0.2], "max_depth": [3, 5, 7]},
    "svm": {"C": [0.1, 1, 10], "kernel": ["rbf", "linear"]},
    "knn": {"n_neighbors": [3, 5, 7, 11], "weights": ["uniform", "distance"]},
    "decision_tree": {"max_depth": [None, 5, 10, 20], "min_samples_split": [2, 5, 10]},
    "linear_regression": {},
    "ridge": {"alpha": [0.01, 0.1, 1, 10, 100]},
    "lasso": {"alpha": [0.001, 0.01, 0.1, 1, 10]},
    "random_forest_regressor": {"n_estimators": [50, 100, 200], "max_depth": [None, 10, 20, 30], "min_samples_split": [2, 5, 10]},
    "gradient_boosting_regressor": {"n_estimators": [50, 100, 200], "learning_rate": [0.01, 0.05, 0.1, 0.2], "max_depth": [3, 5, 7]},
    "svr": {"C": [0.1, 1, 10], "kernel": ["rbf", "linear"]},
}


# =================== PREPROCESSING ===================

def _detect_numeric(values):
    """Bir kolon degerlerinin numerik olup olmadigini kontrol et."""
    count = 0
    for v in values:
        if v is None or v == "" or v == "NULL":
            continue
        try:
            float(v)
            count += 1
        except (ValueError, TypeError):
            return False
    return count > 0


def preprocess_data(data_2d, target_col_name, feature_col_names, train_split=0.8):
    """
    Ham 2D veriyi (headers dahil) preprocess edip train/test split yap.
    Returns: dict with X_train, X_test, y_train, y_test, preprocessor_info, class_names
    """
    if not data_2d or len(data_2d) < 3:
        raise ValueError("Yeterli veri yok (en az 2 satir gerekli)")

    headers = [str(h) for h in data_2d[0]]
    rows = data_2d[1:]

    # Hedef kolon index'i bul
    if target_col_name not in headers:
        raise ValueError(f"Hedef kolon '{target_col_name}' bulunamadi")
    target_idx = headers.index(target_col_name)

    # Feature kolon index'lerini bul
    feature_indices = []
    for fn in feature_col_names:
        if fn in headers and fn != target_col_name:
            feature_indices.append(headers.index(fn))
    if not feature_indices:
        raise ValueError("En az bir feature kolonu secilmeli")

    # Veriyi ayir
    X_raw = []
    y_raw = []
    for row in rows:
        if target_idx < len(row):
            y_val = row[target_idx]
            if y_val is None or y_val == "" or y_val == "NULL":
                continue  # Hedefi bos olan satirlari atla
            x_row = []
            for fi in feature_indices:
                x_row.append(row[fi] if fi < len(row) else None)
            X_raw.append(x_row)
            y_raw.append(y_val)

    if len(X_raw) < 10:
        raise ValueError(f"Yeterli gecerli veri yok ({len(X_raw)} satir). En az 10 satir gerekli.")

    # Kolon tiplerini belirle (numeric vs categorical)
    n_features = len(feature_indices)
    feature_names = [headers[fi] for fi in feature_indices]
    is_numeric = []
    for col_i in range(n_features):
        col_vals = [row[col_i] for row in X_raw]
        is_numeric.append(_detect_numeric(col_vals))

    # === Impute missing values ===
    numeric_imputer = SimpleImputer(strategy="median")
    categorical_imputer = SimpleImputer(strategy="most_frequent")

    X_array = np.array(X_raw, dtype=object)

    numeric_cols = [i for i, num in enumerate(is_numeric) if num]
    categorical_cols = [i for i, num in enumerate(is_numeric) if not num]

    # Convert numeric cols to float
    for ci in numeric_cols:
        for ri in range(len(X_array)):
            val = X_array[ri, ci]
            if val is None or val == "" or val == "NULL":
                X_array[ri, ci] = np.nan
            else:
                try:
                    X_array[ri, ci] = float(val)
                except (ValueError, TypeError):
                    X_array[ri, ci] = np.nan

    # Impute
    if numeric_cols:
        X_num = X_array[:, numeric_cols].astype(float)
        X_num = numeric_imputer.fit_transform(X_num)
        for idx, ci in enumerate(numeric_cols):
            X_array[:, ci] = X_num[:, idx]

    if categorical_cols:
        X_cat = X_array[:, categorical_cols]
        # None -> "MISSING"
        for ri in range(len(X_cat)):
            for ci_local in range(X_cat.shape[1]):
                if X_cat[ri, ci_local] is None or X_cat[ri, ci_local] == "" or X_cat[ri, ci_local] == "NULL":
                    X_cat[ri, ci_local] = "MISSING"
                else:
                    X_cat[ri, ci_local] = str(X_cat[ri, ci_local])
        X_cat = categorical_imputer.fit_transform(X_cat)
        for idx, ci in enumerate(categorical_cols):
            X_array[:, ci] = X_cat[:, idx]

    # === Encode categoricals ===
    label_encoders = {}
    for ci in categorical_cols:
        le = LabelEncoder()
        col_vals = [str(v) for v in X_array[:, ci]]
        X_array[:, ci] = le.fit_transform(col_vals)
        label_encoders[feature_names[ci]] = le

    # Convert to float
    X_final = X_array.astype(float)

    # === Scale numerics ===
    scaler = StandardScaler()
    if numeric_cols:
        X_final[:, numeric_cols] = scaler.fit_transform(X_final[:, numeric_cols])

    # === Encode target if classification ===
    target_encoder = None
    class_names = None
    y_array = np.array(y_raw, dtype=object)

    # Hedef numerik mi?
    target_is_numeric = _detect_numeric(y_raw)
    if not target_is_numeric:
        target_encoder = LabelEncoder()
        y_final = target_encoder.fit_transform([str(v) for v in y_array]).astype(float)
        class_names = target_encoder.classes_.tolist()
    else:
        y_final = np.array([float(v) for v in y_array], dtype=float)

    # === Train/Test split ===
    X_train, X_test, y_train, y_test = train_test_split(
        X_final, y_final, test_size=(1.0 - train_split), random_state=42, shuffle=True
    )

    preprocessor_info = {
        "feature_names": feature_names,
        "is_numeric": is_numeric,
        "numeric_cols": numeric_cols,
        "categorical_cols": categorical_cols,
        "numeric_imputer": numeric_imputer if numeric_cols else None,
        "categorical_imputer": categorical_imputer if categorical_cols else None,
        "label_encoders": label_encoders,
        "scaler": scaler if numeric_cols else None,
        "target_encoder": target_encoder,
        "class_names": class_names,
    }

    return {
        "X_train": X_train, "X_test": X_test,
        "y_train": y_train, "y_test": y_test,
        "preprocessor_info": preprocessor_info,
        "class_names": class_names,
    }


# =================== TRAINING ===================

def _safe_float(val):
    """NaN/Inf kontrol ile float donustur."""
    if val is None or (isinstance(val, float) and (math.isnan(val) or math.isinf(val))):
        return 0.0
    return round(float(val), 4)


def _count_combos(param_grid):
    """Param grid'deki toplam kombinasyon sayisini hesapla."""
    total = 1
    for v in param_grid.values():
        total *= len(v) if isinstance(v, list) else 1
    return total


def train_single_model(algo_key, algo_name, model_class, model_params,
                       X_train, y_train, X_test, y_test,
                       problem_type, cv_folds, class_names=None, auto_tune=False):
    """Tek bir modeli egit ve metriklerini hesapla."""
    try:
        best_params = None

        if auto_tune and algo_key in HYPERPARAM_GRIDS and HYPERPARAM_GRIDS[algo_key]:
            param_grid = HYPERPARAM_GRIDS[algo_key]
            base_params = {k: v for k, v in model_params.items() if k not in param_grid}
            scoring = "accuracy" if problem_type == "classification" else "r2"
            base_model = model_class(**base_params)
            search = RandomizedSearchCV(
                base_model, param_grid,
                n_iter=min(10, max(1, _count_combos(param_grid))),
                cv=min(cv_folds, len(X_train)),
                scoring=scoring, random_state=42, n_jobs=-1, error_score="raise",
            )
            search.fit(X_train, y_train)
            model = search.best_estimator_
            best_params = search.best_params_
            y_pred = model.predict(X_test)
        else:
            model = model_class(**model_params)
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)

        result = {
            "algorithm": algo_key,
            "name": algo_name,
            "metrics": {},
            "model_object": model,
            "best_params": best_params,
        }

        if problem_type == "classification":
            n_classes = len(set(y_train))
            avg = "binary" if n_classes == 2 else "weighted"

            result["metrics"]["accuracy"] = _safe_float(accuracy_score(y_test, y_pred))
            result["metrics"]["precision"] = _safe_float(precision_score(y_test, y_pred, average=avg, zero_division=0))
            result["metrics"]["recall"] = _safe_float(recall_score(y_test, y_pred, average=avg, zero_division=0))
            result["metrics"]["f1"] = _safe_float(f1_score(y_test, y_pred, average=avg, zero_division=0))

            # ROC AUC
            try:
                if hasattr(model, "predict_proba"):
                    y_proba = model.predict_proba(X_test)
                    if n_classes == 2:
                        result["metrics"]["roc_auc"] = _safe_float(roc_auc_score(y_test, y_proba[:, 1]))
                    else:
                        result["metrics"]["roc_auc"] = _safe_float(
                            roc_auc_score(y_test, y_proba, multi_class="ovr", average="weighted")
                        )
                else:
                    result["metrics"]["roc_auc"] = 0.0
            except Exception:
                result["metrics"]["roc_auc"] = 0.0

            # Confusion matrix
            cm = confusion_matrix(y_test, y_pred)
            result["confusion_matrix"] = cm.tolist()

            # ROC curve (binary only)
            if n_classes == 2 and hasattr(model, "predict_proba"):
                try:
                    y_proba = model.predict_proba(X_test)[:, 1]
                    fpr, tpr, _ = roc_curve(y_test, y_proba)
                    # Subsample for JSON size
                    step = max(1, len(fpr) // 50)
                    result["roc_curve"] = {
                        "fpr": [_safe_float(v) for v in fpr[::step]],
                        "tpr": [_safe_float(v) for v in tpr[::step]],
                    }
                except Exception:
                    result["roc_curve"] = None
            else:
                result["roc_curve"] = None

            # Cross-validation
            try:
                cv_scores = cross_val_score(model_class(**model_params), X_train, y_train, cv=min(cv_folds, len(X_train)), scoring="accuracy")
                result["cv_scores"] = {
                    "mean": _safe_float(cv_scores.mean()),
                    "std": _safe_float(cv_scores.std()),
                }
            except Exception:
                result["cv_scores"] = {"mean": 0.0, "std": 0.0}

        else:  # regression
            result["metrics"]["r2"] = _safe_float(r2_score(y_test, y_pred))
            result["metrics"]["mae"] = _safe_float(mean_absolute_error(y_test, y_pred))
            result["metrics"]["mse"] = _safe_float(mean_squared_error(y_test, y_pred))
            result["metrics"]["rmse"] = _safe_float(math.sqrt(max(0, mean_squared_error(y_test, y_pred))))

            # Cross-validation
            try:
                cv_scores = cross_val_score(model_class(**model_params), X_train, y_train, cv=min(cv_folds, len(X_train)), scoring="r2")
                result["cv_scores"] = {
                    "mean": _safe_float(cv_scores.mean()),
                    "std": _safe_float(cv_scores.std()),
                }
            except Exception:
                result["cv_scores"] = {"mean": 0.0, "std": 0.0}

        # Feature importance
        if hasattr(model, "feature_importances_"):
            importances = model.feature_importances_
        elif hasattr(model, "coef_"):
            coef = model.coef_
            if coef.ndim > 1:
                importances = np.mean(np.abs(coef), axis=0)
            else:
                importances = np.abs(coef)
        else:
            importances = None

        if importances is not None:
            result["feature_importances"] = [_safe_float(v) for v in importances]
        else:
            result["feature_importances"] = None

        return result

    except Exception as e:
        logger.error(f"Model training error ({algo_key}): {e}\n{traceback.format_exc()}")
        return {
            "algorithm": algo_key,
            "name": algo_name,
            "metrics": {},
            "error": str(e),
        }


def run_training_job(task_data_json, config):
    """
    Tam egitim pipeline'i. Senkron fonksiyon.

    task_data_json: ml_tasks tablosundaki 'data' JSON string (2D array)
    config: {problem_type, target_column, feature_columns, algorithms, train_split, cv_folds}

    Returns: {status, models: [...], best_model_name, error, feature_names, class_names}
    """
    try:
        # Parse data
        if isinstance(task_data_json, str):
            data_2d = json.loads(task_data_json)
        else:
            data_2d = task_data_json

        problem_type = config["problem_type"]
        target_column = config["target_column"]
        feature_columns = config["feature_columns"]
        algorithms = config["algorithms"]
        train_split = config.get("train_split", 0.8)
        cv_folds = config.get("cv_folds", 5)
        auto_tune = config.get("auto_tune", False)

        # Preprocess
        pp = preprocess_data(data_2d, target_column, feature_columns, train_split)
        X_train, X_test = pp["X_train"], pp["X_test"]
        y_train, y_test = pp["y_train"], pp["y_test"]
        preprocessor_info = pp["preprocessor_info"]
        class_names = pp["class_names"]
        feature_names = preprocessor_info["feature_names"]

        # Algoritma map
        algo_map = CLASSIFICATION_ALGORITHMS if problem_type == "classification" else REGRESSION_ALGORITHMS

        # Train each model
        results = []
        for algo_key in algorithms:
            if algo_key not in algo_map:
                continue
            algo_name, model_class, model_params = algo_map[algo_key]
            res = train_single_model(
                algo_key, algo_name, model_class, model_params,
                X_train, y_train, X_test, y_test,
                problem_type, cv_folds, class_names, auto_tune=auto_tune
            )
            res["preprocessor_info"] = preprocessor_info
            results.append(res)

        if not results:
            return {"status": "failed", "error": "Hicbir model egitimi basarili olmadi", "models": []}

        # Best model
        if problem_type == "classification":
            primary_metric = "accuracy"
        else:
            primary_metric = "r2"

        valid_results = [r for r in results if primary_metric in r.get("metrics", {})]
        if valid_results:
            best = max(valid_results, key=lambda r: r["metrics"][primary_metric])
            best_model_name = best["name"]
        else:
            best_model_name = results[0]["name"]

        # Mark best
        for r in results:
            r["is_best"] = (r["name"] == best_model_name)

        return {
            "status": "completed",
            "models": results,
            "best_model_name": best_model_name,
            "feature_names": feature_names,
            "class_names": class_names,
            "error": None,
        }

    except Exception as e:
        logger.error(f"Training job error: {e}\n{traceback.format_exc()}")
        return {
            "status": "failed",
            "models": [],
            "best_model_name": "",
            "error": str(e),
        }


# =================== MODEL SAVE / LOAD ===================

def save_model_file(model_object, preprocessor_info, model_id, algorithm):
    """Modeli ve preprocessing bilgisini joblib ile kaydet."""
    os.makedirs(ML_MODELS_DIR, exist_ok=True)
    filename = f"model_{model_id}_{algorithm}.joblib"
    filepath = os.path.join(ML_MODELS_DIR, filename)
    bundle = {
        "model": model_object,
        "preprocessor_info": preprocessor_info,
    }
    joblib.dump(bundle, filepath)
    return filepath


def load_model_file(filepath):
    """Kaydedilmis modeli yukle."""
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Model dosyasi bulunamadi: {filepath}")
    return joblib.load(filepath)


def delete_model_file(filepath):
    """Model dosyasini sil."""
    if filepath and os.path.exists(filepath):
        os.remove(filepath)


# =================== PREDICT ===================

def predict_with_model(filepath, input_data_2d):
    """
    Kaydedilmis model ile tahmin yap.
    input_data_2d: [[headers], [row1], [row2], ...]
    Returns: list of predictions
    """
    bundle = load_model_file(filepath)
    model = bundle["model"]
    pp = bundle["preprocessor_info"]

    feature_names = pp["feature_names"]
    is_numeric = pp["is_numeric"]
    numeric_cols = pp["numeric_cols"]
    categorical_cols = pp["categorical_cols"]
    label_encoders = pp["label_encoders"]
    scaler = pp["scaler"]
    target_encoder = pp["target_encoder"]
    numeric_imputer = pp.get("numeric_imputer")
    categorical_imputer = pp.get("categorical_imputer")

    headers = [str(h) for h in input_data_2d[0]]
    rows = input_data_2d[1:]

    # Feature index mapping
    feature_indices = []
    for fn in feature_names:
        if fn in headers:
            feature_indices.append(headers.index(fn))
        else:
            feature_indices.append(-1)

    # Build X
    X_raw = []
    for row in rows:
        x_row = []
        for fi in feature_indices:
            if fi >= 0 and fi < len(row):
                x_row.append(row[fi])
            else:
                x_row.append(None)
        X_raw.append(x_row)

    X_array = np.array(X_raw, dtype=object)
    n_features = len(feature_names)

    # Numeric convert
    for ci in numeric_cols:
        for ri in range(len(X_array)):
            val = X_array[ri, ci]
            if val is None or val == "" or val == "NULL":
                X_array[ri, ci] = np.nan
            else:
                try:
                    X_array[ri, ci] = float(val)
                except (ValueError, TypeError):
                    X_array[ri, ci] = np.nan

    # Impute
    if numeric_cols and numeric_imputer is not None:
        X_num = X_array[:, numeric_cols].astype(float)
        X_num = numeric_imputer.transform(X_num)
        for idx, ci in enumerate(numeric_cols):
            X_array[:, ci] = X_num[:, idx]

    if categorical_cols and categorical_imputer is not None:
        X_cat = X_array[:, categorical_cols]
        for ri in range(len(X_cat)):
            for ci_local in range(X_cat.shape[1]):
                if X_cat[ri, ci_local] is None or X_cat[ri, ci_local] == "" or X_cat[ri, ci_local] == "NULL":
                    X_cat[ri, ci_local] = "MISSING"
                else:
                    X_cat[ri, ci_local] = str(X_cat[ri, ci_local])
        X_cat = categorical_imputer.transform(X_cat)
        for idx, ci in enumerate(categorical_cols):
            X_array[:, ci] = X_cat[:, idx]

    # Encode categoricals
    for ci in categorical_cols:
        fn = feature_names[ci]
        if fn in label_encoders:
            le = label_encoders[fn]
            col_vals = []
            for v in X_array[:, ci]:
                sv = str(v)
                if sv in le.classes_:
                    col_vals.append(le.transform([sv])[0])
                else:
                    col_vals.append(0)  # Unknown category -> 0
            X_array[:, ci] = col_vals

    X_final = X_array.astype(float)

    # Scale numerics
    if numeric_cols and scaler is not None:
        X_final[:, numeric_cols] = scaler.transform(X_final[:, numeric_cols])

    # Predict
    predictions = model.predict(X_final)

    # Decode target if needed
    if target_encoder is not None:
        decoded = []
        for p in predictions:
            p_int = int(round(p))
            if 0 <= p_int < len(target_encoder.classes_):
                decoded.append(target_encoder.classes_[p_int])
            else:
                decoded.append(str(p))
        return decoded
    else:
        return [_safe_float(p) for p in predictions]


def predict_with_explanation(filepath, input_data_2d):
    """
    Tahmin + her satir icin basit yerel aciklama.
    contribution = global_importance * |scaled_value|
    """
    bundle = load_model_file(filepath)
    model = bundle["model"]
    pp = bundle["preprocessor_info"]

    # Once normal predict pipeline
    predictions = predict_with_model(filepath, input_data_2d)

    # Feature importances
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
    elif hasattr(model, "coef_"):
        coef = model.coef_
        importances = np.mean(np.abs(coef), axis=0) if coef.ndim > 1 else np.abs(coef)
    else:
        return predictions, []

    feature_names = pp["feature_names"]
    if len(importances) != len(feature_names):
        return predictions, []

    # Preprocess input — X_final'i yeniden olustur
    headers = [str(h) for h in input_data_2d[0]]
    rows = input_data_2d[1:]
    feature_indices = []
    for fn in feature_names:
        feature_indices.append(headers.index(fn) if fn in headers else -1)

    X_raw = []
    for row in rows:
        x_row = []
        for fi in feature_indices:
            x_row.append(row[fi] if fi >= 0 and fi < len(row) else None)
        X_raw.append(x_row)

    explanations = []
    for ri in range(len(X_raw)):
        contributions = []
        for fi in range(len(feature_names)):
            raw_val = X_raw[ri][fi]
            try:
                num_val = float(raw_val) if raw_val is not None else 0
            except (ValueError, TypeError):
                num_val = 0
            contrib = float(importances[fi]) * abs(num_val)
            contributions.append({
                "feature": feature_names[fi],
                "importance": round(float(importances[fi]), 4),
                "contribution": round(contrib, 4)
            })
        contributions.sort(key=lambda c: c["contribution"], reverse=True)
        explanations.append(contributions[:5])

    return predictions, explanations
