import { useEffect, useRef } from "react";
import * as THREE from "three";

const DEG2RAD = Math.PI / 180;
const ARROW_LENGTH = 22;

interface Props {
  robot: { x: number; z: number; headingDeg: number };
  opacity?: number;
}

export function HeadingOverlay({ robot, opacity = 0.85 }: Props) {
  const geoRef = useRef<THREE.BufferGeometry>(new THREE.BufferGeometry());

  const headingRad = robot.headingDeg * DEG2RAD;
  const dx = Math.cos(headingRad);
  const dz = Math.sin(headingRad);

  const positions = new Float32Array([
    robot.x, 2, robot.z,
    robot.x + dx * ARROW_LENGTH, 2, robot.z + dz * ARROW_LENGTH,
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
      <lineBasicMaterial color="#22d3ee" transparent opacity={opacity} linewidth={2} />
    </line>
  );
}
