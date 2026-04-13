import { ArrowLeft, Settings } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { RoboticsWorkspaceProvider, useRoboticsWorkspaceContext } from "../features/robotics_lab/RoboticsWorkspaceContext";
import "./RoboticsLab.css";

function LayoutShell() {
  const { exitLab, fallbackExitPath, persistenceStatus, projectId, projectRevision } = useRoboticsWorkspaceContext();
  return (
    <div className="robotics-lab-page">
      <header className="robotics-lab-topbar">
        <div className="robotics-split-nav">
          <NavLink to="/playground/robotics/code" className="robotics-split-link">
            Code Editor
          </NavLink>
          <NavLink to="/playground/robotics/run" className="robotics-split-link">
            Run Simulator
          </NavLink>
          <NavLink to="/playground/robotics/sim" className="robotics-split-link">
            Simulation Editor
          </NavLink>
        </div>
        <div className="robotics-lab-status">
          <span>{persistenceStatus}</span>
          <span>{projectId ? `${projectId.slice(0, 8)}...` : "No project"}</span>
          <span>r{projectRevision}</span>
        </div>
        <button
          className="robotics-lab-btn robotics-lab-btn--icon"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("robotics:openViewportSettings"));
          }}
        >
          <Settings size={14} /> Settings
        </button>
        <Link
          to={fallbackExitPath}
          onClick={(event) => {
            event.preventDefault();
            exitLab();
          }}
          className="robotics-lab-exit"
        >
          <ArrowLeft size={16} /> Exit Lab
        </Link>
      </header>
      <Outlet />
    </div>
  );
}

export default function RoboticsLabLayout() {
  return (
    <RoboticsWorkspaceProvider>
      <LayoutShell />
    </RoboticsWorkspaceProvider>
  );
}
