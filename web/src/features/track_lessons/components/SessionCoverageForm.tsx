import { useState } from "react";

type SessionCoverageFormProps = {
  onSubmit: (payload: { coverage_status: "completed" | "partial" | "skipped"; notes?: string }) => Promise<void> | void;
};

export function SessionCoverageForm({ onSubmit }: SessionCoverageFormProps) {
  const [coverageStatus, setCoverageStatus] = useState<"completed" | "partial" | "skipped">("completed");
  const [notes, setNotes] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit({ coverage_status: coverageStatus, notes });
  };

  return (
    <form onSubmit={submit} className="ui-card" style={{ padding: 16, display: "grid", gap: 8 }}>
      <h3 style={{ margin: 0 }}>Record coverage</h3>
      <label className="ui-form-field">
        <span>Status</span>
        <select value={coverageStatus} onChange={(event) => setCoverageStatus(event.target.value as "completed" | "partial" | "skipped")}>
          <option value="completed">completed</option>
          <option value="partial">partial</option>
          <option value="skipped">skipped</option>
        </select>
      </label>
      <label className="ui-form-field">
        <span>Notes</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
      </label>
      <button type="submit" className="ui-btn ui-btn--primary">Save coverage</button>
    </form>
  );
}
