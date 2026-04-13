import { useMemo, useRef, useState } from "react";

import type { TrackPayload } from "../../../lib/api/trackLessons";
import { KidCheckbox, KidDialog, KidDropdown } from "../../../components/ui";

const LESSON_PICKER_PAGE_SIZE = 20;

const GRADE_OPTIONS = [
  "",
  "K",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
] as const;

type TrackBuilderProps = {
  availableLessons: Array<{ id: string; title: string }>;
  onSubmit: (payload: TrackPayload) => Promise<void> | void;
  formTitle?: string;
  onCancel?: () => void;
};

export function TrackBuilder({ availableLessons, onSubmit, formTitle = "Track builder", onCancel }: TrackBuilderProps) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);
  const [lessonPickerOpen, setLessonPickerOpen] = useState(false);
  const [lessonSearchInput, setLessonSearchInput] = useState("");
  const [lessonSearchQuery, setLessonSearchQuery] = useState("");
  const [pendingLessonIds, setPendingLessonIds] = useState<string[]>([]);
  const [visibleLessonCount, setVisibleLessonCount] = useState(LESSON_PICKER_PAGE_SIZE);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const lessonListRef = useRef<HTMLDivElement | null>(null);

  const orderedLessons = useMemo(
    () => selectedLessonIds.map((lessonId, index) => ({ lesson_id: lessonId, order_index: index })),
    [selectedLessonIds],
  );
  const selectableLessons = useMemo(() => {
    const needle = lessonSearchQuery.trim().toLowerCase();
    return availableLessons
      .filter((lesson) => !selectedLessonIds.includes(lesson.id))
      .filter((lesson) => {
        if (!needle) return true;
        return lesson.title.toLowerCase().includes(needle);
      });
  }, [availableLessons, lessonSearchQuery, selectedLessonIds]);
  const visibleLessons = useMemo(
    () => selectableLessons.slice(0, visibleLessonCount),
    [selectableLessons, visibleLessonCount],
  );
  const hasMoreLessons = visibleLessonCount < selectableLessons.length;

  const loadMoreLessons = () => {
    if (!hasMoreLessons) return;
    setVisibleLessonCount((prev) => Math.min(prev + LESSON_PICKER_PAGE_SIZE, selectableLessons.length));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit({
      title,
      summary,
      subject,
      grade: grade || undefined,
      lessons: orderedLessons,
      milestones: milestoneTitle
        ? [{ title: milestoneTitle, order_index: 0, rules: [{ rule_type: "n_lessons", threshold: Math.max(1, orderedLessons.length) }] }]
        : [],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="track-lessons-form">
      <h3>{formTitle}</h3>
      <label className="ui-form-field">
        <span>Title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label className="ui-form-field">
        <span>Summary</span>
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} />
      </label>
      <div className="track-lessons-inline-grid">
        <label className="ui-form-field">
          <span>Subject</span>
          <input value={subject} onChange={(event) => setSubject(event.target.value)} />
        </label>
        <label className="ui-form-field">
          <span>Grade (optional)</span>
          <KidDropdown
            value={grade}
            onChange={setGrade}
            ariaLabel="Track grade"
            fullWidth
            options={GRADE_OPTIONS.map((option) => ({
              value: option,
              label: option ? `Grade ${option}` : "Any grade",
            }))}
          />
        </label>
      </div>
      <label className="ui-form-field">
        <span>Add lessons</span>
        <button
          type="button"
          className="kid-button kid-button--ghost"
          onClick={() => {
            setLessonPickerOpen(true);
            setLessonSearchInput("");
            setLessonSearchQuery("");
            setPendingLessonIds([]);
            setVisibleLessonCount(LESSON_PICKER_PAGE_SIZE);
          }}
        >
          Open lesson picker
        </button>
        <p className="track-lessons-help">Search and select one or more lessons in a dialog.</p>
      </label>
      <div style={{ display: "grid", gap: 6 }}>
        {selectedLessonIds.map((lessonId, index) => {
          const lesson = availableLessons.find((item) => item.id === lessonId);
          return (
            <div key={lessonId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ minWidth: 24 }}>{index + 1}.</span>
              <span style={{ flex: 1 }}>{lesson?.title ?? lessonId}</span>
              <button
                type="button"
                className="kid-button kid-button--ghost"
                onClick={() => setSelectedLessonIds((prev) => prev.filter((id) => id !== lessonId))}
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
      <label className="ui-form-field">
        <span>Milestone title (optional)</span>
        <input value={milestoneTitle} onChange={(event) => setMilestoneTitle(event.target.value)} />
      </label>
      <div className="track-lessons-form-actions">
        <button
          type="button"
          className="track-lessons-cancel-button"
          onClick={() => onCancel?.()}
        >
          Cancel
        </button>
        <button type="submit" className="kid-button">Save track</button>
      </div>
      <KidDialog
        isOpen={lessonPickerOpen}
        onClose={() => setLessonPickerOpen(false)}
        title="Add lessons to track"
        showActions={false}
      >
        <div className="track-lessons-lesson-picker">
          <label className="ui-form-field">
            <span>Search lessons</span>
            <div className="track-lessons-lesson-picker__search">
              <input
                value={lessonSearchInput}
                onChange={(event) => setLessonSearchInput(event.target.value)}
                placeholder="Search by lesson title"
              />
              <button
                type="button"
                className="kid-button kid-button--ghost"
                onClick={() => {
                  setLessonSearchQuery(lessonSearchInput);
                  setVisibleLessonCount(LESSON_PICKER_PAGE_SIZE);
                  lessonListRef.current?.scrollTo({ top: 0 });
                }}
              >
                Search
              </button>
            </div>
          </label>
          <div
            ref={lessonListRef}
            className="track-lessons-lesson-picker__list"
            onScroll={(event) => {
              const target = event.currentTarget;
              if (target.scrollTop + target.clientHeight >= target.scrollHeight - 24) {
                loadMoreLessons();
              }
            }}
          >
            {selectableLessons.length === 0 ? (
              <div className="track-lessons-lesson-picker__empty">
                <p className="track-lessons-help">No lessons match your search or all lessons are already in this track.</p>
              </div>
            ) : (
              visibleLessons.map((lesson) => {
                const selected = pendingLessonIds.includes(lesson.id);
                return (
                  <label
                    key={lesson.id}
                    className={`track-lessons-lesson-picker__item ${selected ? "track-lessons-lesson-picker__item--selected" : ""}`}
                  >
                    <KidCheckbox
                      checked={selected}
                      compact
                      ariaLabel={`Select lesson ${lesson.title}`}
                      onChange={() =>
                        setPendingLessonIds((prev) =>
                          prev.includes(lesson.id) ? prev.filter((id) => id !== lesson.id) : [...prev, lesson.id],
                        )
                      }
                    />
                    <span className="track-lessons-lesson-picker__title">{lesson.title}</span>
                  </label>
                );
              })
            )}
            {hasMoreLessons ? (
              <button
                type="button"
                className="kid-button kid-button--ghost"
                onClick={loadMoreLessons}
              >
                Load more
              </button>
            ) : null}
          </div>
          <p className="track-lessons-help">
            Showing {visibleLessons.length} of {selectableLessons.length} matching lessons.
          </p>
          <div className="track-lessons-actions">
            <button
              type="button"
              className="kid-button kid-button--ghost"
              onClick={() => setLessonPickerOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="kid-button"
              disabled={pendingLessonIds.length === 0}
              onClick={() => {
                if (pendingLessonIds.length === 0) return;
                setSelectedLessonIds((prev) => [...prev, ...pendingLessonIds.filter((id) => !prev.includes(id))]);
                setPendingLessonIds([]);
                setLessonSearchInput("");
                setLessonSearchQuery("");
                setVisibleLessonCount(LESSON_PICKER_PAGE_SIZE);
                setLessonPickerOpen(false);
              }}
            >
              Add selected ({pendingLessonIds.length})
            </button>
          </div>
        </div>
      </KidDialog>
    </form>
  );
}
