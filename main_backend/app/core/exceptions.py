from __future__ import annotations

import re

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        field: str | None = None,
    ):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field = field

    @classmethod
    def not_found(cls, message: str = "Not found") -> "AppError":
        return cls(status.HTTP_404_NOT_FOUND, "not_found", message)

    @classmethod
    def forbidden(cls, message: str = "Access denied") -> "AppError":
        return cls(status.HTTP_403_FORBIDDEN, "forbidden", message)

    @classmethod
    def unauthorized(cls, message: str = "Unauthorized") -> "AppError":
        return cls(status.HTTP_401_UNAUTHORIZED, "unauthorized", message)

    @classmethod
    def bad_request(cls, message: str, field: str | None = None) -> "AppError":
        return cls(status.HTTP_400_BAD_REQUEST, "bad_request", message, field)

    @classmethod
    def conflict(cls, message: str) -> "AppError":
        return cls(status.HTTP_409_CONFLICT, "conflict", message)


def _detail_to_code(detail: str) -> str:
    words = re.sub(r"[^a-z0-9 ]", "", detail.lower()).split()[:5]
    return "_".join(words) or "error"


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    body: dict = {"error": {"code": exc.code, "message": exc.message}}
    if exc.field:
        body["error"]["field"] = exc.field
    return JSONResponse(status_code=exc.status_code, content=body)


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    detail = exc.detail
    if isinstance(detail, dict):
        return JSONResponse(status_code=exc.status_code, content={"error": detail})
    text = str(detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": _detail_to_code(text), "message": text}},
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    first = errors[0] if errors else {}
    loc = first.get("loc", [])
    field = ".".join(str(x) for x in loc[1:]) if len(loc) > 1 else None
    message = first.get("msg", "Validation error")
    body: dict = {"error": {"code": "validation_error", "message": message}}
    if field:
        body["error"]["field"] = field
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=body)
