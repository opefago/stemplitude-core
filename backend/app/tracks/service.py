from sqlalchemy.ext.asyncio import AsyncSession

from app.lesson_content.service import LessonTrackService


class TrackService(LessonTrackService):
    def __init__(self, db: AsyncSession):
        super().__init__(db)
