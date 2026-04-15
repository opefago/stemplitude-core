import { useEffect, useMemo, useRef, useState } from "react";
import { LabelRenderer } from "../measurement/LabelRenderer";
import { MeasurementOverlayManager } from "../measurement/MeasurementOverlayManager";
import { PathRenderer } from "../measurement/PathRenderer";
import { TurnMarkerRenderer } from "../measurement/TurnMarkerRenderer";
import { DEFAULT_MEASUREMENT_OVERLAY_CONFIG } from "../measurement/types";
import type { MeasurementOverlayConfig, MeasurementOverlayState } from "../measurement/types";

interface Props {
  robot: { x: number; z: number; headingDeg: number };
  runtimeState?: string;
  resetKey?: number;
  config?: Partial<MeasurementOverlayConfig>;
  opacity?: number;
}

function makeEmptyState(config: MeasurementOverlayConfig): MeasurementOverlayState {
  return {
    running: false,
    mode: config.mode,
    startMarker: null,
    endMarker: null,
    activeSegment: null,
    segments: [],
    turns: [],
    samples: [],
    summary: {
      totalDistanceCm: 0,
      totalDistanceLabel: "0 cm",
      segmentCount: 0,
      turnCount: 0,
    },
  };
}

export function MeasurementOverlay({
  robot,
  runtimeState = "idle",
  resetKey = 0,
  config,
  opacity = 0.8,
}: Props) {
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_MEASUREMENT_OVERLAY_CONFIG, ...(config || {}) }),
    [config],
  );
  const managerRef = useRef(new MeasurementOverlayManager(mergedConfig));
  const runtimeStateRef = useRef(runtimeState);
  const [overlayState, setOverlayState] = useState<MeasurementOverlayState>(makeEmptyState(mergedConfig));

  useEffect(() => {
    setOverlayState(managerRef.current.setConfig(mergedConfig));
  }, [mergedConfig]);

  useEffect(() => {
    setOverlayState(managerRef.current.reset());
  }, [resetKey]);

  useEffect(() => {
    const previousRuntimeState = runtimeStateRef.current;
    runtimeStateRef.current = runtimeState;
    if (runtimeState === "running" && previousRuntimeState !== "running") {
      setOverlayState(
        managerRef.current.startRun({
          x: robot.x,
          z: robot.z,
          headingDeg: robot.headingDeg,
        }),
      );
      return;
    }
    if (
      previousRuntimeState === "running" &&
      (runtimeState === "completed" || runtimeState === "idle" || runtimeState === "error")
    ) {
      setOverlayState(
        managerRef.current.endRun({
          x: robot.x,
          z: robot.z,
          headingDeg: robot.headingDeg,
        }),
      );
    }
  }, [robot.headingDeg, robot.x, robot.z, runtimeState]);

  useEffect(() => {
    if (runtimeState !== "running" && !overlayState.running) return;
    setOverlayState(
      managerRef.current.updatePose({
        x: robot.x,
        z: robot.z,
        headingDeg: robot.headingDeg,
      }),
    );
  }, [robot.headingDeg, robot.x, robot.z, runtimeState, overlayState.running]);

  if (!mergedConfig.enabled) return null;

  return (
    <group>
      <PathRenderer
        mode={overlayState.mode}
        segments={overlayState.segments}
        activeSegment={overlayState.activeSegment}
        samples={overlayState.samples}
        lineElevation={mergedConfig.lineElevation}
        opacity={opacity}
        showLiveEndpoint
        showDimensionGuides={mergedConfig.showDimensionGuides}
      />
      <TurnMarkerRenderer
        turns={overlayState.turns}
        markerElevation={mergedConfig.markerElevation}
        showTurnArcs={mergedConfig.showTurnArcs}
      />
      <LabelRenderer
        segments={overlayState.segments}
        activeSegment={overlayState.activeSegment}
        turns={overlayState.turns}
        summary={overlayState.summary}
        startMarker={overlayState.startMarker}
        showSegmentLabels={mergedConfig.showSegmentLabels}
        showTurnLabels={mergedConfig.showTurnLabels}
        showTotalDistance={mergedConfig.showTotalDistance}
        labelElevation={mergedConfig.labelElevation}
        maxLabelCount={mergedConfig.maxLabelCount}
        labelSize={mergedConfig.labelSize}
      />
      {mergedConfig.showStartMarker && overlayState.startMarker ? (
        <group position={[overlayState.startMarker.x, mergedConfig.markerElevation, overlayState.startMarker.z]}>
          <mesh>
            <sphereGeometry args={[1.5, 16, 16]} />
            <meshBasicMaterial color="#22c55e" />
          </mesh>
          <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[3.5, 5.5, 32]} />
            <meshBasicMaterial color="#22c55e" transparent opacity={0.72} />
          </mesh>
        </group>
      ) : null}
      {mergedConfig.showEndMarker && overlayState.endMarker ? (
        <group position={[overlayState.endMarker.x, mergedConfig.markerElevation, overlayState.endMarker.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[3.4, 5.3, 32]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.9} />
          </mesh>
        </group>
      ) : null}
      {mergedConfig.showHeadingMarker ? (
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[
                new Float32Array([
                  robot.x,
                  mergedConfig.markerElevation + 0.45,
                  robot.z,
                  robot.x + Math.cos((robot.headingDeg * Math.PI) / 180) * 20,
                  mergedConfig.markerElevation + 0.45,
                  robot.z + Math.sin((robot.headingDeg * Math.PI) / 180) * 20,
                ]),
                3,
              ]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#22d3ee" transparent opacity={0.82} />
        </line>
      ) : null}
    </group>
  );
}

