from fastapi import Header, HTTPException, status
from jose import JWTError, jwt

from app.config import settings

_ALGORITHM = "HS256"


async def get_current_user_id(authorization: str = Header(...)) -> str:
    """Extract and verify JWT from Authorization: Bearer <token> header."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not authorization.startswith("Bearer "):
        raise credentials_exception
    token = authorization[len("Bearer "):]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[_ALGORITHM])
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise credentials_exception
        return user_id
    except JWTError:
        raise credentials_exception
