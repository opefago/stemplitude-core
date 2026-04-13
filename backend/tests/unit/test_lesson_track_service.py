from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
import json
from pathlib import Path

import pytest

from app.lesson_content.models import ClassroomTrackInstanceLesson
from app.lesson_content.schemas import (
    DuplicateContentRequest,
    LessonCreate,
    SessionCoverageCreate,
    TrackCreate,
    TrackLessonInput,
)
from app.lesson_content.service import LessonTrackService

pytestmark = pytest.mark.unit


@pytest.fixture
def service(mock_db):
    return LessonTrackService(mock_db)


@pytest.mark.asyncio
async def test_create_lesson_persists_and_returns_row(service, mock_db):
    payload = LessonCreate(title="Intro to circuits", owner_type="tenant")
    mock_db.refresh = AsyncMock(side_effect=lambda obj: setattr(obj, "id", obj.id))

    result = await service.create_lesson(uuid4(), payload)

    assert result.title == "Intro to circuits"
    mock_db.add.assert_called()
    mock_db.flush.assert_awaited()


@pytest.mark.asyncio
async def test_create_track_replaces_lessons(service, mock_db):
    replace_mock = AsyncMock()
    service._replace_track_lessons = replace_mock
    service._replace_milestones = AsyncMock()

    payload = TrackCreate(
        title="Robotics Track",
        owner_type="tenant",
        lessons=[TrackLessonInput(lesson_id=uuid4(), order_index=0)],
    )

    await service.create_track(uuid4(), payload)

    replace_mock.assert_awaited_once()
    mock_db.add.assert_called()


@pytest.mark.asyncio
async def test_duplicate_lesson_creates_lineage(service, mock_db):
    source_lesson = MagicMock(
        id=uuid4(),
        tenant_id=None,
        title="Stemplitude lesson",
        summary="summary",
        objectives=[],
        subject="Science",
        grade="6",
        tags=[],
        duration_minutes=20,
    )
    service._get_lesson_any_owner = AsyncMock(return_value=source_lesson)

    result = await service.duplicate_content(
        uuid4(),
        DuplicateContentRequest(content_type="lesson", content_id=source_lesson.id),
    )

    assert result["content_type"] == "lesson"
    # Duplicate row + lineage row
    assert mock_db.add.call_count >= 2


@pytest.mark.asyncio
async def test_record_coverage_updates_instance_status(service, mock_db):
    service._apply_instance_lesson_status = AsyncMock()
    payload = SessionCoverageCreate(
        track_instance_id=uuid4(),
        lesson_id=uuid4(),
        coverage_status="completed",
    )

    await service.record_session_coverage(
        tenant_id=uuid4(),
        classroom_id=uuid4(),
        session_id=uuid4(),
        payload=payload,
    )

    service._apply_instance_lesson_status.assert_awaited_once()
    added_types = [type(call.args[0]) for call in mock_db.add.call_args_list if call.args]
    assert ClassroomTrackInstanceLesson not in added_types


def test_seed_fixture_payloads_are_schema_compatible():
    fixture_path = Path(__file__).parent / "fixtures" / "track_lesson_seed.json"
    data = json.loads(fixture_path.read_text())

    lesson = LessonCreate(**data["lesson"], owner_type="tenant")
    track = TrackCreate(
        title=data["track"]["title"],
        summary=data["track"].get("summary"),
        owner_type="tenant",
        lessons=[TrackLessonInput(lesson_id=uuid4(), order_index=0)],
    )

    assert lesson.title
    assert track.title
