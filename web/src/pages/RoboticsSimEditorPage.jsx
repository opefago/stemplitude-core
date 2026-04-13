import { Eye, EyeOff, Pause, Play, RotateCcw, RotateCw, Save, StepForward, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRoboticsWorkspaceContext } from "../features/robotics_lab/RoboticsWorkspaceContext";
import { GRID_CELL_CM } from "../features/robotics_lab/workspaceDefaults";
import { ThreeSimViewport } from "../features/robotics_lab/ThreeSimViewport";
import { CameraToolbar } from "../features/robotics_lab/components/CameraToolbar";
import { OverlayToggles } from "../features/robotics_lab/components/OverlayToggles";

const PLACEMENT_ITEMS = [
  { type: "wall", label: "Wall", size: { x: 120, y: 28, z: 18 }, defaultColor: "#6b7280" },
  { type: "obstacle", label: "Obstacle", size: { x: 40, y: 20, z: 40 }, defaultColor: "#ef4444" },
  { type: "target_zone", label: "Target Zone", size: { x: 60, y: 10, z: 60 }, defaultColor: "#22c55e" },
  { type: "color_zone", label: "Color Zone", size: { x: 50, y: 6, z: 50 }, defaultColor: "#f59e0b" },
];

function makeSceneObject(item, x, z) {
  return {
    id: `${item.type}_${Date.now()}`,
    type: item.type,
    position: { x, y: 0, z },
    size_cm: item.size,
    rotation_deg: { y: 0 },
    metadata: {
      color: item.defaultColor,
    },
  };
}

