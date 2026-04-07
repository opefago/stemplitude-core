"""Labs service."""

import logging
import uuid
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import blob_storage
from app.dependencies import CurrentIdentity, TenantContext
from app.gamification.streak_side_effects import bump_student_streak
from app.labs.models import LabAssignment, Project, SubmissionFeedback

from .repository import FeedbackRepository, LabAssignmentRepository, ProjectRepository
from .schemas import (
    FeedbackCreate,
    FeedbackResponse,
    FeedbackUpdate,
    LabAssignmentCreate,
    LabAssignmentResponse,
    LabAssignmentUpdate,
    PublicExploreProjectResponse,
    ProjectResponse,
    ProjectUpdate,
)

logger = logging.getLogger(__name__)


def _metadata_flag_true(raw: object) -> bool:
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)):
        return raw != 0
    if isinstance(raw, str):
        v = raw.strip().lower()
        return v in {"1", "true", "yes", "on"}
    return False


def _creator_name_from_student(student) -> str:
    display = (getattr(student, "display_name", None) or "").strip()
    if display:
        return display
    first = (getattr(student, "first_name", None) or "").strip()
    last = (getattr(student, "last_name", None) or "").strip()
    full = f"{first} {last}".strip()
    if full:
        return full
    return "Learner"


def _tenant_allows_public_explore(tenant_settings: dict | None) -> bool:
    settings = tenant_settings if isinstance(tenant_settings, dict) else {}
    gallery = settings.get("public_game_gallery")
    if not isinstance(gallery, dict):
        return True
    return _metadata_flag_true(gallery.get("enabled", True))


def _project_is_public_game(meta: dict | None) -> bool:
    if not isinstance(meta, dict):
        return False
    # Accept a few flag/key variants to remain compatible with future publish flows.
    published = (
        _metadata_flag_true(meta.get("is_published"))
        or _metadata_flag_true(meta.get("published"))
        or _metadata_flag_true(meta.get("is_public"))
        or _metadata_flag_true(meta.get("public"))
        or _metadata_flag_true(meta.get("isPublic"))
    )
    if not published:
        return False

    kind = str(meta.get("project_type") or meta.get("type") or meta.get("content_type") or "").strip().lower()
    if not kind:
        # If not explicitly typed, still allow as public content once marked published.
        return True
    return "game" in kind


