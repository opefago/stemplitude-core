import { Html } from "@react-three/drei";
import { midpoint3 } from "./math";
import type { MeasurementLabelSize } from "./types";
import type { MeasurementSummary, PathSegment, TurnMarker } from "./types";

interface Props {
  segments: PathSegment[];
  activeSegment: PathSegment | null;
  turns: TurnMarker[];
  summary: MeasurementSummary;
  startMarker: { x: number; y: number; z: number } | null;
  showSegmentLabels: boolean;
  showTurnLabels: boolean;
  showTotalDistance: boolean;
  labelElevation: number;
  maxLabelCount: number;
  labelSize: MeasurementLabelSize;
}

export function LabelRenderer({
  segments,
  activeSegment,
  turns,
  summary,
  startMarker,
  showSegmentLabels,
  showTurnLabels,
  showTotalDistance,
  labelElevation,
  maxLabelCount,
  labelSize,
}: Props) {
  const segmentLabels = (activeSegment ? [...segments, activeSegment] : segments)
    .filter((segment) => segment.distanceCm >= 0.5)
    .slice(-maxLabelCount);
  const turnLabels = turns.slice(-maxLabelCount);

  return (
    <group>
      {showSegmentLabels
        ? segmentLabels.map((segment) => {
            const mid = midpoint3(segment.start, segment.end);
            const isActive = activeSegment?.id === segment.id;
            return (
              <Html
                key={`${segment.id}_label`}
                position={[mid.x, labelElevation + (isActive ? 0.6 : 0), mid.z]}
                center
                occlude={false}
              >
                <div
                  className={`robotics-measurement-label robotics-measurement-label--segment${
                    isActive ? " robotics-measurement-label--active" : ""
                  } robotics-measurement-label--${labelSize}`}
                >
                  {segment.label}
                </div>
              </Html>
            );
          })
        : null}
      {showTurnLabels
        ? turnLabels.map((turn) => (
            <Html
              key={`${turn.id}_label`}
              position={[turn.position.x, labelElevation + 1.5, turn.position.z]}
              center
              occlude={false}
            >
              <div className={`robotics-measurement-label robotics-measurement-label--turn robotics-measurement-label--${labelSize}`}>
                {turn.label}
              </div>
            </Html>
          ))
        : null}
      {showTotalDistance && startMarker ? (
        <Html
          position={[startMarker.x, labelElevation + 2.6, startMarker.z]}
          center
          occlude={false}
        >
          <div className={`robotics-measurement-label robotics-measurement-label--summary robotics-measurement-label--${labelSize}`}>
            Total {summary.totalDistanceLabel}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

