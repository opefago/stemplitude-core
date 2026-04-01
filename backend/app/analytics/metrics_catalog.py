"""Tenant analytics metric definitions (formulas, dimensions, privacy).

Cohort definition (v1): A cohort for dimensional rollups is the set of students
enrolled in at least one active classroom that carries the dimension
(program, course/curriculum, classroom, or primary instructor). Activity counts
and scores for that row include only events/progress for students in that cohort
on the bucket day (UTC).

``all``: tenant-wide slice — no enrollment filter; all activity in the tenant.

**Rubrics**: When instructors grade with optional ``rubric`` rows on the grade event, rollups store
``mean_rubric_compliance`` as the mean of (sum points_awarded / sum max_points) per graded submission
that included a rubric. Holistic ``score`` (0–100) drives ``median_assignment_score`` / ``mean_assignment_score``.
"""

from __future__ import annotations

# Minimum enrolled students in a dimension slice before we expose comparative breakdowns
# (reduces re-identification risk in small classes).
MIN_COHORT_SIZE_FOR_BREAKDOWN = 5

# API: max calendar days in a single summary/breakdown request
MAX_ANALYTICS_RANGE_DAYS = 90

# Compare endpoint: max number of dimension entities in one request
MAX_COMPARE_IDS = 4

DIMENSION_ALL = "all"
DIMENSION_PROGRAM = "program"
DIMENSION_COURSE = "course"
DIMENSION_CLASSROOM = "classroom"
DIMENSION_INSTRUCTOR = "instructor"

VALID_DIMENSIONS = frozenset(
    {
        DIMENSION_ALL,
        DIMENSION_PROGRAM,
        DIMENSION_COURSE,
        DIMENSION_CLASSROOM,
        DIMENSION_INSTRUCTOR,
    }
)

METRIC_FIELDS = (
    "active_students",
    "enrolled_students",
    "lesson_completions",
    "lab_completions",
    "lesson_progress_updates",
    "lab_progress_updates",
    "assignments_submitted",
    "assignments_saved",
    "assignments_on_time",
    "assignments_late",
    "attendance_present",
    "attendance_total",
    "presence_records",
    "median_lesson_score",
    "median_lab_score",
    "mean_lesson_score",
    "mean_lab_score",
)
