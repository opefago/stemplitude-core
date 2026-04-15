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
import {
  createRoboticsSimulator,
  IRRuntimeExecutor,
  interpretTextProgram,
  resolveKitCapabilities,
  resolveKitActuatorActionHandler,
  resolveKitRuntimeBehavior,
  resolveRobotModel,
  resolveWheelProfile,
  validateProgramForKit,
} from "../../labs/robotics";
import { DEFAULT_OVERLAY_STATE } from "../../labs/robotics/view/overlayManager";
import {
  BASE_WORLD,
  FALLBACK_MANIFESTS,
  START_POSE,
  SAMPLE_PROGRAM,
  describeNode,
  inferNextNodeId,
  safeProgram,
} from "./workspaceDefaults";
import {
  createInitialDebugSession,
  nextDebugSession,
  resolveDebugActionLabel,
  resolveDebugSourceMode,
} from "./debugSession";

function deriveLessonId(search) {
  const params = new URLSearchParams(search);
  return params.get("lesson_id");
}

const DEFAULT_CAMERA_STATE = {
  mode: "perspective",
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

function optionalNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function normalizeDebugNodeId(nodeId) {
  if (typeof nodeId !== "string") return "";
  const queueMarker = nodeId.indexOf("__q");
  const returnMarker = nodeId.indexOf("__return");
  const cut = [queueMarker, returnMarker].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return cut >= 0 ? nodeId.slice(0, cut) : nodeId;
}

function collectDebugNodeLabels(program) {
  const labels = new Map();
  const walk = (nodeList, contextLabel = "") => {
    if (!Array.isArray(nodeList)) return;
    nodeList.forEach((node) => {
      if (!node || typeof node !== "object" || typeof node.id !== "string") return;
      const baseId = normalizeDebugNodeId(node.id);
      let label = describeNode(node);
      if (node.kind === "call") label = `call ${String(node.function_id || "function")}`;
      if (node.kind === "repeat") {
        label = typeof node.times === "number" ? `repeat ${node.times} times` : "repeat while condition";
      }
      if (node.kind === "if") label = "if condition";
      labels.set(baseId, contextLabel ? `${contextLabel} -> ${label}` : label);
      if (node.kind === "if") {
        walk(node.then_nodes, `${label} (then)`);
        walk(node.else_nodes, `${label} (else)`);
      } else if (node.kind === "repeat") {
        walk(node.body, label);
      }
    });
  };
  walk(program?.nodes);
  if (Array.isArray(program?.functions)) {
    program.functions.forEach((fn) => {
      const fnLabel = `function ${String(fn?.name || fn?.id || "fn")}`;
      walk(fn?.body, fnLabel);
    });
  }
  return labels;
}

function collectDebugNodeSequence(program) {
  const sequence = [];
  const pushNodes = (nodeList) => {
    if (!Array.isArray(nodeList)) return;
    nodeList.forEach((node) => {
      if (!node || typeof node !== "object" || typeof node.id !== "string") return;
      sequence.push({
        id: normalizeDebugNodeId(node.id),
        kind: node.kind,
        label: describeNode(node),
      });
      if (node.kind === "if") {
        pushNodes(node.then_nodes);
        pushNodes(node.else_nodes);
      } else if (node.kind === "repeat") {
        pushNodes(node.body);
      }
    });
  };
  pushNodes(program?.nodes);
  if (Array.isArray(program?.functions)) {
    program.functions.forEach((fn) => {
      pushNodes(fn?.body);
    });
  }
  return sequence;
}

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
    move_collision_policy: "hold_until_distance",
    physics_engine: "three_runtime",
    step_policy: "semantic_next",
    traction_longitudinal: 0.92,
    traction_lateral: 0.9,
    rolling_resistance: 4.2,
    robot_max_climb_slope_deg: 16,
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
  const [stepSession, setStepSession] = useState(null);
  const [debugSession, setDebugSession] = useState(createInitialDebugSession("blocks"));
  const [projectId, setProjectId] = useState(null);
  const [projectRevision, setProjectRevision] = useState(1);
  const [persistenceStatus, setPersistenceStatus] = useState("Local-only");
  const [templateResolved, setTemplateResolved] = useState(false);
  const [cameraState, setCameraState] = useState(DEFAULT_CAMERA_STATE);
  const [overlayState, setOverlayState] = useState(DEFAULT_OVERLAY_STATE);
  const [sensorOverrides, setSensorOverrides] = useState({});
  const [pathTrailResetToken, setPathTrailResetToken] = useState(0);
  const [measurementResetToken, setMeasurementResetToken] = useState(0);
  const [cameraResetToken, setCameraResetToken] = useState(0);
  const [cameraFocusToken, setCameraFocusToken] = useState(0);

  const selectedManifest = useMemo(
    () => manifests.find((item) => item.vendor === selectedVendor && item.robot_type === selectedRobotType) || null,
    [manifests, selectedRobotType, selectedVendor],
  );
  const baseRobotModel = useMemo(
    () =>
      resolveRobotModel({
        vendor: selectedVendor,
        robotType: selectedRobotType,
        manifest: selectedManifest,
      }),
    [selectedManifest, selectedRobotType, selectedVendor],
  );
  const robotModel = useMemo(() => {
    const profile = resolveWheelProfile(baseRobotModel);
    return {
      ...baseRobotModel,
      traction_longitudinal:
        optionalNumber(runtimeSettings.traction_longitudinal) ?? profile.tractionLongitudinal,
      traction_lateral: optionalNumber(runtimeSettings.traction_lateral) ?? profile.tractionLateral,
      rolling_resistance: optionalNumber(runtimeSettings.rolling_resistance) ?? profile.rollingResistance,
      max_climb_slope_deg: optionalNumber(runtimeSettings.robot_max_climb_slope_deg) ?? 16,
    };
  }, [
    baseRobotModel,
    runtimeSettings.rolling_resistance,
    runtimeSettings.robot_max_climb_slope_deg,
    runtimeSettings.traction_lateral,
    runtimeSettings.traction_longitudinal,
  ]);
  const simulator = useMemo(
    () =>
      createRoboticsSimulator({
        engineId: String(runtimeSettings.physics_engine || "three_runtime"),
        robotModel,
      }),
    [robotModel, runtimeSettings.physics_engine],
  );
  const runtimeBehavior = useMemo(
    () =>
      resolveKitRuntimeBehavior({
        vendor: selectedVendor,
        robotType: selectedRobotType,
        manifest: selectedManifest,
      }),
    [selectedManifest, selectedRobotType, selectedVendor],
  );
  const kitCapabilities = useMemo(
    () =>
      resolveKitCapabilities({
        vendor: selectedVendor,
        robotType: selectedRobotType,
        manifest: selectedManifest,
      }),
    [selectedManifest, selectedRobotType, selectedVendor],
  );
  const resolveActuatorAction = useMemo(
    () => (actuatorId, action) =>
      resolveKitActuatorActionHandler({
        vendor: selectedVendor,
        robotType: selectedRobotType,
        actuatorId,
        action,
        manifest: selectedManifest,
      }),
    [selectedManifest, selectedRobotType, selectedVendor],
  );
  const executorRef = useRef(new IRRuntimeExecutor(simulator));
  const debugNodeLabelsRef = useRef(new Map());
  const debugNodeSequenceRef = useRef([]);
  const initializedRef = useRef(false);

  function syncPoseToStart(nextStartPose) {
    simulator.reset(nextStartPose);
    const snapshot = simulator.tick({
      dt_ms: 0,
      linear_velocity_cm_s: 0,
      angular_velocity_deg_s: 0,
    });
    setPose(snapshot.pose);
    setSensorValues(snapshot.sensor_values);
    setPathTrailResetToken((prev) => prev + 1);
    setMeasurementResetToken((prev) => prev + 1);
  }

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
    setDebugSession((prev) => ({
      ...prev,
      sourceMode: resolveDebugSourceMode(mode),
    }));
  }, [mode]);

  useEffect(() => {
    executorRef.current = new IRRuntimeExecutor(simulator, runtimeBehavior, resolveActuatorAction, {
      moveCollisionPolicy: runtimeSettings.move_collision_policy || "hold_until_distance",
    });
    executorRef.current.load(program);
    debugNodeLabelsRef.current = collectDebugNodeLabels(program);
    debugNodeSequenceRef.current = collectDebugNodeSequence(program);
    setRuntimeState(executorRef.current.getState());
  }, [program, resolveActuatorAction, runtimeBehavior, runtimeSettings.move_collision_policy, simulator]);

  useEffect(() => {
    simulator.setSensorOverrides?.(sensorOverrides);
  }, [sensorOverrides, simulator]);

  useEffect(() => {
    simulator.setWorld(world);
  }, [simulator, world]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    simulator.reset(startPose);
    const snapshot = simulator.tick({
      dt_ms: 0,
      linear_velocity_cm_s: 0,
      angular_velocity_deg_s: 0,
    });
    setPose(snapshot.pose);
    setSensorValues(snapshot.sensor_values);
  }, [simulator]);

  useEffect(() => {
    if (!initializedRef.current) return;
    simulator.reset(startPose);
    const snapshot = simulator.tick({
      dt_ms: 0,
      linear_velocity_cm_s: 0,
      angular_velocity_deg_s: 0,
    });
    setPose(snapshot.pose);
    setSensorValues(snapshot.sensor_values);
    setPathTrailResetToken((prev) => prev + 1);
    setMeasurementResetToken((prev) => prev + 1);
  }, [simulator, startPose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listRoboticsCapabilityManifests();
        if (!cancelled && rows.length > 0) {
          setManifests(rows);
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
    if (!Array.isArray(manifests) || manifests.length === 0) return;
    const active = manifests.find((item) => item.vendor === selectedVendor && item.robot_type === selectedRobotType);
    if (active) return;
    const fallback = manifests[0];
    setSelectedVendor(fallback.vendor);
    setSelectedRobotType(fallback.robot_type);
    setMode((prevMode) => (fallback.languages?.includes(prevMode) ? prevMode : fallback.languages?.[0] || "blocks"));
  }, [manifests, selectedRobotType, selectedVendor]);

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
    if (!isAutoRunning && !stepSession) return undefined;
    const id = window.setInterval(() => {
      if (isAutoRunning) {
        stepProgram("semantic_next", {
          manual: false,
          coalesceProgress: false,
          debugAction: "run",
        });
        return;
      }
      if (!stepSession) return;
      const result = stepProgram(stepSession.policy, {
        manual: false,
        skipStructural: stepSession.skipStructural,
        coalesceProgress: false,
        debugAction: stepSession.action,
      });
      const continueSession = shouldContinueStepSession(stepSession.policy, result);
      if (!continueSession) {
        setStepSession(null);
      }
    }, Math.max(50, Number(runtimeSettings.tick_ms) || 200));
    return () => window.clearInterval(id);
  }, [isAutoRunning, runtimeSettings.tick_ms, stepSession]);

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
      // Keep robot mesh and start marker aligned when project loads.
      syncPoseToStart({
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

  function stepProgram(policy = "semantic_next", options = {}) {
    const manual = options.manual !== false;
    const coalesceProgress = options.coalesceProgress === true;
    const skipStructural = options.skipStructural !== false;
    const debugAction = resolveDebugActionLabel(policy, options.debugAction);
    if (manual) {
      setIsAutoRunning(false);
      setStepSession(null);
    }
    if (executorRef.current.getState() === "completed") {
      executorRef.current.reset();
      simulator.reset(startPose);
    }
    if (executorRef.current.getState() === "idle" || executorRef.current.getState() === "paused") {
      executorRef.current.run();
    }
    const previousState = runtimeState;
    const simulationBudgetMs = Math.max(50, Number(runtimeSettings.tick_ms) || 200);
    let result = executorRef.current.step({
      simulation_budget_ms: simulationBudgetMs,
      policy,
    });
    if (manual && policy === "semantic_next" && skipStructural) {
      let structuralGuard = 0;
      while (
        result.state === "running" &&
        [
          "condition_evaluated",
          "branch_selected",
          "loop_check",
          "loop_exit",
        ].includes(result.semanticEvent?.type || "") &&
        structuralGuard < 50
      ) {
        result = executorRef.current.step({
          simulation_budget_ms: simulationBudgetMs,
          policy,
        });
        structuralGuard += 1;
      }
    }
    if (manual && coalesceProgress) {
      let guard = 0;
      while (result.state === "running" && result.semanticEvent?.type === "action_progress" && guard < 200) {
        result = executorRef.current.step({
          simulation_budget_ms: simulationBudgetMs,
          policy,
        });
        guard += 1;
      }
    }
    const snapshot = simulator.tick({
      dt_ms: 0,
      linear_velocity_cm_s: 0,
      angular_velocity_deg_s: 0,
    });
    setPose(snapshot.pose);
    setSensorValues(snapshot.sensor_values);
    setRuntimeState(result.state);
    setDebugSession((prev) =>
      nextDebugSession(prev, {
        mode,
        action: debugAction,
        result,
        nodeLabels: debugNodeLabelsRef.current,
        nodeSequence: debugNodeSequenceRef.current,
      }),
    );
    if (result.highlightedNodeId) {
      const semantic = result.semanticEvent?.type ? ` [${result.semanticEvent.type}]` : "";
      logLine(`Executed ${result.highlightedNodeId}${semantic}`);
    }
    if (result.issues.length > 0) {
      result.issues.forEach((issue) => {
        const linePart = Number.isFinite(issue.line) ? `L${issue.line} ` : "";
        logLine(`[runtime/${issue.category}/${issue.code}] ${linePart}${issue.message}`);
      });
    } else if (Array.isArray(result.diagnostics) && result.diagnostics.length > 0) {
      result.diagnostics.forEach((line) => logLine(`[runtime] ${line}`));
    }
    if (result.state === "completed" || result.state === "error") {
      setIsAutoRunning(false);
      setStepSession(null);
      if (previousState !== result.state) void persistAttempt(result.state);
    }
    return result;
  }

  function shouldContinueStepSession(policy, result) {
    if (result?.state !== "running") return false;
    const type = result?.semanticEvent?.type;
    if (policy === "step_over") {
      return type !== "call_return" && type !== "loop_exit";
    }
    return type === "action_progress";
  }

  function stepIntoProgram() {
    stepProgram("step_into", { skipStructural: false });
  }

  function stepOverProgram() {
    const initial = stepProgram("step_over", {
      skipStructural: false,
      coalesceProgress: false,
      debugAction: "step_over",
    });
    setStepSession(
      shouldContinueStepSession("step_over", initial)
        ? {
            policy: "step_over",
            skipStructural: false,
            action: "step_over",
          }
        : null,
    );
  }

  function stepBlockProgram() {
    const initial = stepProgram("semantic_next", {
      skipStructural: true,
      coalesceProgress: false,
      debugAction: "step",
    });
    const continueSession = initial?.state === "running" && initial?.semanticEvent?.type === "action_progress";
    setStepSession(
      continueSession
        ? {
            policy: "semantic_next",
            skipStructural: true,
            action: "step",
          }
        : null,
    );
  }

  function runProgram() {
    let runtimeProgram = program;
    if (mode === "python" || mode === "cpp") {
      const interpreted = interpretTextProgram(textCode, mode, {
        allowedSensors: kitCapabilities.sensors.map((sensor) => sensor.kind),
      });
      if (!interpreted.ok) {
        setRuntimeState("error");
        setIsAutoRunning(false);
        setDebugSession((prev) =>
          nextDebugSession(prev, {
            mode,
            action: "run",
            result: {
              state: "error",
              highlightedNodeId: undefined,
              diagnostics: interpreted.diagnostics,
              issues: interpreted.issues || [],
              semanticEvent: undefined,
            },
            nodeLabels: debugNodeLabelsRef.current,
            nodeSequence: debugNodeSequenceRef.current,
          }),
        );
        const structured = interpreted.issues;
        if (structured.length > 0) {
          structured.forEach((issue) => {
            const linePart = Number.isFinite(issue.line) ? `L${issue.line} ` : "";
            logLine(`[interpreter/${issue.category}/${issue.code}] ${linePart}${issue.message}`);
          });
        } else {
          interpreted.diagnostics.forEach((line) => logLine(`[interpreter] ${line}`));
        }
        return;
      }
      runtimeProgram = interpreted.program;
      logLine(`[interpreter] Loaded ${interpreted.program.nodes.length} simulator command(s) from ${mode} code`);
    }
    if (!Array.isArray(runtimeProgram?.nodes) || runtimeProgram.nodes.length === 0) {
      setRuntimeState("error");
      setIsAutoRunning(false);
      setDebugSession((prev) =>
        nextDebugSession(prev, {
          mode,
          action: "run",
          result: {
            state: "error",
            highlightedNodeId: undefined,
            diagnostics: ["Program has no executable commands."],
            issues: [],
            semanticEvent: undefined,
          },
          nodeLabels: debugNodeLabelsRef.current,
          nodeSequence: debugNodeSequenceRef.current,
        }),
      );
      logLine("[runtime] Program has no executable commands.");
      return;
    }
    const validation = validateProgramForKit({
      program: runtimeProgram,
      capabilities: kitCapabilities,
      runtimeBehavior,
      resolveActuatorAction,
    });
    debugNodeLabelsRef.current = collectDebugNodeLabels(runtimeProgram);
    debugNodeSequenceRef.current = collectDebugNodeSequence(runtimeProgram);
    if (!validation.ok) {
      setRuntimeState("error");
      setIsAutoRunning(false);
      setDebugSession((prev) =>
        nextDebugSession(prev, {
          mode,
          action: "run",
          result: {
            state: "error",
            highlightedNodeId: undefined,
            diagnostics: validation.diagnostics,
            issues: validation.issues || [],
            semanticEvent: undefined,
          },
          nodeLabels: debugNodeLabelsRef.current,
          nodeSequence: debugNodeSequenceRef.current,
        }),
      );
      if (validation.issues.length > 0) {
        validation.issues.forEach((issue) => {
          const linePart = Number.isFinite(issue.line) ? `L${issue.line} ` : "";
          logLine(`[validator/${issue.category}/${issue.code}] ${linePart}${issue.message}`);
        });
      } else {
        validation.diagnostics.forEach((line) => logLine(`[validator] ${line}`));
      }
      return;
    }

    executorRef.current.load(runtimeProgram);
    executorRef.current.run();
    setRuntimeState(executorRef.current.getState());
    setDebugSession((prev) =>
      nextDebugSession(prev, {
        mode,
        action: "run",
        result: {
          state: executorRef.current.getState(),
          highlightedNodeId: undefined,
          diagnostics: [],
          issues: [],
          semanticEvent: undefined,
        },
        resetTrace: true,
        nodeLabels: debugNodeLabelsRef.current,
        nodeSequence: debugNodeSequenceRef.current,
      }),
    );
    setStepSession(null);
    setIsAutoRunning(true);
    logLine(`[runtime] Run started (${runtimeProgram.nodes.length} command${runtimeProgram.nodes.length === 1 ? "" : "s"})`);
    // Kick off the first semantic step immediately so Run has instant feedback.
    stepProgram("semantic_next", { manual: false, debugAction: "run" });
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
    setStepSession(null);
    setDebugSession((prev) => ({
      ...prev,
      activeStepPolicy: "paused",
      runtimeState: executorRef.current.getState(),
    }));
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
    setStepSession(null);
    setDebugSession(createInitialDebugSession(mode));
    setPathTrailResetToken((prev) => prev + 1);
    setMeasurementResetToken((prev) => prev + 1);
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
      ...(key === "showMeasurements" && !prev.showMeasurements
        ? {
            showMeasurementLabels: true,
          }
        : {}),
    }));
  }

  function setMeasurementLabelSize(size) {
    setOverlayState((prev) => ({
      ...prev,
      measurementLabelSize: size,
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
    setStartPose((prev) => {
      const nextStartPose = {
        ...prev,
        heading_deg: normalized,
      };
      // When editing the start pose, keep simulator pose aligned with the ghost marker.
      if (!isAutoRunning) syncPoseToStart(nextStartPose);
      return nextStartPose;
    });
  }

  function setStartPosition(nextX, nextY) {
    setStartPose((prev) => {
      const nextStartPose = {
        ...prev,
        position: {
          x: Number(nextX),
          y: Number(nextY),
        },
      };
      // When editing the start pose, keep simulator pose aligned with the ghost marker.
      if (!isAutoRunning) syncPoseToStart(nextStartPose);
      return nextStartPose;
    });
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
    debugSession,
    runtimeSettings,
    setRuntimeSettings,
    robotModel,
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
    measurementResetToken,
    cameraResetToken,
    cameraFocusToken,
    setCameraMode,
    resetCamera,
    updateCameraState,
    focusCameraOnRobot,
    zoomCamera,
    toggleOverlay,
    setMeasurementLabelSize,
    saveProjectSnapshot,
    runProgram,
    pauseProgram,
    resetProgram,
    stepProgram: stepBlockProgram,
    stepIntoProgram,
    stepOverProgram,
    logLine,
    emitEvent,
  };
}
