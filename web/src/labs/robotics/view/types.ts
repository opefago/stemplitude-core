export type CameraMode = "top" | "follow" | "perspective";

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  position: Vector3Like;
  target: Vector3Like;
  zoom?: number;
}

export interface CameraState {
  mode: CameraMode;
  previousMode?: CameraMode;
  transitionMs: number;
  isTransitioning: boolean;
  topZoom: number;
  followDistance: number;
  followHeight: number;
  lockFollowHeading: boolean;
  followPositionLerp: number;
  followTargetLerp: number;
}

export interface OverlayState {
  showGrid: boolean;
  showSensors: boolean;
  showPathTrail: boolean;
  showHeading: boolean;
  showRobotFootprint: boolean;
}

export interface RobotPoseForCamera {
  x: number;
  z: number;
  headingDeg: number;
}

export interface WorldSizeCm {
  width: number;
  depth: number;
}

export interface OrbitModeConfig {
  enabled: boolean;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  enablePan: boolean;
  enableRotate: boolean;
}

export interface CameraUpdateOutput {
  pose: CameraPose;
  orbit: OrbitModeConfig;
}
