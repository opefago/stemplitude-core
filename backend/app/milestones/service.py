from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.lesson_content.models import ClassroomTrackInstanceLesson, Milestone, MilestoneRule


class MilestoneService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def evaluate_track_milestones(self, track_id):
        milestones = (
            await self.db.execute(select(Milestone).where(Milestone.track_id == track_id))
        ).scalars().all()
        results: list[dict] = []
        for milestone in milestones:
            rules = (
                await self.db.execute(
                    select(MilestoneRule).where(MilestoneRule.milestone_id == milestone.id)
                )
            ).scalars().all()
            results.append({"milestone_id": milestone.id, "rules": len(rules)})
        return results

    async def evaluate_instance_progress(self, track_instance_id):
        rows = (
            await self.db.execute(
                select(ClassroomTrackInstanceLesson.status).where(
                    ClassroomTrackInstanceLesson.track_instance_id == track_instance_id
                )
            )
        ).scalars().all()
        return {
            "completed": len([status for status in rows if status == "completed"]),
            "pending": len([status for status in rows if status in {"pending", "in_progress"}]),
            "skipped": len([status for status in rows if status == "skipped"]),
        }
