"""Expand recurring class schedules into upcoming SessionResponse rows.

Persisted ``ClassroomSession`` rows are used when instructors start or schedule
specific instances. Many workspaces only store the weekly pattern on
``Classroom.schedule`` / ``recurrence_rule``; this module fills the gap for
parent/student \"upcoming sessions\" lists.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dateutil.rrule import rrulestr

from app.classrooms.models import Classroom, ClassroomSession
from app.classrooms.schemas import SessionResponse

logger = logging.getLogger(__name__)

# Deterministic IDs for synthetic sessions (stable per classroom + start instant).
_RECURRING_SESSION_NS = uuid.UUID("018f3a2e-7c91-7a3b-9f0e-2a1b3c4d5e6f")

_UPCOMING_HORIZON_DAYS = 90
_MAX_OCCURRENCES_PER_CLASSROOM = 200
_DEDUPE_TOLERANCE_SEC = 120

_WEEKDAY_BY_NAME = {
    "monday": 0,
    "mon": 0,
    "tuesday": 1,
    "tue": 1,
    "tues": 1,
    "wednesday": 2,
    "wed": 2,
    "thursday": 3,
    "thu": 3,
    "thur": 3,
    "thurs": 3,
    "friday": 4,
    "fri": 4,
    "saturday": 5,
    "sat": 5,
    "sunday": 6,
    "sun": 6,
}


def _synthetic_session_id(classroom_id: uuid.UUID, start: datetime) -> uuid.UUID:
    key = f"{classroom_id}:{start.astimezone(timezone.utc).isoformat()}"
    return uuid.uuid5(_RECURRING_SESSION_NS, key)


def _parse_hh_mm(raw: object) -> tuple[int, int] | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    parts = s.split(":")
    if len(parts) < 2:
        return None
    try:
        h = int(parts[0])
        m = int(parts[1])
    except ValueError:
        return None
    if not (0 <= h <= 23 and 0 <= m <= 59):
        return None
    return h, m


def _session_duration_minutes(schedule: dict) -> int:
    st = _parse_hh_mm(schedule.get("time"))
    et = _parse_hh_mm(schedule.get("end_time"))
    if st and et:
        sm = st[0] * 60 + st[1]
        em = et[0] * 60 + et[1]
        if em > sm:
            return em - sm
    return 60


def _classroom_schedule_tz(classroom: Classroom) -> ZoneInfo:
    tz_name = (classroom.timezone or "UTC").strip() or "UTC"
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        logger.warning("Unknown classroom timezone %r, using UTC", tz_name)
        return ZoneInfo("UTC")


def _program_date_bounds(classroom: Classroom) -> tuple[datetime | None, datetime | None]:
    """If the classroom belongs to a program, return (start, end) as UTC datetimes."""
    program = getattr(classroom, "program", None)
    if program is None or classroom.program_id is None:
        return None, None
    p_start: datetime | None = None
    p_end: datetime | None = None
    if getattr(program, "start_date", None) is not None:
        p_start = datetime.combine(program.start_date, time.min, tzinfo=timezone.utc)
    if getattr(program, "end_date", None) is not None:
        p_end = datetime.combine(program.end_date, time(23, 59, 59), tzinfo=timezone.utc)
    return p_start, p_end


def _tighten_bound(
    current: datetime | None, candidate: datetime | None, *, pick_later: bool
) -> datetime | None:
    """Return the tighter of two optional bounds.  *pick_later=True* keeps the later
    value (for start bounds); *pick_later=False* keeps the earlier value (for end bounds)."""
    if current is None:
        return candidate
    if candidate is None:
        return current
    return max(current, candidate) if pick_later else min(current, candidate)


def _series_bounds(
    classroom: Classroom, horizon_end: datetime
) -> tuple[datetime | None, datetime | None]:
    """Return optional UTC (start, end) bounds for the class series,
    tightened by the parent program's term dates when applicable."""
    start = classroom.starts_at
    end = classroom.ends_at
    if start and start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end and end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    prog_start, prog_end = _program_date_bounds(classroom)
    start = _tighten_bound(start, prog_start, pick_later=True)
    end = _tighten_bound(end, prog_end, pick_later=False)

    if end and end > horizon_end:
        end = horizon_end
    return start, end


