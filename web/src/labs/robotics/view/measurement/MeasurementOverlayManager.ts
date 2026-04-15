import {
  headingFromPointsDeg,
  midpoint3,
  normalizeHeadingDeg,
  planarDistanceCm,
  shouldAcceptSample,
  signedAngleDeltaDeg,
  toPosition3,
} from "./math";
import { formatDistanceCm, formatTurnLabel } from "./units";
import {
  DEFAULT_MEASUREMENT_OVERLAY_CONFIG,
  type MeasurementOverlayConfig,
  type MeasurementOverlayState,
  type MeasurementPose,
  type MeasurementSummary,
  type PathSample,
  type PathSegment,
  type TurnMarker,
} from "./types";

function createSummary(config: MeasurementOverlayConfig, totalDistanceCm = 0, segmentCount = 0, turnCount = 0): MeasurementSummary {
  return {
    totalDistanceCm,
    totalDistanceLabel: formatDistanceCm(totalDistanceCm, config.distanceUnit, config.gridCellCm),
    segmentCount,
    turnCount,
  };
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
    summary: createSummary(config),
  };
}

export class MeasurementOverlayManager {
  private config: MeasurementOverlayConfig;
  private state: MeasurementOverlayState;
  private lastSample: PathSample | null = null;
  private activeStartSample: PathSample | null = null;
  private lastTurnSample: PathSample | null = null;
  private pendingTurn: {
    pivotSample: PathSample;
    fromHeadingDeg: number;
    toHeadingDeg: number;
    settleCount: number;
  } | null = null;
  private counters = { sample: 0, segment: 0, turn: 0 };

  constructor(config?: Partial<MeasurementOverlayConfig>) {
    this.config = { ...DEFAULT_MEASUREMENT_OVERLAY_CONFIG, ...(config || {}) };
    this.state = makeEmptyState(this.config);
  }

  setConfig(partial: Partial<MeasurementOverlayConfig>): MeasurementOverlayState {
    this.config = { ...this.config, ...partial };
    this.state.mode = this.config.mode;
    this.state.summary = createSummary(
      this.config,
      this.state.summary.totalDistanceCm,
      this.state.summary.segmentCount,
      this.state.summary.turnCount,
    );
    return this.getState();
  }

  getConfig(): MeasurementOverlayConfig {
    return { ...this.config };
  }

  getState(): MeasurementOverlayState {
    return {
      ...this.state,
      activeSegment: this.state.activeSegment ? { ...this.state.activeSegment } : null,
      segments: this.state.segments.map((segment) => ({ ...segment })),
      turns: this.state.turns.map((turn) => ({ ...turn })),
      samples: this.state.samples.map((sample) => ({ ...sample })),
      summary: { ...this.state.summary },
    };
  }

  reset(): MeasurementOverlayState {
    this.state = makeEmptyState(this.config);
    this.lastSample = null;
    this.activeStartSample = null;
    this.lastTurnSample = null;
    this.pendingTurn = null;
    this.counters = { sample: 0, segment: 0, turn: 0 };
    return this.getState();
  }

  startRun(initialPose: MeasurementPose, timestampMs = Date.now()): MeasurementOverlayState {
    this.reset();
    const firstSample = this.createSample(initialPose, timestampMs);
    this.state.running = true;
    this.state.mode = this.config.mode;
    this.state.startMarker = { ...firstSample.position };
    this.state.samples.push(firstSample);
    this.lastSample = firstSample;
    this.activeStartSample = firstSample;
    this.lastTurnSample = null;
    this.pendingTurn = null;
    this.state.activeSegment = this.buildSegment(firstSample, firstSample, firstSample.headingDeg);
    this.refreshSummary();
    return this.getState();
  }

