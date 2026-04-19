export type ObjectiveCriteriaType =
  | "zone_enter"
  | "object_in_zone"
  | "checkpoint_sequence"
  | "time_under"
  | "distance_under"
  | "all_objects_scored";

export interface ObjectiveCriteria {
  type: ObjectiveCriteriaType;
  zone_id?: string;
  object_class?: string;
  checkpoint_ids?: string[];
  threshold_ms?: number;
  threshold_cm?: number;
}

export interface MissionObjective {
  id: string;
  type: ObjectiveCriteriaType;
  description: string;
  points: number;
  criteria: ObjectiveCriteria;
  completed: boolean;
}

export interface MissionDefinition {
  id: string;
  name: string;
  description: string;
  objectives: MissionObjective[];
  time_limit_ms?: number;
  max_score: number;
  passing_score: number;
}

export interface MissionState {
  started: boolean;
  finished: boolean;
  elapsed_ms: number;
  score: number;
  objectives: MissionObjective[];
  checkpoints_visited: string[];
  zones_entered: Set<string>;
}

export interface TickContext {
  robot_position: { x: number; y: number };
  robot_heading_deg: number;
  object_positions: Array<{ id: string; x: number; z: number; type: string; metadata?: Record<string, unknown> }>;
  elapsed_ms: number;
  path_length_cm: number;
}

export class MissionEvaluator {
  private mission: MissionDefinition;
  private state: MissionState;
  private listeners: Array<(state: MissionState) => void> = [];

  constructor(mission: MissionDefinition) {
    this.mission = mission;
    this.state = {
      started: false,
      finished: false,
      elapsed_ms: 0,
      score: 0,
      objectives: mission.objectives.map((o) => ({ ...o, completed: false })),
      checkpoints_visited: [],
      zones_entered: new Set(),
    };
  }

  start(): void {
    this.state.started = true;
    this.state.finished = false;
    this.state.elapsed_ms = 0;
    this.state.score = 0;
    this.state.checkpoints_visited = [];
    this.state.zones_entered = new Set();
    this.state.objectives = this.mission.objectives.map((o) => ({ ...o, completed: false }));
    this.notify();
  }

  tick(ctx: TickContext): void {
    if (!this.state.started || this.state.finished) return;

    this.state.elapsed_ms = ctx.elapsed_ms;

    if (this.mission.time_limit_ms && ctx.elapsed_ms > this.mission.time_limit_ms) {
      this.finish();
      return;
    }

    for (const obj of this.state.objectives) {
      if (obj.completed) continue;

      const crit = obj.criteria;

      if (crit.type === "zone_enter" && crit.zone_id) {
        const zone = ctx.object_positions.find((o) => o.id === crit.zone_id);
        if (zone && this.isInZone(ctx.robot_position, zone)) {
          obj.completed = true;
          this.state.score += obj.points;
          this.state.zones_entered.add(crit.zone_id);
        }
      }

      if (crit.type === "object_in_zone" && crit.zone_id && crit.object_class) {
        const zone = ctx.object_positions.find((o) => o.id === crit.zone_id);
        const targets = ctx.object_positions.filter((o) => o.metadata?.palette_object_id === crit.object_class || o.metadata?.pickup_class === crit.object_class);
        if (zone) {
          const inZone = targets.some((t) => this.isInZone({ x: t.x, y: t.z }, zone));
          if (inZone) {
            obj.completed = true;
            this.state.score += obj.points;
          }
        }
      }

      if (crit.type === "checkpoint_sequence" && crit.checkpoint_ids) {
        const nextIdx = this.state.checkpoints_visited.length;
        if (nextIdx < crit.checkpoint_ids.length) {
          const nextCpId = crit.checkpoint_ids[nextIdx];
          const cp = ctx.object_positions.find((o) => o.id === nextCpId);
          if (cp && this.isInZone(ctx.robot_position, cp)) {
            this.state.checkpoints_visited.push(nextCpId);
            if (this.state.checkpoints_visited.length === crit.checkpoint_ids.length) {
              obj.completed = true;
              this.state.score += obj.points;
            }
          }
        }
      }

      if (crit.type === "time_under" && crit.threshold_ms) {
        const allOthersComplete = this.state.objectives
          .filter((o) => o.id !== obj.id)
          .every((o) => o.completed);
        if (allOthersComplete && ctx.elapsed_ms <= crit.threshold_ms) {
          obj.completed = true;
          this.state.score += obj.points;
        }
      }

      if (crit.type === "distance_under" && crit.threshold_cm) {
        const allOthersComplete = this.state.objectives
          .filter((o) => o.id !== obj.id)
          .every((o) => o.completed);
        if (allOthersComplete && ctx.path_length_cm <= crit.threshold_cm) {
          obj.completed = true;
          this.state.score += obj.points;
        }
      }
    }

    const allComplete = this.state.objectives.every((o) => o.completed);
    if (allComplete) {
      this.finish();
    }

    this.notify();
  }

  finish(): void {
    this.state.finished = true;
    this.notify();
  }

  getState(): MissionState {
    return { ...this.state };
  }

  isPassing(): boolean {
    return this.state.score >= this.mission.passing_score;
  }

  onStateChange(listener: (state: MissionState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private isInZone(point: { x: number; y: number }, zone: { x: number; z: number; metadata?: Record<string, unknown> }): boolean {
    const halfSize = 30;
    return (
      Math.abs(point.x - zone.x) < halfSize &&
      Math.abs(point.y - zone.z) < halfSize
    );
  }
}
