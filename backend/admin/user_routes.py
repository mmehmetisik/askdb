from fastapi import APIRouter, HTTPException, Depends, Request

from backend.core.config import logger
from backend.core.models import UserCreate
from backend.auth import hash_password, require_admin
from backend.sql.execution.database import get_auth_adapter
from backend.core.i18n import t as _t, get_lang

router = APIRouter(tags=["users"])


@router.post("/users")
async def create_user(req: UserCreate, request: Request, _admin: dict = Depends(require_admin)):
    adapter = await get_auth_adapter()
    existing = await adapter.fetchrow(
        "SELECT id FROM app_users WHERE username = $1", req.username
    )
    if existing:
        raise HTTPException(status_code=400, detail=_t("users.alreadyExists", get_lang(request)))

    hashed = hash_password(req.password)
    await adapter.execute_command(
        "INSERT INTO app_users (username, password, role, trino_access) VALUES ($1, $2, $3, $4)",
        req.username, hashed, req.role, req.trino_access,
    )
    return {"success": True, "message": _t("users.created", get_lang(request))}


@router.get("/users")
async def get_users(_admin: dict = Depends(require_admin)):
    adapter = await get_auth_adapter()
    rows = await adapter.fetch(
        """SELECT u.id, u.username, u.role, u.trino_access, u.table_profile_id,
                  u.created_at, p.name as profile_name
           FROM app_users u
           LEFT JOIN table_profiles p ON u.table_profile_id = p.id
           ORDER BY u.id DESC"""
    )
    return {"success": True, "users": rows}


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, request: Request, _admin: dict = Depends(require_admin)):
    adapter = await get_auth_adapter()
    user = await adapter.fetchrow("SELECT id FROM app_users WHERE id = $1", user_id)
    if not user:
        raise HTTPException(status_code=404, detail=_t("users.notFound", get_lang(request)))
    await adapter.execute_command("DELETE FROM app_users WHERE id = $1", user_id)
    return {"success": True, "message": _t("users.deleted", get_lang(request))}


@router.patch("/users/{user_id}/trino-access")
async def toggle_user_trino_access(user_id: int, body: dict, request: Request, _admin: dict = Depends(require_admin)):
    """Kullanicinin Trino erisimini ac/kapat (admin-only)."""
    adapter = await get_auth_adapter()
    user = await adapter.fetchrow("SELECT id, role FROM app_users WHERE id = $1", user_id)
    if not user:
        raise HTTPException(status_code=404, detail=_t("users.notFound", get_lang(request)))
    trino_access = bool(body.get("trino_access", False))
    await adapter.execute_command(
        "UPDATE app_users SET trino_access = $1 WHERE id = $2",
        trino_access, user_id,
    )
    return {"success": True, "message": _t("users.trinoUpdated", get_lang(request)), "trino_access": trino_access}


@router.patch("/users/{user_id}/profile")
async def assign_user_profile(user_id: int, body: dict, request: Request, _admin: dict = Depends(require_admin)):
    """Kullaniciya tablo erisim profili ata."""
    adapter = await get_auth_adapter()
    user = await adapter.fetchrow("SELECT id FROM app_users WHERE id = $1", user_id)
    if not user:
        raise HTTPException(status_code=404, detail=_t("users.notFound", get_lang(request)))
    profile_id = body.get("table_profile_id")
    if profile_id is not None:
        profile = await adapter.fetchrow("SELECT id FROM table_profiles WHERE id = $1", profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail=_t("profiles.notFound", get_lang(request)))
    await adapter.execute_command(
        "UPDATE app_users SET table_profile_id = $1 WHERE id = $2", profile_id, user_id
    )
    return {"success": True, "message": _t("users.profileUpdated", get_lang(request))}
