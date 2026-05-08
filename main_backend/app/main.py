from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core import redis_client
from app.api.health import router as health_router
from app.api.auth import router as auth_router
from app.api.onboarding import router as onboarding_router
from app.api.profile import router as profile_router
from app.api.admin_users import router as admin_router
from app.api.internal import router as internal_router
from app.api.payments import router as payments_router
from app.api.subscriptions import router as subscriptions_router
from app.api.colleges import router as colleges_router
from app.api.admin_content import router as admin_content_router
from app.api.admin_analytics import router as admin_analytics_router
from app.api.admin_referrals import router as admin_referrals_router
from app.api.admin_proxy import router as admin_proxy_router
from app.api.tutor_proxy import router as tutor_proxy_router
from app.api.practice_proxy import router as practice_proxy_router
from app.api.consultant_proxy import router as consultant_proxy_router
from app.api.capsule_proxy import router as capsule_proxy_router
from app.api.config import router as config_router
from app.api.notes import router as notes_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await redis_client.close()


app = FastAPI(
    title="HamroGuru Main Backend",
    version="0.1.0",
    debug=settings.DEBUG,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(onboarding_router)
app.include_router(profile_router)
app.include_router(admin_router)
app.include_router(internal_router)
app.include_router(payments_router)
app.include_router(subscriptions_router)
app.include_router(colleges_router)
app.include_router(admin_content_router)
app.include_router(admin_analytics_router)
app.include_router(admin_referrals_router)
app.include_router(admin_proxy_router)
app.include_router(tutor_proxy_router)
app.include_router(practice_proxy_router)
app.include_router(consultant_proxy_router)
app.include_router(capsule_proxy_router)
app.include_router(config_router)
app.include_router(notes_router)
