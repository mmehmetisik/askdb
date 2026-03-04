"""
ml_routes.py — ML Studio API Endpoint'leri
Egitim, polling, model yonetimi ve tahmin.
"""

import asyncio
import json
import os
import logging
from fastapi import APIRouter, HTTPException, Depends

from backend.auth import get_current_user, require_data_scientist
from backend.sql.execution.database import get_auth_adapter
from backend.core.models import MLTrainRequest, MLPredictRequest
from backend.ml.engine import (
    run_training_job, save_model_file, delete_model_file,
    predict_with_model, predict_with_explanation,
    CLASSIFICATION_ALGORITHMS, REGRESSION_ALGORITHMS,
    ML_MODELS_DIR,
)

logger = logging.getLogger("ml_routes")

ml_router = APIRouter(prefix="/ml", tags=["ML Studio"])

# Aktif training task'lari (job_id -> asyncio.Task)
_active_train_tasks: dict[int, asyncio.Task] = {}


# =================== ML TASK DETAY ===================

@ml_router.get("/tasks/{task_id}")
async def get_ml_task_detail(task_id: int, user: dict = Depends(require_data_scientist)):
    """Tek bir ML task detayini veri dahil dondur."""
    adapter = await get_auth_adapter()
    row = await adapter.fetchrow(
        """SELECT t.*, u.username as creator_name
           FROM ml_tasks t
           LEFT JOIN app_users u ON t.created_by = u.id
           WHERE t.id = $1""",
        task_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="ML gorevi bulunamadi")

    r = dict(row) if hasattr(row, "keys") else {
        "id": row[0], "source_report_id": row[1], "title": row[2],
        "created_by": row[3], "note": row[4], "target_column": row[5],
        "data": row[6], "column_types": row[7], "cleaning_steps": row[8],
        "filters_applied": row[9], "row_count": row[10], "col_count": row[11],
        "status": row[12], "created_at": row[13], "updated_at": row[14],
        "creator_name": row[15] if len(row) > 15 else "",
    }

    # JSON parse
    for field in ("data", "column_types", "cleaning_steps", "filters_applied"):
        if isinstance(r.get(field), str):
            try:
                r[field] = json.loads(r[field])
            except (json.JSONDecodeError, TypeError):
                pass

    # datetime -> string
    for field in ("created_at", "updated_at"):
        if r.get(field) and hasattr(r[field], "isoformat"):
            r[field] = r[field].isoformat()

    return {"success": True, "task": r}


# =================== EGITIM BASLAT ===================

@ml_router.post("/train")
async def start_training(req: MLTrainRequest, user: dict = Depends(require_data_scientist)):
    """ML egitimini baslat. Hemen job_id doner, egitim arka planda devam eder."""
    adapter = await get_auth_adapter()

    # Kullanici ID al
    me = await adapter.fetchrow("SELECT id FROM app_users WHERE username = $1", user["username"])
    if not me:
        raise HTTPException(status_code=404, detail="Kullanici bulunamadi")
    my_id = me["id"] if isinstance(me, dict) else me[0]

    # Task var mi kontrol et
    task_row = await adapter.fetchrow("SELECT id, data FROM ml_tasks WHERE id = $1", req.ml_task_id)
    if not task_row:
        raise HTTPException(status_code=404, detail="ML gorevi bulunamadi")

    task_data = task_row["data"] if isinstance(task_row, dict) else task_row[1]

    # ml_jobs'a kayit yaz
    feature_json = json.dumps(req.feature_columns, ensure_ascii=False)
    algo_json = json.dumps(req.algorithms, ensure_ascii=False)

    job_row = await adapter.fetchrow(
        """INSERT INTO ml_jobs
           (ml_task_id, created_by, problem_type, target_column,
            feature_columns, algorithms, train_split, cv_folds, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'running')
           RETURNING id""",
        req.ml_task_id, my_id, req.problem_type, req.target_column,
        feature_json, algo_json, req.train_split, req.cv_folds,
    )
    job_id = job_row["id"] if isinstance(job_row, dict) else job_row[0]

    # Arka planda egitim baslat (asyncio.create_task — ayni event loop, DB erisimi sorunsuz)
    config = {
        "ml_task_id": req.ml_task_id,
        "problem_type": req.problem_type,
        "target_column": req.target_column,
        "feature_columns": req.feature_columns,
        "algorithms": req.algorithms,
        "train_split": req.train_split,
        "cv_folds": req.cv_folds,
        "auto_tune": req.auto_tune,
    }

    task = asyncio.create_task(_background_train_async(job_id, task_data, config, my_id))
    _active_train_tasks[job_id] = task
    task.add_done_callback(lambda t: _on_train_done(t, job_id))

    logger.info(f"[ML TRAIN] Job #{job_id} started - {req.problem_type} - {len(req.algorithms)} algorithms")
    return {"success": True, "job_id": job_id, "message": "Egitim basladi"}


