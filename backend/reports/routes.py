import json

from fastapi import APIRouter, HTTPException, Depends, Request

from backend.core.i18n import t as _t, get_lang
from backend.core.config import logger
from backend.core.models import ReportCreate, ReportUpdate, MLTaskCreate
from backend.auth import get_current_user
from backend.sql.execution.database import get_auth_adapter

router = APIRouter(tags=["reports"])


@router.post("/reports")
async def create_report(req: ReportCreate, request: Request, user: dict = Depends(get_current_user)):
    """Sorgu sonucunu rapor olarak kaydet ve baska kullaniciya gonder."""
    adapter = await get_auth_adapter()

    sender = await adapter.fetchrow(
        "SELECT id FROM app_users WHERE username = $1", user["username"]
    )
    if not sender:
        raise HTTPException(status_code=404, detail=_t("reports.userNotFound", get_lang(request)))
    sender_id = sender["id"] if isinstance(sender, dict) else sender[0]

    if req.assigned_to:
        target = await adapter.fetchrow(
            "SELECT id, role FROM app_users WHERE id = $1", req.assigned_to
        )
        if not target:
            raise HTTPException(status_code=404, detail=_t("reports.targetNotFound", get_lang(request)))

    result_json = json.dumps(req.result_data, ensure_ascii=False, default=str)
    types_json = json.dumps(req.column_types, ensure_ascii=False)

    await adapter.execute_command(
        """INSERT INTO saved_reports
           (title, created_by, assigned_to, original_sql, result_data, column_types, row_count, note, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new')""",
        req.title, sender_id, req.assigned_to, req.original_sql,
        result_json, types_json, req.row_count, req.note or "",
    )
    logger.info(f"[REPORT] '{req.title}' created by {user['username']} -> assigned_to={req.assigned_to}")
    return {"success": True, "message": _t("reports.saved", get_lang(request))}


@router.get("/reports")
async def get_reports(request: Request, user: dict = Depends(get_current_user)):
    """Kullanicinin raporlarini getir (role gore filtrelenir)."""
    adapter = await get_auth_adapter()

    me = await adapter.fetchrow(
        "SELECT id FROM app_users WHERE username = $1", user["username"]
    )
    if not me:
        raise HTTPException(status_code=404, detail=_t("reports.userNotFound", get_lang(request)))
    my_id = me["id"] if isinstance(me, dict) else me[0]

    if user["role"] == "admin":
        rows = await adapter.fetch(
            """SELECT r.id, r.title, r.created_by, r.assigned_to, r.row_count,
                      r.note, r.status, r.created_at, r.updated_at,
                      u1.username as creator_name, u2.username as assignee_name
               FROM saved_reports r
               LEFT JOIN app_users u1 ON r.created_by = u1.id
               LEFT JOIN app_users u2 ON r.assigned_to = u2.id
               ORDER BY r.created_at DESC"""
        )
    elif user["role"] in ("reporter", "data_scientist"):
        rows = await adapter.fetch(
            """SELECT r.id, r.title, r.created_by, r.assigned_to, r.row_count,
                      r.note, r.status, r.created_at, r.updated_at,
                      u1.username as creator_name, u2.username as assignee_name
               FROM saved_reports r
               LEFT JOIN app_users u1 ON r.created_by = u1.id
               LEFT JOIN app_users u2 ON r.assigned_to = u2.id
               WHERE r.assigned_to = $1
               ORDER BY r.created_at DESC""",
            my_id,
        )
    else:
        rows = await adapter.fetch(
            """SELECT r.id, r.title, r.created_by, r.assigned_to, r.row_count,
                      r.note, r.status, r.created_at, r.updated_at,
                      u1.username as creator_name, u2.username as assignee_name
               FROM saved_reports r
               LEFT JOIN app_users u1 ON r.created_by = u1.id
               LEFT JOIN app_users u2 ON r.assigned_to = u2.id
               WHERE r.created_by = $1
               ORDER BY r.created_at DESC""",
            my_id,
        )

    return {"success": True, "reports": rows}


