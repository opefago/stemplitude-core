import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

interface Props {
  robot: { x: number; z: number; headingDeg: number };
  enabled: boolean;
  opacity?: number;
  resetKey?: number;
}

const MIN_DIST_SQ = 4;

export function PathTrailOverlay({ robot, enabled, opacity = 0.65, resetKey }: Props) {
  const [points, setPoints] = useState<THREE.Vector3[]>([]);

  useEffect(() => {
    setPoints([]);
  }, [resetKey]);

  useEffect(() => {
    if (!enabled) return;
    setPoints((prev) => {
      const next = new THREE.Vector3(robot.x, 0.6, robot.z);
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        const dx = next.x - last.x;
        const dz = next.z - last.z;
        if (dx * dx + dz * dz < MIN_DIST_SQ) return prev;
      }
      return [...prev, next];
    });
  }, [robot.x, robot.z, enabled]);

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [points]);

  if (!geometry) return null;

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color="#a78bfa" transparent opacity={opacity} linewidth={1} />
    </line>
  );
}