def _classroom_is_schedulable(classroom: Classroom) -> bool:
    if not classroom.is_active or classroom.deleted_at is not None:
        return False
    rt0 = (classroom.recurrence_type or "").strip().lower()
    if rt0 in ("one_time", "once", "single"):
        return False
    sch = classroom.schedule or {}
    if sch.get("recurring") is True:
        return True
    rt = (classroom.recurrence_type or "").strip().lower()
    if rt in ("weekly", "recurring"):
        return True
    if (classroom.recurrence_rule or "").strip():
        return True
    return False


def _normalize_rrule_text(rule: str) -> str:
    r = rule.strip()
    if not r:
        return ""
    upper = r.upper()
    if upper.startswith("RRULE:"):
        return r
    return f"RRULE:{r}"


def _occurrence_starts_from_rrule(
    classroom: Classroom,
    *,
    after_utc: datetime,
    until_utc: datetime,
) -> list[datetime]:
    rule_raw = (classroom.recurrence_rule or "").strip()
    if not rule_raw:
        return []

    prog_start, prog_end = _program_date_bounds(classroom)
    if prog_start and prog_start > after_utc:
        after_utc = prog_start
    if prog_end and prog_end < until_utc:
        until_utc = prog_end
    if after_utc >= until_utc:
        return []

    tz = _classroom_schedule_tz(classroom)
    sch = classroom.schedule or {}

    dtstart = classroom.starts_at
    if dtstart is None:
        t = _parse_hh_mm(sch.get("time"))
        if not t:
            return []
        local_after = after_utc.astimezone(tz)
        d0 = local_after.date()
        hh, mm = t
        cand_local = datetime.combine(d0, time(hh, mm), tzinfo=tz)
        if cand_local <= local_after:
            cand_local += timedelta(days=1)
        dtstart = cand_local.astimezone(timezone.utc)
    else:
        if dtstart.tzinfo is None:
            dtstart = dtstart.replace(tzinfo=timezone.utc)
        else:
            dtstart = dtstart.astimezone(timezone.utc)

    try:
        rrule_line = _normalize_rrule_text(rule_raw)
        rule = rrulestr(rrule_line, dtstart=dtstart)
    except Exception:
        logger.info("Could not parse recurrence_rule for classroom %s", classroom.id, exc_info=True)
        return []

    try:
        # r.between is in dtstart's timezone context; pass aware UTC bounds
        inst = rule.between(after_utc, until_utc, inc=False)
    except Exception:
        logger.info("rrule.between failed for classroom %s", classroom.id, exc_info=True)
        return []

    out: list[datetime] = []
    for d in inst:
        if not isinstance(d, datetime):
            continue
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        else:
            d = d.astimezone(timezone.utc)
        if d <= after_utc:
            continue
        if d >= until_utc:
            continue
        out.append(d)
        if len(out) >= _MAX_OCCURRENCES_PER_CLASSROOM:
            break
    return out


def _occurrence_starts_from_weekly_schedule(
    classroom: Classroom,
    *,
    after_utc: datetime,
    until_utc: datetime,
) -> list[datetime]:
    sch = classroom.schedule or {}
    days = sch.get("days")
    if not isinstance(days, list) or not days:
        return []

    wanted: set[int] = set()
    for d in days:
        key = str(d).strip().lower()
        if key in _WEEKDAY_BY_NAME:
            wanted.add(_WEEKDAY_BY_NAME[key])

    if not wanted:
        return []

    t_start = _parse_hh_mm(sch.get("time"))
    if not t_start:
        return []

    tz = _classroom_schedule_tz(classroom)

    series_start, series_end = _series_bounds(classroom, until_utc)

    local_after = after_utc.astimezone(tz)
    local_until = until_utc.astimezone(tz)

    cursor: date = local_after.date()
    end_date: date = local_until.date()

    out: list[datetime] = []
    while cursor <= end_date and len(out) < _MAX_OCCURRENCES_PER_CLASSROOM:
        if cursor.weekday() in wanted:
            hh, mm = t_start
            local_start = datetime.combine(cursor, time(hh, mm), tzinfo=tz)
            utc_start = local_start.astimezone(timezone.utc)
            if series_start and utc_start < series_start.astimezone(timezone.utc):
                cursor += timedelta(days=1)
                continue
            if series_end and utc_start > series_end.astimezone(timezone.utc):
                cursor += timedelta(days=1)
                continue
            if utc_start > after_utc and utc_start < until_utc:
                out.append(utc_start)
        cursor += timedelta(days=1)

    return out