@router.get("/reports/{report_id}")
async def get_report_detail(report_id: int, request: Request, user: dict = Depends(get_current_user)):
    """Rapor detayi (veri dahil)."""
    adapter = await get_auth_adapter()

    me = await adapter.fetchrow(
        "SELECT id FROM app_users WHERE username = $1", user["username"]
    )
    my_id = me["id"] if isinstance(me, dict) else me[0]

    row = await adapter.fetchrow(
        """SELECT r.*, u1.username as creator_name, u2.username as assignee_name
           FROM saved_reports r
           LEFT JOIN app_users u1 ON r.created_by = u1.id
           LEFT JOIN app_users u2 ON r.assigned_to = u2.id
           WHERE r.id = $1""",
        report_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=_t("reports.notFound", get_lang(request)))

    r = row if isinstance(row, dict) else dict(row)
    if user["role"] != "admin":
        if user["role"] in ("reporter", "data_scientist") and r.get("assigned_to") != my_id:
            raise HTTPException(status_code=403, detail=_t("reports.noAccess", get_lang(request)))
        if user["role"] == "analyst" and r.get("created_by") != my_id:
            raise HTTPException(status_code=403, detail=_t("reports.noAccess", get_lang(request)))

    # Parse JSON fields
    result_data = r.get("result_data", "[]")
    if isinstance(result_data, str):
        result_data = json.loads(result_data)
    column_types = r.get("column_types", "[]")
    if isinstance(column_types, str):
        column_types = json.loads(column_types)
    filters_applied = r.get("filters_applied", "{}")
    if isinstance(filters_applied, str):
        filters_applied = json.loads(filters_applied)
    hidden_columns = r.get("hidden_columns", "[]")
    if isinstance(hidden_columns, str):
        hidden_columns = json.loads(hidden_columns)
    deleted_rows = r.get("deleted_rows", "[]")
    if isinstance(deleted_rows, str):
        deleted_rows = json.loads(deleted_rows)

    return {
        "success": True,
        "report": {
            "id": r["id"],
            "title": r["title"],
            "created_by": r["created_by"],
            "assigned_to": r.get("assigned_to"),
            "creator_name": r.get("creator_name", ""),
            "assignee_name": r.get("assignee_name", ""),
            "original_sql": r.get("original_sql", ""),
            "result_data": result_data,
            "column_types": column_types,
            "row_count": r.get("row_count", 0),
            "note": r.get("note", ""),
            "status": r.get("status", "new"),
            "filters_applied": filters_applied,
            "hidden_columns": hidden_columns,
            "deleted_rows": deleted_rows,
            "created_at": r.get("created_at"),
            "updated_at": r.get("updated_at"),
        },
    }


@router.put("/reports/{report_id}")
async def update_report(report_id: int, req: ReportUpdate, request: Request, user: dict = Depends(get_current_user)):
    """Rapor snapshot guncelle (filtre, gizli sutun, silinen satirlar, durum)."""
    adapter = await get_auth_adapter()

    me = await adapter.fetchrow("SELECT id FROM app_users WHERE username = $1", user["username"])
    my_id = me["id"] if isinstance(me, dict) else me[0]

    existing = await adapter.fetchrow("SELECT id, assigned_to, created_by FROM saved_reports WHERE id = $1", report_id)
    if not existing:
        raise HTTPException(status_code=404, detail=_t("reports.notFound", get_lang(request)))

    e = existing if isinstance(existing, dict) else dict(existing)
    if user["role"] != "admin" and e.get("assigned_to") != my_id and e.get("created_by") != my_id:
        raise HTTPException(status_code=403, detail=_t("reports.noUpdateAccess", get_lang(request)))

    updates = []
    params = []
    idx = 1

    if req.filters_applied is not None:
        updates.append(f"filters_applied = ${idx}")
        params.append(json.dumps(req.filters_applied, ensure_ascii=False))
        idx += 1
    if req.hidden_columns is not None:
        updates.append(f"hidden_columns = ${idx}")
        params.append(json.dumps(req.hidden_columns))
        idx += 1
    if req.deleted_rows is not None:
        updates.append(f"deleted_rows = ${idx}")
        params.append(json.dumps(req.deleted_rows))
        idx += 1
    if req.status is not None:
        updates.append(f"status = ${idx}")
        params.append(req.status)
        idx += 1

    if not updates:
        return {"success": True, "message": _t("reports.noChange", get_lang(request))}

    updates.append(f"updated_at = NOW()")
    sql = f"UPDATE saved_reports SET {', '.join(updates)} WHERE id = ${idx}"
    params.append(report_id)

    await adapter.execute_command(sql, *params)
    return {"success": True, "message": _t("reports.updated", get_lang(request))}


