type LessonCardProps = {
  title: string;
  summary?: string | null;
  durationMinutes?: number | null;
  subject?: string | null;
  grade?: string | null;
  ownerType?: string | null;
  createdByLabel?: string | null;
  onPreview?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onAssign?: () => void;
};

export function LessonCard({
  title,
  summary,
  durationMinutes,
  subject,
  grade,
  ownerType,
  createdByLabel,
  onPreview,
  onEdit,
  onDuplicate,
  onAssign,
}: LessonCardProps) {
  const ownerLabel = ownerType === "stemplitude" ? "Platform" : ownerType ?? "Tenant";
  const showCreator = ownerType !== "stemplitude" && Boolean(createdByLabel);
  return (
    <article className="track-lessons-card">
      <div className="track-lessons-card-head">
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span className="track-lessons-pill">{ownerLabel}</span>
      </div>
      {summary ? <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>{summary}</p> : null}
      {showCreator ? <p className="track-lessons-help">By {createdByLabel}</p> : null}
      <p className="track-lessons-card-meta">
        {durationMinutes ? `${durationMinutes} min` : "Duration n/a"} · {subject ?? "Any subject"} · {grade ?? "Any grade"}
      </p>
      <div className="track-lessons-card-actions">
        <button type="button" className="kid-button kid-button--ghost" onClick={onPreview}>Preview</button>
        <button type="button" className="kid-button kid-button--ghost" onClick={onEdit}>Edit</button>
        <button type="button" className="kid-button kid-button--ghost" onClick={onDuplicate}>Duplicate</button>
        <button type="button" className="kid-button" onClick={onAssign}>Assign to class</button>
      </div>
    </article>
  );
}
