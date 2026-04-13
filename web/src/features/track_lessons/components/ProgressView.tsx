type ProgressViewProps = {
  currentLesson: number;
  completedLessons: number;
  pendingLessons: number;
  skippedLessons: number;
  milestones: Array<{ title: string; completed: boolean }>;
};

export function ProgressView({
  currentLesson,
  completedLessons,
  pendingLessons,
  skippedLessons,
  milestones,
}: ProgressViewProps) {
  return (
    <section className="ui-card" style={{ padding: 16, display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0 }}>Progress</h3>
      <p style={{ margin: 0 }}>Current lesson: {currentLesson}</p>
      <p style={{ margin: 0 }}>Completed: {completedLessons}</p>
      <p style={{ margin: 0 }}>Pending: {pendingLessons}</p>
      <p style={{ margin: 0 }}>Skipped: {skippedLessons}</p>
      <div style={{ display: "grid", gap: 6 }}>
        {milestones.map((milestone) => (
          <div key={milestone.title} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>{milestone.title}</span>
            <span>{milestone.completed ? "Unlocked" : "Locked"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
