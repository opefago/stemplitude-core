"""Unit tests for classroom schedule → upcoming session expansion."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from app.classrooms.models import Classroom, ClassroomSession
from app.classrooms.schedule_occurrences import (
    expand_classroom_upcoming_occurrences,
    merge_db_and_scheduled_upcoming,
)
from app.programs.models import Program


def _classroom(**kwargs: object) -> Classroom:
    defaults = {
        "id": uuid.uuid4(),
        "tenant_id": uuid.uuid4(),
        "program_id": None,
        "curriculum_id": None,
        "instructor_id": None,
        "name": "Test class",
        "mode": "online",
        "recurrence_type": "weekly",
        "meeting_provider": None,
        "meeting_link": "https://example.test/meet",
        "external_meeting_id": None,
        "meeting_auto_generated": False,
        "location_address": None,
        "join_code": "TEST01",
        "schedule": {},
        "settings": {},
        "starts_at": None,
        "ends_at": None,
        "recurrence_rule": None,
        "timezone": "America/Vancouver",
        "max_students": None,
        "is_active": True,
        "deleted_at": None,
    }
    defaults.update(kwargs)
    return Classroom(**defaults)


def test_weekly_schedule_finds_next_monday_occurrence():
    c = _classroom(
        schedule={
            "recurring": True,
            "days": ["Monday"],
            "time": "15:00",
            "end_time": "16:00",
        },
    )
    # Fixed instant: Sunday 2026-03-29 20:00 UTC = same calendar day Vancouver (PDT, -7)
    after = datetime(2026, 3, 29, 20, 0, tzinfo=timezone.utc)
    until = datetime(2026, 5, 1, 0, 0, tzinfo=timezone.utc)
    occ = expand_classroom_upcoming_occurrences(c, after_utc=after, until_utc=until)
    assert len(occ) >= 1
    first = occ[0].session_start.astimezone(timezone.utc)
    # Monday Mar 30 2026 15:00 Vancouver = Mar 30 22:00 UTC
    assert first.date() == datetime(2026, 3, 30, 0, 0, tzinfo=timezone.utc).date()
    assert first.hour == 22


def test_merge_prefers_db_row_over_near_duplicate_synthetic():
    classroom_id = uuid.uuid4()
    tenant_id = uuid.uuid4()
    c = _classroom(
        id=classroom_id,
        tenant_id=tenant_id,
        schedule={
            "recurring": True,
            "days": ["Monday"],
            "time": "15:00",
            "end_time": "16:00",
        },
    )
    now = datetime(2026, 3, 29, 20, 0, tzinfo=timezone.utc)
    # Real session same wall time as synthetic (~ Mar 30 22:00 UTC)
    sid = uuid.uuid4()
    db_row = ClassroomSession(
        id=sid,
        classroom_id=classroom_id,
        tenant_id=tenant_id,
        session_start=datetime(2026, 3, 30, 22, 0, 5, tzinfo=timezone.utc),
        session_end=datetime(2026, 3, 30, 23, 0, 5, tzinfo=timezone.utc),
        status="scheduled",
        meeting_link=None,
        external_meeting_id=None,
        notes=None,
    )
    merged = merge_db_and_scheduled_upcoming([db_row], [c], now=now, limit=10)
    ids = [m.id for m in merged]
    assert sid in ids
    assert sum(1 for m in merged if m.id == sid) == 1


def test_merge_session_start_before_excludes_later_occurrences():
    classroom_id = uuid.uuid4()
    tenant_id = uuid.uuid4()
    c = _classroom(
        id=classroom_id,
        tenant_id=tenant_id,
        schedule={
            "recurring": True,
            "days": ["Monday", "Wednesday"],
            "time": "15:00",
            "end_time": "16:00",
        },
    )
    now = datetime(2026, 3, 29, 20, 0, tzinfo=timezone.utc)
    before = datetime(2026, 4, 2, 0, 0, tzinfo=timezone.utc)
    merged = merge_db_and_scheduled_upcoming(
        [], [c], now=now, limit=50, session_start_before=before
    )
    for m in merged:
        st = m.session_start
        if st.tzinfo is None:
            st = st.replace(tzinfo=timezone.utc)
        else:
            st = st.astimezone(timezone.utc)
        assert st < before


def test_one_time_recurrence_does_not_expand():
    c = _classroom(
        recurrence_type="one_time",
        schedule={
            "recurring": False,
            "days": ["Monday"],
            "time": "15:00",
            "end_time": "16:00",
        },
    )
    after = datetime(2026, 3, 29, 20, 0, tzinfo=timezone.utc)
    until = datetime(2026, 5, 1, 0, 0, tzinfo=timezone.utc)
    assert expand_classroom_upcoming_occurrences(c, after_utc=after, until_utc=until) == []


def _make_program(
    start_date: date | None = None, end_date: date | None = None
) -> Program:
    return Program(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        name="Test program",
        is_active=True,
        start_date=start_date,
        end_date=end_date,
        settings={},
    )


def test_weekly_schedule_clipped_by_program_end_date():
    """Occurrences must not exceed the parent program's end_date."""
    program = _make_program(end_date=date(2026, 4, 7))
    c = _classroom(
        program_id=program.id,
        schedule={
            "recurring": True,
            "days": ["Monday"],
            "time": "15:00",
            "end_time": "16:00",
        },
    )
    c.program = program

    after = datetime(2026, 3, 29, 20, 0, tzinfo=timezone.utc)
    until = datetime(2026, 5, 1, 0, 0, tzinfo=timezone.utc)
    occ = expand_classroom_upcoming_occurrences(c, after_utc=after, until_utc=until)
    assert len(occ) >= 1
    for o in occ:
        assert o.session_start.date() <= date(2026, 4, 7)