def expand_classroom_upcoming_occurrences(
    classroom: Classroom,
    *,
    after_utc: datetime,
    until_utc: datetime,
) -> list[SessionResponse]:
    if not _classroom_is_schedulable(classroom):
        return []

    rule_raw = (classroom.recurrence_rule or "").strip()
    if rule_raw:
        starts = _occurrence_starts_from_rrule(
            classroom, after_utc=after_utc, until_utc=until_utc
        )
    else:
        starts = _occurrence_starts_from_weekly_schedule(
            classroom, after_utc=after_utc, until_utc=until_utc
        )

    sch = classroom.schedule or {}
    duration_min = _session_duration_minutes(sch)

    responses: list[SessionResponse] = []
    for st in starts:
        en = st + timedelta(minutes=duration_min)
        responses.append(
            SessionResponse(
                id=_synthetic_session_id(classroom.id, st),
                classroom_id=classroom.id,
                tenant_id=classroom.tenant_id,
                session_start=st,
                session_end=en,
                status="scheduled",
                meeting_link=classroom.meeting_link,
                external_meeting_id=None,
                notes=None,
                session_content=None,
                canceled_at=None,
            )
        )
    return responses


def merge_db_and_scheduled_upcoming(
    db_sessions: Iterable[ClassroomSession],
    classrooms: Iterable[Classroom],
    *,
    now: datetime,
    limit: int,
    session_start_before: datetime | None = None,
) -> list[SessionResponse]:
    """Combine persisted sessions with schedule-derived occurrences, deduped and sorted."""
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    else:
        now = now.astimezone(timezone.utc)

    horizon = now + timedelta(days=_UPCOMING_HORIZON_DAYS)
    until = horizon
    before_utc: datetime | None = None
    if session_start_before is not None:
        b = session_start_before
        if b.tzinfo is None:
            b = b.replace(tzinfo=timezone.utc)
        else:
            b = b.astimezone(timezone.utc)
        before_utc = b
        until = min(until, b)

    by_id: dict[uuid.UUID, SessionResponse] = {}
    for row in db_sessions:
        if row.session_start.tzinfo is None:
            st = row.session_start.replace(tzinfo=timezone.utc)
        else:
            st = row.session_start.astimezone(timezone.utc)
        if st <= now:
            continue
        if before_utc is not None and st >= before_utc:
            continue
        by_id[row.id] = SessionResponse.model_validate(row)

    virtuals: list[SessionResponse] = []
    seen_classroom: set[uuid.UUID] = set()
    for c in classrooms:
        if c.id in seen_classroom:
            continue
        seen_classroom.add(c.id)
        virtuals.extend(
            expand_classroom_upcoming_occurrences(c, after_utc=now, until_utc=until)
        )

    def near_duplicate(v: SessionResponse) -> bool:
        for existing in by_id.values():
            if existing.classroom_id != v.classroom_id:
                continue
            delta = abs((existing.session_start - v.session_start).total_seconds())
            if delta <= _DEDUPE_TOLERANCE_SEC:
                return True
        return False

    for v in virtuals:
        if near_duplicate(v):
            continue
        if v.id not in by_id:
            by_id[v.id] = v

    merged = sorted(by_id.values(), key=lambda s: s.session_start)
    if before_utc is not None:

        def _start_utc(s: SessionResponse) -> datetime:
            st = s.session_start
            if st.tzinfo is None:
                return st.replace(tzinfo=timezone.utc)
            return st.astimezone(timezone.utc)

        merged = [s for s in merged if _start_utc(s) < before_utc]
    return merged[:limit]
