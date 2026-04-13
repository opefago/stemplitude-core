import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface Props {
  robot: { x: number; z: number; headingDeg: number };
  enabled: boolean;
  opacity?: number;
  resetKey?: number;
}

const MIN_DIST_SQ = 4;

export function PathTrailOverlay({ robot, enabled, opacity = 0.65, resetKey }: Props) {
  const geoRef = useRef<THREE.BufferGeometry>(new THREE.BufferGeometry());
  const pointsRef = useRef<number[]>([]);
  const [pointCount, setPointCount] = useState(0);

  useEffect(() => {
    pointsRef.current = [];
    setPointCount(0);
  }, [resetKey]);

  useEffect(() => {
    if (!enabled) return;
    const pts = pointsRef.current;
    const len = pts.length;
    if (len >= 3) {
      const lx = pts[len - 3];
      const lz = pts[len - 1];
      const ddx = robot.x - lx;
      const ddz = robot.z - lz;
      if (ddx * ddx + ddz * ddz < MIN_DIST_SQ) return;
    }
    pts.push(robot.x, 0.6, robot.z);
    setPointCount(pts.length / 3);
  }, [robot.x, robot.z, enabled]);

  useEffect(() => {
    if (pointCount < 2) return;
    const arr = new Float32Array(pointsRef.current);
    geoRef.current.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    geoRef.current.attributes.position.needsUpdate = true;
  }, [pointCount]);

  useEffect(() => {
    const geo = geoRef.current;
    return () => geo.dispose();
  }, []);

  if (pointCount < 2) return null;

  return (
    <line geometry={geoRef.current}>
      <lineBasicMaterial color="#a78bfa" transparent opacity={opacity} linewidth={1} />
    </line>
  );
}
