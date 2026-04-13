import { useRef } from "react";
import { RoboticsCameraController } from "./cameraController";
import type { CameraState, RobotPoseForCamera, WorldSizeCm } from "./types";

export function useCameraController(
  cameraState: CameraState,
  worldSize: WorldSizeCm,
  robot: RobotPoseForCamera,
): RoboticsCameraController {
  const ref = useRef<RoboticsCameraController | null>(null);
  if (!ref.current) {
    ref.current = new RoboticsCameraController(cameraState, worldSize, robot);
  }
  return ref.current;
}
