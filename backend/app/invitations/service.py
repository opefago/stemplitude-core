import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
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
from app.users.models import User

logger = logging.getLogger(__name__)

INVITE_EXPIRY_DAYS = 7


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
            role_name=role_name,
            student_names=student_names,
            invite_link=self._build_invite_link(invite.token),
        )

    def _send_invite_email(
        self,
        to_email: str,
        subject: str,
        first_name: str | None,
        inviter_name: str,
        tenant_name: str,
        role_or_desc: str,
        link: str,
    ) -> None:
        greeting = f"Hi {first_name}" if first_name else "Hi"
        plain = (
            f"{greeting},\n\n"
            f"{inviter_name} has invited you to join {tenant_name} as {role_or_desc}.\n\n"
            f"Click the link below to accept your invitation:\n{link}\n\n"
            f"This invitation expires in {INVITE_EXPIRY_DAYS} days.\n\n"
            f"If you did not expect this invitation, you can ignore this email."
        )
        html = (
            f"<p>{greeting},</p>"
            f"<p><strong>{inviter_name}</strong> has invited you to join "
            f"<strong>{tenant_name}</strong> as {role_or_desc}.</p>"
            f"<p style='margin:24px 0'>"
            f"<a href='{link}' style='background:#059669;color:#fff;padding:12px 24px;"
            f"border-radius:8px;text-decoration:none;font-weight:700;display:inline-block'>"
            f"Accept Invitation</a></p>"
            f"<p style='color:#666;font-size:0.9em'>Or copy this link: {link}</p>"
            f"<p style='color:#666;font-size:0.85em'>This invitation expires in "
            f"{INVITE_EXPIRY_DAYS} days.</p>"
        )
        try:
            from workers.tasks.email_tasks import send_email_task
            send_email_task.delay(to_email, subject, plain, html)
        except Exception:
            logger.exception("Failed to enqueue invite email for %s", to_email)

    # --- Public API ---

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
        self._send_invite_email(
            to_email=str(data.email),
            subject=f"You've been invited to join {tenant.name}",
            first_name=data.first_name,
            inviter_name=inviter_name,
            tenant_name=tenant.name,
            role_or_desc=role_name,
            link=self._build_invite_link(invite.token),
        )
        return self._to_response(invite, role_name=role_name)

    async def create_parent_invite(
        self,
        tenant_id: UUID,
        invited_by_id: UUID,
        data: CreateParentInviteRequest,
    ) -> InvitationResponse:
        tenant = await self._get_tenant(tenant_id)
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
            to_email=str(data.email),
            subject=f"You're invited to join {tenant.name} as a parent",
            first_name=data.first_name,
            inviter_name=inviter_name,
            tenant_name=tenant.name,
            role_or_desc=f"a parent for {names_str}",
            link=self._build_invite_link(invite.token),
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

        # Resolve role_id: for parent invite, find the tenant's parent role
        if invite.invite_type == "parent":
            parent_role = await self._get_parent_role(invite.tenant_id)
            role_id = parent_role.id if parent_role else None
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
