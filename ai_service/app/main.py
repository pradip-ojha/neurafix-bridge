import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app import redis_client
from app.api.health import router as health_router
from app.api.rag import router as rag_router
from app.api.tutor import router as tutor_router
from app.api.questions import router as questions_router
from app.api.practice import router as practice_router
from app.api.debug import router as debug_router

for _log_name in (
    "app.rag.pipeline", "app.rag.semantic_refiner", "app.rag.chunker",
    "app.rag.embedder", "app.rag.retriever",
    "app.agents.tutor.agent", "app.agents.practice.agent",
    "app.personalization.context_builder", "app.sessions.manager",
    "app.api.practice",
):
    _logger = logging.getLogger(_log_name)
    _logger.setLevel(logging.DEBUG)
    if not _logger.handlers:
        _h = logging.StreamHandler()
        _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
        _logger.addHandler(_h)
    _logger.propagate = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await redis_client.close()


app = FastAPI(
    title="HamroGuru AI Service",
    version="0.1.0",
    debug=settings.DEBUG,
    lifespan=lifespan,
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
app.include_router(tutor_router)
app.include_router(questions_router)
app.include_router(practice_router)
app.include_router(debug_router)
