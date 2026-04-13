import type {
  CameraMode,
  CameraPose,
  CameraState,
  OrbitModeConfig,
  RobotPoseForCamera,
  WorldSizeCm,
} from "./types";

const DEG2RAD = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function buildTopPose(worldSize: WorldSizeCm, zoom: number): CameraPose {
  const cx = worldSize.width / 2;
  const cz = worldSize.depth / 2;
  const height = Math.max(worldSize.width, worldSize.depth) * 1.1;
  return {
    position: { x: cx, y: height / zoom, z: cz },
    target: { x: cx, y: 0, z: cz },
    zoom,
  };
}

export function buildPerspectivePose(
  worldSize: WorldSizeCm,
  robot?: RobotPoseForCamera,
): CameraPose {
  const cx = worldSize.width / 2;
  const cz = worldSize.depth / 2;
  const target = {
    x: cx - worldSize.width * 0.0240625,
    y: 0,
    z: cz - worldSize.depth * 0.001125,
  };

  // Deterministic orbit for startup camera:
  // locked to user's validated "perfect" alignment
  // debug: p(-450.49,359.24,233.15) t(380.75,0,239.46) for 800x480
  const azimuthDeg = -90.44;
  const polarDeg = 66.63;
  const distance = clamp(Math.max(worldSize.width, worldSize.depth) * 1.13195, 860, 980);

  const azimuth = azimuthDeg * DEG2RAD;
  const polar = polarDeg * DEG2RAD;
  const sinPolar = Math.sin(polar);

  const offsetX = distance * sinPolar * Math.sin(azimuth);
  const offsetY = distance * Math.cos(polar);
  const offsetZ = distance * sinPolar * Math.cos(azimuth);

  return {
    position: {
      x: target.x + offsetX,
      y: target.y + offsetY,
      z: target.z + offsetZ,
    },
    target,
  };
}

export function buildFollowPose(
  robot: RobotPoseForCamera,
  state: CameraState,
): CameraPose {
  const headingRad = robot.headingDeg * DEG2RAD;
  const d = state.followDistance;
  const h = state.followHeight;
  const offsetX = state.lockFollowHeading
    ? -Math.cos(headingRad) * d
    : -d * 0.7;
  const offsetZ = state.lockFollowHeading
    ? -Math.sin(headingRad) * d
    : -d * 0.7;
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
      return buildPerspectivePose(worldSize, robot);
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
