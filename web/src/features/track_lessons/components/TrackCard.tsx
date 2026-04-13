type TrackCardProps = {
  title: string;
  summary?: string | null;
  lessonCount: number;
  ownerType?: string | null;
  onPreview?: () => void;
  onDuplicate?: () => void;
  onAssign?: () => void;
  onEdit?: () => void;
};

export function TrackCard({
  title,
  summary,
  lessonCount,
  ownerType,
  onPreview,
  onDuplicate,
  onAssign,
  onEdit,
}: TrackCardProps) {
  const ownerLabel = ownerType === "stemplitude" ? "Platform" : ownerType ?? "Tenant";
  return (
    <article className="track-lessons-card">
      <div className="track-lessons-card-head">
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span className="track-lessons-pill">{ownerLabel}</span>
      </div>
      {summary ? <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>{summary}</p> : null}
      <p className="track-lessons-card-meta">{lessonCount} lessons</p>
      <div className="track-lessons-card-actions">
        <button type="button" className="kid-button kid-button--ghost" onClick={onPreview}>Preview</button>
        <button type="button" className="kid-button kid-button--ghost" onClick={onEdit}>Edit</button>
        <button type="button" className="kid-button kid-button--ghost" onClick={onDuplicate}>Duplicate</button>
        <button type="button" className="kid-button" onClick={onAssign}>Assign</button>
      </div>
    </article>
  );
}
