import { Copy, Download, Eye, EyeOff, FlipHorizontal, Group, Magnet, Pause, Play, RotateCcw, RotateCw, Redo2, Save, Trash2, Undo2, Ungroup, Upload, LayoutTemplate, Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoboticsWorkspaceContext } from "../features/robotics_lab/RoboticsWorkspaceContext";
import { GRID_CELL_CM } from "../features/robotics_lab/workspaceDefaults";
import { ThreeSimViewport } from "../features/robotics_lab/ThreeSimViewport.tsx";
import { CameraToolbar } from "../features/robotics_lab/components/CameraToolbar";
import { DebuggerStatusPanel } from "../features/robotics_lab/components/DebuggerStatusPanel";
import { OverlayToggles } from "../features/robotics_lab/components/OverlayToggles";
import { StepSplitButton } from "../features/robotics_lab/components/StepSplitButton";
import { ViewportSettingsDialog } from "../features/robotics_lab/components/ViewportSettingsDialog";
import { ObjectPalette } from "../features/robotics_lab/components/object_palette";
import { createSceneObjectFromPalette, getObjectDefinitionById } from "../features/robotics_lab/objectPalette";
import { resolveKitCapabilities } from "../labs/robotics";
import { UndoStack, snapshotScene } from "../features/robotics_lab/undoStack";
import { useKeyboardShortcuts } from "../features/robotics_lab/useKeyboardShortcuts";
import { WORLD_PRESETS } from "../features/robotics_lab/worldPresets";
import { CustomObjectCreator } from "../features/robotics_lab/components/CustomObjectCreator";

let transparentDragImage = null;

function getTransparentDragImage() {
  if (transparentDragImage) return transparentDragImage;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  transparentDragImage = canvas;
  return transparentDragImage;
}

function formatSensorValue(sensorKind, value) {
  if (sensorKind === "distance") return `${Number(value ?? 0).toFixed(1)} cm`;
  if (sensorKind === "gyro") return `${Math.round(Number(value ?? 0))} deg`;
  if (sensorKind === "line") return value ? "Detected" : "No line";
  if (sensorKind === "bumper" || sensorKind === "touch") return value ? "Pressed" : "Released";
  if (sensorKind === "color") return String(value ?? "default");
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  if (value === null || value === undefined || value === "") return "--";
  return String(value);
}

function snapToGridCenter(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return GRID_CELL_CM / 2;
  const half = GRID_CELL_CM / 2;
  return Math.round((numeric - half) / GRID_CELL_CM) * GRID_CELL_CM + half;
}

function snapToGridEdge(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric / GRID_CELL_CM) * GRID_CELL_CM;
}

function snapForObjectType(value, objectType) {
  if (objectType === "wall") return snapToGridEdge(value);
  return snapToGridCenter(value);
}