  updatePose(pose: MeasurementPose, timestampMs = Date.now()): MeasurementOverlayState {
    if (!this.config.enabled) return this.getState();
    if (!this.state.running || !this.lastSample) {
      return this.startRun(pose, timestampMs);
    }
    const previousPose = {
      x: this.lastSample.position.x,
      z: this.lastSample.position.z,
      headingDeg: this.lastSample.headingDeg,
    };
    if (!shouldAcceptSample(previousPose, pose, this.config.minSampleDistanceCm)) {
      return this.getState();
    }
    const sample = this.createSample(pose, timestampMs);
    this.state.samples.push(sample);

    const turnDelta = signedAngleDeltaDeg(this.lastSample.headingDeg, sample.headingDeg);
    const isTurn = Math.abs(turnDelta) >= this.config.turnAngleThresholdDeg;

    if (isTurn) {
      this.finalizeActiveSegment(this.lastSample);
      if (!this.pendingTurn) {
        const fromHeadingDeg = normalizeHeadingDeg(
          this.state.segments.length > 0
            ? headingFromPointsDeg(
                this.state.segments[this.state.segments.length - 1].start,
                this.state.segments[this.state.segments.length - 1].end,
              )
            : this.lastSample.headingDeg,
        );
        this.pendingTurn = {
          pivotSample: this.lastSample,
          fromHeadingDeg,
          toHeadingDeg: sample.headingDeg,
          settleCount: 0,
        };
      } else {
        const pendingCurrentAngle = Math.abs(
          signedAngleDeltaDeg(this.pendingTurn.fromHeadingDeg, this.pendingTurn.toHeadingDeg),
        );
        const candidateAngle = Math.abs(signedAngleDeltaDeg(this.pendingTurn.fromHeadingDeg, sample.headingDeg));
        if (candidateAngle >= pendingCurrentAngle) {
          this.pendingTurn.toHeadingDeg = sample.headingDeg;
        }
        this.pendingTurn.settleCount = 0;
      }
      this.activeStartSample = this.lastSample;
      this.state.activeSegment = this.buildSegment(this.activeStartSample, sample, sample.headingDeg);
    } else if (this.activeStartSample) {
      if (
        this.pendingTurn &&
        planarDistanceCm(this.pendingTurn.pivotSample.position, sample.position) >= Math.max(this.config.minSegmentDistanceCm, 4)
      ) {
        const pendingCurrentAngle = Math.abs(
          signedAngleDeltaDeg(this.pendingTurn.fromHeadingDeg, this.pendingTurn.toHeadingDeg),
        );
        const candidateAngle = Math.abs(signedAngleDeltaDeg(this.pendingTurn.fromHeadingDeg, sample.headingDeg));
        if (candidateAngle >= pendingCurrentAngle) {
          this.pendingTurn.toHeadingDeg = sample.headingDeg;
        }
        const settleDelta = Math.abs(signedAngleDeltaDeg(this.lastSample.headingDeg, sample.headingDeg));
        const settleThreshold = Math.max(2.5, this.config.turnAngleThresholdDeg * 0.22);
        if (settleDelta <= settleThreshold) {
          this.pendingTurn.settleCount += 1;
        } else {
          this.pendingTurn.settleCount = 0;
        }
        if (this.pendingTurn.settleCount >= 2) {
          this.createTurnMarkerWithHeadings(
            this.pendingTurn.pivotSample,
            this.pendingTurn.fromHeadingDeg,
            this.pendingTurn.toHeadingDeg,
          );
          this.pendingTurn = null;
        }
      }
      this.state.activeSegment = this.buildSegment(this.activeStartSample, sample, this.activeStartSample.headingDeg);
    }

    if (this.config.mode === "continuous" && this.activeStartSample && this.state.activeSegment) {
      this.state.activeSegment.headingEndDeg = sample.headingDeg;
      this.state.activeSegment.end = { ...sample.position };
    }

    this.lastSample = sample;
    this.refreshSummary();
    return this.getState();
  }

  endRun(finalPose?: MeasurementPose, timestampMs = Date.now()): MeasurementOverlayState {
    if (finalPose) {
      this.updatePose(finalPose, timestampMs);
    }
    if (this.lastSample) {
      if (this.pendingTurn) {
        const toHeadingDeg = headingFromPointsDeg(this.pendingTurn.pivotSample.position, this.lastSample.position);
        this.createTurnMarkerWithHeadings(
          this.pendingTurn.pivotSample,
          this.pendingTurn.fromHeadingDeg,
          toHeadingDeg,
        );
        this.pendingTurn = null;
      }
      this.finalizeActiveSegment(this.lastSample);
      this.state.endMarker = { ...this.lastSample.position };
    }
    this.state.running = false;
    this.refreshSummary();
    return this.getState();
  }

