from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse

from backend.core.config import logger, SECURE_COOKIE, JWT_EXPIRY_HOURS
from backend.core.models import LoginRequest
from .service import create_token, verify_password, get_current_user, ACCESS_TOKEN_COOKIE
from backend.core.csrf import CSRF_ENABLED, CSRF_COOKIE_NAME, generate_csrf_token
from backend.sql.execution.database import get_auth_adapter
from backend.core.i18n import t as _t, get_lang

router = APIRouter(tags=["auth"])


@router.post("/login")
async def login(req: LoginRequest, request: Request):
    logger.info(f"Login attempt: {req.username}")
    adapter = await get_auth_adapter()
    user = await adapter.fetchrow(
        "SELECT * FROM app_users WHERE username = $1", req.username
    )
    if user and verify_password(req.password, user["password"]):
        trino_access = True if user["role"] == "admin" else bool(user.get("trino_access", False))
        token = create_token(user["username"], user["role"], trino_access)
        logger.info(f"Login successful: {req.username} (role: {user['role']}, trino: {trino_access})")
        response = JSONResponse(content={
            "success": True,
            "role": user["role"],
            "username": user["username"],
            "trino_access": trino_access,
        })
        response.set_cookie(
            key=ACCESS_TOKEN_COOKIE,
            value=token,
            httponly=True,
            secure=SECURE_COOKIE,
            samesite="strict",
            max_age=JWT_EXPIRY_HOURS * 3600,
            path="/",
        )
        if CSRF_ENABLED:
            response.set_cookie(
                key=CSRF_COOKIE_NAME,
                value=generate_csrf_token(),
                httponly=False,
                secure=SECURE_COOKIE,
                samesite="strict",
                max_age=JWT_EXPIRY_HOURS * 3600,
                path="/",
            )
        return response
    logger.warning(f"Failed login attempt: {req.username}")
    raise HTTPException(status_code=401, detail=_t("auth.invalidCredentials", get_lang(request)))


@router.post("/logout")
async def logout():
    """Oturumu sonlandir — cookie'yi temizle."""
    response = JSONResponse(content={"success": True, "message": _t("auth.loggedOut")})
    response.delete_cookie(ACCESS_TOKEN_COOKIE, path="/")
    return response


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Mevcut kullanici bilgisini dondur (cookie dogrulama icin)."""
    return {
        "success": True,
        "username": user["username"],
        "role": user["role"],
        "trino_access": user["trino_access"],
    }
