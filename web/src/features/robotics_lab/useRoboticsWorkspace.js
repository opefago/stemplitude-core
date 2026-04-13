import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useLabSession } from "../labs/useLabSession";
import { useAuth } from "../../providers/AuthProvider";
import {
  createRoboticsAttempt,
  createRoboticsProject,
  getRoboticsProject,
  ingestRoboticsEvents,
  listRoboticsCapabilityManifests,
  listRoboticsProjects,
  resolveRoboticsTemplate,
  updateRoboticsProject,
} from "../../lib/api/robotics";
import { IRRuntimeExecutor, ThreeRuntimeSimulator, interpretTextProgram } from "../../labs/robotics";
import { DEFAULT_OVERLAY_STATE } from "../../labs/robotics/view/overlayManager";
import {
  BASE_WORLD,
  FALLBACK_MANIFESTS,
  START_POSE,
  SAMPLE_PROGRAM,
  inferNextNodeId,
  getRobotModel,
  safeProgram,
} from "./workspaceDefaults";

function deriveLessonId(search) {
  const params = new URLSearchParams(search);
  return params.get("lesson_id");
}

const DEFAULT_CAMERA_STATE = {
  mode: "top",
  previousMode: undefined,
  transitionMs: 280,
  isTransitioning: false,
  topZoom: 1,
  followDistance: 88,
  followHeight: 48,
  lockFollowHeading: true,
  followPositionLerp: 6.5,
  followTargetLerp: 8,
};

const CAMERA_PREFS_KEY = "stemplitude.robotics.cameraPrefs.v1";

