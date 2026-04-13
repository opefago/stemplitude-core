from __future__ import annotations

import uuid
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.lesson_content.models import (
    ClassroomLessonAssignment,
    ClassroomTrackAssignment,
    ClassroomTrackInstance,
    ClassroomTrackInstanceLesson,
    ContentDuplicate,
    Lesson,
    LessonQuizLink,
    CurriculumTrackAssignment,
    LessonResource,
    Milestone,
    MilestoneRule,
    Quiz,
    QuizVersion,
    SessionLessonLink,
    Track,
    TrackLesson,
    TrackProgress,
    Transcript,
    TranscriptChunk,
    VideoAsset,
)
from app.lesson_content.schemas import (
    ClassroomLessonAssignmentCreate,
    CurriculumTrackAssignmentCreate,
    DuplicateContentRequest,
    LessonCreate,
    LessonUpdate,
    MilestoneInput,
    QuizCreate,
    QuizUpdate,
    SearchContentResponse,
    SessionCoverageCreate,
    TrackAssignmentCreate,
    TrackCreate,
    TrackLessonInput,
    TrackUpdate,
)


class LessonTrackService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_lesson(
        self,
        tenant_id: uuid.UUID,
        payload: LessonCreate,
        actor_id: uuid.UUID | None = None,
    ) -> Lesson:
        lesson = Lesson(
            tenant_id=None if payload.owner_type == "stemplitude" else tenant_id,
            owner_type=payload.owner_type,
            visibility=payload.visibility,
            status=payload.status,
            title=payload.title,
            summary=payload.summary,
            objectives=payload.objectives,
            subject=payload.subject,
            grade=payload.grade,
            tags=payload.tags,
            duration_minutes=payload.duration_minutes,
            created_by_id=actor_id,
        )
        self.db.add(lesson)
        await self.db.flush()
        await self._replace_lesson_assets(lesson.id, lesson.tenant_id, payload.video, payload.resources, payload.transcript)
        await self._replace_lesson_quiz_links(lesson.id, tenant_id, payload.quiz_ids)
        await self.db.refresh(lesson)
        return lesson

    async def update_lesson(self, lesson_id: uuid.UUID, tenant_id: uuid.UUID, payload: LessonUpdate) -> Lesson:
        lesson = await self._get_lesson(lesson_id, tenant_id)
        for field in [
            "title",
            "summary",
            "objectives",
            "subject",
            "grade",
            "tags",
            "duration_minutes",
            "visibility",
            "status",
        ]:
            value = getattr(payload, field)
            if value is not None:
                setattr(lesson, field, value)
        if payload.video is not None or payload.transcript is not None:
            await self._replace_lesson_assets(lesson.id, lesson.tenant_id, payload.video, None, payload.transcript)
        if payload.quiz_ids is not None:
            await self._replace_lesson_quiz_links(lesson.id, tenant_id, payload.quiz_ids)
        await self.db.flush()
        await self.db.refresh(lesson)
        return lesson

    async def list_lessons(self, tenant_id: uuid.UUID, include_stemplitude: bool = True) -> list[Lesson]:
        where = [Lesson.tenant_id == tenant_id]
        if include_stemplitude:
            where.append(Lesson.owner_type == "stemplitude")
        stmt = (
            select(Lesson)
            .where(or_(*where))
            .order_by(Lesson.updated_at.desc())
        )
        return list((await self.db.execute(stmt)).scalars())

    async def create_track(self, tenant_id: uuid.UUID, payload: TrackCreate) -> Track:
        track = Track(
            tenant_id=None if payload.owner_type == "stemplitude" else tenant_id,
            owner_type=payload.owner_type,
            visibility=payload.visibility,
            status=payload.status,
            title=payload.title,
            summary=payload.summary,
            subject=payload.subject,
            grade=payload.grade,
            tags=payload.tags,
        )
        self.db.add(track)
        await self.db.flush()
        await self._replace_track_lessons(track.id, payload.lessons)
        await self._replace_milestones(track.id, payload.milestones)
        await self.db.refresh(track)
        return track

    async def update_track(self, track_id: uuid.UUID, tenant_id: uuid.UUID, payload: TrackUpdate) -> Track:
        track = await self._get_track(track_id, tenant_id)
        for field in ["title", "summary", "subject", "grade", "tags", "visibility", "status"]:
            value = getattr(payload, field)
            if value is not None:
                setattr(track, field, value)
        if payload.lessons is not None:
            await self._replace_track_lessons(track.id, payload.lessons)
        if payload.milestones is not None:
            await self._replace_milestones(track.id, payload.milestones)
        await self.db.flush()
        await self.db.refresh(track)
        return track

    async def list_tracks(self, tenant_id: uuid.UUID, include_stemplitude: bool = True) -> list[Track]:
        where = [Track.tenant_id == tenant_id]
        if include_stemplitude:
            where.append(Track.owner_type == "stemplitude")
        stmt = select(Track).where(or_(*where)).order_by(Track.updated_at.desc())
        return list((await self.db.execute(stmt)).scalars())

    async def create_quiz(self, tenant_id: uuid.UUID, payload: QuizCreate) -> Quiz:
        quiz = Quiz(
            tenant_id=None if payload.owner_type == "stemplitude" else tenant_id,
            owner_type=payload.owner_type,
            visibility=payload.visibility,
            status=payload.status,
            title=payload.title,
            description=payload.description,
            instructions=payload.instructions,
            schema_json=payload.schema_definition,
        )
        self.db.add(quiz)
        await self.db.flush()
        await self._create_quiz_version(quiz)
        await self.db.refresh(quiz)
        return quiz

    async def list_quizzes(self, tenant_id: uuid.UUID, include_stemplitude: bool = True) -> list[Quiz]:
        where = [Quiz.tenant_id == tenant_id]
        if include_stemplitude:
            where.append(Quiz.owner_type == "stemplitude")
        stmt = select(Quiz).where(or_(*where)).order_by(Quiz.updated_at.desc())
        return list((await self.db.execute(stmt)).scalars())

    async def update_quiz(self, quiz_id: uuid.UUID, tenant_id: uuid.UUID, payload: QuizUpdate) -> Quiz:
        quiz = await self._get_quiz(quiz_id, tenant_id)
        updates = {
            "title": payload.title,
            "description": payload.description,
            "instructions": payload.instructions,
            "visibility": payload.visibility,
            "status": payload.status,
        }
        for field, value in updates.items():
            if value is not None:
                setattr(quiz, field, value)
        if payload.schema_definition is not None:
            quiz.schema_json = payload.schema_definition
        # Safe revision behavior: editing a published quiz creates a new draft revision by default.
        if quiz.status == "published" and payload.status is None:
            quiz.status = "draft"
        await self.db.flush()
        await self._create_quiz_version(quiz)
        await self.db.refresh(quiz)
        return quiz

    async def list_quiz_versions(self, quiz_id: uuid.UUID, tenant_id: uuid.UUID) -> list[QuizVersion]:
        await self._get_quiz(quiz_id, tenant_id)
        stmt = select(QuizVersion).where(QuizVersion.quiz_id == quiz_id).order_by(QuizVersion.version.desc())
        return list((await self.db.execute(stmt)).scalars())

    async def duplicate_content(self, tenant_id: uuid.UUID, payload: DuplicateContentRequest) -> dict:
        if payload.content_type == "lesson":
            src = await self._get_lesson_any_owner(payload.content_id, tenant_id)
            duplicate = Lesson(
                tenant_id=tenant_id,
                owner_type="tenant",
                visibility="tenant_only",
                status="draft",
                title=f"{src.title} (Copy)",
                summary=src.summary,
                objectives=src.objectives,
                subject=src.subject,
                grade=src.grade,
                tags=src.tags,
                duration_minutes=src.duration_minutes,
            )
            self.db.add(duplicate)
            await self.db.flush()
            self.db.add(
                ContentDuplicate(
                    source_content_type="lesson",
                    source_content_id=src.id,
                    source_tenant_id=src.tenant_id,
                    target_content_type="lesson",
                    target_content_id=duplicate.id,
                    target_tenant_id=tenant_id,
                )
            )
            return {"content_type": "lesson", "content_id": duplicate.id}

        src_track = await self._get_track_any_owner(payload.content_id, tenant_id)
        duplicate_track = Track(
            tenant_id=tenant_id,
            owner_type="tenant",
            visibility="tenant_only",
            status="draft",
            title=f"{src_track.title} (Copy)",
            summary=src_track.summary,
            subject=src_track.subject,
            grade=src_track.grade,
            tags=src_track.tags,
        )
        self.db.add(duplicate_track)
        await self.db.flush()
        source_lessons = await self.db.execute(
            select(TrackLesson).where(TrackLesson.track_id == src_track.id).order_by(TrackLesson.order_index.asc())
        )
        for row in source_lessons.scalars():
            self.db.add(
                TrackLesson(track_id=duplicate_track.id, lesson_id=row.lesson_id, order_index=row.order_index)
            )
        self.db.add(
            ContentDuplicate(
                source_content_type="track",
                source_content_id=src_track.id,
                source_tenant_id=src_track.tenant_id,
                target_content_type="track",
                target_content_id=duplicate_track.id,
                target_tenant_id=tenant_id,
            )
        )
        return {"content_type": "track", "content_id": duplicate_track.id}

    async def assign_track_to_classroom(
        self, tenant_id: uuid.UUID, classroom_id: uuid.UUID, payload: TrackAssignmentCreate
    ) -> dict:
        track = await self._get_track_any_owner(payload.track_id, tenant_id)
        assignment = ClassroomTrackAssignment(
            tenant_id=tenant_id,
            classroom_id=classroom_id,
            track_id=track.id,
            auto_suggestion_enabled=payload.auto_suggestion_enabled,
            allow_override=payload.allow_override,
            milestone_tracking_enabled=payload.milestone_tracking_enabled,
        )
        self.db.add(assignment)
        await self.db.flush()

        instance = ClassroomTrackInstance(
            tenant_id=tenant_id,
            classroom_id=classroom_id,
            track_id=track.id,
            assignment_id=assignment.id,
        )
        self.db.add(instance)
        await self.db.flush()

        track_lessons = await self.db.execute(
            select(TrackLesson).where(TrackLesson.track_id == track.id).order_by(TrackLesson.order_index.asc())
        )
        for row in track_lessons.scalars():
            self.db.add(
                ClassroomTrackInstanceLesson(
                    track_instance_id=instance.id,
                    lesson_id=row.lesson_id,
                    order_index=row.order_index,
                )
            )
        return {"assignment_id": assignment.id, "track_instance_id": instance.id}

    async def assign_track_to_curriculum(
        self, tenant_id: uuid.UUID, curriculum_id: uuid.UUID, payload: CurriculumTrackAssignmentCreate
    ) -> CurriculumTrackAssignment:
        assignment = CurriculumTrackAssignment(
            tenant_id=tenant_id,
            curriculum_id=curriculum_id,
            track_id=payload.track_id,
        )
        self.db.add(assignment)
        await self.db.flush()
        await self.db.refresh(assignment)
        return assignment

    async def assign_lesson_to_classroom(
        self, tenant_id: uuid.UUID, classroom_id: uuid.UUID, payload: ClassroomLessonAssignmentCreate
    ) -> ClassroomLessonAssignment:
        lesson = await self._get_lesson_any_owner(payload.lesson_id, tenant_id)
        existing = (
            await self.db.execute(
                select(ClassroomLessonAssignment).where(
                    ClassroomLessonAssignment.tenant_id == tenant_id,
                    ClassroomLessonAssignment.classroom_id == classroom_id,
                    ClassroomLessonAssignment.lesson_id == lesson.id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            return existing
        assignment = ClassroomLessonAssignment(
            tenant_id=tenant_id,
            classroom_id=classroom_id,
            lesson_id=lesson.id,
        )
        self.db.add(assignment)
        await self.db.flush()
        await self.db.refresh(assignment)
        return assignment

    async def get_suggested_lesson(self, classroom_id: uuid.UUID, session_id: uuid.UUID, tenant_id: uuid.UUID) -> dict:
        del session_id  # Session is included for API consistency and future weighting.
        instance_stmt = (
            select(ClassroomTrackInstance)
            .where(
                ClassroomTrackInstance.classroom_id == classroom_id,
                ClassroomTrackInstance.tenant_id == tenant_id,
                ClassroomTrackInstance.status == "active",
            )
            .order_by(ClassroomTrackInstance.created_at.desc())
            .limit(1)
        )
        instance = (await self.db.execute(instance_stmt)).scalar_one_or_none()
        if not instance:
            return {"lesson_id": None, "title": None, "order_index": None, "reason": "No active track instance"}

        lesson_stmt = (
            select(ClassroomTrackInstanceLesson, Lesson)
            .join(Lesson, Lesson.id == ClassroomTrackInstanceLesson.lesson_id)
            .where(
                ClassroomTrackInstanceLesson.track_instance_id == instance.id,
                ClassroomTrackInstanceLesson.status.in_(["pending", "in_progress"]),
            )
            .order_by(ClassroomTrackInstanceLesson.order_index.asc())
            .limit(1)
        )
        row = (await self.db.execute(lesson_stmt)).first()
        if not row:
            return {"lesson_id": None, "title": None, "order_index": None, "reason": "Track already completed"}
        instance_lesson, lesson = row
        return {
            "lesson_id": lesson.id,
            "title": lesson.title,
            "order_index": instance_lesson.order_index,
            "reason": "Next uncompleted lesson",
        }

    async def record_session_coverage(
        self,
        tenant_id: uuid.UUID,
        classroom_id: uuid.UUID,
        session_id: uuid.UUID,
        payload: SessionCoverageCreate,
        actor_id: uuid.UUID | None = None,
    ) -> SessionLessonLink:
        row = SessionLessonLink(
            tenant_id=tenant_id,
            classroom_id=classroom_id,
            session_id=session_id,
            track_instance_id=payload.track_instance_id,
            lesson_id=payload.lesson_id,
            resource_id=payload.resource_id,
            selection_type=payload.selection_type,
            coverage_status=payload.coverage_status,
            notes=payload.notes,
            created_by_id=actor_id,
        )
        self.db.add(row)
        if payload.track_instance_id and payload.lesson_id:
            await self._apply_instance_lesson_status(payload.track_instance_id, payload.lesson_id, payload.coverage_status)
        await self.db.flush()
        await self.db.refresh(row)
        return row

    async def compute_track_progress(
        self, tenant_id: uuid.UUID, student_id: uuid.UUID, track_instance_id: uuid.UUID
    ) -> TrackProgress:
        instance = await self.db.get(ClassroomTrackInstance, track_instance_id)
        if not instance or instance.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track instance not found")
        status_counts = await self.db.execute(
            select(
                ClassroomTrackInstanceLesson.status,
                func.count(ClassroomTrackInstanceLesson.id),
            )
            .where(ClassroomTrackInstanceLesson.track_instance_id == track_instance_id)
            .group_by(ClassroomTrackInstanceLesson.status)
        )
        counts = {row[0]: row[1] for row in status_counts.all()}
        completed = counts.get("completed", 0)
        skipped = counts.get("skipped", 0)
        total = sum(counts.values())
        completion = int((completed / total) * 100) if total else 0

        existing = (
            await self.db.execute(
                select(TrackProgress).where(
                    TrackProgress.track_instance_id == track_instance_id,
                    TrackProgress.student_id == student_id,
                )
            )
        ).scalar_one_or_none()
        if not existing:
            existing = TrackProgress(
                tenant_id=tenant_id,
                student_id=student_id,
                track_id=instance.track_id,
                track_instance_id=track_instance_id,
            )
            self.db.add(existing)
        existing.completed_lessons = completed
        existing.skipped_lessons = skipped
        existing.total_lessons = total
        existing.completion_percent = completion
        await self.db.flush()
        await self.db.refresh(existing)
        return existing

    async def search_content(
        self,
        tenant_id: uuid.UUID,
        query: str,
        visibility: str | None = None,
        owner_type: str | None = None,
        limit: int = 25,
    ) -> list[SearchContentResponse]:
        query = query.strip()
        if not query:
            return []
        lesson_filter = [or_(Lesson.tenant_id == tenant_id, Lesson.owner_type == "stemplitude")]
        track_filter = [or_(Track.tenant_id == tenant_id, Track.owner_type == "stemplitude")]
        if visibility:
            lesson_filter.append(Lesson.visibility == visibility)
            track_filter.append(Track.visibility == visibility)
        if owner_type:
            lesson_filter.append(Lesson.owner_type == owner_type)
            track_filter.append(Track.owner_type == owner_type)

        q_like = f"%{query}%"
        transcript_lesson_ids = (
            select(Transcript.lesson_id)
            .join(TranscriptChunk, TranscriptChunk.transcript_id == Transcript.id)
            .where(TranscriptChunk.content.ilike(q_like))
        )
        lesson_rows = await self.db.execute(
            select(Lesson)
            .where(
                and_(*lesson_filter),
                or_(
                    Lesson.title.ilike(q_like),
                    Lesson.summary.ilike(q_like),
                    Lesson.id.in_(transcript_lesson_ids),
                ),
            )
            .order_by(Lesson.updated_at.desc())
            .limit(limit)
        )
        track_rows = await self.db.execute(
            select(Track)
            .where(and_(*track_filter), or_(Track.title.ilike(q_like), Track.summary.ilike(q_like)))
            .order_by(Track.updated_at.desc())
            .limit(limit)
        )
        out: list[SearchContentResponse] = []
        for lesson in lesson_rows.scalars():
            out.append(
                SearchContentResponse(
                    content_type="lesson",
                    content_id=lesson.id,
                    title=lesson.title,
                    summary=lesson.summary,
                    owner_type=lesson.owner_type,
                    visibility=lesson.visibility,
                )
            )
        for track in track_rows.scalars():
            out.append(
                SearchContentResponse(
                    content_type="track",
                    content_id=track.id,
                    title=track.title,
                    summary=track.summary,
                    owner_type=track.owner_type,
                    visibility=track.visibility,
                )
            )
        return out

    async def _replace_track_lessons(self, track_id: uuid.UUID, lessons: Iterable[TrackLessonInput]) -> None:
        await self.db.execute(delete(TrackLesson).where(TrackLesson.track_id == track_id))
        for row in lessons:
            self.db.add(TrackLesson(track_id=track_id, lesson_id=row.lesson_id, order_index=row.order_index))

    async def _replace_milestones(self, track_id: uuid.UUID, milestones: Iterable[MilestoneInput]) -> None:
        existing = await self.db.execute(select(Milestone.id).where(Milestone.track_id == track_id))
        milestone_ids = [row[0] for row in existing.all()]
        if milestone_ids:
            await self.db.execute(delete(MilestoneRule).where(MilestoneRule.milestone_id.in_(milestone_ids)))
        await self.db.execute(delete(Milestone).where(Milestone.track_id == track_id))
        for milestone in milestones:
            model = Milestone(
                track_id=track_id,
                title=milestone.title,
                description=milestone.description,
                order_index=milestone.order_index,
            )
            self.db.add(model)
            await self.db.flush()
            for rule in milestone.rules:
                self.db.add(
                    MilestoneRule(
                        milestone_id=model.id,
                        rule_type=rule.rule_type,
                        threshold=rule.threshold,
                        lesson_id=rule.lesson_id,
                        config=rule.config,
                    )
                )

    async def _replace_lesson_assets(
        self,
        lesson_id: uuid.UUID,
        tenant_id: uuid.UUID | None,
        video,
        resources,
        transcript,
    ) -> None:
        if resources is not None:
            await self.db.execute(delete(LessonResource).where(LessonResource.lesson_id == lesson_id))
            for idx, resource in enumerate(resources):
                self.db.add(
                    LessonResource(
                        lesson_id=lesson_id,
                        resource_type=resource.resource_type,
                        title=resource.title,
                        body=resource.body,
                        url=resource.url,
                        metadata_=resource.metadata,
                        sort_order=idx,
                    )
                )
        if video is not None:
            await self.db.execute(delete(VideoAsset).where(VideoAsset.lesson_id == lesson_id))
            self.db.add(
                VideoAsset(
                    lesson_id=lesson_id,
                    tenant_id=tenant_id,
                    provider=video.provider,
                    provider_ref=video.provider_ref,
                    title=video.title,
                    duration_seconds=video.duration_seconds,
                    thumbnail_url=video.thumbnail_url,
                )
            )
        if transcript is not None:
            await self.db.execute(delete(TranscriptChunk).where(TranscriptChunk.transcript_id.in_(select(Transcript.id).where(Transcript.lesson_id == lesson_id))))
            await self.db.execute(delete(Transcript).where(Transcript.lesson_id == lesson_id))
            if transcript.strip():
                transcript_row = Transcript(lesson_id=lesson_id, raw_text=transcript.strip(), language="en")
                self.db.add(transcript_row)
                await self.db.flush()
                chunks = [chunk.strip() for chunk in transcript.split("\n") if chunk.strip()]
                for idx, chunk in enumerate(chunks):
                    self.db.add(TranscriptChunk(transcript_id=transcript_row.id, chunk_index=idx, content=chunk))

    async def _create_quiz_version(self, quiz: Quiz) -> None:
        latest_version = (
            await self.db.execute(
                select(func.max(QuizVersion.version)).where(QuizVersion.quiz_id == quiz.id)
            )
        ).scalar_one_or_none()
        next_version = (latest_version or 0) + 1
        self.db.add(
            QuizVersion(
                quiz_id=quiz.id,
                version=next_version,
                title=quiz.title,
                description=quiz.description,
                instructions=quiz.instructions,
                status=quiz.status,
                schema_json=quiz.schema_json or {},
            )
        )

    async def _replace_lesson_quiz_links(
        self, lesson_id: uuid.UUID, tenant_id: uuid.UUID, quiz_ids: list[uuid.UUID]
    ) -> None:
        await self.db.execute(delete(LessonQuizLink).where(LessonQuizLink.lesson_id == lesson_id))
        if not quiz_ids:
            return
        seen: set[uuid.UUID] = set()
        for order_index, quiz_id in enumerate(quiz_ids):
            if quiz_id in seen:
                continue
            seen.add(quiz_id)
            quiz = await self.db.get(Quiz, quiz_id)
            if not quiz:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")
            if quiz.owner_type != "stemplitude" and quiz.tenant_id != tenant_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden quiz link")
            self.db.add(
                LessonQuizLink(
                    lesson_id=lesson_id,
                    quiz_id=quiz.id,
                    order_index=order_index,
                )
            )

    async def _apply_instance_lesson_status(self, track_instance_id: uuid.UUID, lesson_id: uuid.UUID, status_value: str) -> None:
        row = (
            await self.db.execute(
                select(ClassroomTrackInstanceLesson).where(
                    ClassroomTrackInstanceLesson.track_instance_id == track_instance_id,
                    ClassroomTrackInstanceLesson.lesson_id == lesson_id,
                )
            )
        ).scalar_one_or_none()
        if not row:
            max_order = (
                await self.db.execute(
                    select(func.max(ClassroomTrackInstanceLesson.order_index)).where(
                        ClassroomTrackInstanceLesson.track_instance_id == track_instance_id
                    )
                )
            ).scalar_one_or_none()
            row = ClassroomTrackInstanceLesson(
                track_instance_id=track_instance_id,
                lesson_id=lesson_id,
                order_index=(max_order or 0) + 1,
                is_inserted=True,
            )
            self.db.add(row)
        row.status = status_value
        row.completion_percent = 100 if status_value == "completed" else row.completion_percent

    async def _get_lesson(self, lesson_id: uuid.UUID, tenant_id: uuid.UUID) -> Lesson:
        lesson = await self.db.get(Lesson, lesson_id)
        if not lesson or (lesson.owner_type != "stemplitude" and lesson.tenant_id != tenant_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        return lesson

    async def _get_track(self, track_id: uuid.UUID, tenant_id: uuid.UUID) -> Track:
        track = await self.db.get(Track, track_id)
        if not track or (track.owner_type != "stemplitude" and track.tenant_id != tenant_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
        return track

    async def _get_quiz(self, quiz_id: uuid.UUID, tenant_id: uuid.UUID) -> Quiz:
        quiz = await self.db.get(Quiz, quiz_id)
        if not quiz or (quiz.owner_type != "stemplitude" and quiz.tenant_id != tenant_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")
        return quiz

    async def _get_lesson_any_owner(self, lesson_id: uuid.UUID, tenant_id: uuid.UUID) -> Lesson:
        lesson = await self.db.get(Lesson, lesson_id)
        if not lesson:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        if lesson.owner_type != "stemplitude" and lesson.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return lesson

    async def _get_track_any_owner(self, track_id: uuid.UUID, tenant_id: uuid.UUID) -> Track:
        track = await self.db.get(Track, track_id)
        if not track:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")
        if track.owner_type != "stemplitude" and track.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return track
