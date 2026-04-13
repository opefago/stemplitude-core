import type {
  CameraMode,
  CameraPose,
  CameraState,
  OrbitModeConfig,
  RobotPoseForCamera,
  WorldSizeCm,
} from "./types";

const DEG2RAD = Math.PI / 180;

export function buildTopPose(
  worldSize: WorldSizeCm,
  zoom: number,
): CameraPose {
  const cx = worldSize.width / 2;
  const cz = worldSize.depth / 2;
  const height = Math.max(worldSize.width, worldSize.depth) * 1.1;
  return {
    position: { x: cx, y: height / zoom, z: cz },
    target: { x: cx, y: 0, z: cz },
    zoom,
  };
}

export function buildPerspectivePose(worldSize: WorldSizeCm): CameraPose {
  const cx = worldSize.width / 2;
  const cz = worldSize.depth / 2;
  const dist = Math.max(worldSize.width, worldSize.depth) * 0.9;
  return {
    position: { x: cx + dist * 0.6, y: dist * 0.55, z: cz + dist * 0.6 },
    target: { x: cx, y: 0, z: cz },
  };
}

export function buildFollowPose(
  robot: RobotPoseForCamera,
  state: CameraState,
): CameraPose {
  const headingRad = robot.headingDeg * DEG2RAD;
  const d = state.followDistance;
  const h = state.followHeight;
  const offsetX = state.lockFollowHeading ? -Math.sin(headingRad) * d : -d * 0.7;
  const offsetZ = state.lockFollowHeading ? -Math.cos(headingRad) * d : -d * 0.7;
  return {
    position: { x: robot.x + offsetX, y: h, z: robot.z + offsetZ },
    target: { x: robot.x, y: 0, z: robot.z },
  };
}

export function buildPresetPose(
  mode: CameraMode,
  state: CameraState,
  worldSize: WorldSizeCm,
  robot: RobotPoseForCamera,
): CameraPose {
  switch (mode) {
    case "top":
      return buildTopPose(worldSize, state.topZoom);
    case "follow":
      return buildFollowPose(robot, state);
    case "perspective":
      return buildPerspectivePose(worldSize);
    default:
      return buildTopPose(worldSize, 1);
  }
}

export function buildOrbitConfig(mode: CameraMode): OrbitModeConfig {
  switch (mode) {
    case "top":
      return {
        enabled: true,
        minDistance: 40,
        maxDistance: 2000,
        minPolarAngle: 0,
        maxPolarAngle: Math.PI * 0.05,
        enablePan: true,
        enableRotate: false,
      };
    case "follow":
      return {
        enabled: false,
        minDistance: 20,
        maxDistance: 500,
        minPolarAngle: 0.1,
        maxPolarAngle: Math.PI * 0.48,
        enablePan: false,
        enableRotate: false,
      };
    case "perspective":
      return {
        enabled: true,
        minDistance: 30,
        maxDistance: 2000,
        minPolarAngle: 0.1,
        maxPolarAngle: Math.PI * 0.48,
        enablePan: true,
        enableRotate: true,
      };
    default:
      return {
        enabled: true,
        minDistance: 40,
        maxDistance: 2000,
        minPolarAngle: 0,
        maxPolarAngle: Math.PI * 0.48,
        enablePan: true,
        enableRotate: true,
      };
  }
}