def test_weekly_schedule_clipped_by_program_start_date():
    """Occurrences must not start before the parent program's start_date."""
    program = _make_program(start_date=date(2026, 4, 7))
    c = _classroom(
        program_id=program.id,
        schedule={
            "recurring": True,
            "days": ["Monday"],
            "time": "15:00",
            "end_time": "16:00",
        },
    )
    c.program = program

    after = datetime(2026, 3, 29, 20, 0, tzinfo=timezone.utc)
    until = datetime(2026, 5, 1, 0, 0, tzinfo=timezone.utc)
    occ = expand_classroom_upcoming_occurrences(c, after_utc=after, until_utc=until)
    assert len(occ) >= 1
    for o in occ:
        assert o.session_start.date() >= date(2026, 4, 7)


def test_program_bounds_clip_rrule_occurrences():
    """RRule-based expansion must also respect program term dates."""
    program = _make_program(
        start_date=date(2026, 4, 1), end_date=date(2026, 4, 14)
    )
    c = _classroom(
        program_id=program.id,
        recurrence_rule="FREQ=WEEKLY;BYDAY=MO",
        starts_at=datetime(2026, 3, 30, 22, 0, tzinfo=timezone.utc),
        schedule={"time": "15:00", "end_time": "16:00"},
    )
    c.program = program

    after = datetime(2026, 3, 29, 20, 0, tzinfo=timezone.utc)
    until = datetime(2026, 5, 1, 0, 0, tzinfo=timezone.utc)
    occ = expand_classroom_upcoming_occurrences(c, after_utc=after, until_utc=until)
    for o in occ:
        assert o.session_start.date() >= date(2026, 4, 1)
        assert o.session_start.date() <= date(2026, 4, 14)


def test_classroom_without_program_unaffected():
    """A classroom with no program_id should expand normally without clipping."""
    c = _classroom(
        schedule={
            "recurring": True,
            "days": ["Monday"],
            "time": "15:00",
            "end_time": "16:00",
        },
    )
    after = datetime(2026, 3, 29, 20, 0, tzinfo=timezone.utc)
    until = datetime(2026, 5, 1, 0, 0, tzinfo=timezone.utc)
    occ_no_program = expand_classroom_upcoming_occurrences(c, after_utc=after, until_utc=until)
    assert len(occ_no_program) >= 4


def test_program_with_no_dates_does_not_clip():
    """A program without start_date / end_date should not clip occurrences."""
    program = _make_program()
    c = _classroom(
        program_id=program.id,
        schedule={
            "recurring": True,
            "days": ["Monday"],
            "time": "15:00",
            "end_time": "16:00",
        },
    )
    c.program = program

    after = datetime(2026, 3, 29, 20, 0, tzinfo=timezone.utc)
    until = datetime(2026, 5, 1, 0, 0, tzinfo=timezone.utc)
    occ = expand_classroom_upcoming_occurrences(c, after_utc=after, until_utc=until)
    assert len(occ) >= 4
