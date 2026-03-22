from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

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

    # Email - Postmark
    POSTMARK_SERVER_TOKEN: str = ""
    POSTMARK_SENDER_EMAIL: str = "noreply@stemplitude.com"

    # Email - Mailgun
    MAILGUN_API_KEY: str = ""
    MAILGUN_DOMAIN: str = ""

    # Email - SES
    AWS_SES_ACCESS_KEY_ID: str = ""
    AWS_SES_SECRET_ACCESS_KEY: str = ""
    AWS_SES_REGION: str = "us-east-1"
    AWS_SES_SENDER_EMAIL: str = ""

    # Flagsmith
    FLAGSMITH_API_KEY: str = ""
    FLAGSMITH_API_URL: str = "https://edge.api.flagsmith.com/api/v1/"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # In-app notifications (see workers.tasks.cleanup_tasks.cleanup_notifications)
    NOTIFICATION_RETENTION_DAYS: int = 90  # 0 = disable time-based deletion
    NOTIFICATION_MAX_PER_RECIPIENT: int = 500  # 0 = disable per-recipient cap

    # Orphan blob cleanup (see workers.tasks.cleanup_tasks.cleanup_orphan_blobs)
    BLOB_ORPHAN_CLEANUP_DRY_RUN: bool = False  # True = scan only, do not delete from S3

    # Frontend URL (used for building invitation links)
    FRONTEND_URL: str = "http://localhost:5173"

    # Super Admin bootstrap (only needed for initial setup)
    SUPERADMIN_EMAIL: str | None = None
    SUPERADMIN_PASSWORD: str | None = None

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"


settings = Settings()
