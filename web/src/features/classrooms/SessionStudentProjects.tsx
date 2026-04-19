import { useCallback, useEffect, useState } from "react";
import { Download, FolderOpen, RefreshCw, User } from "lucide-react";
import { listSessionProjects, type StudentLabProject } from "../../lib/api/labs";

interface Props {
  sessionId: string;
  classroomId?: string;
}

const LAB_TYPE_LABELS: Record<string, string> = {
  "circuit-maker": "Circuit Lab",
  "robotics-lab": "Robo Maker",
  "python-game": "Python Game Lab",
  "game-maker": "Game Maker Lab",
  "design-maker": "3D Design Lab",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function SessionStudentProjects({ sessionId, classroomId }: Props) {
  const [projects, setProjects] = useState<StudentLabProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSessionProjects(sessionId, {
        classroomId,
        limit: 200,
      });
      setProjects(data);
    } catch (err) {
      console.warn("[SessionStudentProjects] fetch failed:", err);
      setError("Failed to load student projects");
    } finally {
      setLoading(false);
    }
  }, [sessionId, classroomId]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const grouped = projects.reduce<Record<string, StudentLabProject[]>>(
    (acc, p) => {
      const sid = p.student_id;
      if (!acc[sid]) acc[sid] = [];
      acc[sid].push(p);
      return acc;
    },
    {},
  );

  return (
    <div className="session-projects">
      <div className="session-projects__header">
        <h4 className="session-projects__title">
          <FolderOpen size={16} />
          Student Projects
          {!loading && (
            <span className="session-projects__count">
              {projects.length} project{projects.length !== 1 ? "s" : ""}
            </span>
          )}
        </h4>
        <button
          type="button"
          className="classroom-list__create-btn classroom-list__create-btn--ghost"
          onClick={() => void loadProjects()}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          Refresh
        </button>
      </div>

      {error && <p className="session-projects__error">{error}</p>}

      {!loading && projects.length === 0 && !error && (
        <div className="session-projects__empty">
          <FolderOpen size={32} />
          <p>No student projects saved for this session yet.</p>
          <p className="session-projects__empty-hint">
            Projects appear here when students save their work during the session.
          </p>
        </div>
      )}

      {Object.entries(grouped).map(([studentId, studentProjects]) => (
        <div key={studentId} className="session-projects__student-group">
          <div className="session-projects__student-header">
            <User size={14} />
            <span className="session-projects__student-name">
              {(studentProjects[0]?.metadata as any)?.project_name
                ? `Student`
                : "Student"}
            </span>
            <span className="session-projects__student-id">{studentId.slice(0, 8)}</span>
            <span className="session-projects__student-badge">
              {studentProjects.length} project{studentProjects.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="session-projects__list">
            {studentProjects.map((proj) => {
              const labType =
                (proj.metadata as any)?.lab_type ?? "unknown";
              return (
                <div key={proj.id} className="session-projects__card">
                  <div className="session-projects__card-info">
                    <span className="session-projects__card-title">
                      {proj.title}
                    </span>
                    <span className="session-projects__card-meta">
                      <span className="session-projects__lab-badge">
                        {LAB_TYPE_LABELS[labType] ?? labType}
                      </span>
                      <span>{formatDate(proj.updated_at)}</span>
                      <span>rev {proj.revision}</span>
                    </span>
                  </div>
                  {proj.blob_url && (
                    <a
                      href={proj.blob_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="session-projects__download-btn"
                      title="Download project file"
                    >
                      <Download size={14} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