def _on_train_done(task, job_id):
    """Callback: log unhandled exceptions from background training."""
    _active_train_tasks.pop(job_id, None)
    if task.cancelled():
        logger.warning(f"[ML TRAIN] Job #{job_id} cancelled")
    elif task.exception():
        logger.error(f"[ML TRAIN] Job #{job_id} unhandled exception: {task.exception()}")


async def _background_train_async(job_id, task_data_json, config, user_id):
    """Arka planda calisan async egitim fonksiyonu."""
    try:
        # Senkron ML egitimini thread pool'da calistir
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, run_training_job, task_data_json, config)

        # DB guncelleme — ayni event loop'ta, sorunsuz
        await _save_training_results(job_id, result, config, user_id)

    except Exception as e:
        logger.error(f"[ML TRAIN] Job #{job_id} error: {e}")
        try:
            await _mark_job_failed(job_id, str(e))
        except Exception as e2:
            logger.error(f"[ML TRAIN] Job #{job_id} mark_failed error: {e2}")


async def _save_training_results(job_id, result, config, user_id):
    """Egitim sonuclarini DB'ye kaydet ve modelleri diske yaz."""
    from backend.sql.execution.database import get_auth_adapter
    adapter = await get_auth_adapter()

    if result["status"] == "failed":
        await adapter.execute_command(
            "UPDATE ml_jobs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2",
            result.get("error", "Bilinmeyen hata"), job_id,
        )
        return

    # Basarili sonuclari kaydet
    models_for_db = []
    for m in result["models"]:
        if "error" in m:
            continue

        # Model dosyasini kaydet
        model_obj = m.get("model_object")
        pp_info = m.get("preprocessor_info")

        # Once ml_models'a INSERT yapip ID al, sonra dosya kaydet
        metrics_json = json.dumps(m["metrics"], ensure_ascii=False)
        feature_json = json.dumps(config["feature_columns"], ensure_ascii=False)

        # Gecici file_path
        model_row = await adapter.fetchrow(
            """INSERT INTO ml_models
               (ml_job_id, ml_task_id, model_name, algorithm, problem_type,
                metrics, feature_columns, target_column, file_path,
                is_best, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '', $9, $10)
               RETURNING id""",
            job_id, config.get("ml_task_id", 0) or 0,
            m["name"], m["algorithm"], config["problem_type"],
            metrics_json, feature_json, config["target_column"],
            m.get("is_best", False), user_id,
        )
        model_id = model_row["id"] if isinstance(model_row, dict) else model_row[0]

        # Dosyaya kaydet
        if model_obj is not None and pp_info is not None:
            filepath = save_model_file(model_obj, pp_info, model_id, m["algorithm"])
            await adapter.execute_command(
                "UPDATE ml_models SET file_path = $1 WHERE id = $2",
                filepath, model_id,
            )
        else:
            filepath = ""

        models_for_db.append({
            "model_id": model_id,
            "name": m["name"],
            "algorithm": m["algorithm"],
            "is_best": m.get("is_best", False),
            "metrics": m["metrics"],
            "confusion_matrix": m.get("confusion_matrix"),
            "roc_curve": m.get("roc_curve"),
            "feature_importances": m.get("feature_importances"),
            "cv_scores": m.get("cv_scores"),
            "best_params": m.get("best_params"),
        })

    # Job guncelle
    results_json = json.dumps({
        "problem_type": config["problem_type"],
        "models": models_for_db,
        "feature_names": result.get("feature_names", []),
        "class_names": result.get("class_names"),
    }, ensure_ascii=False, default=str)

    await adapter.execute_command(
        """UPDATE ml_jobs
           SET status = 'completed', results = $1, best_model_name = $2, completed_at = NOW()
           WHERE id = $3""",
        results_json, result.get("best_model_name", ""), job_id,
    )
    logger.info(f"[ML TRAIN] Job #{job_id} completed - {len(models_for_db)} models saved")


async def _mark_job_failed(job_id, error_msg):
    """Job'u basarisiz olarak isaretle."""
    from backend.sql.execution.database import get_auth_adapter
    adapter = await get_auth_adapter()
    await adapter.execute_command(
        "UPDATE ml_jobs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2",
        error_msg, job_id,
    )


# =================== EGITIM DURUM POLLING ===================

