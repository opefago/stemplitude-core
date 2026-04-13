import type {
  CameraMode,
  CameraPose,
  CameraState,
  CameraUpdateOutput,
  RobotPoseForCamera,
  Vector3Like,
  WorldSizeCm,
} from "./types";
import { buildOrbitConfig, buildPresetPose } from "./cameraPresets";

function lerp3(a: Vector3Like, b: Vector3Like, t: number): Vector3Like {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export class RoboticsCameraController {
  private currentPose: CameraPose;
  private targetPose: CameraPose;
  private mode: CameraMode = "top";
  private transitionProgress = 1;
  private transitionDuration = 0.28;

  constructor(
    state: CameraState,
    worldSize: WorldSizeCm,
    robot: RobotPoseForCamera,
  ) {
    this.mode = state.mode;
    const pose = buildPresetPose(state.mode, state, worldSize, robot);
    this.currentPose = { ...pose };
    this.targetPose = { ...pose };
  }

  setMode(
    mode: CameraMode,
    state: CameraState,
    worldSize: WorldSizeCm,
    robot: RobotPoseForCamera,
  ) {
    this.mode = mode;
    this.targetPose = buildPresetPose(mode, state, worldSize, robot);
    this.transitionProgress = 0;
    this.transitionDuration = (state.transitionMs || 280) / 1000;
  }

  reset(
    state: CameraState,
    worldSize: WorldSizeCm,
    robot: RobotPoseForCamera,
  ) {
    const pose = buildPresetPose(state.mode, state, worldSize, robot);
    this.currentPose = { ...pose };
    this.targetPose = { ...pose };
    this.transitionProgress = 1;
  }

  focusRobot(robot: RobotPoseForCamera) {
    this.targetPose = {
      ...this.targetPose,
      target: { x: robot.x, y: 0, z: robot.z },
    };
    this.transitionProgress = 0;
    this.transitionDuration = 0.3;
  }

  isTransitioning(): boolean {
    return this.transitionProgress < 1;
  }

  update(
    delta: number,
    state: CameraState,
    worldSize: WorldSizeCm,
    robot: RobotPoseForCamera,
  ): CameraUpdateOutput {
    if (state.mode === "follow") {
      this.targetPose = buildPresetPose("follow", state, worldSize, robot);
      const posLerp = Math.min(1, delta * state.followPositionLerp);
      const tgtLerp = Math.min(1, delta * state.followTargetLerp);
      this.currentPose = {
        position: lerp3(this.currentPose.position, this.targetPose.position, posLerp),
        target: lerp3(this.currentPose.target, this.targetPose.target, tgtLerp),
        zoom: this.targetPose.zoom,
      };
    } else if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(
        1,
        this.transitionProgress + delta / Math.max(0.01, this.transitionDuration),
      );
      const t = this.transitionProgress;
      this.currentPose = {
        position: lerp3(this.currentPose.position, this.targetPose.position, t),
        target: lerp3(this.currentPose.target, this.targetPose.target, t),
        zoom: this.targetPose.zoom,
      };
    }

    return {
      pose: this.currentPose,
      orbit: buildOrbitConfig(state.mode),
    };
  }
}
