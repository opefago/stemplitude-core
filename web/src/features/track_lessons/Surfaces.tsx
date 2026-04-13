import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  assignTrackToCurriculum,
  assignLessonToClassroom,
  createAdminLesson,
  createAdminTrack,
  createTenantLesson,
  createTenantQuiz,
  createTenantTrack,
  duplicateContent,
  getSuggestedLesson,
  listTenantLessons,
  listTenantQuizzes,
  listTenantTracks,
  recordSessionCoverage,
} from "../../lib/api/trackLessons";
import { listClassrooms } from "../../lib/api/classrooms";
import { listCourses } from "../../lib/api/curriculum";
import { listUsers } from "../../lib/api/users";
import {
  LessonBuilder,
  LessonCard,
  MultiAssignDialog,
  ProgressView,
  QuizBuilder,
  SessionCoverageForm,
  SuggestedLessonPanel,
  TrackBuilder,
  TrackCard,
} from "./components";
import { KidDialog, KidDropdown } from "../../components/ui";
import "./track-lessons.css";

type Lesson = {
  id: string;
  title: string;
  summary?: string | null;
  duration_minutes?: number | null;
  subject?: string | null;
  grade?: string | null;
  owner_type?: string | null;
  created_by_id?: string | null;
};

type Track = {
  id: string;
  title: string;
  summary?: string | null;
  owner_type?: string | null;
};

type Quiz = {
  id: string;
  title: string;
  description?: string | null;
  instructions?: string | null;
  owner_type?: string | null;
  status?: string | null;
  schema_json?: Record<string, unknown> | null;
};

function useLessonTrackData() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const [lessonRows, trackRows, quizRows] = await Promise.all([
        listTenantLessons(true),
        listTenantTracks(true),
        listTenantQuizzes(true),
      ]);
      setLessons(lessonRows);
      setTracks(trackRows);
      setQuizzes(quizRows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return { lessons, tracks, quizzes, loading, refresh };
}

