import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OverlayMode, PathSample, PathSegment } from "./types";

interface Props {
  mode: OverlayMode;
  segments: PathSegment[];
  activeSegment: PathSegment | null;
  samples: PathSample[];
  lineElevation: number;
  opacity?: number;
  showLiveEndpoint?: boolean;
  showDimensionGuides?: boolean;
}

function toSegmentPolyline(segments: PathSegment[], activeSegment: PathSegment | null, y: number): number[] {
  const ordered = activeSegment ? [...segments, activeSegment] : segments;
  const points: number[] = [];
  ordered.forEach((segment, index) => {
    if (index === 0) {
      points.push(segment.start.x, y, segment.start.z);
    }
    points.push(segment.end.x, y, segment.end.z);
  });
  return points;
}

export function PathRenderer({
  mode,
  segments,
  activeSegment,
  samples,
  lineElevation,
  opacity = 0.8,
  showLiveEndpoint = true,
  showDimensionGuides = true,
}: Props) {
  const segmentGeoRef = useRef<THREE.BufferGeometry>(new THREE.BufferGeometry());
  const traceGeoRef = useRef<THREE.BufferGeometry>(new THREE.BufferGeometry());
  const orderedSegments = useMemo(
    () => (activeSegment ? [...segments, activeSegment] : segments).filter((segment) => segment.distanceCm >= 0.25),
    [segments, activeSegment],
  );

  const segmentPositions = useMemo(
    () => toSegmentPolyline(segments, activeSegment, lineElevation),
    [segments, activeSegment, lineElevation],
  );

  const tracePositions = useMemo(() => {
    if (mode !== "continuous") return [];
    return samples.flatMap((sample) => [sample.position.x, lineElevation + 0.08, sample.position.z]);
  }, [samples, mode, lineElevation]);

  useEffect(() => {
    if (segmentPositions.length < 6) {
      segmentGeoRef.current.setDrawRange(0, 0);
      return;
    }
    segmentGeoRef.current.setAttribute("position", new THREE.BufferAttribute(new Float32Array(segmentPositions), 3));
    segmentGeoRef.current.attributes.position.needsUpdate = true;
    segmentGeoRef.current.setDrawRange(0, segmentPositions.length / 3);
  }, [segmentPositions]);

  useEffect(() => {
    if (tracePositions.length < 6) {
      traceGeoRef.current.setDrawRange(0, 0);
      return;
    }
    traceGeoRef.current.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tracePositions), 3));
    traceGeoRef.current.attributes.position.needsUpdate = true;
    traceGeoRef.current.setDrawRange(0, tracePositions.length / 3);
  }, [tracePositions]);

  useEffect(() => {
    const segmentGeo = segmentGeoRef.current;
    const traceGeo = traceGeoRef.current;
    return () => {
      segmentGeo.dispose();
      traceGeo.dispose();
    };
  }, []);

  return (
    <group>
      {orderedSegments.map((segment) => {
        const dx = segment.end.x - segment.start.x;
        const dz = segment.end.z - segment.start.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        if (length < 0.25) return null;
        const angleY = Math.atan2(dz, dx);
        const midX = (segment.start.x + segment.end.x) / 2;
        const midZ = (segment.start.z + segment.end.z) / 2;
        const active = activeSegment?.id === segment.id;
        const tickLength = active ? 3.6 : 3.1;
        const arrowInset = Math.min(6, Math.max(2.2, length * 0.2));
        const startArrowX = -length / 2 + arrowInset;
        const endArrowX = length / 2 - arrowInset;
        return (
          <group key={`seg_stroke_${segment.id}`} position={[midX, lineElevation + 0.32, midZ]} rotation={[0, angleY, 0]}>
            <mesh renderOrder={80}>
              <boxGeometry args={[length, 0.18, active ? 2.4 : 2.1]} />
              <meshBasicMaterial
                color={active ? "#1f0f37" : "#140d24"}
                transparent
                opacity={Math.min(1, opacity + 0.12)}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[0, 0.02, 0]} renderOrder={81}>
              <boxGeometry args={[Math.max(0.5, length - 0.2), 0.08, active ? 1.2 : 1]} />
              <meshBasicMaterial
                color={active ? "#f0abfc" : "#c084fc"}
                transparent
                opacity={Math.min(1, opacity + 0.16)}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
            {showDimensionGuides ? (
              <>
                <mesh position={[-length / 2, 0.05, 0]} renderOrder={82}>
                  <boxGeometry args={[0.28, 0.1, tickLength]} />
                  <meshBasicMaterial color="#1e1b4b" transparent opacity={0.92} depthTest={false} depthWrite={false} />
                </mesh>
                <mesh position={[length / 2, 0.05, 0]} renderOrder={82}>
                  <boxGeometry args={[0.28, 0.1, tickLength]} />
                  <meshBasicMaterial color="#1e1b4b" transparent opacity={0.92} depthTest={false} depthWrite={false} />
                </mesh>
                {length >= 6 ? (
                  <>
                    <mesh position={[startArrowX, 0.1, 0]} rotation={[0, 0, Math.PI / 2]} renderOrder={83}>
                      <coneGeometry args={[0.82, 1.8, 12]} />
                      <meshBasicMaterial color="#7c3aed" transparent opacity={0.95} depthTest={false} depthWrite={false} />
                    </mesh>
                    <mesh position={[endArrowX, 0.1, 0]} rotation={[0, 0, -Math.PI / 2]} renderOrder={83}>
                      <coneGeometry args={[0.82, 1.8, 12]} />
                      <meshBasicMaterial color="#7c3aed" transparent opacity={0.95} depthTest={false} depthWrite={false} />
                    </mesh>
                  </>
                ) : null}
              </>
            ) : null}
          </group>
        );
      })}
      {mode === "continuous" && tracePositions.length >= 6 ? (
        <line geometry={traceGeoRef.current} renderOrder={78}>
          <lineBasicMaterial
            color="#0f172a"
            transparent
            opacity={Math.max(0.55, opacity * 0.92)}
            depthTest={false}
            depthWrite={false}
          />
        </line>
      ) : null}
      {showLiveEndpoint && activeSegment ? (
        <mesh position={[activeSegment.end.x, lineElevation + 0.42, activeSegment.end.z]} renderOrder={84}>
          <sphereGeometry args={[1.7, 16, 16]} />
          <meshBasicMaterial color="#f0abfc" transparent opacity={0.96} depthTest={false} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}

