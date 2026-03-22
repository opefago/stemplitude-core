"""Initial schema - all 39 tables + audit triggers

Revision ID: 001_initial
Revises:
Create Date: 2026-03-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # === CORE TABLES ===

    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(20)),
        sa.Column("avatar_url", sa.String(500)),
        sa.Column("timezone", sa.String(50)),
        sa.Column("language", sa.String(10)),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("is_super_admin", sa.Boolean, default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "tenants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("code", sa.String(20), unique=True, nullable=False),
        sa.Column("type", sa.String(50), nullable=False, server_default="center"),
        sa.Column("logo_url", sa.String(500)),
        sa.Column("settings", JSONB, server_default="{}"),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_tenants_slug", "tenants", ["slug"])
    op.create_index("ix_tenants_code", "tenants", ["code"])

    op.create_table(
        "roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("is_system", sa.Boolean, default=False),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "slug", name="uq_role_tenant_slug"),
    )
    op.create_index("ix_roles_tenant_id", "roles", ["tenant_id"])

    op.create_table(
        "permissions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("resource", sa.String(50), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("description", sa.String(200)),
        sa.UniqueConstraint("resource", "action", name="uq_permission_resource_action"),
    )

    op.create_table(
        "role_permissions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("permission_id", UUID(as_uuid=True), sa.ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),
    )
    op.create_index("ix_role_permissions_role_id", "role_permissions", ["role_id"])
    op.create_index("ix_role_permissions_permission_id", "role_permissions", ["permission_id"])

    op.create_table(
        "memberships",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="SET NULL")),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "tenant_id", name="uq_membership_user_tenant"),
    )
    op.create_index("ix_memberships_user_id", "memberships", ["user_id"])
    op.create_index("ix_memberships_tenant_id", "memberships", ["tenant_id"])
    op.create_index("ix_memberships_role_id", "memberships", ["role_id"])

    op.create_table(
        "students",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255)),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(100)),
        sa.Column("date_of_birth", sa.Date),
        sa.Column("avatar_url", sa.String(500)),
        sa.Column("global_account", sa.Boolean, default=False),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_students_email", "students", ["email"])

    op.create_table(
        "student_memberships",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("student_id", UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("username", sa.String(100)),
        sa.Column("grade_level", sa.String(20)),
        sa.Column("role", sa.String(20), server_default="student"),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("enrolled_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("student_id", "tenant_id", name="uq_student_membership_student_tenant"),
        sa.UniqueConstraint("username", "tenant_id", name="uq_student_membership_username_tenant"),
    )
    op.create_index("ix_student_memberships_student_id", "student_memberships", ["student_id"])
    op.create_index("ix_student_memberships_tenant_id", "student_memberships", ["tenant_id"])
    op.create_index("ix_student_memberships_tenant_active", "student_memberships", ["tenant_id", "is_active"])

    op.create_table(
        "parent_students",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relationship", sa.String(50), server_default="parent"),
        sa.Column("is_primary_contact", sa.Boolean, default=False),
        sa.UniqueConstraint("user_id", "student_id", name="uq_parent_student"),
    )
    op.create_index("ix_parent_students_user_id", "parent_students", ["user_id"])
    op.create_index("ix_parent_students_student_id", "parent_students", ["student_id"])

    # === BUSINESS TABLES ===

    op.create_table(
        "plans",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("price_monthly", sa.Numeric(10, 2)),
        sa.Column("price_yearly", sa.Numeric(10, 2)),
        sa.Column("stripe_price_id_monthly", sa.String(100)),
        sa.Column("stripe_price_id_yearly", sa.String(100)),
        sa.Column("trial_days", sa.Integer, default=0),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_plans_slug", "plans", ["slug"])

    op.create_table(
        "plan_features",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("plan_id", UUID(as_uuid=True), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("feature_key", sa.String(100), nullable=False),
        sa.Column("enabled", sa.Boolean, default=True),
        sa.UniqueConstraint("plan_id", "feature_key", name="uq_plan_feature"),
    )
    op.create_index("ix_plan_features_plan_id", "plan_features", ["plan_id"])

    op.create_table(
        "plan_limits",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("plan_id", UUID(as_uuid=True), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("limit_key", sa.String(100), nullable=False),
        sa.Column("limit_value", sa.Integer, nullable=False),
        sa.UniqueConstraint("plan_id", "limit_key", name="uq_plan_limit"),
    )
    op.create_index("ix_plan_limits_plan_id", "plan_limits", ["plan_id"])

    op.create_table(
        "subscriptions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_id", UUID(as_uuid=True), sa.ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="trialing"),
        sa.Column("stripe_subscription_id", sa.String(100)),
        sa.Column("stripe_customer_id", sa.String(100)),
        sa.Column("current_period_start", sa.DateTime(timezone=True)),
        sa.Column("current_period_end", sa.DateTime(timezone=True)),
        sa.Column("trial_end", sa.DateTime(timezone=True)),
        sa.Column("canceled_at", sa.DateTime(timezone=True)),
        sa.Column("promo_code", sa.String(50)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_subscriptions_tenant_id", "subscriptions", ["tenant_id"])
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])
    op.create_index("ix_subscriptions_plan_id", "subscriptions", ["plan_id"])
    op.create_index("ix_subscriptions_stripe_sub_id", "subscriptions", ["stripe_subscription_id"])
    op.create_index("ix_subscriptions_stripe_cust_id", "subscriptions", ["stripe_customer_id"])

    op.create_table(
        "invoices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("subscription_id", UUID(as_uuid=True), sa.ForeignKey("subscriptions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stripe_invoice_id", sa.String(100)),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.Column("currency", sa.String(3), server_default="usd"),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True)),
        sa.Column("period_end", sa.DateTime(timezone=True)),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_invoices_subscription_id", "invoices", ["subscription_id"])
    op.create_index("ix_invoices_stripe_invoice_id", "invoices", ["stripe_invoice_id"])

    op.create_table(
        "licenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("subscription_id", UUID(as_uuid=True), sa.ForeignKey("subscriptions.id", ondelete="SET NULL")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("valid_from", sa.Date, nullable=False),
        sa.Column("valid_until", sa.Date),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_licenses_tenant_id", "licenses", ["tenant_id"])
    op.create_index("ix_licenses_subscription_id", "licenses", ["subscription_id"])
    op.create_index("ix_licenses_user_id", "licenses", ["user_id"])

    op.create_table(
        "license_features",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("license_id", UUID(as_uuid=True), sa.ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("feature_key", sa.String(100), nullable=False),
        sa.Column("enabled", sa.Boolean, default=True),
        sa.UniqueConstraint("license_id", "feature_key", name="uq_license_feature"),
    )
    op.create_index("ix_license_features_license_id", "license_features", ["license_id"])

    op.create_table(
        "license_limits",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("license_id", UUID(as_uuid=True), sa.ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("limit_key", sa.String(100), nullable=False),
        sa.Column("limit_value", sa.Integer, nullable=False),
        sa.UniqueConstraint("license_id", "limit_key", name="uq_license_limit"),
    )
    op.create_index("ix_license_limits_license_id", "license_limits", ["license_id"])

    op.create_table(
        "seat_usage",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("license_id", UUID(as_uuid=True), sa.ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seat_type", sa.String(50), nullable=False),
        sa.Column("current_count", sa.Integer, default=0),
        sa.Column("max_count", sa.Integer, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("license_id", "seat_type", name="uq_seat_usage"),
    )
    op.create_index("ix_seat_usage_license_id", "seat_usage", ["license_id"])
    op.create_index("ix_seat_usage_tenant_id", "seat_usage", ["tenant_id"])

    op.create_table(
        "capabilities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(100), unique=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(50)),
        sa.Column("description", sa.String(500)),
    )
    op.create_index("ix_capabilities_key", "capabilities", ["key"])
    op.create_index("ix_capabilities_category", "capabilities", ["category"])

    op.create_table(
        "capability_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("capability_id", UUID(as_uuid=True), sa.ForeignKey("capabilities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_required", sa.String(100)),
        sa.Column("required_feature", sa.String(100)),
        sa.Column("seat_type", sa.String(50)),
        sa.Column("limit_key", sa.String(100)),
    )
    op.create_index("ix_capability_rules_capability_id", "capability_rules", ["capability_id"])

    # === LMS TABLES ===

    op.create_table(
        "programs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.String(1000)),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_programs_tenant_id", "programs", ["tenant_id"])

    op.create_table(
        "classrooms",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("program_id", UUID(as_uuid=True), sa.ForeignKey("programs.id", ondelete="SET NULL")),
        sa.Column("instructor_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("mode", sa.String(20), server_default="online"),
        sa.Column("recurrence_type", sa.String(20)),
        sa.Column("meeting_provider", sa.String(20)),
        sa.Column("meeting_link", sa.String(500)),
        sa.Column("external_meeting_id", sa.String(200)),
        sa.Column("meeting_auto_generated", sa.Boolean, default=False),
        sa.Column("location_address", sa.String(500)),
        sa.Column("join_code", sa.String(20), unique=True, nullable=False),
        sa.Column("schedule", JSONB, server_default="{}"),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("recurrence_rule", sa.String(200)),
        sa.Column("timezone", sa.String(50)),
        sa.Column("max_students", sa.Integer),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_classrooms_tenant_id", "classrooms", ["tenant_id"])
    op.create_index("ix_classrooms_program_id", "classrooms", ["program_id"])
    op.create_index("ix_classrooms_instructor_id", "classrooms", ["instructor_id"])
    op.create_index("ix_classrooms_join_code", "classrooms", ["join_code"])

    op.create_table(
        "classroom_students",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("classroom_id", UUID(as_uuid=True), sa.ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("classroom_id", "student_id", name="uq_classroom_student"),
    )
    op.create_index("ix_classroom_students_classroom_id", "classroom_students", ["classroom_id"])
    op.create_index("ix_classroom_students_student_id", "classroom_students", ["student_id"])

    op.create_table(
        "classroom_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("classroom_id", UUID(as_uuid=True), sa.ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("session_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), server_default="scheduled"),
        sa.Column("meeting_link", sa.String(500)),
        sa.Column("external_meeting_id", sa.String(200)),
        sa.Column("notes", sa.String(2000)),
        sa.Column("canceled_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_classroom_sessions_classroom_id", "classroom_sessions", ["classroom_id"])
    op.create_index("ix_classroom_sessions_tenant_id", "classroom_sessions", ["tenant_id"])

    op.create_table(
        "courses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.String(1000)),
        sa.Column("difficulty", sa.String(20)),
        sa.Column("sort_order", sa.Integer, default=0),
        sa.Column("is_published", sa.Boolean, default=False),
    )
    op.create_index("ix_courses_tenant_id", "courses", ["tenant_id"])

    op.create_table(
        "modules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("course_id", UUID(as_uuid=True), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.String(1000)),
        sa.Column("sort_order", sa.Integer, default=0),
    )
    op.create_index("ix_modules_course_id", "modules", ["course_id"])

    op.create_table(
        "lessons",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("module_id", UUID(as_uuid=True), sa.ForeignKey("modules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("content_type", sa.String(50)),
        sa.Column("content", sa.Text),
        sa.Column("sort_order", sa.Integer, default=0),
        sa.Column("duration_minutes", sa.Integer),
    )
    op.create_index("ix_lessons_module_id", "lessons", ["module_id"])

    op.create_table(
        "labs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("lesson_id", UUID(as_uuid=True), sa.ForeignKey("lessons.id", ondelete="SET NULL")),
        sa.Column("lab_type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("config", JSONB, server_default="{}"),
        sa.Column("starter_code", JSONB, server_default="{}"),
    )
    op.create_index("ix_labs_lesson_id", "labs", ["lesson_id"])

    # === CONTENT TABLES ===

    op.create_table(
        "projects",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("student_id", UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lab_id", UUID(as_uuid=True), sa.ForeignKey("labs.id", ondelete="SET NULL")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("blob_key", sa.String(500)),
        sa.Column("blob_url", sa.String(500)),
        sa.Column("metadata", JSONB, server_default="{}"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_projects_student_id", "projects", ["student_id"])
    op.create_index("ix_projects_lab_id", "projects", ["lab_id"])
    op.create_index("ix_projects_tenant_id", "projects", ["tenant_id"])

    op.create_table(
        "assets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", UUID(as_uuid=True), nullable=False),
        sa.Column("owner_type", sa.String(20), nullable=False),
        sa.Column("asset_type", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("blob_key", sa.String(500), nullable=False),
        sa.Column("blob_url", sa.String(500)),
        sa.Column("mime_type", sa.String(100)),
        sa.Column("file_size", sa.Integer),
        sa.Column("metadata", JSONB, server_default="{}"),
        sa.Column("lab_type", sa.String(50)),
        sa.Column("thumbnail_key", sa.String(500)),
        sa.Column("thumbnail_url", sa.String(500)),
        sa.Column("is_global", sa.Boolean, default=False),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_assets_tenant_id", "assets", ["tenant_id"])
    op.create_index("ix_assets_owner_id", "assets", ["owner_id"])

    op.create_table(
        "global_assets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("uploaded_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("uploaded_by_org_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("asset_type", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("blob_key", sa.String(500), nullable=False),
        sa.Column("blob_url", sa.String(500)),
        sa.Column("mime_type", sa.String(100)),
        sa.Column("file_size", sa.Integer),
        sa.Column("metadata", JSONB, server_default="{}"),
        sa.Column("lab_type", sa.String(50)),
        sa.Column("category", sa.String(50)),
        sa.Column("thumbnail_key", sa.String(500)),
        sa.Column("thumbnail_url", sa.String(500)),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "(uploaded_by_user_id IS NOT NULL)::int + (uploaded_by_org_id IS NOT NULL)::int = 1",
            name="ck_global_assets_uploader_exactly_one",
        ),
    )
    op.create_index("ix_global_assets_uploaded_by_user", "global_assets", ["uploaded_by_user_id"])
    op.create_index("ix_global_assets_uploaded_by_org", "global_assets", ["uploaded_by_org_id"])

    op.create_table(
        "tenant_lab_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lab_type", sa.String(50), nullable=False),
        sa.Column("enabled", sa.Boolean, default=True),
        sa.Column("config", JSONB, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "lab_type", name="uq_tenant_lab_setting"),
    )
    op.create_index("ix_tenant_lab_settings_tenant_id", "tenant_lab_settings", ["tenant_id"])

    # === PROGRESS TABLES ===

    op.create_table(
        "lesson_progress",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("student_id", UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lesson_id", UUID(as_uuid=True), sa.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), server_default="not_started"),
        sa.Column("score", sa.Integer),
        sa.Column("time_spent_seconds", sa.Integer, default=0),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("student_id", "lesson_id", "tenant_id", name="uq_lesson_progress"),
    )
    op.create_index("ix_lesson_progress_student_id", "lesson_progress", ["student_id"])
    op.create_index("ix_lesson_progress_lesson_id", "lesson_progress", ["lesson_id"])
    op.create_index("ix_lesson_progress_tenant_id", "lesson_progress", ["tenant_id"])

    op.create_table(
        "lab_progress",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("student_id", UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lab_id", UUID(as_uuid=True), sa.ForeignKey("labs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), server_default="not_started"),
        sa.Column("score", sa.Integer),
        sa.Column("time_spent_seconds", sa.Integer, default=0),
        sa.Column("state_snapshot", JSONB),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("student_id", "lab_id", "tenant_id", name="uq_lab_progress"),
    )
    op.create_index("ix_lab_progress_student_id", "lab_progress", ["student_id"])
    op.create_index("ix_lab_progress_lab_id", "lab_progress", ["lab_id"])
    op.create_index("ix_lab_progress_tenant_id", "lab_progress", ["tenant_id"])

    op.create_table(
        "attendance",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("classroom_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("classroom_id", UUID(as_uuid=True), sa.ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", UUID(as_uuid=True), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), server_default="present"),
        sa.Column("notes", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("session_id", "student_id", name="uq_attendance_session_student"),
    )
    op.create_index("ix_attendance_session_id", "attendance", ["session_id"])
    op.create_index("ix_attendance_classroom_id", "attendance", ["classroom_id"])
    op.create_index("ix_attendance_student_id", "attendance", ["student_id"])
    op.create_index("ix_attendance_tenant_id", "attendance", ["tenant_id"])

    # === COMMUNICATION TABLES ===

    op.create_table(
        "messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("sender_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recipient_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject", sa.String(200)),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("is_read", sa.Boolean, default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_messages_sender_id", "messages", ["sender_id"])
    op.create_index("ix_messages_recipient_id", "messages", ["recipient_id"])
    op.create_index("ix_messages_tenant_id", "messages", ["tenant_id"])

    op.create_table(
        "notifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text),
        sa.Column("is_read", sa.Boolean, default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_tenant_id", "notifications", ["tenant_id"])

    op.create_table(
        "email_providers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("provider", sa.String(50), unique=True, nullable=False),
        sa.Column("is_active", sa.Boolean, default=False),
        sa.Column("priority", sa.Integer, default=0),
        sa.Column("config", JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "email_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("recipient", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("message_id", sa.String(200)),
        sa.Column("error", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_email_logs_status", "email_logs", ["status"])
    op.create_index("ix_email_logs_created_at", "email_logs", ["created_at"])
    op.create_index("ix_email_logs_status_created_at", "email_logs", ["created_at", "status"])

    # === INTEGRATIONS ===

    op.create_table(
        "oauth_connections",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("provider_account_id", sa.String(200)),
        sa.Column("access_token_enc", sa.String(1000)),
        sa.Column("refresh_token_enc", sa.String(1000)),
        sa.Column("scopes", sa.String(500)),
        sa.Column("token_expires_at", sa.DateTime(timezone=True)),
        sa.Column("calendar_sync_enabled", sa.Boolean, default=False),
        sa.Column("calendar_id", sa.String(200)),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "provider", "tenant_id", name="uq_oauth_connection"),
    )
    op.create_index("ix_oauth_connections_user_id", "oauth_connections", ["user_id"])
    op.create_index("ix_oauth_connections_tenant_id", "oauth_connections", ["tenant_id"])

    # === TENANT HIERARCHY (two-level parent → child) ===

    op.create_table(
        "tenant_hierarchy",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("parent_tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("child_tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("billing_mode", sa.String(20), nullable=False, server_default="central"),
        sa.Column("seat_allocations", JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("child_tenant_id", name="uq_hierarchy_child"),
    )
    op.create_index("ix_tenant_hierarchy_parent", "tenant_hierarchy", ["parent_tenant_id"])
    op.create_index("ix_tenant_hierarchy_child", "tenant_hierarchy", ["child_tenant_id"])

    # === SUPPORT ===

    op.create_table(
        "support_access_grants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("granted_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("support_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("reason", sa.String(500)),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_by", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_support_access_grants_tenant_id", "support_access_grants", ["tenant_id"])
    op.create_index("ix_support_access_grants_support_user_id", "support_access_grants", ["support_user_id"])

    # === AUDIT EVENTS ===

    op.create_table(
        "audit_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("table_name", sa.String(100), nullable=False),
        sa.Column("record_id", sa.String(100), nullable=False),
        sa.Column("action", sa.String(10), nullable=False),
        sa.Column("old_data", JSONB),
        sa.Column("new_data", JSONB),
        sa.Column("changed_fields", JSONB),
        sa.Column("db_user", sa.String(100), nullable=False, server_default=sa.text("current_user")),
        sa.Column("app_user_id", sa.String(100)),
        sa.Column("tenant_id", sa.String(100)),
        sa.Column("ip_address", sa.String(45)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_audit_events_table_name", "audit_events", ["table_name"])
    op.create_index("ix_audit_events_record_id", "audit_events", ["record_id"])
    op.create_index("ix_audit_events_action", "audit_events", ["action"])
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])
    op.create_index("ix_audit_events_tenant_id", "audit_events", ["tenant_id"])
    op.create_index("ix_audit_events_app_user_id", "audit_events", ["app_user_id"])
    op.create_index(
        "ix_audit_events_table_created",
        "audit_events",
        ["table_name", "created_at"],
    )

    # === AUDIT TRIGGER FUNCTION ===

    op.execute("""
        CREATE OR REPLACE FUNCTION audit_trigger_func()
        RETURNS TRIGGER AS $$
        DECLARE
            record_pk TEXT;
            old_jsonb JSONB;
            new_jsonb JSONB;
            diff_keys JSONB;
            v_app_user TEXT;
            v_tenant   TEXT;
            v_ip       TEXT;
        BEGIN
            -- Extract app-level context set via SET LOCAL in the application
            BEGIN
                v_app_user := current_setting('app.current_user_id', true);
            EXCEPTION WHEN OTHERS THEN
                v_app_user := NULL;
            END;
            BEGIN
                v_tenant := current_setting('app.current_tenant_id', true);
            EXCEPTION WHEN OTHERS THEN
                v_tenant := NULL;
            END;
            BEGIN
                v_ip := current_setting('app.client_ip', true);
            EXCEPTION WHEN OTHERS THEN
                v_ip := NULL;
            END;

            IF (TG_OP = 'DELETE') THEN
                record_pk := OLD.id::TEXT;
                old_jsonb  := to_jsonb(OLD);
                INSERT INTO audit_events
                    (table_name, record_id, action, old_data, new_data, changed_fields,
                     db_user, app_user_id, tenant_id, ip_address)
                VALUES
                    (TG_TABLE_NAME, record_pk, 'DELETE', old_jsonb, NULL, NULL,
                     current_user, v_app_user, v_tenant, v_ip);
                RETURN OLD;

            ELSIF (TG_OP = 'UPDATE') THEN
                record_pk := NEW.id::TEXT;
                old_jsonb  := to_jsonb(OLD);
                new_jsonb  := to_jsonb(NEW);
                -- Compute only the fields that actually changed
                SELECT jsonb_agg(key) INTO diff_keys
                FROM jsonb_each(new_jsonb) n
                WHERE n.value IS DISTINCT FROM (old_jsonb -> n.key);

                -- Skip if nothing actually changed
                IF diff_keys IS NULL OR jsonb_array_length(diff_keys) = 0 THEN
                    RETURN NEW;
                END IF;

                INSERT INTO audit_events
                    (table_name, record_id, action, old_data, new_data, changed_fields,
                     db_user, app_user_id, tenant_id, ip_address)
                VALUES
                    (TG_TABLE_NAME, record_pk, 'UPDATE', old_jsonb, new_jsonb, diff_keys,
                     current_user, v_app_user, v_tenant, v_ip);
                RETURN NEW;

            ELSIF (TG_OP = 'INSERT') THEN
                record_pk := NEW.id::TEXT;
                new_jsonb  := to_jsonb(NEW);
                INSERT INTO audit_events
                    (table_name, record_id, action, old_data, new_data, changed_fields,
                     db_user, app_user_id, tenant_id, ip_address)
                VALUES
                    (TG_TABLE_NAME, record_pk, 'INSERT', NULL, new_jsonb, NULL,
                     current_user, v_app_user, v_tenant, v_ip);
                RETURN NEW;

            ELSIF (TG_OP = 'TRUNCATE') THEN
                INSERT INTO audit_events
                    (table_name, record_id, action, old_data, new_data, changed_fields,
                     db_user, app_user_id, tenant_id, ip_address)
                VALUES
                    (TG_TABLE_NAME, 'TRUNCATE', 'TRUNCATE', NULL, NULL, NULL,
                     current_user, v_app_user, v_tenant, v_ip);
                RETURN NULL;
            END IF;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # === ATTACH AUDIT TRIGGERS TO KEY TABLES ===

    _audited_tables = [
        "tenants",
        "users",
        "memberships",
        "students",
        "student_memberships",
        "roles",
        "role_permissions",
        "subscriptions",
        "invoices",
        "licenses",
        "seat_usage",
        "classrooms",
        "classroom_students",
        "programs",
        "tenant_hierarchy",
        "tenant_lab_settings",
        "support_access_grants",
        "oauth_connections",
    ]
    for tbl in _audited_tables:
        op.execute(f"""
            CREATE TRIGGER audit_{tbl}
            AFTER INSERT OR UPDATE OR DELETE ON {tbl}
            FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
        """)
        op.execute(f"""
            CREATE TRIGGER audit_{tbl}_truncate
            BEFORE TRUNCATE ON {tbl}
            FOR EACH STATEMENT EXECUTE FUNCTION audit_trigger_func();
        """)

    # === GIN INDEXES ON JSONB COLUMNS ===
    op.execute("CREATE INDEX ix_tenants_settings_gin ON tenants USING GIN (settings)")
    op.execute("CREATE INDEX ix_classrooms_schedule_gin ON classrooms USING GIN (schedule)")
    op.execute("CREATE INDEX ix_labs_config_gin ON labs USING GIN (config)")
    op.execute("CREATE INDEX ix_email_providers_config_gin ON email_providers USING GIN (config)")


