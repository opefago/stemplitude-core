import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.capabilities.repository import CapabilityEngineRepository
from app.config import settings
from app.email.outbox import enqueue_transactional_email
from app.email.presets import build_invitation_email
from app.invitations.models import Invitation
from app.invitations.repository import InvitationRepository
from app.invitations.schemas import (
    AcceptInviteResponse,
    CreateParentInviteRequest,
    CreateUserInviteRequest,
    InvitationListResponse,
    InvitationResponse,
    ValidateInviteResponse,
)
from app.roles.models import Role
from app.students.models import ParentStudent, Student
from app.tenants.models import Membership, Tenant
from app.tenants.service import TenantService
from app.users.models import User

logger = logging.getLogger(__name__)

INVITE_EXPIRY_DAYS = 7


class InvitationEmailEnqueueError(RuntimeError):
    """Invitation email could not be queued (Celery broker unavailable or misconfigured)."""


class InvitationService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = InvitationRepository(session)

    # --- Internal helpers ---

    async def _get_tenant(self, tenant_id: UUID) -> Tenant:
        result = await self.session.execute(select(Tenant).where(Tenant.id == tenant_id))
        tenant = result.scalar_one_or_none()
        if not tenant:
            raise ValueError("Tenant not found")
        return tenant

    async def _get_user(self, user_id: UUID) -> User | None:
        result = await self.session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def _get_role(self, role_id: UUID) -> Role | None:
        result = await self.session.execute(select(Role).where(Role.id == role_id))
        return result.scalar_one_or_none()

    async def _get_parent_role(self, tenant_id: UUID) -> Role | None:
        result = await self.session.execute(
            select(Role).where(
                Role.tenant_id == tenant_id,
                Role.slug == "parent",
                Role.is_active == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def _get_students(self, student_ids: list[UUID]) -> list[Student]:
        if not student_ids:
            return []
        result = await self.session.execute(
            select(Student).where(Student.id.in_(student_ids))
        )
        return list(result.scalars().all())

    def _build_invite_link(self, token: str) -> str:
        base = getattr(settings, "FRONTEND_URL", "http://localhost:5173").rstrip("/")
        return f"{base}/invite/{token}"

    def _to_response(
        self,
        invite: Invitation,
        role_name: str | None = None,
        student_names: list[str] | None = None,
    ) -> InvitationResponse:
        return InvitationResponse(
            id=invite.id,
            token=invite.token,
            invite_type=invite.invite_type,
            email=invite.email,
            status=invite.status,
            expires_at=invite.expires_at,
            created_at=invite.created_at,
            accepted_at=invite.accepted_at,
            role_id=invite.role_id,
            role_name=role_name,
            student_names=student_names,
            invite_link=self._build_invite_link(invite.token),
        )

    def _send_invite_email(
        self,
        tenant_id: UUID,
        to_email: str,
        subject: str,
        first_name: str | None,
        inviter_name: str,
        tenant_name: str,
        role_or_desc: str,
        link: str,
        *,
        invite_kind: str,
    ) -> None:
        """Enqueue invite email via Celery (or run inline when CELERY_TASK_ALWAYS_EAGER=true)."""
        prepared = build_invitation_email(
            subject=subject,
            invite_link=link,
            inviter_name=inviter_name,
            tenant_name=tenant_name,
            role_or_desc=role_or_desc,
            recipient_first_name=first_name,
            personal_message=personal_message,
            expires_days=INVITE_EXPIRY_DAYS,
        )
        try:
            async_result = enqueue_transactional_email(
                to_email=to_email,
                prepared=prepared,
                tenant_id=tenant_id,
            )
            logger.info(
                "Enqueued %s invite email task_id=%s to=%s tenant_id=%s",
                invite_kind,
                getattr(async_result, "id", None),
                to_email,
                tenant_id,
            )
        except Exception as exc:
            logger.exception(
                "Failed to enqueue %s invite email for %s", invite_kind, to_email
            )
            raise InvitationEmailEnqueueError(
                "Could not queue the invitation email. Start Redis and run a Celery worker "
                "(celery -A workers.celery_app worker -l info), or set CELERY_TASK_ALWAYS_EAGER=true "
                "in the API environment for local development so mail sends inside the API process."
            ) from exc

    # --- Public API ---

    async def _count_pending_user_invites_for_role(
        self, tenant_id: UUID, role_id: UUID
    ) -> int:
        result = await self.session.execute(
            select(func.count())
            .select_from(Invitation)
            .where(
                Invitation.tenant_id == tenant_id,
                Invitation.invite_type == "user",
                Invitation.status == "pending",
                Invitation.role_id == role_id,
            )
        )
        return int(result.scalar_one() or 0)

    async def _assert_instructor_seats_for_invites(
        self, tenant_id: UUID, role: Role | None, additional: int
    ) -> None:
        if additional < 1 or role is None:
            return
        slug = (role.slug or "").lower()
        if "instructor" not in slug:
            return
        lic_repo = LicenseRepository(self.session)
        seats = await lic_repo.list_seats_for_tenant(tenant_id)
        inst = next((s for s in seats if s.seat_type == "instructor"), None)
        if inst is None:
            return
        cap_repo = CapabilityEngineRepository(self.session)
        used = await cap_repo.count_instructors(tenant_id)
        pending = await self._count_pending_user_invites_for_role(tenant_id, role.id)
        if used + pending + additional > inst.max_count:
            raise ValueError(
                "Instructor seats are full for this plan "
                f"({used + pending}/{inst.max_count} in use including pending invites; "
                f"{additional} new invite(s) requested). Remove a member, revoke a pending invite, "
                "or upgrade your plan."
            )

    async def create_user_invite(
        self,
        tenant_id: UUID,
        invited_by_id: UUID,
        data: CreateUserInviteRequest,
    ) -> InvitationResponse:
        tenant = await self._get_tenant(tenant_id)
        inviter = await self._get_user(invited_by_id)
        role = await self._get_role(data.role_id)
        role_name = role.name if role else "a member"

        await self._assert_instructor_seats_for_invites(tenant_id, role, 1)

        invite = Invitation(
            tenant_id=tenant_id,
            invite_type="user",
            email=str(data.email),
            role_id=data.role_id,
            student_ids=None,
            invited_by=invited_by_id,
            status="pending",
            expires_at=datetime.now(timezone.utc) + timedelta(days=INVITE_EXPIRY_DAYS),
        )
        invite = await self.repo.create(invite)

        inviter_name = (
            f"{inviter.first_name} {inviter.last_name}".strip()
            if inviter
            else tenant.name
        )
        msg = (data.personal_message or "").strip() or None
        self._send_invite_email(
            tenant_id=tenant.id,
            to_email=str(data.email),
            subject=f"You've been invited to join {tenant.name}",
            first_name=data.first_name,
            inviter_name=inviter_name,
            tenant_name=tenant.name,
            role_or_desc=role_name,
            link=self._build_invite_link(invite.token),
            invite_kind="user",
            personal_message=msg,
        )
        return self._to_response(invite, role_name=role_name)

    async def create_parent_invite(
        self,
        tenant_id: UUID,
        invited_by_id: UUID,
        data: CreateParentInviteRequest,
    ) -> InvitationResponse:
        tenant = await self._get_tenant(tenant_id)
        ts = TenantService(self.session)
        parent_role = await self._get_parent_role(tenant_id)
        if parent_role is None:
            parent_role = await ts.ensure_system_role(tenant_id, "parent")
        if parent_role is None:
            raise ValueError(
                "Could not create or find the Parent role for this organization. "
                "Try running database role setup or contact support."
            )
        inviter = await self._get_user(invited_by_id)
        students = await self._get_students(list(data.student_ids))
        student_names = [f"{s.first_name} {s.last_name}" for s in students]
        names_str = ", ".join(student_names) if student_names else "your child"

        invite = Invitation(
            tenant_id=tenant_id,
            invite_type="parent",
            email=str(data.email),
            role_id=None,
            student_ids=[str(sid) for sid in data.student_ids],
            invited_by=invited_by_id,
            status="pending",
            expires_at=datetime.now(timezone.utc) + timedelta(days=INVITE_EXPIRY_DAYS),
        )
        invite = await self.repo.create(invite)

        inviter_name = (
            f"{inviter.first_name} {inviter.last_name}".strip()
            if inviter
            else tenant.name
        )
        self._send_invite_email(
            tenant_id=tenant.id,
            to_email=str(data.email),
            subject=f"You're invited to join {tenant.name} as a parent",
            first_name=data.first_name,
            inviter_name=inviter_name,
            tenant_name=tenant.name,
            role_or_desc=f"a parent for {names_str}",
            link=self._build_invite_link(invite.token),
            invite_kind="parent",
        )
        return self._to_response(invite, student_names=student_names)

    async def validate_token(self, token: str) -> ValidateInviteResponse:
        invite = await self.repo.get_by_token(token)
        if not invite:
            raise ValueError("Invitation not found or invalid")

        now = datetime.now(timezone.utc)
        if invite.status == "pending" and invite.expires_at < now:
            invite.status = "expired"
            await self.session.flush()

        tenant = await self._get_tenant(invite.tenant_id)
        inviter = await self._get_user(invite.invited_by) if invite.invited_by else None
        inviter_name = (
            f"{inviter.first_name} {inviter.last_name}".strip()
            if inviter
            else tenant.name
        )

        role_name = None
        if invite.role_id:
            role = await self._get_role(invite.role_id)
            role_name = role.name if role else None

        student_names = None
        if invite.student_ids:
            students = await self._get_students([UUID(sid) for sid in invite.student_ids])
            student_names = [f"{s.first_name} {s.last_name}" for s in students]

        return ValidateInviteResponse(
            token=invite.token,
            invite_type=invite.invite_type,
            email=invite.email,
            tenant_name=tenant.name,
            tenant_id=invite.tenant_id,
            inviter_name=inviter_name,
            role_name=role_name,
            student_names=student_names,
            expires_at=invite.expires_at,
            status=invite.status,
        )

    async def accept_invite(self, token: str, user_id: UUID) -> AcceptInviteResponse:
        invite = await self.repo.get_by_token(token)
        if not invite:
            raise ValueError("Invitation not found")
        if invite.status == "accepted":
            raise ValueError("This invitation has already been accepted")
        if invite.status in ("expired", "revoked"):
            raise ValueError(f"This invitation has been {invite.status}")
        if invite.expires_at < datetime.now(timezone.utc):
            invite.status = "expired"
            await self.session.flush()
            raise ValueError("This invitation has expired")

        user = await self._get_user(user_id)
        if not user:
            raise ValueError("User not found")
        invited_norm = str(invite.email).strip().casefold()
        account_norm = (user.email or "").strip().casefold()
        if account_norm != invited_norm:
            raise ValueError(
                "This invitation was sent to a different email address. "
                "Sign in or register with the invited email, or ask an admin to send a new invitation."
            )

        # Resolve role_id: for parent invite, ensure tenant has a Parent role row
        if invite.invite_type == "parent":
            ts = TenantService(self.session)
            parent_role = await self._get_parent_role(invite.tenant_id)
            if parent_role is None:
                parent_role = await ts.ensure_system_role(invite.tenant_id, "parent")
            if parent_role is None:
                raise ValueError(
                    "Parent role is not available for this organization. "
                    "An administrator may need to repair roles."
                )
            role_id = parent_role.id
        else:
            role_id = invite.role_id

        # Upsert membership
        existing = await self.session.execute(
            select(Membership).where(
                Membership.user_id == user_id,
                Membership.tenant_id == invite.tenant_id,
            )
        )
        membership = existing.scalar_one_or_none()
        if membership:
            if role_id and membership.role_id != role_id:
                membership.role_id = role_id
            membership.is_active = True
        else:
            self.session.add(
                Membership(
                    user_id=user_id,
                    tenant_id=invite.tenant_id,
                    role_id=role_id,
                    is_active=True,
                )
            )

        # For parent invite, link each student
        if invite.invite_type == "parent" and invite.student_ids:
            for sid_str in invite.student_ids:
                sid = UUID(sid_str)
                existing_link = await self.session.execute(
                    select(ParentStudent).where(
                        ParentStudent.user_id == user_id,
                        ParentStudent.student_id == sid,
                    )
                )
                if not existing_link.scalar_one_or_none():
                    self.session.add(
                        ParentStudent(
                            user_id=user_id,
                            student_id=sid,
                            relationship="parent",
                            is_primary_contact=False,
                        )
                    )

        invite.status = "accepted"
        invite.accepted_at = datetime.now(timezone.utc)
        invite.accepted_by_user_id = user_id
        await self.session.flush()

        return AcceptInviteResponse(
            message="Invitation accepted. Welcome to the workspace!",
            tenant_id=invite.tenant_id,
            invite_type=invite.invite_type,
        )

    async def revoke_invite(self, token: str, tenant_id: UUID) -> None:
        invite = await self.repo.get_by_token(token)
        if not invite or invite.tenant_id != tenant_id:
            raise ValueError("Invitation not found")
        if invite.status == "accepted":
            raise ValueError("Cannot revoke an accepted invitation")
        invite.status = "revoked"
        await self.session.flush()

    async def list_invites(
        self, tenant_id: UUID, skip: int = 0, limit: int = 50
    ) -> InvitationListResponse:
        invites, total = await self.repo.list_for_tenant(tenant_id, skip=skip, limit=limit)
        items: list[InvitationResponse] = []
        for invite in invites:
            role_name = None
            student_names = None
            if invite.role_id:
                role = await self._get_role(invite.role_id)
                role_name = role.name if role else None
            if invite.student_ids:
                students = await self._get_students([UUID(sid) for sid in invite.student_ids])
                student_names = [f"{s.first_name} {s.last_name}" for s in students]
            items.append(self._to_response(invite, role_name=role_name, student_names=student_names))
        return InvitationListResponse(items=items, total=total)
