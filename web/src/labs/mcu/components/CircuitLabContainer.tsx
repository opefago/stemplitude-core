import React, { useEffect, useRef, useState } from "react";
import { useChildContextStudentId } from "../../../lib/childContext";
import {
  migrateLegacyLabProjectsIfNeeded,
  readLabProjectsArray,
  writeLabLastOpenedAt,
  writeLabProjectsArray,
} from "../../../lib/learnerLabStorage";
import { useLabPersistence } from "../../../features/labs/useLabPersistence";
import { useAuth } from "../../../providers/AuthProvider";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { TippyAnchor } from "../../../components/ui/TippyAnchor";
import "tippy.js/dist/tippy.css";
import "tippy.js/animations/shift-away.css";
import { Application } from "pixi.js";
import { GameManager } from "../lib/shared/GameManager";
import {
  CircuitScene,
  type CircuitSceneSnapshot,
} from "../lib/circuit/CircuitScene";
import { emitLabEvent, emitLabEventThrottled } from "../../../lib/api/gamification";
import {
  Zap,
  Play,
  Square,
  Activity,
  Undo2,
  Redo2,
  Save,
  FolderOpen,
  HelpCircle,
  Trash2,
  X,
} from "lucide-react";

const tipProps = {
  theme: "custom" as const,
  animation: "shift-away" as const,
  arrow: true,
  delay: [400, 0] as [number, number],
  duration: [200, 150] as [number, number],
};

const CM_PROJECTS_BASE_KEY = "stemplitude_circuitmaker_projects";

const loadProjectsFromStorage = () => readLabProjectsArray(CM_PROJECTS_BASE_KEY);

type Props = {
  exitPath?: string;
  onExit?: () => void;
  ydoc?: Y.Doc;
  yjsProvider?: WebsocketProvider;
};