export default function RoboticsSimEditorPage() {
  const {
    world,
    setWorld,
    pose,
    sensorValues,
    sensorOverrides,
    setSensorOverride,
    clearSensorOverride,
    runtimeState,
    runtimeSettings,
    setRuntimeSettings,
    startPose,
    setStartPosition,
    rotateStartHeading,
    setStartHeading,
    cameraState,
    overlayState,
    pathTrailResetToken,
    cameraResetToken,
    cameraFocusToken,
    setCameraMode,
    resetCamera,
    focusCameraOnRobot,
    zoomCamera,
    toggleOverlay,
    updateCameraState,
    runProgram,
    pauseProgram,
    stepProgram,
    resetProgram,
    saveProjectSnapshot,
    panel,
  } = useRoboticsWorkspaceContext();
  const [dragType, setDragType] = useState(null);
  const [rightTab, setRightTab] = useState("scene");
  const [selectedObjectId, setSelectedObjectId] = useState(null);

  const worldScene = world.world_scene || { version: 1, gravity_m_s2: 9.81, objects: [] };
  const worldSummary = useMemo(
    () => `${world.width_cells * GRID_CELL_CM}cm x ${world.height_cells * GRID_CELL_CM}cm`,
    [world.height_cells, world.width_cells],
  );
  const selectedObject = useMemo(
    () => worldScene.objects.find((object) => object.id === selectedObjectId) || null,
    [selectedObjectId, worldScene.objects],
  );

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

  function addObjectNearRobot(item) {
    const next = makeSceneObject(item, pose.position.x + 40, pose.position.y);
    updateWorldScene([...worldScene.objects, next], "object_placed");
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
              x,
              z,
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
    if (!dragType) return;
    const item = PLACEMENT_ITEMS.find((entry) => entry.type === dragType);
    if (!item) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relX = (event.clientX - rect.left) / rect.width;
    const relZ = (event.clientY - rect.top) / rect.height;
    const px = relX * world.width_cells * GRID_CELL_CM;
    const pz = relZ * world.height_cells * GRID_CELL_CM;
    const next = makeSceneObject(item, px, pz);
    updateWorldScene([...worldScene.objects, next], "object_dropped");
    setDragType(null);
  }

  function normalizedDistanceValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "";
    return Math.max(0, Math.round(numeric));
  }

  return (
    <div className="robotics-split-content">
      <aside className="robotics-lab-left">
        <section className="robotics-left-card">
          <h3>Simulation Runtime</h3>
          <div className="robotics-runtime-stats">
            <span className="robotics-runtime-pill"><strong>Runtime</strong> {runtimeState}</span>
            <span className="robotics-runtime-pill"><strong>World</strong> {worldSummary}</span>
          </div>
          <div className="robotics-lab-controls robotics-lab-controls--compact">
            <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={runProgram}><Play size={16} /> Run</button>
            <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={pauseProgram}><Pause size={16} /> Pause</button>
            <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={stepProgram}><StepForward size={16} /> Step</button>
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
        </section>

        <section className="robotics-left-card">
          <h4>Workplane</h4>
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
        </section>

        <section className="robotics-left-card">
          <h4>Drag to place</h4>
          <div className="robotics-placement-library">
            {PLACEMENT_ITEMS.map((item) => (
              <button
                key={item.type}
                className="robotics-block-btn"
                draggable
                onDragStart={() => setDragType(item.type)}
                onClick={() => addObjectNearRobot(item)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="robotics-sim-pane">
        <div
          className="robotics-drop-target robotics-drop-target--floating"
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
        >
          <ThreeSimViewport
            worldScene={worldScene}
            pose={pose}
            sensorValues={sensorValues}
            cameraState={cameraState}
            overlayState={overlayState}
            pathTrailResetToken={pathTrailResetToken}
            cameraResetToken={cameraResetToken}
            cameraFocusToken={cameraFocusToken}
            editable
            worldSizeCm={{
              width: world.width_cells * GRID_CELL_CM,
              depth: world.height_cells * GRID_CELL_CM,
            }}
            onObjectMove={updateObjectPosition}
            onObjectDragEnd={commitObjectMove}
            onObjectSelect={(id) => {
              setSelectedObjectId(id);
              setRightTab("properties");
            }}
            robotStartPose={startPose}
            onRobotStartMove={handleRobotStartMove}
            onRobotStartMoveEnd={commitRobotStartMove}
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
          <div className="robotics-floating-controls-bottom">
            <OverlayToggles overlays={overlayState} onToggle={toggleOverlay} />
          </div>
        </div>
      </section>

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
            <div className="robotics-sensor-card">
              <span>Distance</span>
              <strong>{Number(sensorValues?.distance ?? 0).toFixed(1)} cm</strong>
              <label>
                Override
                <input
                  type="number"
                  min={0}
                  value={
                    sensorOverrides.distance === undefined || sensorOverrides.distance === null
                      ? ""
                      : String(sensorOverrides.distance)
                  }
                  placeholder="auto"
                  onChange={(event) => {
                    const next = normalizedDistanceValue(event.target.value);
                    if (next === "") clearSensorOverride("distance");
                    else setSensorOverride("distance", Number(next));
                  }}
                />
              </label>
            </div>
            <div className="robotics-sensor-card">
              <span>Bumper</span>
              <strong>{sensorValues?.bumper ? "Pressed" : "Released"}</strong>
              <div className="robotics-sensor-actions">
                <button className="robotics-lab-btn" onClick={() => clearSensorOverride("bumper")}>Auto</button>
                <button className="robotics-lab-btn" onClick={() => setSensorOverride("bumper", true)}>On</button>
                <button className="robotics-lab-btn" onClick={() => setSensorOverride("bumper", false)}>Off</button>
              </div>
            </div>
            <div className="robotics-sensor-card">
              <span>Line</span>
              <strong>{sensorValues?.line ? "Detected" : "No line"}</strong>
              <div className="robotics-sensor-actions">
                <button className="robotics-lab-btn" onClick={() => clearSensorOverride("line")}>Auto</button>
                <button className="robotics-lab-btn" onClick={() => setSensorOverride("line", true)}>On</button>
                <button className="robotics-lab-btn" onClick={() => setSensorOverride("line", false)}>Off</button>
              </div>
            </div>
            <div className="robotics-sensor-card">
              <span>Color</span>
              <strong>{String(sensorValues?.color ?? "default")}</strong>
              <label>
                Override
                <select
                  value={sensorOverrides.color === undefined || sensorOverrides.color === null ? "" : String(sensorOverrides.color)}
                  onChange={(event) => {
                    if (!event.target.value) clearSensorOverride("color");
                    else setSensorOverride("color", event.target.value);
                  }}
                >
                  <option value="">auto</option>
                  <option value="default">default</option>
                  <option value="zone">zone</option>
                  <option value="goal">goal</option>
                  <option value="red">red</option>
                  <option value="green">green</option>
                  <option value="blue">blue</option>
                </select>
              </label>
            </div>
            <div className="robotics-sensor-card">
              <span>Gyro</span>
              <strong>{Math.round(Number(sensorValues?.gyro ?? 0))} deg</strong>
            </div>
          </div>
        </section>
      </aside>
      {panel}
    </div>
  );
}
