import { useEffect, useRef } from "react";
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
  const geoRef = useRef<THREE.BufferGeometry>(new THREE.BufferGeometry());

  const range = distanceCm != null ? Math.min(distanceCm, MAX_RANGE) : MAX_RANGE;
  const headingRad = robot.headingDeg * DEG2RAD;
  const dx = Math.cos(headingRad);
  const dz = Math.sin(headingRad);

  const positions = new Float32Array([
    robot.x + dx * SENSOR_OFFSET, 1.5, robot.z + dz * SENSOR_OFFSET,
    robot.x + dx * (SENSOR_OFFSET + range), 1.5, robot.z + dz * (SENSOR_OFFSET + range),
  ]);

  useEffect(() => {
    geoRef.current.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geoRef.current.attributes.position.needsUpdate = true;
  });

  useEffect(() => {
    const geo = geoRef.current;
    return () => geo.dispose();
  }, []);

  return (
    <line geometry={geoRef.current}>
      <lineBasicMaterial color="#f97316" transparent opacity={opacity} linewidth={2} />
    </line>
  );
}