export const CircuitLabContainer: React.FC<Props> = ({
  exitPath = "/playground",
  onExit,
  ydoc,
  yjsProvider,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const gameManagerRef = useRef<GameManager | null>(null);
  const sceneRef = useRef<CircuitScene | null>(null);
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [projectId, setProjectId] = useState(() => crypto.randomUUID());
  const [projectName, setProjectName] = useState("Untitled Circuit");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  const childCtx = useChildContextStudentId();
  const { user } = useAuth();
  const lastSnapshotHashRef = useRef<string>("");

  useEffect(() => {
    migrateLegacyLabProjectsIfNeeded(CM_PROJECTS_BASE_KEY);
    setSavedProjects(loadProjectsFromStorage() as any[]);
  }, [childCtx, user?.id, user?.subType]);

  const persistence = useLabPersistence({
    labId: "circuit-maker",
    localStorageKey: CM_PROJECTS_BASE_KEY,
    title: projectName,
    autosaveMs: 12000,
    debounceMs: 900,
    enabled: Boolean(user?.id),
    getPayload: () => {
      const snapshot =
        (sceneRef.current as CircuitScene | null)?.exportSnapshot?.() ?? null;
      if (!snapshot) return null;
      const raw = JSON.stringify(snapshot);
      return {
        blob: new Blob([raw], { type: "application/json" }),
        filename: `${projectName || "circuit-project"}.json`,
        metadata: {
          lab_type: "circuit-maker",
          schema: "circuit-scene-snapshot-v2",
          project_name: projectName,
        },
        localDraft: {
          snapshot,
          projectName,
        },
      };
    },
  });

  useEffect(() => {
    writeLabLastOpenedAt("circuit-maker");
  }, []);

  const handleStartStop = () => {
    if (sceneRef.current) {
      (sceneRef.current as any).toggleSimulation?.();
      setIsSimulationRunning((r) => !r);
      const outputs =
        (sceneRef.current as any).getGamificationOutputSummary?.() ?? {};
      emitLabEventThrottled({
        lab_id: "circuit-maker",
        lab_type: "circuit-maker",
        event_type: "CIRCUIT_COMPLETE",
        context: {
          action: "toggle_simulation",
          any_component: "any",
          outputs,
        },
      }, 2500);
    }
  };

  const handleAnalyze = () => {
    if (sceneRef.current) {
      (sceneRef.current as any).runDCAnalysis?.();
      const outputs =
        (sceneRef.current as any).getGamificationOutputSummary?.() ?? {};
      void emitLabEvent({
        lab_id: "circuit-maker",
        lab_type: "circuit-maker",
        event_type: "CIRCUIT_COMPLETE",
        context: {
          action: "dc_analysis",
          any_component: "any",
          outputs,
        },
      });
    }
  };

  const handleUndo = () => {
    // TODO: wire up when CircuitScene supports undo
    console.log("Undo");
  };

  const handleRedo = () => {
    // TODO: wire up when CircuitScene supports redo
    console.log("Redo");
  };

  const handleClear = () => {
    if (sceneRef.current) {
      sceneRef.current.clearScene();
      void emitLabEvent({
        lab_id: "circuit-maker",
        lab_type: "circuit-maker",
        event_type: "OBJECT_ERROR",
        context: { action: "clear_scene" },
      });
    }
  };

  const handleSaveProject = () => {
    const now = new Date().toISOString();
    const projects = loadProjectsFromStorage();
    const idx = projects.findIndex((p: any) => p.id === projectId);
    const project = {
      id: projectId,
      name: projectName,
      updatedAt: now,
      createdAt: idx >= 0 ? projects[idx].createdAt : now,
      snapshot:
        (sceneRef.current as CircuitScene | null)?.exportSnapshot?.() ?? null,
    };
    if (idx >= 0) projects[idx] = project;
    else projects.unshift(project);
    writeLabProjectsArray(CM_PROJECTS_BASE_KEY, projects);
    setSavedProjects(projects);
    void persistence.saveCheckpoint();
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus(null), 1500);
  };

  const handleLoadProject = (p: any) => {
    setProjectId(p.id);
    setProjectName(p.name);
    if (sceneRef.current) {
      const snapshot = p.snapshot as CircuitSceneSnapshot | null | undefined;
      if (snapshot) {
        sceneRef.current.importSnapshot(snapshot);
      } else {
        sceneRef.current.clearScene();
      }
      setIsSimulationRunning(false);
    }
    persistence.setProjectIdentity(p.id ?? null);
    setShowProjects(false);
  };

  const handleDeleteProject = (id: string) => {
    const projects = loadProjectsFromStorage().filter(
      (p: any) => p.id !== id
    );
    writeLabProjectsArray(CM_PROJECTS_BASE_KEY, projects);
    setSavedProjects(projects);
  };

  const handleNewProject = () => {
    setProjectId(crypto.randomUUID());
    setProjectName("Untitled Circuit");
    if (sceneRef.current) {
      sceneRef.current.clearScene();
    }
    setIsSimulationRunning(false);
    setShowProjects(false);
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    const initApp = async () => {
      const app = new Application();
      await app.init({
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0xffffff,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      appRef.current = app;
      canvasRef.current!.appendChild(app.canvas);

      const gameManager = GameManager.create(app);
      gameManagerRef.current = gameManager;

      const circuitScene = new CircuitScene();
      sceneRef.current = circuitScene;

      gameManager.registerScene("circuit", circuitScene);
      gameManager.switchToScene("circuit");
    };

    initApp();

    return () => {
      if (sceneRef.current) {
        sceneRef.current.destroy();
      }
      if (gameManagerRef.current) {
        gameManagerRef.current.destroy();
      }
      if (appRef.current) {
        appRef.current.destroy(true);
      }
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const snapshot = sceneRef.current?.exportSnapshot?.();
      if (!snapshot) return;
      const hash = JSON.stringify(snapshot);
      if (hash !== lastSnapshotHashRef.current) {
        lastSnapshotHashRef.current = hash;
        persistence.markDirty();
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [persistence]);

  const btnStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 12px",
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#e6edf3",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s ease",
    whiteSpace: "nowrap",
  };

  const sep = (
    <div
      style={{
        width: 1,
        height: 20,
        background: "#30363d",
        margin: "0 4px",
      }}
    />
  );

  return (
    <div
      className="circuit-lab-container"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        zIndex: 1000,
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 1rem",
          background: "#161b22",
          borderBottom: "1px solid #30363d",
          gap: 12,
          flexShrink: 0,
          height: 48,
          zIndex: 1001,
        }}
      >
        {/* Left: Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <Zap size={20} color="#58a6ff" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#58a6ff" }}>
            Circuit Maker
          </span>
        </div>

        {/* Center: Project + Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            justifyContent: "center",
          }}
        >
          {/* Project name */}
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            spellCheck={false}
            maxLength={40}
            placeholder="Project name"
            style={{
              padding: "5px 10px",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid #30363d",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "#e6edf3",
              minWidth: 140,
              maxWidth: 220,
              outline: "none",
            }}
          />
          <TippyAnchor content="Save project (Ctrl+S)" {...tipProps}>
            <button onClick={handleSaveProject} style={btnStyle}>
              <Save size={14} /> {saveStatus ? "Saved!" : "Save"}
            </button>
          </TippyAnchor>
          <TippyAnchor content="Open a saved project" {...tipProps}>
            <button
              onClick={() => {
                setSavedProjects(loadProjectsFromStorage());
                setShowProjects(true);
              }}
              style={btnStyle}
            >
              <FolderOpen size={14} /> Open
            </button>
          </TippyAnchor>

          {sep}

          {/* Undo / Redo */}
          <TippyAnchor content="Undo last action (Ctrl+Z)" {...tipProps}>
            <button onClick={handleUndo} style={btnStyle}>
              <Undo2 size={14} />
            </button>
          </TippyAnchor>
          <TippyAnchor content="Redo last action (Ctrl+Y)" {...tipProps}>
            <button onClick={handleRedo} style={btnStyle}>
              <Redo2 size={14} />
            </button>
          </TippyAnchor>

          {sep}

          {/* Simulation */}
          <TippyAnchor
            content={
              isSimulationRunning
                ? "Stop time-domain simulation"
                : "Start time-domain simulation"
            }
            {...tipProps}
          >
            <button
              onClick={handleStartStop}
              style={{
                ...btnStyle,
                background: isSimulationRunning
                  ? "rgba(231,76,60,0.8)"
                  : "#238636",
                borderColor: isSimulationRunning ? "#e74c3c" : "#2ea043",
                color: "#fff",
              }}
            >
              {isSimulationRunning ? (
                <Square size={14} />
              ) : (
                <Play size={14} />
              )}
              {isSimulationRunning ? "Stop" : "Start"}
            </button>
          </TippyAnchor>

          <TippyAnchor content="Run DC circuit analysis" {...tipProps}>
            <button
              onClick={handleAnalyze}
              style={{
                ...btnStyle,
                background: "rgba(155,89,182,0.7)",
                borderColor: "#9b59b6",
                color: "#fff",
              }}
            >
              <Activity size={14} /> Analyze
            </button>
          </TippyAnchor>

          {sep}

          <TippyAnchor content="Clear all components from canvas" {...tipProps}>
            <button onClick={handleClear} style={btnStyle}>
              <Trash2 size={14} /> Clear
            </button>
          </TippyAnchor>

          <TippyAnchor content="Quick help & keyboard shortcuts" {...tipProps}>
            <button onClick={() => setShowHelp(!showHelp)} style={btnStyle}>
              <HelpCircle size={14} /> Help
            </button>
          </TippyAnchor>
        </div>

        {/* Right: Exit */}
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}
        >
          <TippyAnchor content="Exit lab" {...tipProps}>
            <button
              type="button"
              onClick={() => {
                if (onExit) {
                  onExit();
                  return;
                }
                window.location.assign(exitPath);
              }}
              style={{
                ...btnStyle,
                background: "rgba(180,80,40,0.15)",
                borderColor: "#d4a574",
              }}
            >
              <X size={14} /> Exit
            </button>
          </TippyAnchor>
        </div>
      </div>

      {/* Help Panel */}
      {showHelp && (
        <div
          style={{
            background: "#1c2128",
            borderBottom: "1px solid #30363d",
            padding: "10px 16px",
            fontSize: 13,
            color: "#adbac7",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1 }}>
            <strong>Getting Started:</strong> Drag components from the toolbar
            on the right onto the canvas. Use the wire tool to connect them.
            Click <strong>Start</strong> for time-domain simulation or{" "}
            <strong>Analyze</strong> for DC analysis. Mouse wheel to zoom, drag
            to pan, Delete to remove.
          </div>
          <button
            onClick={() => setShowHelp(false)}
            style={{ ...btnStyle, padding: "2px 8px" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* PIXI Canvas */}
      <div
        ref={canvasRef}
        id="pixi-container"
        className="circuit-canvas"
        style={{
          flex: 1,
          width: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      />

      {/* Projects Panel (overlay) */}
      {showProjects && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowProjects(false);
          }}
        >
          <div
            style={{
              background: "#1c2128",
              borderRadius: 16,
              width: 560,
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              overflow: "hidden",
              border: "1px solid #30363d",
            }}
          >
            {/* Dialog Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                background: "#161b22",
                borderBottom: "1px solid #30363d",
              }}
            >
              <button
                onClick={() => setShowProjects(false)}
                style={{ ...btnStyle, background: "transparent" }}
              >
                ← Back
              </button>
              <h3
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#e6edf3",
                }}
              >
                My Projects
              </h3>
              <button
                onClick={handleNewProject}
                style={{
                  ...btnStyle,
                  background: "#238636",
                  borderColor: "#2ea043",
                  color: "#fff",
                }}
              >
                + New Project
              </button>
            </div>

            {/* Project List */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {savedProjects.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "48px 24px",
                    color: "#8b9eb8",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <FolderOpen size={40} color="#8b9eb8" />
                  <h3
                    style={{ margin: 0, fontSize: 16, color: "#adbac7" }}
                  >
                    No saved projects yet
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      maxWidth: 300,
                      lineHeight: 1.5,
                    }}
                  >
                    Click <strong>Save</strong> in the header to save your
                    current project, or start a new one.
                  </p>
                </div>
              ) : (
                savedProjects.map((p: any) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background:
                        p.id === projectId
                          ? "rgba(88,166,255,0.1)"
                          : "rgba(255,255,255,0.03)",
                      border:
                        p.id === projectId
                          ? "1.5px solid #58a6ff"
                          : "1px solid #30363d",
                      borderRadius: 10,
                      transition: "background 0.15s",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#e6edf3",
                        }}
                      >
                        {p.name}
                      </span>
                      <span style={{ fontSize: 11, color: "#8b9eb8" }}>
                        {new Date(p.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => handleLoadProject(p)}
                        style={{
                          ...btnStyle,
                          background: "#238636",
                          color: "#fff",
                          borderColor: "#2ea043",
                          padding: "4px 14px",
                        }}
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleDeleteProject(p.id)}
                        title="Delete project"
                        style={{
                          ...btnStyle,
                          padding: "4px 8px",
                          color: "#f85149",
                          background: "rgba(248,81,73,0.08)",
                          borderColor: "#30363d",
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
