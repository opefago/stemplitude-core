from sqlalchemy.ext.asyncio import AsyncSession

from app.lesson_content.service import LessonTrackService


class ClassroomAssignmentService(LessonTrackService):
    """Thin alias service to keep assignment logic under a dedicated module."""

    def __init__(self, db: AsyncSession):
        super().__init__(db)
