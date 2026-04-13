import { useMemo } from "react";
import * as THREE from "three";

const DEG2RAD = Math.PI / 180;
const ARROW_LENGTH = 22;

interface Props {
  robot: { x: number; z: number; headingDeg: number };
  opacity?: number;
}

export function HeadingOverlay({ robot, opacity = 0.85 }: Props) {
  const headingRad = robot.headingDeg * DEG2RAD;
  const dx = Math.sin(headingRad);
  const dz = Math.cos(headingRad);

  const geometry = useMemo(() => {
    const start = new THREE.Vector3(robot.x, 2, robot.z);
    const end = new THREE.Vector3(
      robot.x + dx * ARROW_LENGTH,
      2,
      robot.z + dz * ARROW_LENGTH,
    );
    return new THREE.BufferGeometry().setFromPoints([start, end]);
  }, [robot.x, robot.z, dx, dz]);

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color="#22d3ee" transparent opacity={opacity} linewidth={2} />
    </line>
  );
}
