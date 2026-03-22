# STEMplitude Backend

Multi-tenant STEM learning platform backend built with FastAPI, PostgreSQL, Redis, and Celery.

## Architecture

- **Framework**: FastAPI (async, modular monolith)
- **Database**: PostgreSQL 16 with async SQLAlchemy 2.0
- **Migrations**: Alembic
- **Cache & Broker**: Redis 7
- **Task Queue**: Celery with Redis
- **Storage**: S3-compatible (LocalStack dev / Cloudflare R2 prod)
- **Auth**: JWT (access + refresh tokens), dual identity (users + students)
- **Billing**: Stripe subscriptions with webhook integration
- **Email**: Multi-provider (Postmark, Mailgun, SES) with failover
- **Feature Flags**: Flagsmith SDK
- **Reverse Proxy**: Nginx with wildcard subdomain routing

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Python 3.12+ (for local development)

### With Docker (recommended)

```bash
cp .env.example .env
# Edit .env with your settings

docker compose up -d db redis localstack
docker compose run --rm migrate
docker compose run --rm seed
docker compose up -d
```

The API will be available at `http://localhost/api/v1/` (through Nginx) or `http://localhost:8000/api/v1/` (direct).

### Local Development

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Start dependencies
docker compose up -d db redis localstack

# Run migrations & seeds
alembic upgrade head
python -m app.seeds

# Start the server
uvicorn app.main:app --reload --port 8000
```

### Running Tests

```bash
pip install -r requirements.txt
pytest tests/ -v
```

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py             # Pydantic Settings
│   ├── database.py           # Async SQLAlchemy engine
│   ├── dependencies.py       # Shared FastAPI dependencies
│   ├── seeds.py              # Seed data loader
│   ├── core/                 # Security, Redis, S3, permissions
│   ├── middleware/            # Tenant resolution, request context
│   ├── auth/                 # Authentication (login, register, JWT)
│   ├── users/                # User management
│   ├── tenants/              # Tenant CRUD, memberships, settings
│   ├── students/             # Student management (hybrid identity)
│   ├── roles/                # RBAC (roles, permissions)
│   ├── plans/                # Plan tiers
│   ├── subscriptions/        # Stripe billing
│   ├── licenses/             # Entitlements & seats
│   ├── capabilities/         # Central authorization engine
│   ├── feature_flags/        # Flagsmith integration
│   ├── programs/             # Program management
│   ├── classrooms/           # Classrooms, sessions, attendance
│   ├── curriculum/           # Courses, modules, lessons, labs
│   ├── labs/                 # Lab projects
│   ├── progress/             # Student progress tracking
│   ├── assets/               # Student & tenant assets
│   ├── messaging/            # Internal messaging
│   ├── notifications/        # Notifications
│   ├── email/                # Multi-provider email service
│   ├── integrations/         # OAuth, Zoom/Google/Teams meetings
│   └── admin/                # Super admin (global assets, stats)
├── workers/                  # Celery tasks & schedules
├── alembic/                  # Database migrations
├── tests/                    # Test suite
├── nginx/                    # Nginx config
├── scripts/                  # Utility scripts
├── docker-compose.yml
├── Dockerfile
└── requirements.txt
```

## API Documentation

When running in development mode, interactive API docs are available at:
- Swagger UI: `http://localhost:8000/api/docs`
- ReDoc: `http://localhost:8000/api/redoc`

## Key Concepts

### Multi-Tenancy
Every request is scoped to a tenant via the `X-Tenant-ID` header (accepts UUID, slug, or tenant code). Tenant resolution middleware validates membership and attaches context.

### Dual Identity Auth
- **Adult users** (parents, instructors, admins): email + password login
- **Students**: two modes based on `global_account` flag:
  - **Tenant-scoped** (young kids): username + password + tenant identifier
  - **Global** (teens): email + password, then tenant selection

### Capability Engine
Central authorization that checks role permissions, license entitlements, feature flags, seat availability, and tenant settings in a single `can(user, tenant, capability)` call.

### Subscription Flow
Plan selection -> Stripe Checkout -> Webhook provisions License -> License controls feature access and seat limits.

## Environment Variables

See `.env.example` for all configuration options.
