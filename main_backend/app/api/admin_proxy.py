from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.dependencies import require_role
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/api/admin", tags=["admin-proxy"])

_admin_only = require_role("admin")

_INTERNAL_HEADERS = {"X-Internal-Secret": settings.MAIN_BACKEND_INTERNAL_SECRET}


def _ai_url(path: str) -> str:
    return f"{settings.AI_SERVICE_URL}{path}"


async def _forward_get(path: str, params: dict | None = None) -> JSONResponse:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(_ai_url(path), headers=_INTERNAL_HEADERS, params=params or {})
    return JSONResponse(content=resp.json(), status_code=resp.status_code)


async def _forward_delete(path: str) -> JSONResponse:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.delete(_ai_url(path), headers=_INTERNAL_HEADERS)
    if resp.status_code == 204:
        return JSONResponse(content=None, status_code=204)
    return JSONResponse(content=resp.json(), status_code=resp.status_code)


async def _forward_json(method: str, path: str, body: dict | None = None) -> JSONResponse:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await getattr(client, method)(_ai_url(path), headers=_INTERNAL_HEADERS, json=body or {})
    return JSONResponse(content=resp.json(), status_code=resp.status_code)


# ---------------------------------------------------------------------------
# RAG Notes proxy
# ---------------------------------------------------------------------------

@router.post("/rag/upload-note")
async def proxy_upload_note(
    subject: str = Form(...),
    chapter: str = Form(...),
    display_name: str = Form(...),
    file: UploadFile = File(...),
    _: User = Depends(_admin_only),
):
    data = await file.read()
    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(
            _ai_url("/api/rag/upload-note"),
            headers=_INTERNAL_HEADERS,
            files={"file": (file.filename, data, file.content_type or "text/plain")},
            data={"subject": subject, "chapter": chapter, "display_name": display_name},
        )
    return JSONResponse(content=resp.json(), status_code=resp.status_code)


@router.get("/rag/notes")
async def proxy_list_notes(_: User = Depends(_admin_only)):
    return await _forward_get("/api/rag/notes")


@router.get("/rag/status/{note_id}")
async def proxy_note_status(note_id: str, _: User = Depends(_admin_only)):
    return await _forward_get(f"/api/rag/status/{note_id}")


@router.delete("/rag/notes/{note_id}")
async def proxy_delete_note(note_id: str, _: User = Depends(_admin_only)):
    return await _forward_delete(f"/api/rag/notes/{note_id}")


@router.get("/rag/structure/{subject}")
async def proxy_rag_structure(subject: str, _: User = Depends(_admin_only)):
    return await _forward_get(f"/api/rag/structure/{subject}")


# ---------------------------------------------------------------------------
# Questions proxy
# ---------------------------------------------------------------------------

@router.post("/questions/upload/main")
async def proxy_upload_main_questions(
    file: UploadFile = File(...),
    _: User = Depends(_admin_only),
):
    data = await file.read()
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            _ai_url("/api/questions/upload/main"),
            headers=_INTERNAL_HEADERS,
            files={"file": (file.filename, data, file.content_type or "application/json")},
        )
    return JSONResponse(content=resp.json(), status_code=resp.status_code)


@router.post("/questions/upload/extra")
async def proxy_upload_extra_questions(
    subject: str = Form(...),
    file: UploadFile = File(...),
    _: User = Depends(_admin_only),
):
    data = await file.read()
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            _ai_url("/api/questions/upload/extra"),
            headers=_INTERNAL_HEADERS,
            files={"file": (file.filename, data, file.content_type or "application/json")},
            data={"subject": subject},
        )
    return JSONResponse(content=resp.json(), status_code=resp.status_code)


@router.get("/questions/stats")
async def proxy_question_stats(
    subject: str | None = Query(None),
    _: User = Depends(_admin_only),
):
    params = {}
    if subject:
        params["subject"] = subject
    return await _forward_get("/api/questions/pool/stats", params)


@router.post("/extra-subjects")
async def proxy_create_extra_subject(request: Request, _: User = Depends(_admin_only)):
    body = await request.json()
    return await _forward_json("post", "/api/questions/extra-subjects", body)


@router.get("/extra-subjects")
async def proxy_list_extra_subjects(_: User = Depends(_admin_only)):
    return await _forward_get("/api/questions/extra-subjects")


@router.patch("/extra-subjects/{key}/toggle")
async def proxy_toggle_extra_subject(key: str, _: User = Depends(_admin_only)):
    return await _forward_json("patch", f"/api/questions/extra-subjects/{key}/toggle")
