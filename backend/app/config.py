import os
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Directory that contains the ``app`` package (…/backend when the repo is a monorepo).
_BACKEND_ROOT = Path(__file__).resolve().parent.parent


def _discover_dotenv_files() -> tuple[str, ...] | None:
    """Paths to load with pydantic-settings (later files override earlier).

    Order: optional ``STEMPLITUDE_ENV_FILE``, repo-root ``.env``, then ``backend/.env``.

    In Docker, Compose ``env_file`` injects variables into the process environment but
    does not create ``/app/.env`` unless you mount or COPY it—so we still read env vars
    from the OS. Listing real files here covers host dev and bind-mounted ``/app/.env``.
    """
    seen: set[Path] = set()
    out: list[Path] = []
    extra = os.environ.get("STEMPLITUDE_ENV_FILE", "").strip()
    if extra:
        p = Path(extra).expanduser().resolve()
        if p.is_file():
            seen.add(p)
            out.append(p)
    for p in (_BACKEND_ROOT.parent / ".env", _BACKEND_ROOT / ".env"):
        rp = p.resolve()
        if rp.is_file() and rp not in seen:
            seen.add(rp)
            out.append(p)
    return tuple(str(p) for p in out) if out else None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_discover_dotenv_files(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "STEMplitude"
    APP_ENV: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = "change-me"
    API_V1_PREFIX: str = "/api/v1"
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, v):
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://stem:stem@localhost:5432/stemplitude"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET_KEY: str = "change-me-jwt"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # S3/R2 Storage
    S3_ENDPOINT_URL: str = "http://localhost:4566"
    S3_ACCESS_KEY_ID: str = "test"
    S3_SECRET_ACCESS_KEY: str = "test"
    S3_BUCKET_NAME: str = "stemplitude-assets"
    S3_REGION: str = "us-east-1"

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    # Development only: used when plan.stripe_price_id_* is empty (see app.plans.stripe_checkout)
    STRIPE_DEV_FALLBACK_PRICE_MONTHLY: str = ""
    STRIPE_DEV_FALLBACK_PRICE_YEARLY: str = ""
    # Stripe Connect (tenant → student/parent payments). OAuth client id from Stripe Dashboard → Connect.
    STRIPE_CONNECT_CLIENT_ID: str = ""

    # PayPal (subscriptions / billing — optional until integrated)
    PAYPAL_CLIENT_ID: str = ""
    PAYPAL_CLIENT_SECRET: str = ""
    PAYPAL_WEBHOOK_ID: str = ""

    # Default From when DB provider config has no sender_email (domain: contact.stemplitude.com)
    EMAIL_DEFAULT_SENDER: str = "info@contact.stemplitude.com"
    # Absolute HTTPS URL to a raster logo (PNG/GIF ~120–240px wide). SVG is often blocked in email.
    EMAIL_BRAND_LOGO_URL: str = ""
    # Optional HTML email theming (empty = built-in defaults). See app.email.templates.EmailTheme.
    EMAIL_THEME_PRIMARY: str = ""
    EMAIL_THEME_BODY: str = ""
    EMAIL_THEME_MUTED: str = ""
    EMAIL_THEME_BORDER: str = ""
    EMAIL_THEME_CARD_BG: str = ""
    EMAIL_THEME_PAGE_BG: str = ""
    EMAIL_THEME_HEADING: str = ""
    EMAIL_THEME_BUTTON_TEXT: str = ""
    EMAIL_THEME_TABLE_HEADER_BG: str = ""
    EMAIL_THEME_LINK: str = ""
    EMAIL_THEME_FONT_STACK: str = ""
    EMAIL_THEME_FONT_SIZE_BODY: str = ""
    EMAIL_THEME_FONT_SIZE_SMALL: str = ""
    EMAIL_THEME_FONT_SIZE_CAPTION: str = ""
    EMAIL_THEME_FONT_SIZE_FOOTER: str = ""
    EMAIL_THEME_FONT_SIZE_H1: str = ""
    EMAIL_THEME_FONT_SIZE_H2: str = ""
    EMAIL_THEME_FONT_SIZE_H3: str = ""
    EMAIL_THEME_RADIUS_CARD: str = ""
    EMAIL_THEME_RADIUS_BUTTON: str = ""
    EMAIL_THEME_SHADOW_CARD: str = ""
    EMAIL_THEME_LINE_HEIGHT_BODY: str = ""

    # Transactional footer (compliance-style + social). See :class:`app.email.templates.TransactionalEmailBuilder`.
    EMAIL_FOOTER_ADDRESS: str = ""
    EMAIL_FOOTER_WHY_RECEIVING: str = ""
    EMAIL_UNSUBSCRIBE_URL: str = ""
    EMAIL_SOCIAL_WEBSITE_URL: str = ""
    EMAIL_SOCIAL_INSTAGRAM_URL: str = ""
    EMAIL_SOCIAL_LINKEDIN_URL: str = ""
    EMAIL_SOCIAL_X_URL: str = ""
    EMAIL_SOCIAL_FACEBOOK_URL: str = ""
    EMAIL_SOCIAL_TIKTOK_URL: str = ""
    EMAIL_SOCIAL_YOUTUBE_URL: str = ""

    # Email - Postmark
    POSTMARK_SERVER_TOKEN: str = ""
    POSTMARK_SENDER_EMAIL: str = "info@contact.stemplitude.com"

    # Email - Mailgun
    MAILGUN_API_KEY: str = ""
    MAILGUN_DOMAIN: str = ""

    # Email - SES
    AWS_SES_ACCESS_KEY_ID: str = ""
    AWS_SES_SECRET_ACCESS_KEY: str = ""
    AWS_SES_REGION: str = "us-east-1"
    AWS_SES_SENDER_EMAIL: str = ""

    # Email - SendGrid / Resend (optional; fall back to EMAIL_DEFAULT_SENDER)
    SENDGRID_API_KEY: str = ""
    SENDGRID_SENDER_EMAIL: str = "info@contact.stemplitude.com"
    RESEND_API_KEY: str = ""
    RESEND_SENDER_EMAIL: str = "info@contact.stemplitude.com"

    # Inbound bounce/complaint webhooks → ``email_suppressions`` (scope ``deliverability``).
    # POST {API_V1_PREFIX}/webhooks/email/postmark | sendgrid | resend
    EMAIL_WEBHOOK_BEARER_TOKEN: str = ""
    EMAIL_WEBHOOK_BASIC_USER: str = ""
    EMAIL_WEBHOOK_BASIC_PASSWORD: str = ""
    # SendGrid: paste public key body only (Mail Settings → Event Webhook → signed verification).
    SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY: str = ""
    # Resend: webhook signing secret (Svix); install ``svix`` package.
    RESEND_WEBHOOK_SECRET: str = ""

    # Flagsmith
    FLAGSMITH_API_KEY: str = ""
    FLAGSMITH_API_URL: str = "https://edge.api.flagsmith.com/api/v1/"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    # When true, .delay() runs tasks in-process (no worker). Dev-only; never enable in production.
    CELERY_TASK_ALWAYS_EAGER: bool = False

    # In-app notifications (see workers.tasks.cleanup_tasks.cleanup_notifications)
    NOTIFICATION_RETENTION_DAYS: int = 90  # 0 = disable time-based deletion
    NOTIFICATION_MAX_PER_RECIPIENT: int = 500  # 0 = disable per-recipient cap

    # Platform email delivery logs (see workers.tasks.cleanup_tasks.cleanup_email_logs)
    EMAIL_LOG_RETENTION_DAYS: int = 90  # 0 = disable deletion (not recommended at scale)

    # Orphan blob cleanup (see workers.tasks.cleanup_tasks.cleanup_orphan_blobs)
    # True = scan only: no S3 deletes and no DB row repairs for missing objects.
    BLOB_ORPHAN_CLEANUP_DRY_RUN: bool = False

    # Public API origin for signed email actions (unsubscribe one-click). No trailing slash.
    # Use scheme + host[:port] only (e.g. https://api.yourdomain.com), not …/api/v1 — the app appends API_V1_PREFIX.
    EMAIL_PUBLIC_BASE_URL: str = ""

    # Frontend URL (used for building invitation links)
    FRONTEND_URL: str = "http://localhost:5173"
    # Apex host for tenant subdomains (e.g. ``stemplitude.com``). When set, ``TenantMiddleware`` can resolve
    # ``X-Tenant-ID`` from ``Host: {public_host_subdomain}.{PUBLIC_HOST_BASE_DOMAIN}``. Empty disables this.
    PUBLIC_HOST_BASE_DOMAIN: str = ""

    # Super Admin bootstrap (only needed for initial setup)
    SUPERADMIN_EMAIL: str | None = None
    SUPERADMIN_PASSWORD: str | None = None

    # Cardless signup trial (see app.auth.service onboard + app.trials.guardrails)
    TRIAL_ENABLED: bool = True
    TRIAL_PLAN_SLUG: str = "trial-evaluation"
    # 0 = use plan.trial_days from DB (fallback 14)
    TRIAL_DURATION_DAYS: int = 14
    TRIAL_MAX_ONBOARDS_PER_IP_PER_DAY: int = 20
    TRIAL_MAX_ONBOARD_ATTEMPTS_PER_EMAIL_HOUR: int = 10
    TRIAL_BLOCK_DISPOSABLE_EMAIL: bool = True
    TRIAL_DISPOSABLE_EMAIL_DOMAINS_EXTRA: str = ""

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"


settings = Settings()
