import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.health import router as health_router
from app.api.rag import router as rag_router

# Ensure app-level loggers are visible alongside uvicorn output
for _log_name in ("app.rag.pipeline", "app.rag.semantic_refiner", "app.rag.chunker",
                  "app.rag.embedder", "app.rag.image_extractor"):
    _logger = logging.getLogger(_log_name)
    _logger.setLevel(logging.DEBUG)
    if not _logger.handlers:
        _h = logging.StreamHandler()
        _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
        _logger.addHandler(_h)
    _logger.propagate = False

app = FastAPI(
    title="HamroGuru AI Service",
    version="0.1.0",
    debug=settings.DEBUG,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ai_service is internal; frontend goes through main_backend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(rag_router)