export default function RoboticsSimEditorPage() {
  const {
    manifests,
    selectedVendor,
    selectedRobotType,
    world,
    setWorld,
    pose,
    sensorValues,
    sensorOverrides,
    setSensorOverride,
    clearSensorOverride,
    runtimeState,
    debugSession,
    runtimeSettings,
    setRuntimeSettings,
    robotModel,
    startPose,
    setStartPosition,
    rotateStartHeading,
    setStartHeading,
    cameraState,
    overlayState,
    pathTrailResetToken,
    measurementResetToken,
    cameraResetToken,
    cameraFocusToken,
    setCameraMode,
    resetCamera,
    focusCameraOnRobot,
    zoomCamera,
    toggleOverlay,
    setMeasurementLabelSize,
    updateCameraState,
    runProgram,
    pauseProgram,
    stepProgram,
    stepIntoProgram,
    stepOverProgram,
    resetProgram,
    saveProjectSnapshot,
    panel,
  } = useRoboticsWorkspaceContext();
  const [dragPresetId, setDragPresetId] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const dropTargetRef = useRef(null);
  const projectClientToWorkplaneRef = useRef(null);
  const [rightTab, setRightTab] = useState("scene");
  const [selectedObjectIds, setSelectedObjectIds] = useState(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewportBackgroundColor, setViewportBackgroundColor] = useState("#f4f6f8");
  const [linePaintMode, setLinePaintMode] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState({
    runtime: false,
    workplane: false,
  });
  const [objectGroups, setObjectGroups] = useState([]);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [customObjectOpen, setCustomObjectOpen] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const undoStackRef = useRef(new UndoStack(50));

  const selectedObjectId = useMemo(() => {
    const arr = Array.from(selectedObjectIds);
    return arr.length === 1 ? arr[0] : arr[0] || null;
  }, [selectedObjectIds]);

  function selectObject(id, addToSelection = false) {
    if (addToSelection) {
      setSelectedObjectIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      const group = objectGroups.find((g) => g.objectIds.includes(id));
      if (group) {
        setSelectedObjectIds(new Set(group.objectIds));
      } else {
        setSelectedObjectIds(new Set([id]));
      }
    }
  }

  function pushUndo(label) {
    const snapshot = snapshotScene(worldScene.objects, objectGroups);
    return snapshot;
  }

  function commitUndo(label, beforeSnapshot) {
    const afterSnapshot = snapshotScene(worldScene.objects, objectGroups);
    undoStackRef.current.push(label, beforeSnapshot, afterSnapshot);
  }

  function handleUndo() {
    const result = undoStackRef.current.undo();
    if (!result) return;
    const nextWorld = { ...world, world_scene: { ...worldScene, objects: result.objects } };
    setWorld(nextWorld);
    if (result.groups) setObjectGroups(result.groups);
    void saveProjectSnapshot("undo", { world: nextWorld });
  }

  function handleRedo() {
    const result = undoStackRef.current.redo();
    if (!result) return;
    const nextWorld = { ...world, world_scene: { ...worldScene, objects: result.objects } };
    setWorld(nextWorld);
    if (result.groups) setObjectGroups(result.groups);
    void saveProjectSnapshot("redo", { world: nextWorld });
  }

  function cloneSelected() {
    if (selectedObjectIds.size === 0) return;
    const before = pushUndo("clone");
    const clones = [];
    for (const id of selectedObjectIds) {
      const obj = worldScene.objects.find((o) => o.id === id);
      if (!obj) continue;
      const clone = {
        ...obj,
        id: `${obj.type}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        position: { ...obj.position, x: obj.position.x + 20, z: obj.position.z + 20 },
        size_cm: { ...obj.size_cm },
        rotation_deg: obj.rotation_deg ? { ...obj.rotation_deg } : undefined,
        metadata: obj.metadata ? { ...obj.metadata } : undefined,
      };
      clones.push(clone);
    }
    updateWorldScene([...worldScene.objects, ...clones], "object_cloned");
    setSelectedObjectIds(new Set(clones.map((c) => c.id)));
    commitUndo("clone", before);
  }

  function mirrorSelected(axis = "x") {
    if (selectedObjectIds.size === 0) return;
    const before = pushUndo("mirror");
    const centerX = (world.width_cells * GRID_CELL_CM) / 2;
    const centerZ = (world.height_cells * GRID_CELL_CM) / 2;
    const nextObjects = worldScene.objects.map((obj) => {
      if (!selectedObjectIds.has(obj.id)) return obj;
      const mirrored = { ...obj, position: { ...obj.position } };
      if (axis === "x") {
        mirrored.position.x = 2 * centerX - obj.position.x;
      } else {
        mirrored.position.z = 2 * centerZ - obj.position.z;
      }
      if (obj.rotation_deg) {
        mirrored.rotation_deg = { y: (360 - (obj.rotation_deg.y || 0)) % 360 };
      }
      return mirrored;
    });
    updateWorldScene(nextObjects, "object_mirrored");
    commitUndo("mirror", before);
  }

  function groupSelected() {
    if (selectedObjectIds.size < 2) return;
    const ids = Array.from(selectedObjectIds);
    const alreadyGrouped = objectGroups.find((g) => g.objectIds.length === ids.length && ids.every((id) => g.objectIds.includes(id)));
    if (alreadyGrouped) return;
    const newGroup = {
      id: `group_${Date.now()}`,
      name: `Group ${objectGroups.length + 1}`,
      objectIds: ids,
    };
    setObjectGroups((prev) => [...prev.filter((g) => !ids.some((id) => g.objectIds.includes(id))), newGroup]);
  }

  function ungroupSelected() {
    if (selectedObjectIds.size === 0) return;
    setObjectGroups((prev) => prev.filter((g) => !Array.from(selectedObjectIds).some((id) => g.objectIds.includes(id))));
  }

  function deleteSelected() {
    if (selectedObjectIds.size === 0) return;
    const before = pushUndo("delete");
    updateWorldScene(
      worldScene.objects.filter((o) => !selectedObjectIds.has(o.id)),
      "object_removed",
    );
    setSelectedObjectIds(new Set());
    commitUndo("delete", before);
  }

  function nudgeSelected(dx, dz) {
    if (selectedObjectIds.size === 0) return;
    const nextObjects = worldScene.objects.map((obj) => {
      if (!selectedObjectIds.has(obj.id)) return obj;
      return { ...obj, position: { ...obj.position, x: obj.position.x + dx, z: obj.position.z + dz } };
    });
    updateWorldScene(nextObjects, "object_nudged", false);
  }

  function applyWorldPreset(preset) {
    const before = pushUndo("preset");
    const nextWorld = {
      ...world,
      width_cells: preset.widthCells,
      height_cells: preset.heightCells,
      world_scene: { ...worldScene, objects: preset.objects },
    };
    setWorld(nextWorld);
    setSelectedObjectIds(new Set());
    resetCamera();
    void saveProjectSnapshot("world_preset_applied", { world: nextWorld });
    commitUndo("preset", before);
    setPresetDialogOpen(false);
  }

  const [consoleLogs, setConsoleLogs] = useState([]);
  const [showConsole, setShowConsole] = useState(false);
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function addConsoleLog(message, level = "info") {
    setConsoleLogs((prev) => [...prev.slice(-200), { id: Date.now(), message, level, time: new Date().toLocaleTimeString() }]);
  }

  function handleExportWorld() {
    const exportData = {
      format: "steamworld",
      version: 1,
      world: {
        width_cells: world.width_cells,
        height_cells: world.height_cells,
        world_scene: worldScene,
        runtime_settings: runtimeSettings,
        groups: objectGroups,
      },
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${world.name || "robotics_world"}.steamworld.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("World exported successfully");
    addConsoleLog("World exported", "info");
  }

  function handleImportWorld(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.format !== "steamworld" || !data.world) {
          showToast("Invalid world file format", "error");
          return;
        }
        const before = pushUndo("import");
        const imported = data.world;
        const nextWorld = {
          ...world,
          width_cells: imported.width_cells || world.width_cells,
          height_cells: imported.height_cells || world.height_cells,
          world_scene: imported.world_scene || worldScene,
        };
        setWorld(nextWorld);
        if (imported.groups) setObjectGroups(imported.groups);
        resetCamera();
        void saveProjectSnapshot("world_imported", { world: nextWorld });
        commitUndo("import", before);
        showToast("World imported successfully");
        addConsoleLog("World imported from file", "info");
      } catch (err) {
        showToast("Failed to parse world file", "error");
        addConsoleLog(`Import error: ${err.message}`, "error");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  const cameraModes = ["top", "follow", "perspective"];
  useKeyboardShortcuts({
    onRunPause: useCallback(() => (runtimeState === "running" ? pauseProgram() : runProgram()), [runtimeState, pauseProgram, runProgram]),
    onReset: resetProgram,
    onSave: useCallback(() => void saveProjectSnapshot("manual"), [saveProjectSnapshot]),
    onDeleteSelected: deleteSelected,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onDuplicate: cloneSelected,
    onGroup: groupSelected,
    onCameraPreset: useCallback((idx) => setCameraMode(cameraModes[idx] || "perspective"), [setCameraMode]),
    onNudge: nudgeSelected,
  });

  useEffect(() => {
    const onOpenSettings = () => setSettingsOpen(true);
    window.addEventListener("robotics:openViewportSettings", onOpenSettings);
    return () => window.removeEventListener("robotics:openViewportSettings", onOpenSettings);
  }, []);

  const worldScene = world.world_scene || { version: 1, gravity_m_s2: 9.81, objects: [] };
  const worldSummary = useMemo(
    () => `${world.width_cells * GRID_CELL_CM}cm x ${world.height_cells * GRID_CELL_CM}cm`,
    [world.height_cells, world.width_cells],
  );
  const selectedObject = useMemo(
    () => (selectedObjectId ? worldScene.objects.find((object) => object.id === selectedObjectId) : null) || null,
    [selectedObjectId, worldScene.objects],
  );
  const selectedManifest = useMemo(
    () => manifests.find((item) => item.vendor === selectedVendor && item.robot_type === selectedRobotType) || null,
    [manifests, selectedRobotType, selectedVendor],
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
  const sensorCapabilities = useMemo(() => kitCapabilities.sensors, [kitCapabilities.sensors]);
  const actuatorCapabilities = useMemo(() => kitCapabilities.actuators, [kitCapabilities.actuators]);

  useEffect(() => {
    if (!worldScene.objects.length) {
      setSelectedObjectIds(new Set());
      return;
    }
    const validIds = new Set(worldScene.objects.map((o) => o.id));
    setSelectedObjectIds((prev) => {
      const filtered = new Set([...prev].filter((id) => validIds.has(id)));
      if (filtered.size === 0 && worldScene.objects.length > 0) {
        filtered.add(worldScene.objects[0].id);
      }
      return filtered;
    });
  }, [worldScene.objects]);

  function updateWorldScene(nextObjects, reason = "world_scene_changed", persist = true) {
    const nextWorld = { ...world, world_scene: { ...worldScene, objects: nextObjects } };
    setWorld(nextWorld);
    if (persist) {
      void saveProjectSnapshot(reason, { world: nextWorld });
    }
  }

  function addObjectNearRobot(definition) {
    const objectType = definition?.placement?.objectType;
    const next = createSceneObjectFromPalette(
      definition,
      snapForObjectType(pose.position.x + 40, objectType),
      snapForObjectType(pose.position.y, objectType),
    );
    updateWorldScene([...worldScene.objects, next], "object_placed");
  }

  function paintLineTrackAt(x, z) {
    const definition = getObjectDefinitionById("sensor_line_track");
    if (!definition) return;
    const half = GRID_CELL_CM / 2;
    const px = Math.max(half, Math.min(world.width_cells * GRID_CELL_CM - half, snapToGridCenter(x)));
    const pz = Math.max(half, Math.min(world.height_cells * GRID_CELL_CM - half, snapToGridCenter(z)));
    const existing = worldScene.objects.find(
      (object) =>
        object.type === "line_segment" &&
        snapToGridCenter(object.position?.x ?? 0) === px &&
        snapToGridCenter(object.position?.z ?? 0) === pz,
    );
    if (existing) {
      updateWorldScene(
        worldScene.objects.filter((object) => object.id !== existing.id),
        "line_track_erased",
      );
      return;
    }
    const next = createSceneObjectFromPalette(definition, px, pz);
    next.size_cm = {
      x: GRID_CELL_CM - 2,
      y: 1,
      z: GRID_CELL_CM - 2,
    };
    updateWorldScene([...worldScene.objects, next], "line_track_painted");
  }

  function removeObject(id) {
    const before = pushUndo("remove");
    updateWorldScene(worldScene.objects.filter((object) => object.id !== id), "object_removed");
    commitUndo("remove", before);
  }

  function updateObjectColor(id, color) {
    const nextObjects = worldScene.objects.map((object) =>
      object.id === id
        ? {
            ...object,
            metadata: {
              ...(object.metadata || {}),
              color,
            },
          }
        : object,
    );
    updateWorldScene(nextObjects, "object_recolored");
  }

  function updateObjectPosition(id, x, z) {
    const nextObjects = worldScene.objects.map((object) =>
      object.id === id
        ? {
            ...object,
            position: {
              ...(object.position || {}),
              x: Number(x),
              z: Number(z),
              y: 0,
            },
          }
        : object,
    );
    updateWorldScene(nextObjects, "object_dragged", false);
  }

  function updateObjectSize(id, nextSizeCm) {
    const nextObjects = worldScene.objects.map((object) =>
      object.id === id
        ? {
            ...object,
            size_cm: {
              ...object.size_cm,
              ...nextSizeCm,
            },
          }
        : object,
    );
    updateWorldScene(nextObjects, "object_resized", false);
  }

  function updateObjectHidden(id, hidden) {
    const nextObjects = worldScene.objects.map((object) =>
      object.id === id
        ? {
            ...object,
            metadata: {
              ...(object.metadata || {}),
              hidden,
            },
          }
        : object,
    );
    updateWorldScene(nextObjects, hidden ? "object_hidden" : "object_shown");
  }

  function updateObjectPhysicsBody(id, physicsBody) {
    const nextObjects = worldScene.objects.map((object) =>
      object.id === id
        ? {
            ...object,
            metadata: {
              ...(object.metadata || {}),
              physics_body: physicsBody,
            },
          }
        : object,
    );
    updateWorldScene(nextObjects, "object_physics_updated");
  }

  function updateObjectRotation(id, headingDeg) {
    const normalized = ((Number(headingDeg) % 360) + 360) % 360;
    const nextObjects = worldScene.objects.map((object) =>
      object.id === id
        ? {
            ...object,
            rotation_deg: {
              ...(object.rotation_deg || {}),
              y: normalized,
            },
          }
        : object,
    );
    updateWorldScene(nextObjects, "object_rotated", false);
  }

  function rotateObjectBy(id, deltaDeg) {
    const current = worldScene.objects.find((object) => object.id === id);
    const currentHeading = Number(current?.rotation_deg?.y) || 0;
    updateObjectRotation(id, currentHeading + deltaDeg);
    const nextWorld = {
      ...world,
      world_scene: {
        ...worldScene,
        objects: worldScene.objects.map((object) =>
          object.id === id
            ? {
                ...object,
                rotation_deg: {
                  ...(object.rotation_deg || {}),
                  y: ((currentHeading + deltaDeg) % 360 + 360) % 360,
                },
              }
            : object,
        ),
      },
    };
    void saveProjectSnapshot("object_rotated", { world: nextWorld });
  }

  function commitObjectMove() {
    const nextWorld = { ...world, world_scene: { ...worldScene, objects: worldScene.objects } };
    void saveProjectSnapshot("object_dragged", { world: nextWorld });
  }

  function handleRobotStartMove(nextX, nextY) {
    setStartPosition(nextX, nextY);
  }

  function commitRobotStartMove(nextX, nextY) {
    const nextWorld = { ...world, world_scene: { ...worldScene, objects: worldScene.objects } };
    void saveProjectSnapshot("start_pose_changed", {
      world: nextWorld,
      startPose: {
        ...startPose,
        position: {
          x: Number(nextX),
          y: Number(nextY),
        },
      },
    });
  }

  function handleDrop(event) {
    event.preventDefault();
    if (!dragPresetId) return;
    const definition = getObjectDefinitionById(dragPresetId);
    if (!definition) return;
    const projected = projectClientToWorkplaneRef.current?.(event.clientX, event.clientY) || null;
    const sizeCm = definition.placement.sizeCm || { x: 20, z: 20 };
    const halfX = (sizeCm.x || 20) / 2;
    const halfZ = (sizeCm.z || 20) / 2;
    const worldW = world.width_cells * GRID_CELL_CM;
    const worldD = world.height_cells * GRID_CELL_CM;
    let px;
    let pz;
    if (projected) {
      px = projected.x;
      pz = projected.z;
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      const relX = (event.clientX - rect.left) / rect.width;
      const relZ = (event.clientY - rect.top) / rect.height;
      px = relX * worldW;
      pz = relZ * worldD;
    }
    px = Math.max(halfX, Math.min(worldW - halfX, px));
    pz = Math.max(halfZ, Math.min(worldD - halfZ, pz));
    if (snapEnabled) {
      px = snapForObjectType(px, definition.placement.objectType);
      pz = snapForObjectType(pz, definition.placement.objectType);
    }
    const next = createSceneObjectFromPalette(definition, px, pz);
    updateWorldScene([...worldScene.objects, next], "object_dropped");
    setDragPresetId(null);
    setDragPreview(null);
  }

  function buildDragPreview(definition, presetId, px, pz) {
    const previewObject = createSceneObjectFromPalette(definition, px, pz);
    previewObject.id = `ghost_${presetId}`;
    return {
      presetId,
      object: previewObject,
    };
  }

  function updateDragPreviewFromEvent(event) {
    if (!dragPresetId) return;
    const definition = getObjectDefinitionById(dragPresetId);
    if (!definition) return;
    const projected = projectClientToWorkplaneRef.current?.(event.clientX, event.clientY) || null;
    let px;
    let pz;
    if (projected) {
      px = snapForObjectType(projected.x, definition.placement.objectType);
      pz = snapForObjectType(projected.z, definition.placement.objectType);
    } else {
      const rect = event.currentTarget?.getBoundingClientRect?.() || dropTargetRef.current?.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const relX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const relZ = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      px = snapForObjectType(relX * world.width_cells * GRID_CELL_CM, definition.placement.objectType);
      pz = snapForObjectType(relZ * world.height_cells * GRID_CELL_CM, definition.placement.objectType);
    }
    {
      const half = GRID_CELL_CM / 2;
      px = Math.max(half, Math.min(world.width_cells * GRID_CELL_CM - half, px));
      pz = Math.max(half, Math.min(world.height_cells * GRID_CELL_CM - half, pz));
    }
    const preview = buildDragPreview(definition, dragPresetId, px, pz);
    if (preview) setDragPreview(preview);
  }

  useEffect(() => {
    if (!dragPresetId) return undefined;
    const definition = getObjectDefinitionById(dragPresetId);
    if (!definition) return undefined;

    const onWindowDragOver = (event) => {
      const rect = dropTargetRef.current?.getBoundingClientRect?.();
      if (!rect) return;
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inside) {
        setDragPreview(null);
        return;
      }
      const projected = projectClientToWorkplaneRef.current?.(event.clientX, event.clientY) || null;
      let px;
      let pz;
      if (projected) {
        px = snapForObjectType(projected.x, definition.placement.objectType);
        pz = snapForObjectType(projected.z, definition.placement.objectType);
      } else {
        const relX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const relZ = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        px = snapForObjectType(relX * world.width_cells * GRID_CELL_CM, definition.placement.objectType);
        pz = snapForObjectType(relZ * world.height_cells * GRID_CELL_CM, definition.placement.objectType);
      }
      {
        const half = GRID_CELL_CM / 2;
        px = Math.max(half, Math.min(world.width_cells * GRID_CELL_CM - half, px));
        pz = Math.max(half, Math.min(world.height_cells * GRID_CELL_CM - half, pz));
      }
      const preview = buildDragPreview(definition, dragPresetId, px, pz);
      if (preview) setDragPreview(preview);
    };

    const clearDragPreview = () => {
      setDragPreview(null);
      setDragPresetId(null);
    };

    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("dragend", clearDragPreview);
    window.addEventListener("drop", clearDragPreview);
    return () => {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("dragend", clearDragPreview);
      window.removeEventListener("drop", clearDragPreview);
    };
  }, [dragPresetId, world.height_cells, world.width_cells]);

  function normalizedDistanceValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "";
    return Math.max(0, Math.round(numeric));
  }

  function toggleLeftPanelSection(sectionKey) {
    setLeftPanelCollapsed((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  }

  function updateObjectMetadata(id, key, value) {
    const nextObjects = worldScene.objects.map((object) =>
      object.id === id
        ? { ...object, metadata: { ...(object.metadata || {}), [key]: value } }
        : object,
    );
    updateWorldScene(nextObjects, "object_property_updated");
  }

  function renderDynamicProperties(obj) {
    if (!obj?.metadata?.palette_object_id) return null;
    const definition = getObjectDefinitionById(obj.metadata.palette_object_id);
    if (!definition?.editableProperties?.length) return null;

    const builtInKeys = new Set(["color"]);
    const dynamicProps = definition.editableProperties.filter((p) => !builtInKeys.has(p.id));
    if (dynamicProps.length === 0) return null;

    return dynamicProps.map((prop) => {
      const currentValue = obj.metadata?.[prop.id];
      if (prop.control === "number") {
        return (
          <div key={prop.id} className="robotics-sensor-card">
            <span>{prop.label}{prop.unit ? ` (${prop.unit})` : ""}</span>
            <label>
              {prop.label}
              <input
                type="number"
                min={prop.min ?? 0}
                max={prop.max ?? 9999}
                step={prop.step ?? 1}
                value={currentValue ?? prop.min ?? 0}
                onChange={(e) => updateObjectMetadata(obj.id, prop.id, Number(e.target.value))}
              />
            </label>
          </div>
        );
      }
      if (prop.control === "text") {
        return (
          <div key={prop.id} className="robotics-sensor-card">
            <span>{prop.label}</span>
            <label>
              {prop.label}
              <input
                type="text"
                value={currentValue ?? ""}
                onChange={(e) => updateObjectMetadata(obj.id, prop.id, e.target.value)}
              />
            </label>
          </div>
        );
      }
      if (prop.control === "select" && prop.options) {
        return (
          <div key={prop.id} className="robotics-sensor-card">
            <span>{prop.label}</span>
            <label>
              {prop.label}
              <select
                value={currentValue ?? ""}
                onChange={(e) => updateObjectMetadata(obj.id, prop.id, e.target.value)}
              >
                {prop.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
        );
      }
      if (prop.control === "color") {
        return (
          <div key={prop.id} className="robotics-sensor-card">
            <span>{prop.label}</span>
            <label>
              {prop.label}
              <input type="color" value={currentValue ?? "#60a5fa"} onChange={(e) => updateObjectMetadata(obj.id, prop.id, e.target.value)} />
            </label>
          </div>
        );
      }
      return null;
    });
  }

  return (
    <div className="robotics-editor-shell">
      <header className="robotics-topbar">
        <div className="robotics-topbar__left">
          <input
            className="robotics-topbar__filename"
            type="text"
            value={world.name || ""}
            placeholder="Untitled World"
            onChange={(e) => setWorld((prev) => ({ ...prev, name: e.target.value }))}
            onBlur={() => void saveProjectSnapshot("rename")}
          />
          <button className="robotics-topbar__btn" onClick={() => { void saveProjectSnapshot("manual"); showToast("Project saved"); }} title="Save (Ctrl+S)">
            <Save size={15} />
          </button>
          <div className="robotics-topbar__sep" />
          <button className="robotics-topbar__btn" onClick={handleUndo} disabled={!undoStackRef.current.canUndo()} title="Undo (Ctrl+Z)">
            <Undo2 size={15} />
          </button>
          <button className="robotics-topbar__btn" onClick={handleRedo} disabled={!undoStackRef.current.canRedo()} title="Redo (Ctrl+Shift+Z)">
            <Redo2 size={15} />
          </button>
          <div className="robotics-topbar__sep" />
          <button
            className={`robotics-topbar__btn${snapEnabled ? " robotics-topbar__btn--active" : ""}`}
            onClick={() => setSnapEnabled((p) => !p)}
            title={snapEnabled ? "Snap On (click to disable)" : "Snap Off (click to enable)"}
          >
            <Magnet size={15} /> Snap
          </button>
        </div>

        <div className="robotics-topbar__center">
          <button className="robotics-topbar__btn" onClick={runProgram} title="Run">
            <Play size={15} /> Run
          </button>
          <button className="robotics-topbar__btn" onClick={pauseProgram} title="Pause">
            <Pause size={15} /> Pause
          </button>
          <StepSplitButton onStep={stepProgram} onStepInto={stepIntoProgram} onStepOver={stepOverProgram} />
          <button className="robotics-topbar__btn" onClick={resetProgram} title="Reset">
            <RotateCcw size={15} /> Reset
          </button>
        </div>

        <div className="robotics-topbar__right">
          <span className="robotics-topbar__pill">{runtimeState}</span>
          <span className="robotics-topbar__pill">{worldSummary}</span>
          <div className="robotics-topbar__sep" />
          <button className="robotics-topbar__btn" onClick={handleExportWorld} title="Export World">
            <Download size={15} />
          </button>
          <button className="robotics-topbar__btn" onClick={() => fileInputRef.current?.click()} title="Import World">
            <Upload size={15} />
          </button>
          <button className="robotics-topbar__btn" onClick={() => setShowConsole((p) => !p)} title="Toggle Console">
            {showConsole ? "Hide Log" : "Log"}
          </button>
        </div>
      </header>

      <div className="robotics-split-content">
      <aside className="robotics-lab-left">
        <section className="robotics-left-card">
          <button
            type="button"
            className="robotics-left-card-toggle"
            onClick={() => toggleLeftPanelSection("runtime")}
            aria-expanded={!leftPanelCollapsed.runtime}
          >
            <h3>Simulation Settings</h3>
            <span className="robotics-left-card-toggle__hint">
              {leftPanelCollapsed.runtime ? "Expand" : "Collapse"}
            </span>
          </button>
          {!leftPanelCollapsed.runtime ? (
            <>
              <div className="robotics-config-grid">
                <label className="robotics-form-field">
                  <span>Tick (ms)</span>
                  <input
                    type="number"
                    min={50}
                    max={1000}
                    value={runtimeSettings.tick_ms ?? 200}
                    onChange={(event) =>
                      setRuntimeSettings((prev) => ({ ...prev, tick_ms: Number(event.target.value) || 200 }))
                    }
                    onBlur={() => void saveProjectSnapshot("runtime_settings_changed")}
                  />
                </label>
                <label className="robotics-form-field">
                  <span>Robot start heading (deg)</span>
                  <input
                    type="number"
                    min={0}
                    max={359}
                    value={Math.round(startPose.heading_deg ?? 0)}
                    onChange={(event) => setStartHeading(Number(event.target.value))}
                  />
                </label>
              </div>
              <div className="robotics-lab-controls robotics-lab-controls--compact">
                <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={() => rotateStartHeading(-15)}>
                  <RotateCcw size={14} /> Robot -15°
                </button>
                <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={() => rotateStartHeading(15)}>
                  <RotateCw size={14} /> Robot +15°
                </button>
              </div>
            </>
          ) : null}
        </section>

        <section className="robotics-left-card">
          <button
            type="button"
            className="robotics-left-card-toggle"
            onClick={() => toggleLeftPanelSection("workplane")}
            aria-expanded={!leftPanelCollapsed.workplane}
          >
            <h4>Workplane</h4>
            <span className="robotics-left-card-toggle__hint">
              {leftPanelCollapsed.workplane ? "Expand" : "Collapse"}
            </span>
          </button>
          {!leftPanelCollapsed.workplane ? (
            <div className="robotics-workplane-controls">
              <div className="robotics-workplane-presets">
                {[
                  { label: "Small", w: 20, h: 20, cm: "400x400" },
                  { label: "Medium", w: 40, h: 24, cm: "800x480" },
                  { label: "Large", w: 50, h: 50, cm: "1000x1000" },
                  { label: "VEX", w: 90, h: 90, cm: "1800x1800" },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    className={`robotics-lab-btn robotics-workplane-preset${
                      world.width_cells === preset.w && world.height_cells === preset.h ? " active" : ""
                    }`}
                    onClick={() => {
                      setWorld((prev) => ({ ...prev, width_cells: preset.w, height_cells: preset.h }));
                      resetCamera();
                    }}
                    title={preset.cm + " cm"}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="robotics-workplane-dims">
                <label className="robotics-form-field">
                  <span>Width (cm)</span>
                  <input
                    type="number"
                    min={200}
                    max={2000}
                    step={GRID_CELL_CM}
                    value={world.width_cells * GRID_CELL_CM}
                    onChange={(event) => {
                      const cm = Math.max(200, Math.min(2000, Number(event.target.value) || 200));
                      setWorld((prev) => ({ ...prev, width_cells: Math.round(cm / GRID_CELL_CM) }));
                    }}
                    onBlur={resetCamera}
                  />
                </label>
                <label className="robotics-form-field">
                  <span>Depth (cm)</span>
                  <input
                    type="number"
                    min={200}
                    max={2000}
                    step={GRID_CELL_CM}
                    value={world.height_cells * GRID_CELL_CM}
                    onChange={(event) => {
                      const cm = Math.max(200, Math.min(2000, Number(event.target.value) || 200));
                      setWorld((prev) => ({ ...prev, height_cells: Math.round(cm / GRID_CELL_CM) }));
                    }}
                    onBlur={resetCamera}
                  />
                </label>
              </div>
            </div>
          ) : null}
        </section>

        <section className="robotics-left-card">
          <button
            className="robotics-lab-btn robotics-lab-btn--icon robotics-preset-btn"
            onClick={() => setPresetDialogOpen(true)}
          >
            <LayoutTemplate size={16} /> World Templates
          </button>
          {presetDialogOpen && (
            <div className="robotics-preset-dialog">
              <div className="robotics-preset-dialog-header">
                <h4>World Templates</h4>
                <button className="robotics-lab-btn" onClick={() => setPresetDialogOpen(false)}>Close</button>
              </div>
              <div className="robotics-preset-grid">
                {WORLD_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className="robotics-preset-card"
                    onClick={() => applyWorldPreset(preset)}
                  >
                    <div className="robotics-preset-card-header">
                      <strong>{preset.name}</strong>
                      <span className={`robotics-difficulty-badge robotics-difficulty-badge--${preset.difficulty}`}>
                        {preset.difficulty}
                      </span>
                    </div>
                    <p>{preset.description}</p>
                    <span className="robotics-preset-meta">
                      {preset.widthCells * GRID_CELL_CM}x{preset.heightCells * GRID_CELL_CM} cm
                      {preset.objects.length > 0 ? ` • ${preset.objects.length} objects` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="robotics-left-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <h4 style={{ margin: 0 }}>Object Library</h4>
            <button className="robotics-lab-btn" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setCustomObjectOpen(true)}>+ Custom</button>
          </div>
          {linePaintMode ? (
            <div className="robotics-line-paint-mode">
              <span>Line paint mode active: click workplane squares to draw/erase.</span>
              <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={() => setLinePaintMode(false)}>
                Exit line paint
              </button>
            </div>
          ) : null}
          <ObjectPalette
            onAdd={(definition) => {
              if (definition.id === "sensor_line_track") {
                setLinePaintMode(true);
                return;
              }
              setLinePaintMode(false);
              addObjectNearRobot(definition);
            }}
            onDragStart={(definition, event) => {
              setLinePaintMode(false);
              setDragPresetId(definition.id);
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData("text/plain", definition.id);
              event.dataTransfer.setDragImage(getTransparentDragImage(), 0, 0);
            }}
          />
        </section>
      </aside>

      <section className="robotics-sim-pane">
        <div
          ref={dropTargetRef}
          className="robotics-drop-target robotics-drop-target--floating"
          onDrop={handleDrop}
          onDragEnter={(event) => {
            event.preventDefault();
            updateDragPreviewFromEvent(event);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            updateDragPreviewFromEvent(event);
          }}
          onDragLeave={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const isOutside =
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom;
            if (isOutside) {
              setDragPreview(null);
            }
          }}
        >
          <ThreeSimViewport
            worldScene={worldScene}
            pose={pose}
            robotModel={robotModel}
            sensorValues={sensorValues}
            cameraState={cameraState}
            overlayState={overlayState}
            pathTrailResetToken={pathTrailResetToken}
            measurementResetToken={measurementResetToken}
            runtimeState={runtimeState}
            cameraResetToken={cameraResetToken}
            cameraFocusToken={cameraFocusToken}
            editable
            worldSizeCm={{
              width: world.width_cells * GRID_CELL_CM,
              depth: world.height_cells * GRID_CELL_CM,
            }}
            backgroundColor={viewportBackgroundColor}
            snapEnabled={snapEnabled}
            onObjectMove={updateObjectPosition}
            onObjectDragEnd={commitObjectMove}
            onObjectSelect={(id, event) => {
              selectObject(id, event?.shiftKey);
              setRightTab("properties");
            }}
            selectedObjectId={selectedObjectId}
            robotStartPose={startPose}
            onRobotStartMove={handleRobotStartMove}
            onRobotStartMoveEnd={commitRobotStartMove}
            ghostObject={dragPreview?.object || null}
            onProjectClientToWorkplaneReady={(project) => {
              projectClientToWorkplaneRef.current = project;
            }}
            onWorkplaneClick={(x, z) => {
              setSelectedObjectIds(new Set());
              if (!linePaintMode) return;
              paintLineTrackAt(x, z);
            }}
          />
          {selectedObjectIds.size > 0 && (
            <div className="robotics-floating-object-ops">
              <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={cloneSelected} title="Clone (Ctrl+D)">
                <Copy size={14} /> Clone
              </button>
              <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={() => mirrorSelected("x")} title="Mirror X">
                <FlipHorizontal size={14} /> Mirror
              </button>
              {selectedObjectIds.size >= 2 && (
                <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={groupSelected} title="Group (Ctrl+G)">
                  <Group size={14} /> Group
                </button>
              )}
              {objectGroups.some((g) => Array.from(selectedObjectIds).some((id) => g.objectIds.includes(id))) && (
                <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={ungroupSelected} title="Ungroup">
                  <Ungroup size={14} /> Ungroup
                </button>
              )}
              <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={deleteSelected} title="Delete">
                <Trash2 size={14} />
              </button>
            </div>
          )}
          <div className="robotics-floating-controls-right">
            <CameraToolbar
              mode={cameraState.mode}
              onModeChange={setCameraMode}
              onReset={() => resetCamera()}
              onFocusRobot={focusCameraOnRobot}
              onZoomIn={() => zoomCamera(0.12)}
              onZoomOut={() => zoomCamera(-0.12)}
              lockFollowHeading={cameraState.lockFollowHeading}
              onToggleFollowHeading={() =>
                updateCameraState({
                  lockFollowHeading: !cameraState.lockFollowHeading,
                })
              }
            />
          </div>
          <div className="robotics-floating-debugger-panel">
            <DebuggerStatusPanel debugSession={debugSession} compact />
          </div>
          <div className="robotics-floating-controls-bottom">
            <OverlayToggles
              overlays={overlayState}
              onToggle={toggleOverlay}
              onSetMeasurementLabelSize={setMeasurementLabelSize}
            />
          </div>
        </div>
      </section>
      <ViewportSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        backgroundColor={viewportBackgroundColor}
        onBackgroundColorChange={setViewportBackgroundColor}
        moveCollisionPolicy={runtimeSettings.move_collision_policy || "hold_until_distance"}
        onMoveCollisionPolicyChange={(policy) => {
          setRuntimeSettings((prev) => ({ ...prev, move_collision_policy: policy }));
          void saveProjectSnapshot("runtime_settings_changed");
        }}
        physicsEngine={runtimeSettings.physics_engine || "three_runtime"}
        onPhysicsEngineChange={(engine) => {
          setRuntimeSettings((prev) => ({ ...prev, physics_engine: engine }));
          void saveProjectSnapshot("runtime_settings_changed");
        }}
        tractionLongitudinal={Number(runtimeSettings.traction_longitudinal ?? 0.92)}
        onTractionLongitudinalChange={(value) => {
          setRuntimeSettings((prev) => ({ ...prev, traction_longitudinal: value }));
          void saveProjectSnapshot("runtime_settings_changed");
        }}
        tractionLateral={Number(runtimeSettings.traction_lateral ?? 0.9)}
        onTractionLateralChange={(value) => {
          setRuntimeSettings((prev) => ({ ...prev, traction_lateral: value }));
          void saveProjectSnapshot("runtime_settings_changed");
        }}
        rollingResistance={Number(runtimeSettings.rolling_resistance ?? 4.2)}
        onRollingResistanceChange={(value) => {
          setRuntimeSettings((prev) => ({ ...prev, rolling_resistance: value }));
          void saveProjectSnapshot("runtime_settings_changed");
        }}
        robotMaxClimbSlopeDeg={Number(runtimeSettings.robot_max_climb_slope_deg ?? 16)}
        onRobotMaxClimbSlopeDegChange={(value) => {
          const clamped = Math.max(0, Math.min(60, Number(value) || 0));
          setRuntimeSettings((prev) => ({ ...prev, robot_max_climb_slope_deg: clamped }));
          void saveProjectSnapshot("runtime_settings_changed");
        }}
      />

      <aside className="robotics-lab-right robotics-lab-right--editor">
        <section className="robotics-side-section robotics-side-section--grow robotics-side-main-panel">
          <div className="robotics-side-tabs">
            <button
              className={`robotics-side-tab${rightTab === "scene" ? " active" : ""}`}
              onClick={() => setRightTab("scene")}
            >
              Scene
            </button>
            <button
              className={`robotics-side-tab${rightTab === "properties" ? " active" : ""}`}
              onClick={() => setRightTab("properties")}
            >
              Properties
            </button>
          </div>

          {rightTab === "scene" ? (
            <section className="robotics-side-section robotics-side-section--grow robotics-side-tab-panel">
              <div className="robotics-log--scene-objects">
                {worldScene.objects.map((object) => {
                  const hidden = Boolean(object?.metadata?.hidden);
                  const isSelected = selectedObjectIds.has(object.id);
                  return (
                    <div
                      key={object.id}
                      className={`robotics-scene-row${isSelected ? " robotics-scene-row--selected" : ""}`}
                      onClick={(e) => selectObject(object.id, e.shiftKey)}
                    >
                      <span className="robotics-scene-name">{object.metadata?.palette_object_id ? (getObjectDefinitionById(object.metadata.palette_object_id)?.displayName || object.type) : object.type}</span>
                      <span className="robotics-scene-pos" title="Position in centimeters">
                        {Math.round(object.position?.x ?? 0)}, {Math.round(object.position?.z ?? 0)}
                      </span>
                      <button
                        className="robotics-scene-action-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          updateObjectHidden(object.id, !hidden);
                        }}
                        title={hidden ? "Show object" : "Hide object"}
                      >
                        {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        className="robotics-scene-action-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeObject(object.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
                {worldScene.objects.length === 0 ? <div className="robotics-stack-empty">No scene objects yet.</div> : null}
              </div>
            </section>
          ) : (
            <section className="robotics-side-section robotics-side-section--grow robotics-side-tab-panel">
              {selectedObject ? (
                <div className="robotics-sensor-cards">
                  <div className="robotics-sensor-card">
                    <span>Type</span>
                    <strong>{selectedObject.metadata?.palette_object_id ? (getObjectDefinitionById(selectedObject.metadata.palette_object_id)?.displayName || selectedObject.type) : selectedObject.type}</strong>
                  </div>
                  {(selectedObject.type === "obstacle" || selectedObject.type === "wall") && (
                    <div className="robotics-sensor-card">
                      <span>Physics body</span>
                      <label>
                        Body
                        <select
                          value={selectedObject?.metadata?.physics_body === "dynamic" ? "dynamic" : "static"}
                          onChange={(event) => updateObjectPhysicsBody(selectedObject.id, event.target.value)}
                          disabled={selectedObject.type === "wall"}
                        >
                          <option value="static">Static (fixed)</option>
                          <option value="dynamic">Dynamic (pushable)</option>
                        </select>
                      </label>
                    </div>
                  )}
                  <div className="robotics-sensor-card">
                    <span>Color</span>
                    <label>
                      Color
                      <input
                        type="color"
                        value={
                          typeof selectedObject?.metadata?.color === "string" ? selectedObject.metadata.color : "#60a5fa"
                        }
                        onChange={(event) => updateObjectColor(selectedObject.id, event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="robotics-sensor-card">
                    <span>Location</span>
                    <label>
                      X
                      <input
                        type="number"
                        value={Math.round(selectedObject.position?.x ?? 0)}
                        onChange={(event) =>
                          updateObjectPosition(selectedObject.id, Number(event.target.value), Number(selectedObject.position?.z ?? 0))
                        }
                      />
                    </label>
                    <label>
                      Z
                      <input
                        type="number"
                        value={Math.round(selectedObject.position?.z ?? 0)}
                        onChange={(event) =>
                          updateObjectPosition(selectedObject.id, Number(selectedObject.position?.x ?? 0), Number(event.target.value))
                        }
                      />
                    </label>
                  </div>
                  <div className="robotics-sensor-card">
                    <span>Rotation (Y)</span>
                    <label>
                      Heading
                      <input
                        type="number"
                        min={0}
                        max={359}
                        value={Math.round(Number(selectedObject?.rotation_deg?.y) || 0)}
                        onChange={(event) => updateObjectRotation(selectedObject.id, Number(event.target.value))}
                      />
                    </label>
                    <div className="robotics-sensor-actions">
                      <button className="robotics-lab-btn" onClick={() => rotateObjectBy(selectedObject.id, -15)}>
                        <RotateCcw size={12} /> -15
                      </button>
                      <button className="robotics-lab-btn" onClick={() => rotateObjectBy(selectedObject.id, 15)}>
                        <RotateCw size={12} /> +15
                      </button>
                    </div>
                  </div>
                  <div className="robotics-sensor-card">
                    <span>Scale / Size</span>
                    <label>
                      Width
                      <input
                        type="number"
                        min={2}
                        value={Math.round(Number(selectedObject?.size_cm?.x) || 20)}
                        onChange={(event) => updateObjectSize(selectedObject.id, { x: Math.max(2, Number(event.target.value) || 2) })}
                      />
                    </label>
                    <label>
                      Height
                      <input
                        type="number"
                        min={2}
                        value={Math.round(Number(selectedObject?.size_cm?.y) || 20)}
                        onChange={(event) => updateObjectSize(selectedObject.id, { y: Math.max(2, Number(event.target.value) || 2) })}
                      />
                    </label>
                    <label>
                      Depth
                      <input
                        type="number"
                        min={2}
                        value={Math.round(Number(selectedObject?.size_cm?.z) || 20)}
                        onChange={(event) => updateObjectSize(selectedObject.id, { z: Math.max(2, Number(event.target.value) || 2) })}
                      />
                    </label>
                  </div>
                  {renderDynamicProperties(selectedObject)}
                </div>
              ) : (
                <div className="robotics-stack-empty">Select a scene object to edit properties.</div>
              )}
            </section>
          )}
        </section>
        <section className="robotics-side-section robotics-side-sensors-panel">
          <div className="robotics-side-tabs robotics-side-tabs--sensors">
            <span className="robotics-side-tab active">Sensors</span>
          </div>
          <div className="robotics-sensor-cards robotics-sensor-cards--sensor-panel">
            {sensorCapabilities.map((sensorCapability) => (
              <div key={sensorCapability.kind} className="robotics-sensor-card">
                <span>{sensorCapability.label}</span>
                <strong>{formatSensorValue(sensorCapability.kind, sensorValues?.[sensorCapability.kind])}</strong>
                {sensorCapability.override.type === "number" ? (
                  <label>
                    Override
                    <input
                      type="number"
                      min={0}
                      value={
                        sensorOverrides[sensorCapability.kind] === undefined || sensorOverrides[sensorCapability.kind] === null
                          ? ""
                          : String(sensorOverrides[sensorCapability.kind])
                      }
                      placeholder="auto"
                      onChange={(event) => {
                        const next = normalizedDistanceValue(event.target.value);
                        if (next === "") clearSensorOverride(sensorCapability.kind);
                        else setSensorOverride(sensorCapability.kind, Number(next));
                      }}
                    />
                  </label>
                ) : null}
                {sensorCapability.override.type === "select" ? (
                  <label>
                    Override
                    <select
                      value={
                        sensorOverrides[sensorCapability.kind] === undefined || sensorOverrides[sensorCapability.kind] === null
                          ? ""
                          : String(sensorOverrides[sensorCapability.kind])
                      }
                      onChange={(event) => {
                        if (!event.target.value) clearSensorOverride(sensorCapability.kind);
                        else setSensorOverride(sensorCapability.kind, event.target.value);
                      }}
                    >
                      <option value="">auto</option>
                      {(sensorCapability.override.options || []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {sensorCapability.override.type === "boolean" ? (
                  <div className="robotics-sensor-actions">
                    <button className="robotics-lab-btn" onClick={() => clearSensorOverride(sensorCapability.kind)}>Auto</button>
                    <button className="robotics-lab-btn" onClick={() => setSensorOverride(sensorCapability.kind, true)}>On</button>
                    <button className="robotics-lab-btn" onClick={() => setSensorOverride(sensorCapability.kind, false)}>Off</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="robotics-side-tabs robotics-side-tabs--sensors">
            <span className="robotics-side-tab active">Actuators</span>
          </div>
          <div className="robotics-sensor-cards robotics-sensor-cards--sensor-panel">
            {actuatorCapabilities.map((actuatorCapability) => (
              <div key={actuatorCapability.kind} className="robotics-sensor-card">
                <span>{actuatorCapability.label}</span>
                <strong>Available</strong>
              </div>
            ))}
          </div>
        </section>
      </aside>
      {showConsole && (
        <div className="robotics-console-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <strong style={{ fontSize: 11, color: "#9aa5b4" }}>Console</strong>
            <button className="robotics-lab-btn" style={{ fontSize: 10, padding: "2px 6px" }} onClick={() => setConsoleLogs([])}>
              Clear
            </button>
          </div>
          {consoleLogs.length === 0 ? (
            <div style={{ color: "#6b7b8d", fontSize: 11 }}>No log messages.</div>
          ) : (
            consoleLogs.map((log) => (
              <div key={log.id} className={`console-${log.level}`} style={{ fontSize: 11, lineHeight: 1.6 }}>
                <span style={{ color: "#6b7b8d", marginRight: 6 }}>{log.time}</span>
                {log.message}
              </div>
            ))
          )}
        </div>
      )}
      {toast && <div className={`robotics-toast robotics-toast--${toast.type}`}>{toast.message}</div>}
      <input ref={fileInputRef} type="file" accept=".json,.steamworld.json" style={{ display: "none" }} onChange={handleImportWorld} />
      <CustomObjectCreator
        open={customObjectOpen}
        onClose={() => setCustomObjectOpen(false)}
        onCreateObject={(customObj) => {
          const before = pushUndo("custom_object");
          const placed = {
            ...customObj,
            position: { x: (world.width_cells * GRID_CELL_CM) / 2, y: 0, z: (world.height_cells * GRID_CELL_CM) / 2 },
          };
          updateWorldScene([...worldScene.objects, placed], "custom_object_created");
          selectObject(placed.id);
          commitUndo("custom_object", before);
          addConsoleLog(`Custom object "${customObj.metadata?.custom_name || "object"}" created`, "info");
        }}
      />
      {panel}
    </div>
    </div>
  );
}
