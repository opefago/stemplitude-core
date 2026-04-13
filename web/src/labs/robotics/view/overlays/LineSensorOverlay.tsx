import * as THREE from "three";
import { useMemo } from "react";

const DEG2RAD = Math.PI / 180;
const SENSOR_OFFSET = 12;
const SPOT_RADIUS = 3;

interface Props {
  robot: { x: number; z: number; headingDeg: number };
  active: boolean;
  opacity?: number;
}

export function LineSensorOverlay({ robot, active, opacity = 0.75 }: Props) {
  const headingRad = robot.headingDeg * DEG2RAD;
  const cx = robot.x + Math.sin(headingRad) * SENSOR_OFFSET;
  const cz = robot.z + Math.cos(headingRad) * SENSOR_OFFSET;

  const color = active ? "#22c55e" : "#64748b";

  return (
    <mesh position={[cx, 0.2, cz]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[SPOT_RADIUS, 24]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} />
    </mesh>
  );
}
