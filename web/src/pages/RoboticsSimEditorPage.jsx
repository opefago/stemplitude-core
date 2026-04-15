import { Eye, EyeOff, Pause, Play, RotateCcw, RotateCw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewportBackgroundColor, setViewportBackgroundColor] = useState("#f4f6f8");
  const [linePaintMode, setLinePaintMode] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState({
    runtime: false,
    workplane: false,
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
    () => worldScene.objects.find((object) => object.id === selectedObjectId) || null,
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
      setSelectedObjectId(null);
      return;
    }
    if (!selectedObjectId || !worldScene.objects.some((object) => object.id === selectedObjectId)) {
      setSelectedObjectId(worldScene.objects[0].id);
    }
  }, [selectedObjectId, worldScene.objects]);

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
    updateWorldScene(worldScene.objects.filter((object) => object.id !== id), "object_removed");
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
              x: snapForObjectType(x, object.type),
              z: snapForObjectType(z, object.type),
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
    let px;
    let pz;
    if (projected) {
      px = snapForObjectType(projected.x, definition.placement.objectType);
      pz = snapForObjectType(projected.z, definition.placement.objectType);
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      const relX = (event.clientX - rect.left) / rect.width;
      const relZ = (event.clientY - rect.top) / rect.height;
      px = snapForObjectType(relX * world.width_cells * GRID_CELL_CM, definition.placement.objectType);
      pz = snapForObjectType(relZ * world.height_cells * GRID_CELL_CM, definition.placement.objectType);
    }
    {
      const half = GRID_CELL_CM / 2;
      px = Math.max(half, Math.min(world.width_cells * GRID_CELL_CM - half, px));
      pz = Math.max(half, Math.min(world.height_cells * GRID_CELL_CM - half, pz));
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

  return (
    <div className="robotics-split-content">
      <aside className="robotics-lab-left">
        <section className="robotics-left-card">
          <button
            type="button"
            className="robotics-left-card-toggle"
            onClick={() => toggleLeftPanelSection("runtime")}
            aria-expanded={!leftPanelCollapsed.runtime}
          >
            <h3>Simulation Runtime</h3>
            <span className="robotics-left-card-toggle__hint">
              {leftPanelCollapsed.runtime ? "Expand" : "Collapse"}
            </span>
          </button>
          {!leftPanelCollapsed.runtime ? (
            <>
              <div className="robotics-runtime-stats">
                <span className="robotics-runtime-pill"><strong>Runtime</strong> {runtimeState}</span>
                <span className="robotics-runtime-pill"><strong>World</strong> {worldSummary}</span>
              </div>
              <div className="robotics-lab-controls robotics-lab-controls--compact">
                <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={runProgram}><Play size={16} /> Run</button>
                <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={pauseProgram}><Pause size={16} /> Pause</button>
                <StepSplitButton onStep={stepProgram} onStepInto={stepIntoProgram} onStepOver={stepOverProgram} />
                <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={resetProgram}><RotateCcw size={16} /> Reset</button>
                <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={() => void saveProjectSnapshot("manual")}><Save size={16} /> Save</button>
              </div>
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
          ) : (
            <div className="robotics-runtime-stats">
              <span className="robotics-runtime-pill"><strong>Runtime</strong> {runtimeState}</span>
              <span className="robotics-runtime-pill"><strong>World</strong> {worldSummary}</span>
            </div>
          )}
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
          <h4>Object Library</h4>
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
            onObjectMove={updateObjectPosition}
            onObjectDragEnd={commitObjectMove}
            onObjectSelect={(id) => {
              setSelectedObjectId(id);
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
              if (!linePaintMode) return;
              paintLineTrackAt(x, z);
            }}
          />
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
                  return (
                    <div
                      key={object.id}
                      className={`robotics-scene-row${selectedObjectId === object.id ? " robotics-scene-row--selected" : ""}`}
                      onClick={() => setSelectedObjectId(object.id)}
                    >
                      <span className="robotics-scene-name">{object.type}</span>
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
                    <strong>{selectedObject.type}</strong>
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
      {panel}
    </div>
  );
}
