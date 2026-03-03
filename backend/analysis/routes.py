"""
Analysis API Router - Analiz Workspace backend endpoint'leri.
Tum veri islemleri Pandas ile backend'de yapilir.
"""
import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional

from backend.auth import get_current_user
from backend.sql.execution.database import get_auth_adapter
from backend.analysis.engine import get_or_create_session, remove_session
from backend.core.config import logger


analysis_router = APIRouter(prefix="/analysis", tags=["analysis"])


# =================== MODELLER ===================
class OperationRequest(BaseModel):
    operation: str = Field(..., description="Operasyon adi: fill_mean, trim_whitespace, vb.")
    column: Optional[str] = Field(None, description="Hedef kolon adi")
    params: dict = Field(default_factory=dict, description="Ek parametreler")


# =================== YARDIMCI ===================
async def _load_session(report_id: int, user: dict):
    """Raporu yukle ve session olustur/getir."""
    from backend.analysis.engine import get_or_create_session, _sessions

    # Session zaten varsa direkt dondur
    if report_id in _sessions:
        return _sessions[report_id]

    # DB'den rapor verisini cek
    adapter = await get_auth_adapter()
    row = await adapter.fetchrow(
        "SELECT id, result_data, column_types, assigned_to, created_by FROM saved_reports WHERE id = $1",
        report_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Rapor bulunamadi.")

    # Dict veya tuple erisimine gore uyumlu okuma
    def _get(row, key, idx):
        if isinstance(row, dict):
            return row.get(key)
        return row[idx] if idx < len(row) else None

    # Yetki kontrolu (user dict: {username, role} — id yok, username ile karsilastir)
    role = user["role"]
    if role != "admin":
        # User id'sini DB'den cek
        user_row = await adapter.fetchrow(
            "SELECT id FROM app_users WHERE username = $1",
            user["username"],
        )
        if user_row:
            uid = _get(user_row, "id", 0)
            assigned_to = _get(row, "assigned_to", 3)
            created_by = _get(row, "created_by", 4)
            if assigned_to != uid and created_by != uid:
                raise HTTPException(status_code=403, detail="Bu rapora erisim izniniz yok.")

    # Veriyi parse et
    try:
        result_data = _get(row, "result_data", 1)
        if isinstance(result_data, str):
            result_data = json.loads(result_data)
        if not result_data:
            result_data = []

        column_types_raw = _get(row, "column_types", 2)
        column_types = None
        if isinstance(column_types_raw, str):
            column_types = json.loads(column_types_raw)

        logger.info(f"[ANALYSIS] Loading report #{report_id}: {len(result_data)} rows")
        session = get_or_create_session(report_id, result_data, column_types)

        # Eger yeni session olusturulduysa ve DB'de kayitli islemler varsa, replay yap
        if not session.operations:
            saved_ops = await adapter.fetch(
                "SELECT operation_type, column_name, params FROM analysis_operations WHERE report_id = $1 ORDER BY id ASC",
                report_id,
            )
            if saved_ops:
                ops_list = []
                for r in saved_ops:
                    if isinstance(r, dict):
                        ops_list.append(r)
                    else:
                        ops_list.append({"operation_type": r[0], "column_name": r[1], "params": r[2]})
                session.replay_operations(ops_list)
                logger.info(f"[ANALYSIS] Replayed {len(ops_list)} saved ops for report #{report_id}")

        return session
    except Exception as e:
        logger.error(f"[ANALYSIS] Session creation error for report #{report_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Veri islenemedi: {str(e)}")


# =================== ENDPOINT'LER ===================

@analysis_router.get("/{report_id}/data")
async def get_paginated_data(
    report_id: int,
    page: int = 1,
    size: int = 100,
    sort_col: Optional[str] = None,
    sort_dir: str = "asc",
    search: str = "",
    user: dict = Depends(get_current_user),
):
    """Sayfalanmis veri dondur."""
    try:
        session = await _load_session(report_id, user)
        return session.get_page(page, size, sort_col, sort_dir, search)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ANALYSIS] Data endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@analysis_router.get("/{report_id}/eda")
async def get_eda_summary(
    report_id: int,
    user: dict = Depends(get_current_user),
):
    """Tum kolonlar icin EDA ozeti."""
    session = await _load_session(report_id, user)
    return session.get_eda_summary()


@analysis_router.get("/{report_id}/duplicates")
async def get_duplicate_rows(
    report_id: int,
    user: dict = Depends(get_current_user),
):
    """Duplike satirlari dondur (inceleme icin)."""
    session = await _load_session(report_id, user)
    return session.get_duplicate_rows()


@analysis_router.get("/{report_id}/column/{col_name}")
async def get_column_profile(
    report_id: int,
    col_name: str,
    user: dict = Depends(get_current_user),
):
    """Tek kolon icin detayli profil."""
    session = await _load_session(report_id, user)
    try:
        return session.get_column_profile(col_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@analysis_router.post("/{report_id}/preview")
async def preview_operation(
    report_id: int,
    req: OperationRequest,
    user: dict = Depends(get_current_user),
):
    """Islem onizlemesi: etkilenecek satirlari goster."""
    session = await _load_session(report_id, user)
    try:
        return session.preview_operation(req.operation, req.column, req.params)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@analysis_router.post("/{report_id}/apply")
async def apply_operation(
    report_id: int,
    req: OperationRequest,
    user: dict = Depends(get_current_user),
):
    """Islemi uygula."""
    session = await _load_session(report_id, user)
    try:
        result = session.apply_operation(req.operation, req.column, req.params)

        # Islem gecmisini DB'ye kaydet
        adapter = await get_auth_adapter()
        await adapter.execute_command(
            """INSERT INTO analysis_operations
               (report_id, operation_type, column_name, params, description, affected_rows)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            report_id, req.operation, req.column or "",
            json.dumps(req.params, ensure_ascii=False),
            result["description"], result["affected_rows"],
        )

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@analysis_router.post("/{report_id}/undo")
async def undo_operation(
    report_id: int,
    user: dict = Depends(get_current_user),
):
    """Son islemi geri al."""
    session = await _load_session(report_id, user)
    result = session.undo()
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

    # DB'den son islemi sil
    adapter = await get_auth_adapter()
    await adapter.execute_command(
        """DELETE FROM analysis_operations
           WHERE id = (SELECT MAX(id) FROM analysis_operations WHERE report_id = $1)""",
        report_id,
    )

    return result


@analysis_router.get("/{report_id}/history")
async def get_operation_history(
    report_id: int,
    user: dict = Depends(get_current_user),
):
    """Islem gecmisi."""
    session = await _load_session(report_id, user)
    return {"operations": session.get_history()}


@analysis_router.post("/{report_id}/reset")
async def reset_data(
    report_id: int,
    user: dict = Depends(get_current_user),
):
    """Tum islemleri sifirla, orijinale don."""
    session = await _load_session(report_id, user)
    result = session.reset()

    # DB'den tum islemleri sil
    adapter = await get_auth_adapter()
    await adapter.execute_command(
        "DELETE FROM analysis_operations WHERE report_id = $1",
        report_id,
    )

    return result


@analysis_router.post("/{report_id}/export")
async def export_data(
    report_id: int,
    user: dict = Depends(get_current_user),
):
    """Temizlenmis veriyi 2D array olarak dondur (Excel/ML export icin)."""
    session = await _load_session(report_id, user)
    data = session.to_export_data()
    return {
        "data": data,
        "row_count": len(data) - 1,
        "col_count": len(data[0]) if data else 0,
    }
