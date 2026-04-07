"""Guardian attendance overview and excusal requests; staff review."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import case, desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.classrooms.models import Classroom, ClassroomSession, ClassroomStudent
from app.classrooms.repository import ClassroomRepository
from app.classrooms.service import ClassroomService
from app.dependencies import CurrentIdentity
from app.email.outbox import enqueue_transactional_email
from app.email.presets import build_notification_email
from app.email.templates import app_absolute_url
from app.notifications.models import Notification
from app.progress.models import Attendance, AttendanceExcusalRequest
from app.realtime.user_events import publish_notifications_changed
from app.roles.models import Role
from app.students.models import Student
from app.students.schemas import (
    AttendanceExcusalCreate,
    AttendanceExcusalReview,
    AttendanceExcusalRow,
    AttendanceExcusalStaffRow,
    GuardianAttendanceOverviewResponse,
    GuardianAttendanceSessionRow,
    GuardianExcusalSummary,
)
from app.tenants.models import Membership
from app.users.models import User
from app.classrooms.schemas import RecordAttendanceRequest

_PENDING = "pending"
_APPROVED = "approved"
_DENIED = "denied"
logger = logging.getLogger(__name__)


def _student_label(s: Student) -> str:
    dn = (s.display_name or "").strip()
    if dn:
        return dn
    return " ".join(x for x in (s.first_name, s.last_name) if x).strip() or "Student"


class AttendanceExcusalService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.classroom_repo = ClassroomRepository(session)

    async def _notify_staff_excusal_submission(
        self,
        *,
        tenant_id: UUID,
        student_id: UUID,
        classroom_id: UUID,
        session_id: UUID,
        updated_existing: bool,
    ) -> None:
        classroom = await self.classroom_repo.get_by_id(classroom_id, tenant_id)
        student = await self.session.get(Student, student_id)
        student_name = _student_label(student) if student else "A student"
        classroom_name = (
            classroom.name.strip() if classroom and classroom.name else "a class"
        )

        recipients: dict[UUID, str | None] = {}
        if classroom and classroom.instructor_id:
            instructor = await self.session.get(User, classroom.instructor_id)
            if instructor and instructor.is_active:
                recipients[instructor.id] = instructor.email

        staff_rows = (
            await self.session.execute(
                select(User.id, User.email)
                .join(Membership, Membership.user_id == User.id)
                .join(Role, Role.id == Membership.role_id)
                .where(
                    Membership.tenant_id == tenant_id,
                    Membership.is_active == True,
                    User.is_active == True,
                    Role.is_active == True,
                    Role.slug.in_(("owner", "admin")),
                )
            )
        ).all()
        for uid, email in staff_rows:
            recipients.setdefault(uid, email)

        if not recipients:
            return

        verb = "updated" if updated_existing else "submitted"
        title = f"Parent excusal request {verb}"
        body = (
            f"{student_name} has a {verb} excusal request for {classroom_name} "
            f"(session {session_id})."
        )
        for uid in recipients:
            self.session.add(
                Notification(
                    user_id=uid,
                    student_id=None,
                    tenant_id=tenant_id,
                    type="attendance_excusal",
                    title=title,
                    body=body,
                    action_path="/app",
                    action_label="Review requests",
                )
            )
        await self.session.flush()

        for uid, email in recipients.items():
            try:
                await publish_notifications_changed(tenant_id, uid)
            except Exception:
                logger.exception(
                    "Failed to publish staff excusal notification uid=%s", uid
                )
            if email and email.strip():
                prepared = build_notification_email(
                    subject=title,
                    headline=title,
                    summary=body,
                    action_url=app_absolute_url("/app"),
                    action_label="Open dashboard",
                )
                enqueue_transactional_email(
                    to_email=email.strip(),
                    prepared=prepared,
                    tenant_id=tenant_id,
                )

    async def guardian_overview(
        self,
        *,
        student_id: UUID,
        tenant_id: UUID,
    ) -> GuardianAttendanceOverviewResponse:
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(days=90)
        window_end = now + timedelta(days=120)

        sess_rows = (
            await self.session.execute(
                select(ClassroomSession, Classroom.name.label("classroom_name"))
                .join(Classroom, Classroom.id == ClassroomSession.classroom_id)
                .join(ClassroomStudent, ClassroomStudent.classroom_id == Classroom.id)
                .where(
                    ClassroomStudent.student_id == student_id,
                    Classroom.tenant_id == tenant_id,
                    ClassroomSession.tenant_id == tenant_id,
                    ClassroomSession.session_start >= window_start,
                    ClassroomSession.session_start <= window_end,
                    ClassroomSession.status != "canceled",
                )
                .order_by(desc(ClassroomSession.session_start))
                .limit(200)
            )
        ).all()

        if not sess_rows:
            return GuardianAttendanceOverviewResponse(rows=[])

        session_ids = [r[0].id for r in sess_rows]

        att_map: dict[UUID, Attendance] = {}
        if session_ids:
            att_res = await self.session.execute(
                select(Attendance).where(
                    Attendance.student_id == student_id,
                    Attendance.session_id.in_(session_ids),
                )
            )
            for a in att_res.scalars().all():
                att_map[a.session_id] = a

        exc_map: dict[UUID, AttendanceExcusalRequest] = {}
        if session_ids:
            exc_res = await self.session.execute(
                select(AttendanceExcusalRequest)
                .where(
                    AttendanceExcusalRequest.student_id == student_id,
                    AttendanceExcusalRequest.session_id.in_(session_ids),
                )
                .order_by(desc(AttendanceExcusalRequest.created_at))
            )
            for e in exc_res.scalars().all():
                if e.session_id not in exc_map:
                    exc_map[e.session_id] = e

        out: list[GuardianAttendanceSessionRow] = []
        for cs, classroom_name in sess_rows:
            att = att_map.get(cs.id)
            ex = exc_map.get(cs.id)
            excusal = None
            if ex:
                excusal = GuardianExcusalSummary(
                    id=ex.id,
                    status=ex.status,
                    reason=ex.reason,
                    review_notes=ex.review_notes,
                    created_at=ex.created_at,
                    reviewed_at=ex.reviewed_at,
                )
            out.append(
                GuardianAttendanceSessionRow(
                    session_id=cs.id,
                    classroom_id=cs.classroom_id,
                    classroom_name=classroom_name or "",
                    session_start=cs.session_start,
                    session_end=cs.session_end,
                    session_status=cs.status,
                    attendance_status=att.status if att else None,
                    attendance_notes=att.notes if att else None,
                    excusal=excusal,
                )
            )

        return GuardianAttendanceOverviewResponse(rows=out)

    async def create_excusal(
        self,
        *,
        student_id: UUID,
        tenant_id: UUID,
        guardian_user_id: UUID,
        data: AttendanceExcusalCreate,
    ) -> AttendanceExcusalRow:
        session_obj = await self.classroom_repo.get_session_by_id(
            data.session_id, data.classroom_id, tenant_id
        )
        if not session_obj:
            # Some parent-facing calendars can include scheduled recurrence occurrences
            # that are not yet materialized into `classroom_sessions`.
            if data.session_start is not None and data.session_end is not None:
                classroom = await self.classroom_repo.get_by_id(
                    data.classroom_id, tenant_id
                )
                if not classroom:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Classroom not found",
                    )
                if data.session_end <= data.session_start:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="session_end must be after session_start",
                    )
                session_obj = ClassroomSession(
                    id=data.session_id,
                    classroom_id=data.classroom_id,
                    tenant_id=tenant_id,
                    session_start=data.session_start,
                    session_end=data.session_end,
                    status="scheduled",
                )
                self.session.add(session_obj)
                try:
                    await self.session.flush()
                except IntegrityError:
                    # If another request materialized it first, re-load.
                    session_obj = await self.classroom_repo.get_session_by_id(
                        data.session_id, data.classroom_id, tenant_id
                    )
            if not session_obj:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Session not found",
                )
        if session_obj.status == "canceled":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot request excusal for a canceled session",
            )

        now = datetime.now(timezone.utc)
        if session_obj.session_end < now - timedelta(days=14):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Excusal window for this session has closed",
            )
        if session_obj.session_start > now + timedelta(days=180):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session is too far in the future",
            )

        enr = await self.classroom_repo.get_enrollment(data.classroom_id, student_id)
        if not enr:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student is not enrolled in this class",
            )

        existing_p = await self.session.scalar(
            select(AttendanceExcusalRequest).where(
                AttendanceExcusalRequest.session_id == data.session_id,
                AttendanceExcusalRequest.student_id == student_id,
                AttendanceExcusalRequest.status == _PENDING,
            )
        )
        if existing_p:
            # Allow guardians to resubmit while pending by updating the same request.
            existing_p.reason = data.reason.strip()
            existing_p.submitted_by_user_id = guardian_user_id
            existing_p.updated_at = now
            await self.session.flush()
            await self.session.refresh(existing_p)
            await self._notify_staff_excusal_submission(
                tenant_id=tenant_id,
                student_id=student_id,
                classroom_id=data.classroom_id,
                session_id=data.session_id,
                updated_existing=True,
            )
            return AttendanceExcusalRow.model_validate(existing_p)

        row = AttendanceExcusalRequest(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            student_id=student_id,
            session_id=data.session_id,
            classroom_id=data.classroom_id,
            submitted_by_user_id=guardian_user_id,
            reason=data.reason.strip(),
            status=_PENDING,
        )
        self.session.add(row)
        try:
            await self.session.flush()
        except IntegrityError as err:
            # Race-safe fallback: another request may have created pending first.
            existing_p = await self.session.scalar(
                select(AttendanceExcusalRequest).where(
                    AttendanceExcusalRequest.session_id == data.session_id,
                    AttendanceExcusalRequest.student_id == student_id,
                    AttendanceExcusalRequest.status == _PENDING,
                )
            )
            if not existing_p:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A pending excusal already exists for this session",
                ) from err
            existing_p.reason = data.reason.strip()
            existing_p.submitted_by_user_id = guardian_user_id
            existing_p.updated_at = now
            await self.session.flush()
            await self.session.refresh(existing_p)
            await self._notify_staff_excusal_submission(
                tenant_id=tenant_id,
                student_id=student_id,
                classroom_id=data.classroom_id,
                session_id=data.session_id,
                updated_existing=True,
            )
            return AttendanceExcusalRow.model_validate(existing_p)
        await self.session.refresh(row)
        await self._notify_staff_excusal_submission(
            tenant_id=tenant_id,
            student_id=student_id,
            classroom_id=data.classroom_id,
            session_id=data.session_id,
            updated_existing=False,
        )
        return AttendanceExcusalRow.model_validate(row)

    async def list_for_staff(
        self,
        *,
        tenant_id: UUID,
        identity: CurrentIdentity,
        effective_role: str | None = None,
        status_filter: str | None,
        skip: int,
        limit: int,
    ) -> list[AttendanceExcusalStaffRow]:
        role = (effective_role or identity.role or "").strip().lower()
        stmt = (
            select(AttendanceExcusalRequest, Student, Classroom.name)
            .join(Student, Student.id == AttendanceExcusalRequest.student_id)
            .join(Classroom, Classroom.id == AttendanceExcusalRequest.classroom_id)
            .where(AttendanceExcusalRequest.tenant_id == tenant_id)
        )
        if role == "instructor":
            stmt = stmt.where(Classroom.instructor_id == identity.id)

        if status_filter:
            stmt = stmt.where(AttendanceExcusalRequest.status == status_filter)

        stmt = stmt.order_by(
            case((AttendanceExcusalRequest.status == _PENDING, 0), else_=1),
            desc(AttendanceExcusalRequest.created_at),
        ).offset(skip).limit(limit)

        rows = (await self.session.execute(stmt)).all()
        out: list[AttendanceExcusalStaffRow] = []
        for ex, stu, cname in rows:
            out.append(
                AttendanceExcusalStaffRow(
                    id=ex.id,
                    student_id=ex.student_id,
                    student_display_name=_student_label(stu),
                    session_id=ex.session_id,
                    classroom_id=ex.classroom_id,
                    classroom_name=cname or "",
                    reason=ex.reason,
                    status=ex.status,
                    submitted_by_user_id=ex.submitted_by_user_id,
                    review_notes=ex.review_notes,
                    created_at=ex.created_at,
                    reviewed_at=ex.reviewed_at,
                    reviewed_by_user_id=ex.reviewed_by_user_id,
                )
            )
        return out

    async def review_excusal(
        self,
        *,
        excusal_id: UUID,
        tenant_id: UUID,
        identity: CurrentIdentity,
        effective_role: str | None = None,
        data: AttendanceExcusalReview,
    ) -> AttendanceExcusalStaffRow:
        role = (effective_role or identity.role or "").strip().lower()

        ex = await self.session.get(AttendanceExcusalRequest, excusal_id)
        if not ex or ex.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
        if ex.status != _PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This request has already been reviewed",
            )

        classroom = await self.classroom_repo.get_by_id(ex.classroom_id, tenant_id)
        if not classroom:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
        if role == "instructor" and classroom.instructor_id != identity.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your class")

        decision = data.decision.strip().lower()
        if decision not in (_APPROVED, _DENIED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="decision must be approved or denied",
            )

        now = datetime.now(timezone.utc)
        ex.status = decision
        ex.reviewed_by_user_id = identity.id
        ex.reviewed_at = now
        ex.review_notes = data.review_notes.strip() if data.review_notes else None
        ex.updated_at = now

        if decision == _APPROVED:
            note = (ex.reason[:400] + "…") if len(ex.reason) > 400 else ex.reason
            full_notes = f"Parent excusal: {note}"
            if ex.review_notes:
                full_notes = f"{full_notes} | Staff: {ex.review_notes}"
            full_notes = full_notes[:500]

            cs = ClassroomService(self.session)
            await cs.record_attendance(
                ex.classroom_id,
                RecordAttendanceRequest(
                    student_id=ex.student_id,
                    session_id=ex.session_id,
                    status="excused",
                    notes=full_notes,
                ),
                tenant_id,
            )

        await self.session.flush()
        await self.session.refresh(ex)
        stu = await self.session.get(Student, ex.student_id)
        cname = classroom.name
        return AttendanceExcusalStaffRow(
            id=ex.id,
            student_id=ex.student_id,
            student_display_name=_student_label(stu) if stu else "Student",
            session_id=ex.session_id,
            classroom_id=ex.classroom_id,
            classroom_name=cname or "",
            reason=ex.reason,
            status=ex.status,
            submitted_by_user_id=ex.submitted_by_user_id,
            review_notes=ex.review_notes,
            created_at=ex.created_at,
            reviewed_at=ex.reviewed_at,
            reviewed_by_user_id=ex.reviewed_by_user_id,
        )