export function useRoboticsWorkspace() {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const { classroomContext, exitLab, fallbackExitPath, panel } = useLabSession();
  const lessonId = useMemo(
    () => classroomContext?.lessonId || deriveLessonId(location.search),
    [classroomContext?.lessonId, location.search],
  );

  const [manifests, setManifests] = useState(FALLBACK_MANIFESTS);
  const [selectedVendor, setSelectedVendor] = useState("vex");
  const [selectedRobotType, setSelectedRobotType] = useState("vex_vr");
  const [mode, setMode] = useState("blocks");
  const [editorMode, setEditorMode] = useState("split");
  const [projectSource, setProjectSource] = useState("default");
  const [projectTitle, setProjectTitle] = useState("My Robotics Mission");
  const [runtimeSettings, setRuntimeSettings] = useState({
    tick_ms: 200,
    deterministic_replay: true,
  });
  const [world, setWorld] = useState(BASE_WORLD);
  const [program, setProgram] = useState(SAMPLE_PROGRAM);
  const [textCode, setTextCode] = useState("");
  const [nextNodeId, setNextNodeId] = useState(inferNextNodeId(SAMPLE_PROGRAM));
  const [pose, setPose] = useState(START_POSE);
  const [startPose, setStartPose] = useState(START_POSE);
  const [sensorValues, setSensorValues] = useState({});
  const [logs, setLogs] = useState([]);
  const [runtimeState, setRuntimeState] = useState("idle");
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [projectId, setProjectId] = useState(null);
  const [projectRevision, setProjectRevision] = useState(1);
  const [persistenceStatus, setPersistenceStatus] = useState("Local-only");
  const [templateResolved, setTemplateResolved] = useState(false);
  const [cameraState, setCameraState] = useState(DEFAULT_CAMERA_STATE);
  const [overlayState, setOverlayState] = useState(DEFAULT_OVERLAY_STATE);
  const [sensorOverrides, setSensorOverrides] = useState({});
  const [pathTrailResetToken, setPathTrailResetToken] = useState(0);
  const [cameraResetToken, setCameraResetToken] = useState(0);
  const [cameraFocusToken, setCameraFocusToken] = useState(0);

  const simulator = useMemo(() => new ThreeRuntimeSimulator(getRobotModel()), []);
  const executorRef = useRef(new IRRuntimeExecutor(simulator));

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CAMERA_PREFS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (parsed.cameraState) {
          setCameraState((prev) => ({ ...prev, ...parsed.cameraState }));
        }
        if (parsed.overlayState) {
          setOverlayState((prev) => ({ ...prev, ...parsed.overlayState }));
        }
      }
    } catch {
      // Ignore bad local storage payloads.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CAMERA_PREFS_KEY,
        JSON.stringify({
          cameraState,
          overlayState,
        }),
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [cameraState, overlayState]);

  useEffect(() => {
    simulator.setSensorOverrides?.(sensorOverrides);
  }, [sensorOverrides, simulator]);

  useEffect(() => {
    simulator.setWorld(world);
    simulator.reset(startPose);
    executorRef.current.load(program);
    const snapshot = simulator.tick({
      dt_ms: 0,
      linear_velocity_cm_s: 0,
      angular_velocity_deg_s: 0,
    });
    setPose(snapshot.pose);
    setSensorValues(snapshot.sensor_values);
    setRuntimeState(executorRef.current.getState());
  }, [program, simulator, startPose, world]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listRoboticsCapabilityManifests();
        if (!cancelled && rows.length > 0) {
          setManifests(rows);
          setSelectedVendor(rows[0].vendor);
          setSelectedRobotType(rows[0].robot_type);
          setMode(rows[0].languages?.[0] || "blocks");
        }
      } catch {
        // Fallback manifest remains available.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (templateResolved) return;
    let cancelled = false;
    (async () => {
      try {
        const resolved = await resolveRoboticsTemplate({
          curriculum_lab_id: classroomContext?.curriculumLabId || undefined,
          assignment_id: classroomContext?.assignmentId || undefined,
          lesson_id: lessonId || undefined,
        });
        if (cancelled) return;
        setTemplateResolved(true);
        setProjectSource(resolved.source);
        setProjectTitle((resolved.title || "My Robotics Mission").slice(0, 120));
        setMode(resolved.mode || "blocks");
        setSelectedVendor(resolved.robot_vendor || "vex");
        setSelectedRobotType(resolved.robot_type || "vex_vr");
        const templatedProgram = safeProgram(resolved?.source_payload?.ir);
        setProgram(templatedProgram);
        setNextNodeId(inferNextNodeId(templatedProgram));
        setTextCode(resolved?.source_payload?.text_code || "");
        if (resolved.world_scene?.objects) {
          setWorld((prev) => ({ ...prev, world_scene: resolved.world_scene }));
        }
        if (resolved.runtime_settings) {
          setRuntimeSettings((prev) => ({ ...prev, ...resolved.runtime_settings }));
        }
      } catch {
        setTemplateResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classroomContext?.assignmentId, classroomContext?.curriculumLabId, lessonId, templateResolved]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id || !templateResolved) return;
    if (projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const preferredId = classroomContext?.savedProjectId || null;
        if (preferredId) {
          const existing = await getRoboticsProject(preferredId);
          if (cancelled) return;
          hydrateFromProject(existing);
          setPersistenceStatus("Cloud project loaded");
          return;
        }
        const rows = await listRoboticsProjects({ student_id: user.id, limit: 1 });
        if (cancelled) return;
        if (rows.length > 0) {
          hydrateFromProject(rows[0]);
          setPersistenceStatus("Cloud project loaded");
          return;
        }
        const created = await createRoboticsProject({
          title: projectTitle,
          robot_vendor: selectedVendor,
          robot_type: selectedRobotType,
          mode,
          editor_mode: "split",
          project_source: projectSource,
          schema_version: 2,
          source: {
            ir: program,
            text_code: textCode || null,
            blocks_xml: null,
          },
          world_scene: world.world_scene ?? null,
          runtime_settings: runtimeSettings,
          metadata: {
            map_id: world.id,
            map_name: world.name,
            world_objects: world.objects,
            start_pose: startPose,
            sensor_overrides: sensorOverrides,
            template_source: projectSource,
            assignment_id: classroomContext?.assignmentId || null,
            curriculum_lab_id: classroomContext?.curriculumLabId || null,
            lesson_id: lessonId || null,
          },
        });
        if (cancelled) return;
        hydrateFromProject(created);
        setPersistenceStatus("Cloud project created");
      } catch {
        if (!cancelled) setPersistenceStatus("Cloud unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    classroomContext?.assignmentId,
    classroomContext?.curriculumLabId,
    classroomContext?.savedProjectId,
    isAuthenticated,
    lessonId,
    mode,
    program,
    projectId,
    projectTitle,
    projectSource,
    runtimeSettings,
    selectedRobotType,
    selectedVendor,
    templateResolved,
    textCode,
    user?.id,
    world.id,
    world.name,
    world.objects,
    world.world_scene,
    startPose,
    sensorOverrides,
  ]);

  useEffect(() => {
    if (!isAutoRunning) return undefined;
    const id = window.setInterval(() => {
      stepProgram();
    }, Math.max(50, Number(runtimeSettings.tick_ms) || 200));
    return () => window.clearInterval(id);
  }, [isAutoRunning, runtimeSettings.tick_ms]);

  function hydrateFromProject(project) {
    setProjectId(project.id);
    setProjectRevision(project.revision || 1);
    setProjectTitle((project.title || "My Robotics Mission").slice(0, 120));
    if (project.mode) setMode(project.mode);
    if (project.editor_mode) setEditorMode(project.editor_mode);
    if (project.project_source) setProjectSource(project.project_source);
    const storedProgram = safeProgram(project?.source?.ir);
    setProgram(storedProgram);
    setNextNodeId(inferNextNodeId(storedProgram));
    setTextCode(project?.source?.text_code || "");
    if (project.world_scene?.objects) {
      setWorld((prev) => ({ ...prev, world_scene: project.world_scene }));
    }
    if (project.runtime_settings) {
      setRuntimeSettings((prev) => ({ ...prev, ...project.runtime_settings }));
    }
    const storedSensorOverrides = project?.metadata?.sensor_overrides;
    if (storedSensorOverrides && typeof storedSensorOverrides === "object") {
      setSensorOverrides({ ...storedSensorOverrides });
    }
    const storedWorldObjects = project?.metadata?.world_objects;
    if (Array.isArray(storedWorldObjects) && storedWorldObjects.length) {
      setWorld((prev) => ({ ...prev, objects: storedWorldObjects }));
    }
    const storedStartPose = project?.metadata?.start_pose;
    if (
      storedStartPose &&
      typeof storedStartPose === "object" &&
      storedStartPose.position &&
      Number.isFinite(storedStartPose.position.x) &&
      Number.isFinite(storedStartPose.position.y) &&
      Number.isFinite(storedStartPose.heading_deg)
    ) {
      setStartPose({
        position: {
          x: Number(storedStartPose.position.x),
          y: Number(storedStartPose.position.y),
        },
        heading_deg: Number(storedStartPose.heading_deg),
      });
    }
  }

  function logLine(line) {
    setLogs((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 50));
  }

  async function emitEvent(eventName, payload) {
    if (!projectId) return;
    try {
      await ingestRoboticsEvents([
        {
          event_name: eventName,
          occurred_at: new Date().toISOString(),
          project_id: projectId,
          actor_id: user?.id,
          payload,
        },
      ]);
    } catch {
      // Non-blocking analytics.
    }
  }

  async function saveProjectSnapshot(reason = "manual", overrides = {}) {
    if (!projectId) return;
    const snapshotProgram = overrides.program || program;
    const snapshotWorld = overrides.world || world;
    const snapshotPose = overrides.pose || pose;
    const snapshotSensorValues = overrides.sensorValues || sensorValues;
    const snapshotRuntimeState = overrides.runtimeState || runtimeState;
    const snapshotStartPose = overrides.startPose || startPose;
    const snapshotSensorOverrides = overrides.sensorOverrides || sensorOverrides;
    const snapshotTextCode = overrides.textCode ?? textCode;
    const snapshotTitle = (overrides.title ?? projectTitle ?? "My Robotics Mission").slice(0, 120);
    try {
      const updated = await updateRoboticsProject(projectId, {
        title: snapshotTitle,
        mode,
        editor_mode: editorMode,
        project_source: projectSource,
        schema_version: 2,
        source: {
          ir: snapshotProgram,
          text_code: snapshotTextCode || null,
          blocks_xml: null,
        },
        world_scene: snapshotWorld.world_scene ?? null,
        runtime_settings: runtimeSettings,
        metadata: {
          save_reason: reason,
          runtime_state: snapshotRuntimeState,
          map_id: snapshotWorld.id,
          map_name: snapshotWorld.name,
          world_objects: snapshotWorld.objects,
          start_pose: snapshotStartPose,
          sensor_overrides: snapshotSensorOverrides,
          command_count: snapshotProgram.nodes.length,
          pose: snapshotPose,
          sensor_values: snapshotSensorValues,
          template_source: projectSource,
          assignment_id: classroomContext?.assignmentId || null,
          curriculum_lab_id: classroomContext?.curriculumLabId || null,
          lesson_id: lessonId || null,
        },
      });
      const nextRevision = updated.revision || projectRevision;
      setProjectRevision(nextRevision);
      setProjectTitle((updated.title || snapshotTitle).slice(0, 120));
      setPersistenceStatus(`Saved r${nextRevision}`);
    } catch {
      setPersistenceStatus("Save failed");
    }
  }

  async function persistAttempt(statusValue) {
    if (!projectId) return;
    try {
      const attempt = await createRoboticsAttempt(projectId, {
        mission_id: world.id,
        run_mode: "simulate",
        telemetry: {
          status: statusValue,
          runtime_state: runtimeState,
          command_count: program.nodes.length,
          final_pose: pose,
          sensor_values: sensorValues,
        },
      });
      await emitEvent("robotics.project.run.completed", {
        attempt_id: attempt.id,
        mission_id: world.id,
        status: statusValue,
      });
      setPersistenceStatus("Attempt recorded");
    } catch {
      setPersistenceStatus("Attempt save failed");
    }
  }

  function stepProgram() {
    const previousState = runtimeState;
    const result = executorRef.current.step();
    const snapshot = simulator.tick({
      dt_ms: 0,
      linear_velocity_cm_s: 0,
      angular_velocity_deg_s: 0,
    });
    setPose(snapshot.pose);
    setSensorValues(snapshot.sensor_values);
    setRuntimeState(result.state);
    if (result.highlightedNodeId) logLine(`Executed ${result.highlightedNodeId}`);
    if (Array.isArray(result.diagnostics) && result.diagnostics.length > 0) {
      result.diagnostics.forEach((line) => logLine(`[runtime] ${line}`));
    }
    if (result.state === "completed" || result.state === "error") {
      setIsAutoRunning(false);
      if (previousState !== result.state) void persistAttempt(result.state);
    }
  }

  function runProgram() {
    let runtimeProgram = program;
    if (mode === "python" || mode === "cpp") {
      const interpreted = interpretTextProgram(textCode, mode);
      if (!interpreted.ok) {
        setRuntimeState("error");
        setIsAutoRunning(false);
        interpreted.diagnostics.forEach((line) => logLine(`[interpreter] ${line}`));
        return;
      }
      runtimeProgram = interpreted.program;
      logLine(`[interpreter] Loaded ${interpreted.program.nodes.length} simulator command(s) from ${mode} code`);
    }
    if (!Array.isArray(runtimeProgram?.nodes) || runtimeProgram.nodes.length === 0) {
      setRuntimeState("error");
      setIsAutoRunning(false);
      logLine("[runtime] Program has no executable commands.");
      return;
    }

    // Always start runs from the canonical start pose so repeated runs are deterministic
    // and visibly affect the robot even after a previous collision/out-of-bounds state.
    simulator.reset(startPose);
    const snapshot = simulator.tick({
      dt_ms: 0,
      linear_velocity_cm_s: 0,
      angular_velocity_deg_s: 0,
    });
    setPose(snapshot.pose);
    setSensorValues(snapshot.sensor_values);
    setPathTrailResetToken((prev) => prev + 1);

    executorRef.current.load(runtimeProgram);
    executorRef.current.run();
    setRuntimeState(executorRef.current.getState());
    setIsAutoRunning(true);
    logLine(`[runtime] Run started (${runtimeProgram.nodes.length} command${runtimeProgram.nodes.length === 1 ? "" : "s"})`);
    void emitEvent("robotics.project.run.started", {
      robot_vendor: selectedVendor,
      robot_type: selectedRobotType,
      map_id: world.id,
    });
  }

  function pauseProgram() {
    executorRef.current.pause();
    setRuntimeState(executorRef.current.getState());
    setIsAutoRunning(false);
  }

  function resetProgram() {
    executorRef.current.reset();
    simulator.reset(startPose);
    const snapshot = simulator.tick({
      dt_ms: 0,
      linear_velocity_cm_s: 0,
      angular_velocity_deg_s: 0,
    });
    setPose(snapshot.pose);
    setSensorValues(snapshot.sensor_values);
    setRuntimeState(executorRef.current.getState());
    setIsAutoRunning(false);
    setPathTrailResetToken((prev) => prev + 1);
    logLine("Simulation reset");
    void saveProjectSnapshot("reset");
  }

  function setCameraMode(nextMode) {
    setCameraState((prev) => ({
      ...prev,
      previousMode: prev.mode,
      mode: nextMode,
      isTransitioning: prev.mode !== nextMode,
    }));
  }

  function resetCamera(mode) {
    setCameraState((prev) => ({
      ...prev,
      mode: mode || prev.mode,
      isTransitioning: false,
    }));
    setCameraResetToken((prev) => prev + 1);
  }

  function updateCameraState(patch) {
    setCameraState((prev) => ({
      ...prev,
      ...patch,
    }));
  }

  function focusCameraOnRobot() {
    setCameraFocusToken((prev) => prev + 1);
  }

  function zoomCamera(step) {
    setCameraState((prev) => ({
      ...prev,
      topZoom: Math.max(0.6, Math.min(1.8, prev.topZoom + step)),
      isTransitioning: false,
    }));
  }

  function toggleOverlay(key) {
    setOverlayState((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function rotateStartHeading(deltaDeg) {
    setStartPose((prev) => ({
      ...prev,
      heading_deg: ((prev.heading_deg + deltaDeg) % 360 + 360) % 360,
    }));
  }

  function setStartHeading(headingDeg) {
    const normalized = ((Number(headingDeg) % 360) + 360) % 360;
    setStartPose((prev) => ({
      ...prev,
      heading_deg: normalized,
    }));
  }

  function setStartPosition(nextX, nextY) {
    setStartPose((prev) => ({
      ...prev,
      position: {
        x: Number(nextX),
        y: Number(nextY),
      },
    }));
  }

  function setSensorOverride(sensorId, value) {
    setSensorOverrides((prev) => ({
      ...prev,
      [sensorId]: value,
    }));
  }

  function clearSensorOverride(sensorId) {
    setSensorOverrides((prev) => {
      const next = { ...prev };
      delete next[sensorId];
      return next;
    });
  }

  return {
    manifests,
    selectedVendor,
    selectedRobotType,
    setSelectedVendor,
    setSelectedRobotType,
    mode,
    setMode,
    editorMode,
    setEditorMode,
    projectTitle,
    setProjectTitle,
    projectSource,
    world,
    setWorld,
    program,
    setProgram,
    textCode,
    setTextCode,
    nextNodeId,
    setNextNodeId,
    pose,
    sensorValues,
    logs,
    runtimeState,
    runtimeSettings,
    setRuntimeSettings,
    projectId,
    projectRevision,
    persistenceStatus,
    panel,
    exitLab,
    fallbackExitPath,
    classroomContext,
    lessonId,
    startPose,
    setStartPose,
    setStartPosition,
    rotateStartHeading,
    setStartHeading,
    sensorOverrides,
    setSensorOverride,
    clearSensorOverride,
    cameraState,
    overlayState,
    pathTrailResetToken,
    cameraResetToken,
    cameraFocusToken,
    setCameraMode,
    resetCamera,
    updateCameraState,
    focusCameraOnRobot,
    zoomCamera,
    toggleOverlay,
    saveProjectSnapshot,
    runProgram,
    pauseProgram,
    resetProgram,
    stepProgram,
    logLine,
    emitEvent,
  };
}