def downgrade() -> None:
    _audited_tables = [
        "tenants", "users", "memberships", "students", "student_memberships",
        "roles", "role_permissions", "subscriptions", "invoices", "licenses",
        "seat_usage", "classrooms", "classroom_students", "programs",
        "tenant_hierarchy", "tenant_lab_settings", "support_access_grants",
        "oauth_connections",
    ]
    for tbl in _audited_tables:
        op.execute(f"DROP TRIGGER IF EXISTS audit_{tbl} ON {tbl}")
        op.execute(f"DROP TRIGGER IF EXISTS audit_{tbl}_truncate ON {tbl}")

    tables = [
        "audit_events",
        "support_access_grants", "tenant_hierarchy", "oauth_connections",
        "email_logs", "email_providers",
        "notifications", "messages",
        "attendance", "lab_progress", "lesson_progress",
        "tenant_lab_settings", "global_assets", "assets", "projects",
        "labs", "lessons", "modules", "courses",
        "classroom_sessions", "classroom_students", "classrooms", "programs",
        "capability_rules", "capabilities",
        "seat_usage", "license_limits", "license_features", "licenses",
        "invoices", "subscriptions",
        "plan_limits", "plan_features", "plans",
        "parent_students", "student_memberships", "students",
        "memberships", "role_permissions", "permissions", "roles",
        "tenants", "users",
    ]
    for table in tables:
        op.drop_table(table)

    op.execute("DROP FUNCTION IF EXISTS audit_trigger_func() CASCADE")
