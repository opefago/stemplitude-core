import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRoboticsWorkspaceContext } from "../features/robotics_lab/RoboticsWorkspaceContext";
import { GRID_CELL_CM } from "../features/robotics_lab/workspaceDefaults";
import { ThreeSimViewport } from "../features/robotics_lab/ThreeSimViewport.tsx";
import { CameraToolbar } from "../features/robotics_lab/components/CameraToolbar";
import { DebuggerStatusPanel } from "../features/robotics_lab/components/DebuggerStatusPanel";
import { OverlayToggles } from "../features/robotics_lab/components/OverlayToggles";
import { StepSplitButton } from "../features/robotics_lab/components/StepSplitButton";
import { ViewportSettingsDialog } from "../features/robotics_lab/components/ViewportSettingsDialog";
import { resolveKitCapabilities } from "../labs/robotics";

function formatSensorValue(sensorKind: string, value: unknown) {
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

export default function RoboticsSimRunPage() {
  const {
    world,
    pose,
    sensorValues,
    manifests,
    selectedVendor,
    selectedRobotType,
    runtimeState,
    debugSession,
    runtimeSettings,
    setRuntimeSettings,
    robotModel,
    runProgram,
    pauseProgram,
    stepProgram,
    stepIntoProgram,
    stepOverProgram,
    resetProgram,
    panel,
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
  } = useRoboticsWorkspaceContext();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewportBackgroundColor, setViewportBackgroundColor] = useState("#f4f6f8");

  useEffect(() => {
    const onOpenSettings = () => setSettingsOpen(true);
    window.addEventListener("robotics:openViewportSettings", onOpenSettings as EventListener);
    return () => window.removeEventListener("robotics:openViewportSettings", onOpenSettings as EventListener);
  }, []);

  const worldScene = world.world_scene || { version: 1, gravity_m_s2: 9.81, objects: [] };
  const worldSummary = `${world.width_cells * GRID_CELL_CM}cm x ${world.height_cells * GRID_CELL_CM}cm`;
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

  return (
    <div className="robotics-sim-run-surface">
      <div className="robotics-sim-run-toolbar">
        <div className="robotics-lab-controls">
          <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={runProgram}>
            <Play size={16} /> Run
          </button>
          <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={pauseProgram}>
            <Pause size={16} /> Pause
          </button>
          <StepSplitButton onStep={stepProgram} onStepInto={stepIntoProgram} onStepOver={stepOverProgram} />
          <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={resetProgram}>
            <RotateCcw size={16} /> Reset
          </button>
        </div>
        <div className="robotics-lab-status">
          <span>Runtime: {runtimeState}</span>
          <span>World: {worldSummary}</span>
        </div>
      </div>
      <section className="robotics-sim-run-viewport robotics-sim-run-viewport--floating">
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
          worldSizeCm={{
            width: world.width_cells * GRID_CELL_CM,
            depth: world.height_cells * GRID_CELL_CM,
          }}
          backgroundColor={viewportBackgroundColor}
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
          <div className="robotics-floating-group robotics-floating-status-bar">
            <span>Runtime: {runtimeState}</span>
            <span>World: {worldSummary}</span>
          </div>
          <OverlayToggles overlays={overlayState} onToggle={toggleOverlay} onSetMeasurementLabelSize={setMeasurementLabelSize} />
        </div>
      </section>
      <ViewportSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        backgroundColor={viewportBackgroundColor}
        onBackgroundColorChange={setViewportBackgroundColor}
        moveCollisionPolicy={String(runtimeSettings?.move_collision_policy || "hold_until_distance")}
        onMoveCollisionPolicyChange={(policy) =>
          setRuntimeSettings((prev: Record<string, unknown>) => ({ ...prev, move_collision_policy: policy }))
        }
        physicsEngine={String(runtimeSettings?.physics_engine || "three_runtime")}
        onPhysicsEngineChange={(engine) =>
          setRuntimeSettings((prev: Record<string, unknown>) => ({ ...prev, physics_engine: engine }))
        }
        tractionLongitudinal={Number(runtimeSettings?.traction_longitudinal ?? 0.92)}
        onTractionLongitudinalChange={(value) =>
          setRuntimeSettings((prev: Record<string, unknown>) => ({ ...prev, traction_longitudinal: value }))
        }
        tractionLateral={Number(runtimeSettings?.traction_lateral ?? 0.9)}
        onTractionLateralChange={(value) =>
          setRuntimeSettings((prev: Record<string, unknown>) => ({ ...prev, traction_lateral: value }))
        }
        rollingResistance={Number(runtimeSettings?.rolling_resistance ?? 4.2)}
        onRollingResistanceChange={(value) =>
          setRuntimeSettings((prev: Record<string, unknown>) => ({ ...prev, rolling_resistance: value }))
        }
      />

      <div className="robotics-sim-run-inspector robotics-sim-run-inspector--single">
        <div>
          <h4>Sensors</h4>
          <div className="robotics-sensor-cards">
            {sensorCapabilities.map((sensorCapability) => (
              <div key={sensorCapability.kind} className="robotics-sensor-card">
                <span>{sensorCapability.label}</span>
                <strong>{formatSensorValue(sensorCapability.kind, sensorValues?.[sensorCapability.kind])}</strong>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4>Actuators</h4>
          <div className="robotics-sensor-cards">
            {actuatorCapabilities.map((actuatorCapability) => (
              <div key={actuatorCapability.kind} className="robotics-sensor-card">
                <span>{actuatorCapability.label}</span>
                <strong>Available</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
      {panel}
    </div>
  );
}