class LabsService:
    """Service for lab project operations."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = ProjectRepository(session)
        self.assignment_repo = LabAssignmentRepository(session)
        self.feedback_repo = FeedbackRepository(session)

    def _student_id(self, identity: CurrentIdentity, tenant_ctx: TenantContext) -> UUID:
        """Resolve student_id: identity.id if student, else require student_id param."""
        if identity.sub_type == "student":
            return identity.id
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student context required for project operations",
        )

    @staticmethod
    def _to_project_response(project: Project, *, blob_url: str | None = None) -> ProjectResponse:
        return ProjectResponse(
            id=project.id,
            student_id=project.student_id,
            lab_id=project.lab_id,
            tenant_id=project.tenant_id,
            title=project.title,
            blob_key=project.blob_key,
            blob_url=blob_url if blob_url is not None else project.blob_url,
            metadata_=project.metadata_,
            status=project.status,
            save_kind=project.save_kind,
            revision=project.revision,
            source_project_id=project.source_project_id,
            submitted_at=project.submitted_at,
            updated_at=project.updated_at,
        )

    async def submit_project(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        title: str,
        lab_id: UUID | None,
        file: UploadFile,
        metadata_: dict | None = None,
        save_kind: str = "checkpoint",
        source_project_id: UUID | None = None,
    ) -> ProjectResponse:
        """Submit a project with file upload to R2."""
        student_id = self._student_id(identity, tenant_ctx)
        from app.member_billing.guard import assert_member_billing_access_allowed

        await assert_member_billing_access_allowed(
            self.session,
            tenant_id=tenant_ctx.tenant_id,
            student_id=student_id,
        )
        project_id = uuid.uuid4()
        filename = file.filename or "project"
        content_type = file.content_type or "application/octet-stream"

        file_data = await file.read()
        key = blob_storage.tenant_project_key(
            tenant_ctx.tenant_id, student_id, project_id, filename
        )
        blob_storage.upload_file(key, file_data, content_type)

        project = Project(
            id=project_id,
            student_id=student_id,
            lab_id=lab_id,
            tenant_id=tenant_ctx.tenant_id,
            title=title,
            blob_key=key,
            blob_url=None,
            metadata_=metadata_ or {},
            save_kind=save_kind or "checkpoint",
            source_project_id=source_project_id,
        )
        project = await self.repo.create(project)
        await bump_student_streak(student_id, tenant_ctx.tenant_id)
        return self._to_project_response(project)

    async def list_projects(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        student_id: UUID | None = None,
        lab_id: UUID | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[ProjectResponse]:
        """List projects. Students see own; teachers see by student_id."""
        if identity.sub_type == "student":
            sid = identity.id
        elif student_id is not None:
            sid = student_id
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="student_id required when listing as teacher",
            )
        projects = await self.repo.list_by_student(
            sid, tenant_ctx.tenant_id, lab_id=lab_id, skip=skip, limit=limit
        )
        return [
            self._to_project_response(p)
            for p in projects
        ]

    async def get_project(
        self,
        project_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        expires_in: int = 3600,
    ) -> ProjectResponse:
        """Get project with signed download URL."""
        project = await self.repo.get_by_id(project_id, tenant_ctx.tenant_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        if identity.sub_type == "student" and project.student_id != identity.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )
        signed_url = None
        if project.blob_key:
            signed_url = blob_storage.generate_presigned_url(project.blob_key, expires_in)
        return self._to_project_response(project, blob_url=signed_url)

    async def delete_project(
        self,
        project_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> None:
        """Delete a project and its blob."""
        project = await self.repo.get_by_id(project_id, tenant_ctx.tenant_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        if identity.sub_type == "student" and project.student_id != identity.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )
        if project.blob_key:
            blob_storage.delete_file(project.blob_key)
        await self.repo.delete(project)

    async def update_project(
        self,
        project_id: UUID,
        *,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        data: ProjectUpdate,
        file: UploadFile | None,
        expected_revision: int | None = None,
    ) -> ProjectResponse:
        """Update project blob/metadata for autosave or user save."""
        project = await self.repo.get_by_id(project_id, tenant_ctx.tenant_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        if identity.sub_type == "student" and project.student_id != identity.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )
        if expected_revision is not None and expected_revision != project.revision:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Revision conflict",
            )

        old_blob_key = project.blob_key
        if data.title is not None:
            project.title = data.title
        if data.metadata_ is not None:
            project.metadata_ = data.metadata_
        if data.save_kind:
            project.save_kind = data.save_kind
        if file is not None:
            filename = file.filename or "project"
            content_type = file.content_type or "application/octet-stream"
            file_data = await file.read()
            next_rev = max(project.revision + 1, 1)
            stamped_name = f"rev-{next_rev}-{filename}"
            key = blob_storage.tenant_project_key(
                tenant_ctx.tenant_id, project.student_id, project.id, stamped_name
            )
            blob_storage.upload_file(key, file_data, content_type)
            project.blob_key = key

        project.revision = max(project.revision + 1, 1)
        project = await self.repo.update(project)

        # Remove old blob after successful update commit path.
        if old_blob_key and old_blob_key != project.blob_key:
            blob_storage.delete_file(old_blob_key)
        return self._to_project_response(project)

    async def create_project_checkpoint(
        self,
        source_project_id: UUID,
        *,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        title: str,
        lab_id: UUID | None,
        file: UploadFile,
        metadata_: dict | None = None,
    ) -> ProjectResponse:
        """Create a checkpoint row linked to a source project."""
        source = await self.repo.get_by_id(source_project_id, tenant_ctx.tenant_id)
        if not source:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Source project not found",
            )
        if identity.sub_type == "student" and source.student_id != identity.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )
        return await self.submit_project(
            identity=identity,
            tenant_ctx=tenant_ctx,
            title=title,
            lab_id=lab_id if lab_id is not None else source.lab_id,
            file=file,
            metadata_=metadata_ or source.metadata_,
            save_kind="checkpoint",
            source_project_id=source.id,
        )

    async def list_project_revisions(
        self,
        project_id: UUID,
        *,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        skip: int = 0,
        limit: int = 100,
    ) -> list[ProjectResponse]:
        project = await self.repo.get_by_id(project_id, tenant_ctx.tenant_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        if identity.sub_type == "student" and project.student_id != identity.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )
        revisions = await self.repo.list_revisions(
            project_id, tenant_ctx.tenant_id, skip=skip, limit=limit
        )
        return [self._to_project_response(row) for row in revisions]

    async def list_public_explore_projects(
        self,
        *,
        skip: int = 0,
        limit: int = 24,
    ) -> list[PublicExploreProjectResponse]:
        """Public gallery cards for anonymously browsing published games."""
        # Pull a larger candidate set so metadata-level filtering can still fill the page.
        candidate_limit = max(limit * 4, limit)
        rows = await self.repo.list_public_explore_candidates(
            skip=skip,
            limit=min(candidate_limit, 400),
        )

        cards: list[PublicExploreProjectResponse] = []
        for project, student, tenant_settings in rows:
            if not _tenant_allows_public_explore(tenant_settings):
                continue
            meta = project.metadata_ if isinstance(project.metadata_, dict) else {}
            if not _project_is_public_game(meta):
                continue

            icon_url = (
                meta.get("icon_url")
                or meta.get("thumbnail_url")
                or meta.get("cover_image_url")
                or meta.get("preview_image_url")
            )
            play_url = (
                meta.get("play_url")
                or meta.get("public_url")
                or meta.get("game_url")
            )
            cards.append(
                PublicExploreProjectResponse(
                    id=project.id,
                    title=project.title,
                    creator_name=_creator_name_from_student(student),
                    creator_avatar_url=student.avatar_url,
                    icon_url=str(icon_url).strip() if isinstance(icon_url, str) and icon_url.strip() else None,
                    play_url=str(play_url).strip() if isinstance(play_url, str) and play_url.strip() else None,
                    published_at=project.submitted_at,
                )
            )
            if len(cards) >= limit:
                break
        return cards

    # --- Lab Assignment operations ---

    async def create_assignment(
        self,
        data: LabAssignmentCreate,
        assigned_by: UUID,
        tenant_id: UUID,
    ) -> LabAssignmentResponse:
        """Create a lab assignment targeting a student or classroom."""
        assignment = LabAssignment(
            lab_id=data.lab_id,
            student_id=data.student_id,
            classroom_id=data.classroom_id,
            tenant_id=tenant_id,
            assigned_by=assigned_by,
            due_at=data.due_at,
            notes=data.notes,
        )
        assignment = await self.assignment_repo.create(assignment)
        logger.info(
            "Lab assignment created id=%s lab=%s target=%s",
            assignment.id,
            assignment.lab_id,
            assignment.student_id or assignment.classroom_id,
        )
        return LabAssignmentResponse.model_validate(assignment)

    async def list_assignments(
        self,
        tenant_id: UUID,
        *,
        student_id: UUID | None = None,
        classroom_id: UUID | None = None,
        status_filter: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[LabAssignmentResponse]:
        """List assignments with optional filters."""
        assignments = await self.assignment_repo.list_by_tenant(
            tenant_id,
            student_id=student_id,
            classroom_id=classroom_id,
            status_filter=status_filter,
            skip=skip,
            limit=limit,
        )
        return [LabAssignmentResponse.model_validate(a) for a in assignments]

    async def get_assignment(
        self, assignment_id: UUID, tenant_id: UUID
    ) -> LabAssignmentResponse:
        assignment = await self.assignment_repo.get_by_id(assignment_id, tenant_id)
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lab assignment not found",
            )
        return LabAssignmentResponse.model_validate(assignment)

    async def list_my_assignments(
        self,
        student_id: UUID,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[LabAssignmentResponse]:
        """List all assignments for a student (direct + classroom)."""
        assignments = await self.assignment_repo.list_for_student(
            student_id, tenant_id, skip=skip, limit=limit
        )
        return [LabAssignmentResponse.model_validate(a) for a in assignments]

    async def update_assignment(
        self,
        assignment_id: UUID,
        data: LabAssignmentUpdate,
        tenant_id: UUID,
    ) -> LabAssignmentResponse:
        assignment = await self.assignment_repo.get_by_id(assignment_id, tenant_id)
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lab assignment not found",
            )
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(assignment, key, value)
        assignment = await self.assignment_repo.update(assignment)
        return LabAssignmentResponse.model_validate(assignment)

    async def delete_assignment(
        self, assignment_id: UUID, tenant_id: UUID
    ) -> None:
        assignment = await self.assignment_repo.get_by_id(assignment_id, tenant_id)
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lab assignment not found",
            )
        await self.assignment_repo.delete(assignment)

    # --- Submission Feedback operations ---

    async def create_feedback(
        self,
        project_id: UUID,
        data: FeedbackCreate,
        instructor_id: UUID,
        tenant_id: UUID,
    ) -> FeedbackResponse:
        """Leave feedback on a student project."""
        project = await self.repo.get_by_id(project_id, tenant_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        feedback = SubmissionFeedback(
            project_id=project_id,
            instructor_id=instructor_id,
            tenant_id=tenant_id,
            feedback_text=data.feedback_text,
            grade=data.grade,
            rubric_scores=data.rubric_scores,
        )
        feedback = await self.feedback_repo.create(feedback)
        project.status = "graded"
        await self.session.flush()
        logger.info("Feedback created id=%s project=%s", feedback.id, project_id)
        return FeedbackResponse.model_validate(feedback)

    async def list_feedback(
        self, project_id: UUID, tenant_id: UUID
    ) -> list[FeedbackResponse]:
        project = await self.repo.get_by_id(project_id, tenant_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        feedbacks = await self.feedback_repo.list_by_project(project_id, tenant_id)
        return [FeedbackResponse.model_validate(f) for f in feedbacks]

    async def update_feedback(
        self,
        feedback_id: UUID,
        data: FeedbackUpdate,
        tenant_id: UUID,
    ) -> FeedbackResponse:
        feedback = await self.feedback_repo.get_by_id(feedback_id, tenant_id)
        if not feedback:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Feedback not found",
            )
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(feedback, key, value)
        feedback = await self.feedback_repo.update(feedback)
        return FeedbackResponse.model_validate(feedback)

    async def delete_feedback(
        self, feedback_id: UUID, tenant_id: UUID
    ) -> None:
        feedback = await self.feedback_repo.get_by_id(feedback_id, tenant_id)
        if not feedback:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Feedback not found",
            )
        await self.feedback_repo.delete(feedback)
