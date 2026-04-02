import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FolderOpen } from "lucide-react";
import { useChildContextStudentId } from "../../lib/childContext";
import {
  migrateLegacyLabProjectsIfNeeded,
  readLabProjectsArray,
} from "../../lib/learnerLabStorage";
import { useAuth } from "../../providers/AuthProvider";
import "../dashboard/dashboard-bento.css";
import "./student-projects.css";

type LabProject = {
  id: string;
  name: string;
  updatedAt?: string;
  createdAt?: string;
  labId: string;
  labLabel: string;
  openPath: string;
};

type LabConfig = {
  id: string;
  label: string;
  path: string;
  storageKey: string;
  projectMapper: (raw: any) => { id: string; name: string; updatedAt?: string; createdAt?: string };
};

const LAB_CONFIGS: LabConfig[] = [
  {
    id: "circuit-maker",
    label: "Circuit Maker",
    path: "/playground/circuit-maker",
    storageKey: "stemplitude_circuitmaker_projects",
    projectMapper: (raw) => ({
      id: String(raw?.id ?? crypto.randomUUID()),
      name: String(raw?.name ?? "Untitled Circuit"),
      updatedAt: raw?.updatedAt ?? undefined,
      createdAt: raw?.createdAt ?? undefined,
    }),
  },
  {
    id: "micro-maker",
    label: "Micro Maker",
    path: "/playground/micro-maker",
    storageKey: "stemplitude_micromaker_projects",
    projectMapper: (raw) => ({
      id: String(raw?.id ?? crypto.randomUUID()),
      name: String(raw?.name ?? "Untitled Project"),
      updatedAt: raw?.updatedAt ?? undefined,
      createdAt: raw?.createdAt ?? undefined,
    }),
  },
  {
    id: "python-game",
    label: "Python Game Maker",
    path: "/playground/python-game",
    storageKey: "stemplitude_pygame_projects",
    projectMapper: (raw) => ({
      id: String(raw?.id ?? crypto.randomUUID()),
      name: String(raw?.name ?? "Untitled Project"),
      updatedAt: raw?.updatedAt ?? undefined,
      createdAt: raw?.createdAt ?? undefined,
    }),
  },
  {
    id: "game-maker",
    label: "Game Maker",
    path: "/playground/game-maker",
    storageKey: "stemplitude_gamemaker_projects",
    projectMapper: (raw) => ({
      id: String(raw?.id ?? crypto.randomUUID()),
      name: String(raw?.name ?? "Untitled Project"),
      updatedAt: raw?.updatedAt ?? undefined,
      createdAt: raw?.createdAt ?? undefined,
    }),
  },
  {
    id: "design-maker",
    label: "Design Maker",
    path: "/playground/design-maker",
    storageKey: "dml-projects-meta",
    projectMapper: (raw) => ({
      id: String(raw?.id ?? crypto.randomUUID()),
      name: String(raw?.name ?? "Untitled Project"),
      updatedAt: raw?.updatedAt ?? undefined,
      createdAt: raw?.createdAt ?? undefined,
    }),
  },
];

function formatProjectTime(project: LabProject): string {
  const stamp = project.updatedAt || project.createdAt;
  if (!stamp) return "Saved recently";
  const time = new Date(stamp).getTime();
  if (Number.isNaN(time)) return "Saved recently";
  return new Date(time).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function StudentProjectsPage() {
  const { user, subType } = useAuth();
  const childCtx = useChildContextStudentId();
  const [labFilter, setLabFilter] = useState<string>("all");
  const allProjects = useMemo<LabProject[]>(() => {
    const projects: LabProject[] = [];
    LAB_CONFIGS.forEach((lab) => {
      migrateLegacyLabProjectsIfNeeded(lab.storageKey);
      const rows = readLabProjectsArray(lab.storageKey);
      rows.forEach((row) => {
        const mapped = lab.projectMapper(row);
        projects.push({
          ...mapped,
          labId: lab.id,
          labLabel: lab.label,
          openPath: lab.path,
        });
      });
    });
    return projects.sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
      return bTime - aTime;
    });
  }, [childCtx, user?.id, subType]);

  const visibleProjects =
    labFilter === "all" ? allProjects : allProjects.filter((project) => project.labId === labFilter);

  return (
    <div className="dashboard-bento student-projects-page" role="main" aria-label="My projects">
      <header className="dashboard-bento__header">
        <h1 className="dashboard-bento__greeting">My Projects</h1>
        <p className="dashboard-bento__subtitle">
          All projects you have saved, filterable by lab.
        </p>
      </header>

      <div className="dashboard-bento__card dashboard-bento__card--purple student-projects-page__filters-card">
        <div className="student-projects-page__filters" role="tablist" aria-label="Filter projects by lab">
          <button
            type="button"
            className={`student-projects-page__filter${labFilter === "all" ? " active" : ""}`}
            onClick={() => setLabFilter("all")}
          >
            All Labs
          </button>
          {LAB_CONFIGS.map((lab) => (
            <button
              key={lab.id}
              type="button"
              className={`student-projects-page__filter${labFilter === lab.id ? " active" : ""}`}
              onClick={() => setLabFilter(lab.id)}
            >
              {lab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dashboard-bento__card dashboard-bento__card--blue student-projects-page__list-card">
        <div className="student-projects-page__list-header">
          <div className="dashboard-bento__card-icon">
            <FolderOpen size={20} aria-hidden />
          </div>
          <h2 className="dashboard-bento__card-title">
            {labFilter === "all"
              ? `Saved Projects (${visibleProjects.length})`
              : `${LAB_CONFIGS.find((lab) => lab.id === labFilter)?.label ?? "Lab"} Projects (${visibleProjects.length})`}
          </h2>
        </div>
        {visibleProjects.length === 0 ? (
          <div className="student-projects-page__empty">
            {allProjects.length === 0 ? (
              <>
                <p className="dashboard-bento__card-desc">
                  You have not saved any projects yet. Open a lab and press save to start your collection.
                </p>
                <Link to="/app/labs" className="dashboard-bento__card-action">
                  Open labs <ArrowRight size={16} aria-hidden />
                </Link>
              </>
            ) : (
              <p className="dashboard-bento__card-desc">
                No projects in this lab yet. Try another filter or create a project in this lab.
              </p>
            )}
          </div>
        ) : (
          <ul className="student-projects-page__list" role="list">
            {visibleProjects.map((project) => (
              <li key={`${project.labId}-${project.id}`} className="student-projects-page__row" role="listitem">
                <div className="student-projects-page__meta">
                  <span className="student-projects-page__name">{project.name}</span>
                  <span className="student-projects-page__lab">{project.labLabel} • {formatProjectTime(project)}</span>
                </div>
                <Link
                  to={project.openPath}
                  className="student-projects-page__open"
                  onClick={() => {
                    localStorage.setItem("student:lastProjectPath", project.openPath);
                  }}
                >
                  Open lab <ArrowRight size={14} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
