import { useMemo } from "react";
import * as THREE from "three";
import { normalizeHeadingDeg } from "./math";
import type { TurnMarker } from "./types";

interface Props {
  turns: TurnMarker[];
  markerElevation: number;
  showTurnArcs: boolean;
}

function buildTurnArc(turn: TurnMarker, markerElevation: number): THREE.Vector3[] {
  const radius = Math.max(8, turn.arcRadiusCm || 10);
  const steps = 18;
  const from = (normalizeHeadingDeg(turn.fromHeadingDeg) * Math.PI) / 180;
  const delta = (turn.angleDeg * Math.PI) / 180;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = from + delta * t;
    points.push(
      new THREE.Vector3(
        turn.position.x + Math.cos(angle) * radius,
        markerElevation + 0.3,
        turn.position.z + Math.sin(angle) * radius,
      ),
    );
  }
  return points;
}

export function TurnMarkerRenderer({ turns, markerElevation, showTurnArcs }: Props) {
  const arcPoints = useMemo(
    () =>
      showTurnArcs
        ? turns.map((turn) => ({
            id: turn.id,
            points: buildTurnArc(turn, markerElevation),
          }))
        : [],
    [turns, markerElevation, showTurnArcs],
  );

  return (
    <group>
      {turns.map((turn) => (
        <group key={turn.id} position={[turn.position.x, markerElevation, turn.position.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[2.2, 3.6, 24]} />
            <meshBasicMaterial color="#fb923c" transparent opacity={0.95} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <sphereGeometry args={[1.15, 14, 14]} />
            <meshBasicMaterial color="#f97316" />
          </mesh>
        </group>
      ))}
      {arcPoints.map((arc) => (
        <line key={`${arc.id}_arc`}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(arc.points.flatMap((point) => [point.x, point.y, point.z])), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#f97316" transparent opacity={0.65} />
        </line>
      ))}
    </group>
  );
}

