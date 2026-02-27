from fastapi import Depends, HTTPException, Request
from jose import jwt, JWTError
import bcrypt
from datetime import datetime, timedelta, timezone

from backend.core.config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRY_HOURS

# Cookie adi
ACCESS_TOKEN_COOKIE = "access_token"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(username: str, role: str, trino_access: bool = False) -> str:
    payload = {
        "sub": username,
        "role": role,
        "trino_access": trino_access,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    """Cookie'den JWT token okuyup kullanici bilgisini dondur."""
    token = request.cookies.get(ACCESS_TOKEN_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Oturum bulunamadi. Lutfen giris yapin.")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get("sub")
        role = payload.get("role")
        trino_access = payload.get("trino_access", False)
        # Eski "user" rolunu "analyst" olarak esle (geriye uyumluluk)
        if role == "user":
            role = "analyst"
        if not username:
            raise HTTPException(status_code=401, detail="Gecersiz token")
        return {"username": username, "role": role, "trino_access": trino_access}
    except JWTError:
        raise HTTPException(
            status_code=401, detail="Gecersiz veya suresi dolmus token"
        )


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin yetkisi gerekli")
    return user


async def require_analyst(user: dict = Depends(get_current_user)) -> dict:
    """Sorgu ekranina erisim: admin ve analyst."""
    if user["role"] not in ("admin", "analyst"):
        raise HTTPException(status_code=403, detail="Sorgu yetkisi gerekli (admin veya analyst)")
    return user


async def require_reporter(user: dict = Depends(get_current_user)) -> dict:
    """Analiz workspace erisimi: admin, reporter, data_scientist."""
    if user["role"] not in ("admin", "reporter", "data_scientist"):
        raise HTTPException(status_code=403, detail="Analiz yetkisi gerekli")
    return user


async def require_data_scientist(user: dict = Depends(get_current_user)) -> dict:
    """ML Studio erisimi: admin ve data_scientist."""
    if user["role"] not in ("admin", "data_scientist"):
        raise HTTPException(status_code=403, detail="ML Studio yetkisi gerekli (admin veya data_scientist)")
    return user