  private createSample(pose: MeasurementPose, timestampMs: number): PathSample {
    this.counters.sample += 1;
    return {
      id: `ms_${this.counters.sample}`,
      timestampMs,
      position: toPosition3(pose, 0),
      headingDeg: normalizeHeadingDeg(pose.headingDeg),
    };
  }

  private buildSegment(startSample: PathSample, endSample: PathSample, headingStartDeg: number): PathSegment {
    const distanceCm = planarDistanceCm(startSample.position, endSample.position);
    return {
      id: `seg_active`,
      start: { ...startSample.position },
      end: { ...endSample.position },
      distanceCm,
      headingStartDeg: normalizeHeadingDeg(headingStartDeg),
      headingEndDeg: normalizeHeadingDeg(endSample.headingDeg),
      label: formatDistanceCm(distanceCm, this.config.distanceUnit, this.config.gridCellCm),
      sampleCount: Math.max(2, this.state.samples.length),
    };
  }

  private finalizeActiveSegment(endSample: PathSample): void {
    if (!this.activeStartSample) return;
    const distanceCm = planarDistanceCm(this.activeStartSample.position, endSample.position);
    if (distanceCm < this.config.minSegmentDistanceCm) {
      this.state.activeSegment = null;
      return;
    }
    this.counters.segment += 1;
    const segment: PathSegment = {
      id: `seg_${this.counters.segment}`,
      start: { ...this.activeStartSample.position },
      end: { ...endSample.position },
      distanceCm,
      headingStartDeg: normalizeHeadingDeg(this.activeStartSample.headingDeg),
      headingEndDeg: normalizeHeadingDeg(endSample.headingDeg),
      label: formatDistanceCm(distanceCm, this.config.distanceUnit, this.config.gridCellCm),
      sampleCount: Math.max(2, this.state.samples.length),
    };
    this.state.segments.push(segment);
    this.state.activeSegment = null;
    this.activeStartSample = endSample;
  }

  private createTurnMarker(pivotSample: PathSample, toHeadingDeg: number): void {
    const fromHeadingDeg = normalizeHeadingDeg(
      this.state.segments.length > 0
        ? this.state.segments[this.state.segments.length - 1].headingEndDeg
        : pivotSample.headingDeg,
    );
    this.createTurnMarkerWithHeadings(pivotSample, fromHeadingDeg, toHeadingDeg);
  }

  private createTurnMarkerWithHeadings(pivotSample: PathSample, fromHeadingDeg: number, toHeadingDeg: number): void {
    if (
      this.lastTurnSample &&
      planarDistanceCm(this.lastTurnSample.position, pivotSample.position) < Math.max(6, this.config.minSegmentDistanceCm * 0.8)
    ) {
      return;
    }
    const normalizedFrom = normalizeHeadingDeg(fromHeadingDeg);
    const normalizedTo = normalizeHeadingDeg(toHeadingDeg);
    const angleDeg = signedAngleDeltaDeg(normalizedFrom, normalizedTo);
    if (Math.abs(angleDeg) < this.config.turnAngleThresholdDeg) return;
    this.counters.turn += 1;
    const marker: TurnMarker = {
      id: `turn_${this.counters.turn}`,
      position: { ...pivotSample.position },
      fromHeadingDeg: normalizedFrom,
      toHeadingDeg: normalizedTo,
      angleDeg,
      label: formatTurnLabel(angleDeg),
      arcRadiusCm: 12,
    };
    this.state.turns.push(marker);
    this.lastTurnSample = pivotSample;
  }

  getSegmentMidpoint(segment: PathSegment): { x: number; y: number; z: number } {
    return midpoint3(segment.start, segment.end);
  }

  private refreshSummary(): void {
    const finalizedDistance = this.state.segments.reduce((sum, segment) => sum + segment.distanceCm, 0);
    const activeDistance = this.state.activeSegment ? this.state.activeSegment.distanceCm : 0;
    const totalDistanceCm = finalizedDistance + activeDistance;
    this.state.summary = createSummary(
      this.config,
      totalDistanceCm,
      this.state.segments.length + (this.state.activeSegment ? 1 : 0),
      this.state.turns.length,
    );
  }
}

