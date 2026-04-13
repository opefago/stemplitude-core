import { useMemo } from "react";
import * as THREE from "three";

const DEG2RAD = Math.PI / 180;
const SENSOR_OFFSET = 10;
const MAX_RANGE = 250;

interface Props {
  robot: { x: number; z: number; headingDeg: number };
  distanceCm: number | null;
  opacity?: number;
}

export function DistanceRayOverlay({ robot, distanceCm, opacity = 0.8 }: Props) {
  const range = distanceCm != null ? Math.min(distanceCm, MAX_RANGE) : MAX_RANGE;
  const headingRad = robot.headingDeg * DEG2RAD;
  const dx = Math.sin(headingRad);
  const dz = Math.cos(headingRad);

  const start = new THREE.Vector3(
    robot.x + dx * SENSOR_OFFSET,
    1.5,
    robot.z + dz * SENSOR_OFFSET,
  );
  const end = new THREE.Vector3(
    robot.x + dx * (SENSOR_OFFSET + range),
    1.5,
    robot.z + dz * (SENSOR_OFFSET + range),
  );

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([start, end]);
    return g;
  }, [start.x, start.y, start.z, end.x, end.y, end.z]);

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color="#f97316" transparent opacity={opacity} linewidth={2} />
    </line>
  );
}
