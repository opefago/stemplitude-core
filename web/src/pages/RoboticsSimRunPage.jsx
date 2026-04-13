import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { useRoboticsWorkspaceContext } from "../features/robotics_lab/RoboticsWorkspaceContext";
import { GRID_CELL_CM } from "../features/robotics_lab/workspaceDefaults";
import { ThreeSimViewport } from "../features/robotics_lab/ThreeSimViewport";
import { CameraToolbar } from "../features/robotics_lab/components/CameraToolbar";
import { OverlayToggles } from "../features/robotics_lab/components/OverlayToggles";

export default function RoboticsSimRunPage() {
  const {
    world,
    pose,
    sensorValues,
    runtimeState,
    runProgram,
    pauseProgram,
    stepProgram,
    resetProgram,
    panel,
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
  } = useRoboticsWorkspaceContext();

  const worldScene = world.world_scene || { version: 1, gravity_m_s2: 9.81, objects: [] };
  const worldSummary = `${world.width_cells * GRID_CELL_CM}cm x ${world.height_cells * GRID_CELL_CM}cm`;

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
          <button className="robotics-lab-btn robotics-lab-btn--icon" onClick={stepProgram}>
            <StepForward size={16} /> Step
          </button>
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
          sensorValues={sensorValues}
          cameraState={cameraState}
          overlayState={overlayState}
          pathTrailResetToken={pathTrailResetToken}
          cameraResetToken={cameraResetToken}
          cameraFocusToken={cameraFocusToken}
          worldSizeCm={{
            width: world.width_cells * GRID_CELL_CM,
            depth: world.height_cells * GRID_CELL_CM,
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
        <div className="robotics-floating-controls-bottom">
          <div className="robotics-floating-group robotics-floating-status-bar">
            <span>Runtime: {runtimeState}</span>
            <span>World: {worldSummary}</span>
          </div>
          <OverlayToggles overlays={overlayState} onToggle={toggleOverlay} />
        </div>
      </section>

      <div className="robotics-sim-run-inspector robotics-sim-run-inspector--single">
        <div>
          <h4>Sensors</h4>
          <div className="robotics-sensor-cards">
            <div className="robotics-sensor-card"><span>Distance</span><strong>{Number(sensorValues?.distance ?? 0).toFixed(1)} cm</strong></div>
            <div className="robotics-sensor-card"><span>Bumper</span><strong>{sensorValues?.bumper ? "Pressed" : "Released"}</strong></div>
            <div className="robotics-sensor-card"><span>Line</span><strong>{sensorValues?.line ? "Detected" : "No line"}</strong></div>
            <div className="robotics-sensor-card"><span>Color</span><strong>{String(sensorValues?.color ?? "default")}</strong></div>
            <div className="robotics-sensor-card"><span>Gyro</span><strong>{Math.round(Number(sensorValues?.gyro ?? 0))} deg</strong></div>
          </div>
        </div>
      </div>
      {panel}
    </div>
  );
}
