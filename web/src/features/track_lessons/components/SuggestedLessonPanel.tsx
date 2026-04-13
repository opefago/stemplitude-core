type SuggestedLessonPanelProps = {
  title?: string | null;
  reason: string;
  onUseSuggested: () => void;
  onChange: () => void;
  onSkip: () => void;
  onAddResource: () => void;
};

export function SuggestedLessonPanel({
  title,
  reason,
  onUseSuggested,
  onChange,
  onSkip,
  onAddResource,
}: SuggestedLessonPanelProps) {
  return (
    <section className="ui-card" style={{ padding: 16, display: "grid", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
        Next suggested lesson
      </p>
      <h3 style={{ margin: 0 }}>{title ?? "No suggestion available"}</h3>
      <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>{reason}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="ui-btn ui-btn--primary" onClick={onUseSuggested}>Use suggested</button>
        <button type="button" className="ui-btn ui-btn--ghost" onClick={onChange}>Change</button>
        <button type="button" className="ui-btn ui-btn--ghost" onClick={onSkip}>Skip</button>
        <button type="button" className="ui-btn ui-btn--ghost" onClick={onAddResource}>Add resource</button>
      </div>
    </section>
  );
}