@ml_router.get("/train/{job_id}/status")
async def get_training_status(job_id: int, user: dict = Depends(require_data_scientist)):
    """Egitim durumunu sorgula (polling)."""
    adapter = await get_auth_adapter()
    row = await adapter.fetchrow(
        "SELECT id, status, results, error_message, best_model_name, started_at, completed_at FROM ml_jobs WHERE id = $1",
        job_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Egitim isi bulunamadi")

    r = dict(row) if hasattr(row, "keys") else {
        "id": row[0], "status": row[1], "results": row[2],
        "error_message": row[3], "best_model_name": row[4],
        "started_at": row[5], "completed_at": row[6],
    }

    # Stuck job detection: running > 5 dakika => failed say
    if r["status"] == "running" and r.get("started_at"):
        from datetime import datetime, timezone, timedelta
        started = r["started_at"]
        if hasattr(started, "tzinfo") and started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if (now - started) > timedelta(minutes=5):
            await adapter.execute_command(
                "UPDATE ml_jobs SET status = 'failed', error_message = 'Timeout: egitim 5 dakikadan fazla surdu', completed_at = NOW() WHERE id = $1",
                job_id,
            )
            r["status"] = "failed"
            r["error_message"] = "Timeout: egitim 5 dakikadan fazla surdu"
            logger.warning(f"[ML TRAIN] Job #{job_id} stuck olarak isaretlendi (>5dk)")

    # JSON parse results
    if isinstance(r.get("results"), str) and r["results"] != "{}":
        try:
            r["results"] = json.loads(r["results"])
        except (json.JSONDecodeError, TypeError):
            r["results"] = {}

    # datetime -> string
    for field in ("started_at", "completed_at"):
        if r.get(field) and hasattr(r[field], "isoformat"):
            r[field] = r[field].isoformat()

    return {"success": True, **r}


# =================== EGITIMI DURDUR ===================

@ml_router.post("/train/{job_id}/cancel")
async def cancel_training(job_id: int, user: dict = Depends(require_data_scientist)):
    """Devam eden egitimi iptal et."""
    adapter = await get_auth_adapter()

    # Task'i iptal et
    task = _active_train_tasks.pop(job_id, None)
    if task and not task.done():
        task.cancel()

    # DB guncelle
    await adapter.execute_command(
        "UPDATE ml_jobs SET status = 'failed', error_message = 'Kullanici tarafindan iptal edildi', completed_at = NOW() WHERE id = $1 AND status = 'running'",
        job_id,
    )
    logger.info(f"[ML TRAIN] Job #{job_id} cancelled by user")
    return {"success": True, "message": "Egitim iptal edildi"}


# =================== MODEL LISTELE ===================

@ml_router.get("/models")
async def get_saved_models(user: dict = Depends(require_data_scientist)):
    """Kaydedilmis modelleri listele."""
    adapter = await get_auth_adapter()
    rows = await adapter.fetch(
        """SELECT m.id, m.ml_job_id, m.ml_task_id, m.model_name, m.algorithm,
                  m.problem_type, m.metrics, m.target_column, m.is_best, m.created_at,
                  u.username as creator_name
           FROM ml_models m
           LEFT JOIN app_users u ON m.created_by = u.id
           ORDER BY m.created_at DESC"""
    )

    models = []
    for row in rows:
        r = dict(row) if hasattr(row, "keys") else {
            "id": row[0], "ml_job_id": row[1], "ml_task_id": row[2],
            "model_name": row[3], "algorithm": row[4], "problem_type": row[5],
            "metrics": row[6], "target_column": row[7], "is_best": row[8],
            "created_at": row[9], "creator_name": row[10] if len(row) > 10 else "",
        }
        if isinstance(r.get("metrics"), str):
            try:
                r["metrics"] = json.loads(r["metrics"])
            except (json.JSONDecodeError, TypeError):
                pass
        if r.get("created_at") and hasattr(r["created_at"], "isoformat"):
            r["created_at"] = r["created_at"].isoformat()
        models.append(r)

    return {"success": True, "models": models}


# =================== MODEL SIL ===================

@ml_router.delete("/models/{model_id}")
async def delete_saved_model(model_id: int, user: dict = Depends(require_data_scientist)):
    """Kaydedilmis modeli sil (dosya + DB)."""
    adapter = await get_auth_adapter()
    row = await adapter.fetchrow("SELECT file_path FROM ml_models WHERE id = $1", model_id)
    if not row:
        raise HTTPException(status_code=404, detail="Model bulunamadi")

    filepath = row["file_path"] if isinstance(row, dict) else row[0]
    delete_model_file(filepath)

    await adapter.execute_command("DELETE FROM ml_models WHERE id = $1", model_id)
    logger.info(f"[ML MODEL] Model #{model_id} deleted")
    return {"success": True, "message": "Model silindi"}


# =================== TAHMIN ===================

@ml_router.post("/predict")
async def run_prediction(req: MLPredictRequest, user: dict = Depends(require_data_scientist)):
    """Kaydedilmis model ile tahmin yap."""
    adapter = await get_auth_adapter()
    row = await adapter.fetchrow(
        "SELECT file_path, model_name, target_column, algorithm FROM ml_models WHERE id = $1",
        req.model_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Model bulunamadi")

    r = dict(row) if hasattr(row, "keys") else {
        "file_path": row[0], "model_name": row[1], "target_column": row[2], "algorithm": row[3],
    }

    if not r["file_path"] or not os.path.exists(r["file_path"]):
        raise HTTPException(status_code=404, detail="Model dosyasi bulunamadi")

    if not req.data or len(req.data) < 2:
        raise HTTPException(status_code=400, detail="Tahmin verisi en az 1 satir icermeli")

    try:
        loop = asyncio.get_running_loop()
        explanations = []

        if getattr(req, "explain", False):
            predictions, explanations = await loop.run_in_executor(
                None, predict_with_explanation, r["file_path"], req.data
            )
        else:
            predictions = await loop.run_in_executor(
                None, predict_with_model, r["file_path"], req.data
            )

        pred_strs = [str(p) for p in predictions]

        # Log prediction to history
        try:
            my_id = user["id"] if isinstance(user, dict) else user[0]
            input_summary = json.dumps(req.data[0][:5], ensure_ascii=False) if req.data else "[]"
            pred_json = json.dumps(pred_strs[:50], ensure_ascii=False)
            await adapter.execute_command(
                """INSERT INTO ml_predictions
                   (ml_model_id, model_name, algorithm, target_column,
                    input_summary, predictions, row_count, created_by)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                req.model_id, r["model_name"], r["algorithm"], r["target_column"] or "",
                input_summary, pred_json, len(pred_strs), my_id,
            )
        except Exception as log_err:
            logger.warning(f"[ML PREDICT] History log failed: {log_err}")

        result = {
            "success": True,
            "predictions": pred_strs,
            "model_name": r["model_name"],
            "target_column": r["target_column"],
            "algorithm": r["algorithm"],
        }
        if explanations:
            result["explanations"] = explanations
        return result
    except Exception as e:
        logger.error(f"[ML PREDICT] Hata: {e}")
        raise HTTPException(status_code=500, detail=f"Tahmin hatasi: {str(e)}")


# =================== PREDICTION HISTORY ===================

@ml_router.get("/predictions")
async def get_prediction_history(user: dict = Depends(require_data_scientist)):
    """Son 50 tahmin gecmisini dondur."""
    adapter = await get_auth_adapter()
    rows = await adapter.fetch(
        """SELECT id, ml_model_id, model_name, algorithm, target_column,
                  input_summary, predictions, row_count, created_at
           FROM ml_predictions
           ORDER BY created_at DESC
           LIMIT 50"""
    )
    items = []
    for row in rows:
        r = dict(row) if hasattr(row, "keys") else {
            "id": row[0], "ml_model_id": row[1], "model_name": row[2],
            "algorithm": row[3], "target_column": row[4], "input_summary": row[5],
            "predictions": row[6], "row_count": row[7], "created_at": row[8],
        }
        # Parse JSON strings
        for key in ("predictions", "input_summary"):
            if isinstance(r.get(key), str):
                try:
                    r[key] = json.loads(r[key])
                except Exception:
                    pass
        if r.get("created_at"):
            r["created_at"] = str(r["created_at"])
        items.append(r)
    return {"success": True, "predictions": items}


@ml_router.delete("/predictions")
async def clear_prediction_history(user: dict = Depends(require_data_scientist)):
    """Tahmin gecmisini temizle."""
    adapter = await get_auth_adapter()
    await adapter.execute_command("DELETE FROM ml_predictions")
    return {"success": True, "message": "Tahmin gecmisi temizlendi"}


# =================== ALGORITMA LISTESI ===================

@ml_router.get("/algorithms")
async def get_algorithms(user: dict = Depends(get_current_user)):
    """Kullanilabilir algoritmalari listele."""
    classification = [
        {"key": k, "name": v[0]} for k, v in CLASSIFICATION_ALGORITHMS.items()
    ]
    regression = [
        {"key": k, "name": v[0]} for k, v in REGRESSION_ALGORITHMS.items()
    ]
    return {
        "success": True,
        "classification": classification,
        "regression": regression,
    }