@router.delete("/reports/{report_id}")
async def delete_report(report_id: int, request: Request, user: dict = Depends(get_current_user)):
    """Rapor sil."""
    adapter = await get_auth_adapter()

    me = await adapter.fetchrow("SELECT id FROM app_users WHERE username = $1", user["username"])
    my_id = me["id"] if isinstance(me, dict) else me[0]

    existing = await adapter.fetchrow("SELECT id, created_by FROM saved_reports WHERE id = $1", report_id)
    if not existing:
        raise HTTPException(status_code=404, detail=_t("reports.notFound", get_lang(request)))

    e = existing if isinstance(existing, dict) else dict(existing)
    if user["role"] != "admin" and e.get("created_by") != my_id:
        raise HTTPException(status_code=403, detail=_t("reports.noDeleteAccess", get_lang(request)))

    await adapter.execute_command("DELETE FROM saved_reports WHERE id = $1", report_id)
    return {"success": True, "message": _t("reports.deleted", get_lang(request))}


@router.get("/reporters")
async def get_reporters(user: dict = Depends(get_current_user)):
    """Rapor gonderilebilecek kullanicilari listele (reporter + data_scientist)."""
    adapter = await get_auth_adapter()
    rows = await adapter.fetch(
        "SELECT id, username, role FROM app_users WHERE role IN ('reporter', 'data_scientist') ORDER BY username"
    )
    return {"success": True, "users": rows}


@router.post("/ml-tasks")
async def create_ml_task(req: MLTaskCreate, request: Request, user: dict = Depends(get_current_user)):
    """Temizlenmis veriyi ML Studio icin kaydet."""
    adapter = await get_auth_adapter()

    me = await adapter.fetchrow(
        "SELECT id FROM app_users WHERE username = $1", user["username"]
    )
    if not me:
        raise HTTPException(status_code=404, detail=_t("reports.userNotFound", get_lang(request)))
    my_id = me["id"] if isinstance(me, dict) else me[0]

    data_json = json.dumps(req.data, ensure_ascii=False, default=str)
    types_json = json.dumps(req.column_types, ensure_ascii=False)
    cleaning_json = json.dumps(req.cleaning_steps, ensure_ascii=False)
    filters_json = json.dumps(req.filters_applied, ensure_ascii=False)

    await adapter.execute_command(
        """INSERT INTO ml_tasks
           (source_report_id, title, created_by, note, target_column,
            data, column_types, cleaning_steps, filters_applied,
            row_count, col_count, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')""",
        req.source_report_id, req.title, my_id, req.note or "",
        req.target_column, data_json, types_json, cleaning_json, filters_json,
        req.row_count, req.col_count,
    )
    logger.info(f"[ML TASK] '{req.title}' created by {user['username']}")
    return {"success": True, "message": _t("ml.taskCreated", get_lang(request))}


@router.get("/ml-tasks")
async def get_ml_tasks(user: dict = Depends(get_current_user)):
    """ML gorevlerini listele."""
    adapter = await get_auth_adapter()
    rows = await adapter.fetch(
        """SELECT t.id, t.title, t.source_report_id, t.created_by,
                  t.row_count, t.col_count, t.status, t.created_at,
                  u.username as creator_name
           FROM ml_tasks t
           LEFT JOIN app_users u ON t.created_by = u.id
           ORDER BY t.created_at DESC"""
    )
    return {"success": True, "tasks": rows}