export function AdminContentDashboardPage() {
  const { lessons, tracks, loading, refresh } = useLessonTrackData();
  const [lessonDialogOpen, setLessonDialogOpen] = useState(false);
  const [trackDialogOpen, setTrackDialogOpen] = useState(false);

  return (
    <div className="track-lessons-page">
      <section className="track-lessons-hero">
        <h1 className="track-lessons-hero-title">Platform Lessons</h1>
        <p className="track-lessons-hero-subtitle">
          Manage platform-owned lessons and tracks with publish workflow controls from platform admin.
        </p>
        <div className="track-lessons-actions" style={{ marginTop: 12 }}>
          <button type="button" className="kid-button" onClick={() => setLessonDialogOpen(true)}>
            Create lesson
          </button>
          <button type="button" className="kid-button kid-button--ghost" onClick={() => setTrackDialogOpen(true)}>
            Create track
          </button>
        </div>
      </section>
      <KidDialog
        isOpen={lessonDialogOpen}
        onClose={() => setLessonDialogOpen(false)}
        showActions={false}
        closeVariant="neutral"
        title="Create platform lesson"
      >
        <LessonBuilder
          formTitle="Lesson details"
          onCancel={() => setLessonDialogOpen(false)}
          onSubmit={async (payload) => {
            await createAdminLesson(payload);
            setLessonDialogOpen(false);
            await refresh();
          }}
        />
      </KidDialog>
      <KidDialog
        isOpen={trackDialogOpen}
        onClose={() => setTrackDialogOpen(false)}
        showActions={false}
        closeVariant="neutral"
        title="Create platform track"
      >
        <TrackBuilder
          formTitle="Track details"
          onCancel={() => setTrackDialogOpen(false)}
          availableLessons={lessons.map((lesson) => ({ id: lesson.id, title: lesson.title }))}
          onSubmit={async (payload) => {
            await createAdminTrack(payload);
            setTrackDialogOpen(false);
            await refresh();
          }}
        />
      </KidDialog>
      <div className="track-lessons-grid" style={{ gap: 10 }}>
        {loading ? <p>Loading content library…</p> : null}
      </div>
      <section className="track-lessons-grid">
        <h2 className="track-lessons-section-title">Global lesson library</h2>
        <div className="track-lessons-grid">
          {lessons.map((lesson) => (
            <LessonCard
              key={lesson.id}
              title={lesson.title}
              summary={lesson.summary}
              durationMinutes={lesson.duration_minutes}
              subject={lesson.subject}
              grade={lesson.grade}
              ownerType={lesson.owner_type}
            />
          ))}
        </div>
      </section>
      <section className="track-lessons-grid">
        <h2 className="track-lessons-section-title">Global track library</h2>
        <div className="track-lessons-grid">
          {tracks.map((track) => (
            <TrackCard key={track.id} title={track.title} summary={track.summary} lessonCount={0} ownerType={track.owner_type} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function TenantDashboardPage() {
  const { lessons, tracks, quizzes, loading, refresh } = useLessonTrackData();
  const [libraryTab, setLibraryTab] = useState<"lessons" | "tracks" | "assessments">("lessons");
  const [lessonScope, setLessonScope] = useState<"all" | "stemplitude" | "mine" | "duplicated">("all");
  const [lessonCreatorFilter, setLessonCreatorFilter] = useState("all");
  const [trackScope, setTrackScope] = useState<"all" | "stemplitude" | "mine">("all");
  const [quizScope, setQuizScope] = useState<"all" | "stemplitude" | "mine">("all");
  const [librarySearchInput, setLibrarySearchInput] = useState("");
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [lessonPage, setLessonPage] = useState(1);
  const [trackPage, setTrackPage] = useState(1);
  const [quizPage, setQuizPage] = useState(1);
  const [lessonDialogOpen, setLessonDialogOpen] = useState(false);
  const [trackDialogOpen, setTrackDialogOpen] = useState(false);
  const [quizDialogOpen, setQuizDialogOpen] = useState(false);
  const [creatingQuiz, setCreatingQuiz] = useState(false);
  const [classroomOptions, setClassroomOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [curriculumOptions, setCurriculumOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [userLabelById, setUserLabelById] = useState<Record<string, string>>({});
  const [activeTrackAssignment, setActiveTrackAssignment] = useState<{ id: string; title: string } | null>(null);
  const [activeLessonAssignment, setActiveLessonAssignment] = useState<{ id: string; title: string } | null>(null);
  const [selectedCurriculumIds, setSelectedCurriculumIds] = useState<string[]>([]);
  const [selectedClassroomIds, setSelectedClassroomIds] = useState<string[]>([]);
  const [assigningTrack, setAssigningTrack] = useState(false);
  const [assigningLesson, setAssigningLesson] = useState(false);
  const navigate = useNavigate();
  const PAGE_SIZE = 12;

  const lessonCreatorOptions = useMemo(() => {
    const creatorRows = lessons
      .filter((lesson) => lesson.owner_type !== "stemplitude" && Boolean(lesson.created_by_id))
      .map((lesson) => lesson.created_by_id as string);
    const uniqueIds = Array.from(new Set(creatorRows));
    const options = uniqueIds
      .map((userId) => ({
        value: userId,
        label: userLabelById[userId] ?? `User ${userId.slice(0, 8)}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "all", label: "All creators" }, ...options];
  }, [lessons, userLabelById]);

  const filteredLessons = useMemo(() => {
    const searched = lessons.filter((lesson) =>
      `${lesson.title} ${lesson.summary ?? ""}`.toLowerCase().includes(librarySearchQuery.trim().toLowerCase()),
    );
    const scoped =
      lessonScope === "all"
        ? searched
        : lessonScope === "stemplitude"
          ? searched.filter((lesson) => lesson.owner_type === "stemplitude")
          : lessonScope === "duplicated"
            ? searched.filter((lesson) => lesson.title?.includes("(Copy)"))
            : searched.filter((lesson) => lesson.owner_type !== "stemplitude");
    if (lessonCreatorFilter === "all") return scoped;
    return scoped.filter((lesson) => lesson.created_by_id === lessonCreatorFilter);
  }, [lessonScope, lessonCreatorFilter, lessons, librarySearchQuery]);

  const filteredTracks = useMemo(() => {
    const searched = tracks.filter((track) =>
      `${track.title} ${track.summary ?? ""}`.toLowerCase().includes(librarySearchQuery.trim().toLowerCase()),
    );
    if (trackScope === "stemplitude") return searched.filter((track) => track.owner_type === "stemplitude");
    if (trackScope === "mine") return searched.filter((track) => track.owner_type !== "stemplitude");
    return searched;
  }, [librarySearchQuery, trackScope, tracks]);
  const filteredQuizzes = useMemo(() => {
    const searched = quizzes.filter((quiz) =>
      `${quiz.title} ${quiz.description ?? ""}`.toLowerCase().includes(librarySearchQuery.trim().toLowerCase()),
    );
    if (quizScope === "stemplitude") return searched.filter((quiz) => quiz.owner_type === "stemplitude");
    if (quizScope === "mine") return searched.filter((quiz) => quiz.owner_type !== "stemplitude");
    return searched;
  }, [librarySearchQuery, quizScope, quizzes]);

  const lessonPageCount = Math.max(1, Math.ceil(filteredLessons.length / PAGE_SIZE));
  const trackPageCount = Math.max(1, Math.ceil(filteredTracks.length / PAGE_SIZE));
  const quizPageCount = Math.max(1, Math.ceil(filteredQuizzes.length / PAGE_SIZE));
  const pagedLessons = useMemo(
    () => filteredLessons.slice((lessonPage - 1) * PAGE_SIZE, lessonPage * PAGE_SIZE),
    [filteredLessons, lessonPage, PAGE_SIZE],
  );
  const pagedTracks = useMemo(
    () => filteredTracks.slice((trackPage - 1) * PAGE_SIZE, trackPage * PAGE_SIZE),
    [filteredTracks, trackPage, PAGE_SIZE],
  );
  const pagedQuizzes = useMemo(
    () => filteredQuizzes.slice((quizPage - 1) * PAGE_SIZE, quizPage * PAGE_SIZE),
    [filteredQuizzes, quizPage, PAGE_SIZE],
  );

  useEffect(() => {
    setLessonPage(1);
  }, [lessonScope, lessonCreatorFilter, librarySearchQuery]);

  useEffect(() => {
    setTrackPage(1);
  }, [trackScope, librarySearchQuery]);
  useEffect(() => {
    setQuizPage(1);
  }, [quizScope, librarySearchQuery]);

  useEffect(() => {
    if (lessonPage > lessonPageCount) setLessonPage(lessonPageCount);
  }, [lessonPage, lessonPageCount]);

  useEffect(() => {
    if (trackPage > trackPageCount) setTrackPage(trackPageCount);
  }, [trackPage, trackPageCount]);
  useEffect(() => {
    if (quizPage > quizPageCount) setQuizPage(quizPageCount);
  }, [quizPage, quizPageCount]);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([listClassrooms({ limit: 300 }), listCourses({ limit: 300 }), listUsers({ limit: 300 })])
      .then(([classroomsResult, curriculumsResult, usersResult]) => {
        if (cancelled) return;
        if (classroomsResult.status === "fulfilled") {
          setClassroomOptions(classroomsResult.value.map((row) => ({ id: row.id, label: row.name })));
        } else {
          setClassroomOptions([]);
        }
        if (curriculumsResult.status === "fulfilled") {
          setCurriculumOptions(curriculumsResult.value.map((row) => ({ id: row.id, label: row.title })));
        } else {
          setCurriculumOptions([]);
        }
        if (usersResult.status === "fulfilled") {
          const labels = usersResult.value.items.reduce<Record<string, string>>((acc, row) => {
            const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
            acc[row.id] = fullName || row.email;
            return acc;
          }, {});
          setUserLabelById(labels);
        } else {
          setUserLabelById({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="track-lessons-page">
      <section className="track-lessons-hero track-lessons-hero--tenant">
        <h1 className="track-lessons-hero-title track-lessons-tenant-title">Tenant Lessons</h1>
        <p className="track-lessons-hero-subtitle track-lessons-tenant-subtitle">
          Build tenant-owned content, duplicate platform assets, assign tracks, and monitor progress.
        </p>
        <div className="track-lessons-actions" style={{ marginTop: 12 }}>
          <button type="button" className="kid-button" onClick={() => setLessonDialogOpen(true)}>
            Create lesson
          </button>
          <button type="button" className="kid-button kid-button--ghost" onClick={() => setTrackDialogOpen(true)}>
            Create track
          </button>
          <button type="button" className="kid-button kid-button--ghost" onClick={() => setQuizDialogOpen(true)}>
            Create quiz
          </button>
        </div>
      </section>
      <KidDialog
        isOpen={lessonDialogOpen}
        onClose={() => setLessonDialogOpen(false)}
        showActions={false}
        closeVariant="neutral"
        title="Create lesson"
      >
        <LessonBuilder
          formTitle="Lesson details"
          onCancel={() => setLessonDialogOpen(false)}
          onSubmit={async (payload) => {
            await createTenantLesson(payload);
            setLessonDialogOpen(false);
            await refresh();
          }}
        />
      </KidDialog>
      <KidDialog
        isOpen={trackDialogOpen}
        onClose={() => setTrackDialogOpen(false)}
        showActions={false}
        closeVariant="neutral"
        title="Create track"
      >
        <TrackBuilder
          formTitle="Track details"
          onCancel={() => setTrackDialogOpen(false)}
          availableLessons={lessons.map((lesson) => ({ id: lesson.id, title: lesson.title }))}
          onSubmit={async (payload) => {
            await createTenantTrack(payload);
            setTrackDialogOpen(false);
            await refresh();
          }}
        />
      </KidDialog>
      <KidDialog
        isOpen={quizDialogOpen}
        onClose={() => setQuizDialogOpen(false)}
        showActions={false}
        closeVariant="neutral"
        layout="fullscreen"
        title="Create quiz"
      >
        <QuizBuilder
          formTitle="Quiz builder"
          isSubmitting={creatingQuiz}
          onCancel={() => setQuizDialogOpen(false)}
          onSubmit={async (payload) => {
            setCreatingQuiz(true);
            try {
              await createTenantQuiz(payload);
              setQuizDialogOpen(false);
              await refresh();
            } finally {
              setCreatingQuiz(false);
            }
          }}
        />
      </KidDialog>
      <MultiAssignDialog
        isOpen={Boolean(activeTrackAssignment)}
        title={activeTrackAssignment ? `Assign "${activeTrackAssignment.title}" to curriculums` : "Assign track"}
        items={curriculumOptions}
        selectedIds={selectedCurriculumIds}
        onSelectedIdsChange={setSelectedCurriculumIds}
        searchPlaceholder="Search curriculums"
        emptyLabel="No curriculums available for assignment."
        confirmLabel="Assign to curriculums"
        isSubmitting={assigningTrack}
        onClose={() => {
          if (assigningTrack) return;
          setActiveTrackAssignment(null);
          setSelectedCurriculumIds([]);
        }}
        onConfirm={async () => {
          if (!activeTrackAssignment || selectedCurriculumIds.length === 0) return;
          setAssigningTrack(true);
          try {
            await Promise.all(
              selectedCurriculumIds.map((curriculumId) =>
                assignTrackToCurriculum(curriculumId, activeTrackAssignment.id),
              ),
            );
            setActiveTrackAssignment(null);
            setSelectedCurriculumIds([]);
          } finally {
            setAssigningTrack(false);
          }
        }}
      />
      <MultiAssignDialog
        isOpen={Boolean(activeLessonAssignment)}
        title={activeLessonAssignment ? `Assign "${activeLessonAssignment.title}" to classes` : "Assign lesson"}
        items={classroomOptions}
        selectedIds={selectedClassroomIds}
        onSelectedIdsChange={setSelectedClassroomIds}
        searchPlaceholder="Search classrooms"
        emptyLabel="No classrooms available for assignment."
        confirmLabel="Assign to classes"
        isSubmitting={assigningLesson}
        onClose={() => {
          if (assigningLesson) return;
          setActiveLessonAssignment(null);
          setSelectedClassroomIds([]);
        }}
        onConfirm={async () => {
          if (!activeLessonAssignment || selectedClassroomIds.length === 0) return;
          setAssigningLesson(true);
          try {
            await Promise.all(
              selectedClassroomIds.map((classroomId) =>
                assignLessonToClassroom(classroomId, activeLessonAssignment.id),
              ),
            );
            setActiveLessonAssignment(null);
            setSelectedClassroomIds([]);
          } finally {
            setAssigningLesson(false);
          }
        }}
      />
      <section className="track-lessons-library-shell">
        <div className="track-lessons-library-header">
          <h2 className="track-lessons-section-title">Content library</h2>
          <div className="track-lessons-segmented" role="tablist" aria-label="Library tab">
            <button
              type="button"
              role="tab"
              aria-selected={libraryTab === "lessons"}
              className={`track-lessons-segmented__item ${libraryTab === "lessons" ? "track-lessons-segmented__item--active" : ""}`}
              onClick={() => setLibraryTab("lessons")}
            >
              Lessons
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={libraryTab === "tracks"}
              className={`track-lessons-segmented__item ${libraryTab === "tracks" ? "track-lessons-segmented__item--active" : ""}`}
              onClick={() => setLibraryTab("tracks")}
            >
              Tracks
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={libraryTab === "assessments"}
              className={`track-lessons-segmented__item ${libraryTab === "assessments" ? "track-lessons-segmented__item--active" : ""}`}
              onClick={() => setLibraryTab("assessments")}
            >
              Quizzes
            </button>
          </div>
        </div>
        <div className="track-lessons-library-toolbar">
          <label className="ui-form-field">
            <span>Search library</span>
            <div className="track-lessons-library-search-row">
              <input
              type="text"
              className="track-lessons-library-search-input"
              value={librarySearchInput}
              onChange={(event) => setLibrarySearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                setLibrarySearchQuery(librarySearchInput.trim());
              }}
              placeholder={
                libraryTab === "lessons"
                  ? "Search lessons"
                  : libraryTab === "tracks"
                    ? "Search tracks"
                    : "Search quizzes"
              }
            />
              <button
                type="button"
                className="kid-button kid-button--ghost"
                onClick={() => setLibrarySearchQuery(librarySearchInput.trim())}
              >
                Search
              </button>
            </div>
          </label>
          {libraryTab === "lessons" ? (
            <>
              <div className="track-lessons-segmented" role="tablist" aria-label="Lesson scope">
                {([
                  { id: "all", label: "All lessons" },
                  { id: "stemplitude", label: "Platform" },
                  { id: "mine", label: "Tenant lessons" },
                  { id: "duplicated", label: "Duplicated" },
                ] as const).map((scope) => (
                  <button
                    key={scope.id}
                    type="button"
                    role="tab"
                    aria-selected={lessonScope === scope.id}
                    className={`track-lessons-segmented__item ${lessonScope === scope.id ? "track-lessons-segmented__item--active" : ""}`}
                    onClick={() => setLessonScope(scope.id)}
                  >
                    {scope.label}
                  </button>
                ))}
              </div>
              <label className="ui-form-field" style={{ minWidth: 220 }}>
                <span>Created by</span>
                <KidDropdown
                  value={lessonCreatorFilter}
                  onChange={setLessonCreatorFilter}
                  ariaLabel="Filter lessons by creator"
                  fullWidth
                  options={lessonCreatorOptions}
                />
              </label>
            </>
          ) : libraryTab === "tracks" ? (
            <div className="track-lessons-segmented" role="tablist" aria-label="Track scope">
              {([
                { id: "all", label: "All tracks" },
                { id: "stemplitude", label: "Platform" },
                { id: "mine", label: "My tracks" },
              ] as const).map((scope) => (
                <button
                  key={scope.id}
                  type="button"
                  role="tab"
                  aria-selected={trackScope === scope.id}
                  className={`track-lessons-segmented__item ${trackScope === scope.id ? "track-lessons-segmented__item--active" : ""}`}
                  onClick={() => setTrackScope(scope.id)}
                >
                  {scope.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="track-lessons-segmented" role="tablist" aria-label="Quiz scope">
              {([
                { id: "all", label: "All quizzes" },
                { id: "stemplitude", label: "Platform" },
                { id: "mine", label: "My quizzes" },
              ] as const).map((scope) => (
                <button
                  key={scope.id}
                  type="button"
                  role="tab"
                  aria-selected={quizScope === scope.id}
                  className={`track-lessons-segmented__item ${quizScope === scope.id ? "track-lessons-segmented__item--active" : ""}`}
                  onClick={() => setQuizScope(scope.id)}
                >
                  {scope.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
      {loading ? <p>Loading tenant libraries…</p> : null}
      {libraryTab === "lessons" ? (
        <section className="track-lessons-grid">
          <h2 className="track-lessons-section-title">Lessons library</h2>
          {filteredLessons.length === 0 && !loading ? (
            <div className="track-lessons-empty">
              <p className="track-lessons-help">No lessons match this filter yet.</p>
              <button type="button" className="kid-button kid-button--ghost" onClick={() => setLessonDialogOpen(true)}>
                Create lesson
              </button>
            </div>
          ) : (
            <div className="track-lessons-grid">
              {pagedLessons.map((lesson) => (
                <LessonCard
                  key={lesson.id}
                  title={lesson.title}
                  summary={lesson.summary}
                  durationMinutes={lesson.duration_minutes}
                  subject={lesson.subject}
                  grade={lesson.grade}
                  ownerType={lesson.owner_type}
                  createdByLabel={
                    lesson.owner_type === "stemplitude"
                      ? null
                      : lesson.created_by_id
                        ? (userLabelById[lesson.created_by_id] ?? `User ${lesson.created_by_id.slice(0, 8)}`)
                        : null
                  }
                  onDuplicate={async () => {
                    await duplicateContent("lesson", lesson.id);
                    await refresh();
                  }}
                  onAssign={() => {
                    setActiveLessonAssignment({ id: lesson.id, title: lesson.title });
                    setSelectedClassroomIds([]);
                  }}
                />
              ))}
            </div>
          )}
          {filteredLessons.length > PAGE_SIZE ? (
            <div className="track-lessons-pagination">
              <button
                type="button"
                className="kid-button kid-button--ghost"
                disabled={lessonPage <= 1}
                onClick={() => setLessonPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </button>
              <span className="track-lessons-help">Page {lessonPage} of {lessonPageCount}</span>
              <button
                type="button"
                className="kid-button kid-button--ghost"
                disabled={lessonPage >= lessonPageCount}
                onClick={() => setLessonPage((prev) => Math.min(lessonPageCount, prev + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </section>
      ) : libraryTab === "tracks" ? (
        <section className="track-lessons-grid">
          <h2 className="track-lessons-section-title">Track library</h2>
          {filteredTracks.length === 0 && !loading ? (
            <div className="track-lessons-empty">
              <p className="track-lessons-help">No tracks match this filter yet.</p>
              <button type="button" className="kid-button kid-button--ghost" onClick={() => setTrackDialogOpen(true)}>
                Create track
              </button>
            </div>
          ) : (
            <div className="track-lessons-grid">
              {filteredTracks.map((track) => (
                <TrackCard
                  key={track.id}
                  title={track.title}
                  summary={track.summary}
                  lessonCount={0}
                  ownerType={track.owner_type}
                  onDuplicate={async () => {
                    await duplicateContent("track", track.id);
                    await refresh();
                  }}
                  onAssign={() => {
                    setActiveTrackAssignment({ id: track.id, title: track.title });
                    setSelectedCurriculumIds([]);
                  }}
                  onEdit={() => navigate(`/tenant/tracks/${track.id}`)}
                />
              ))}
            </div>
          )}
          {filteredTracks.length > PAGE_SIZE ? (
            <div className="track-lessons-pagination">
              <button
                type="button"
                className="kid-button kid-button--ghost"
                disabled={trackPage <= 1}
                onClick={() => setTrackPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </button>
              <span className="track-lessons-help">Page {trackPage} of {trackPageCount}</span>
              <button
                type="button"
                className="kid-button kid-button--ghost"
                disabled={trackPage >= trackPageCount}
                onClick={() => setTrackPage((prev) => Math.min(trackPageCount, prev + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="track-lessons-grid">
          <h2 className="track-lessons-section-title">Quiz library</h2>
          {filteredQuizzes.length === 0 && !loading ? (
            <div className="track-lessons-empty">
              <p className="track-lessons-help">No quizzes match this filter yet.</p>
              <button type="button" className="kid-button kid-button--ghost" onClick={() => setQuizDialogOpen(true)}>
                Create quiz
              </button>
            </div>
          ) : (
            <div className="track-lessons-grid">
              {pagedQuizzes.map((quiz) => (
                <article key={quiz.id} className="track-lessons-card">
                  <div className="track-lessons-card-header">
                    <h3>{quiz.title}</h3>
                    <span className="track-lessons-pill">
                      {quiz.owner_type === "stemplitude" ? "Platform" : "Tenant"}
                    </span>
                  </div>
                  <p>{quiz.description || "No description yet."}</p>
                  <p className="track-lessons-help">
                    Status: {quiz.status || "draft"} · Questions: {Array.isArray(quiz.schema_json?.questions) ? quiz.schema_json.questions.length : 0}
                  </p>
                </article>
              ))}
            </div>
          )}
          {filteredQuizzes.length > PAGE_SIZE ? (
            <div className="track-lessons-pagination">
              <button
                type="button"
                className="kid-button kid-button--ghost"
                disabled={quizPage <= 1}
                onClick={() => setQuizPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </button>
              <span className="track-lessons-help">Page {quizPage} of {quizPageCount}</span>
              <button
                type="button"
                className="kid-button kid-button--ghost"
                disabled={quizPage >= quizPageCount}
                onClick={() => setQuizPage((prev) => Math.min(quizPageCount, prev + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

export function ClassroomDeliveryPage() {
  const { classroomId = "", sessionId = "" } = useParams();
  const [suggested, setSuggested] = useState<{ lesson_id?: string | null; title?: string | null; reason: string }>({
    reason: "Loading suggestion...",
  });

  useEffect(() => {
    if (!classroomId || !sessionId) return;
    void getSuggestedLesson(classroomId, sessionId).then(setSuggested).catch(() => {
      setSuggested({ reason: "Unable to load suggested lesson" });
    });
  }, [classroomId, sessionId]);

  const refreshSuggestion = async () => {
    if (!classroomId || !sessionId) return;
    const next = await getSuggestedLesson(classroomId, sessionId);
    setSuggested(next);
  };

  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Classroom Delivery Surface</h1>
      {!classroomId || !sessionId ? (
        <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
          Open this surface via `/classrooms/{'{classroomId}'}/sessions/{'{sessionId}'}` to load lesson suggestions.
        </p>
      ) : null}
      <SuggestedLessonPanel
        title={suggested.title}
        reason={suggested.reason}
        onUseSuggested={async () => {
          if (!suggested.lesson_id || !classroomId || !sessionId) return;
          await recordSessionCoverage(classroomId, sessionId, {
            lesson_id: suggested.lesson_id,
            selection_type: "suggested",
            coverage_status: "completed",
          });
          await refreshSuggestion();
        }}
        onChange={async () => {
          if (!suggested.lesson_id || !classroomId || !sessionId) return;
          await recordSessionCoverage(classroomId, sessionId, {
            lesson_id: suggested.lesson_id,
            selection_type: "override",
            coverage_status: "partial",
          });
        }}
        onSkip={async () => {
          if (!suggested.lesson_id || !classroomId || !sessionId) return;
          await recordSessionCoverage(classroomId, sessionId, {
            lesson_id: suggested.lesson_id,
            selection_type: "skip",
            coverage_status: "skipped",
          });
          await refreshSuggestion();
        }}
        onAddResource={async () => {
          if (!classroomId || !sessionId) return;
          await recordSessionCoverage(classroomId, sessionId, {
            selection_type: "added_resource",
            coverage_status: "completed",
            notes: "Instructor added additional resource during session",
          });
        }}
      />
      <SessionCoverageForm
        onSubmit={async ({ coverage_status, notes }) => {
          if (!classroomId || !sessionId || !suggested.lesson_id) return;
          await recordSessionCoverage(classroomId, sessionId, {
            lesson_id: suggested.lesson_id,
            coverage_status,
            notes,
          });
        }}
      />
      <ProgressView
        currentLesson={1}
        completedLessons={0}
        pendingLessons={0}
        skippedLessons={0}
        milestones={[{ title: "Foundations milestone", completed: false }]}
      />
    </div>
  );
}
