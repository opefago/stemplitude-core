from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.lesson_content.models import ContentPermission


async def has_content_permission(
    db: AsyncSession,
    *,
    content_type: str,
    content_id,
    subject_type: str,
    subject_id,
    permission: str,
) -> bool:
    row = (
        await db.execute(
            select(ContentPermission.id).where(
                and_(
                    ContentPermission.content_type == content_type,
                    ContentPermission.content_id == content_id,
                    ContentPermission.subject_type == subject_type,
                    ContentPermission.subject_id == subject_id,
                    ContentPermission.permission == permission,
                )
            )
        )
    ).first()
    return row is not None
