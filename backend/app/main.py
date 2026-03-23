import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.logging import setup_logging
from app.core.redis import close_redis, get_redis
from app.middleware.tenant import TenantMiddleware
from app.middleware.request_context import RequestContextMiddleware

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s (env=%s)", settings.APP_NAME, settings.APP_ENV)
    await get_redis()
    logger.info("Redis connected")
    from app.labs.yjs_router import yjs_server
    async with yjs_server:
        yield
    await close_redis()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
    openapi_url="/api/openapi.json",
    docs_url="/api/docs" if settings.is_development else None,
    redoc_url="/api/redoc" if settings.is_development else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(TenantMiddleware)
app.add_middleware(RequestContextMiddleware)


# --- Routers ---
from app.auth.router import router as auth_router  # noqa: E402
from app.users.router import router as users_router  # noqa: E402
from app.tenants.router import router as tenants_router  # noqa: E402
from app.students.router import router as students_router  # noqa: E402
from app.roles.router import router as roles_router  # noqa: E402
from app.assets.router import router as assets_router  # noqa: E402
from app.plans.router import router as plans_router  # noqa: E402
from app.subscriptions.router import router as subscriptions_router  # noqa: E402
from app.licenses.router import router as licenses_router  # noqa: E402
from app.capabilities.router import router as capabilities_router  # noqa: E402
from app.programs.router import router as programs_router  # noqa: E402
from app.classrooms.router import router as classrooms_router  # noqa: E402
from app.curriculum.router import router as curriculum_router  # noqa: E402
from app.labs.router import router as labs_router  # noqa: E402
from app.progress.router import router as progress_router  # noqa: E402
from app.messaging.router import router as messaging_router  # noqa: E402
from app.messaging.conversations_router import router as conversations_router  # noqa: E402
from app.notifications.router import router as notifications_router  # noqa: E402
from app.admin.router import router as admin_router  # noqa: E402
from app.email.router import router as email_router  # noqa: E402
from app.integrations.router import router as integrations_router  # noqa: E402
from app.audit.router import router as audit_router  # noqa: E402
from app.platform.router import router as platform_router  # noqa: E402
from app.gamification.router import router as gamification_router  # noqa: E402
from app.realtime.router import router as realtime_router  # noqa: E402
from app.invitations.router import router as invitations_router  # noqa: E402
from app.growth.router import router as growth_router  # noqa: E402

prefix = settings.API_V1_PREFIX

app.include_router(auth_router, prefix=f"{prefix}/auth", tags=["Auth"])
app.include_router(users_router, prefix=f"{prefix}/users", tags=["Users"])
app.include_router(tenants_router, prefix=f"{prefix}/tenants", tags=["Tenants"])
app.include_router(students_router, prefix=f"{prefix}/students", tags=["Students"])
app.include_router(roles_router, prefix=f"{prefix}/roles", tags=["Roles"])
app.include_router(assets_router, prefix=f"{prefix}/assets", tags=["Assets"])
app.include_router(plans_router, prefix=f"{prefix}/plans", tags=["Plans"])
app.include_router(subscriptions_router, prefix=f"{prefix}/subscriptions", tags=["Subscriptions"])
app.include_router(licenses_router, prefix=f"{prefix}/licenses", tags=["Licenses"])
app.include_router(capabilities_router, prefix=f"{prefix}/capabilities", tags=["Capabilities"])
app.include_router(programs_router, prefix=f"{prefix}/programs", tags=["Programs"])
app.include_router(classrooms_router, prefix=f"{prefix}/classrooms", tags=["Classrooms"])
app.include_router(curriculum_router, prefix=f"{prefix}/curriculum", tags=["Curriculum"])
app.include_router(labs_router, prefix=f"{prefix}/labs", tags=["Labs"])
app.include_router(progress_router, prefix=f"{prefix}/progress", tags=["Progress"])
app.include_router(messaging_router, prefix=f"{prefix}/messages", tags=["Messaging"])
app.include_router(conversations_router, prefix=f"{prefix}/conversations", tags=["Conversations"])
app.include_router(notifications_router, prefix=f"{prefix}/notifications", tags=["Notifications"])
app.include_router(admin_router, prefix=f"{prefix}/admin", tags=["Admin"])
app.include_router(email_router, prefix=f"{prefix}/email", tags=["Email"])
app.include_router(integrations_router, prefix=f"{prefix}/integrations", tags=["Integrations"])
app.include_router(audit_router, prefix=f"{prefix}/audit", tags=["Audit"])
app.include_router(platform_router, prefix=f"{prefix}/platform", tags=["Platform"])
app.include_router(gamification_router, prefix=f"{prefix}/gamification", tags=["Gamification"])
app.include_router(realtime_router, prefix=f"{prefix}/realtime", tags=["Realtime"])
app.include_router(invitations_router, prefix=f"{prefix}/invitations", tags=["Invitations"])
app.include_router(growth_router, prefix=f"{prefix}/growth", tags=["Growth"])


@app.get("/health")
async def health_check():
    return {"status": "healthy", "app": settings.APP_NAME}
