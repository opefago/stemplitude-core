export interface ReplayFrame {
  t_ms: number;
  pose: { x: number; y: number; heading_deg: number };
  sensor_values?: Record<string, string | number | boolean>;
  object_positions?: Array<{ id: string; x: number; z: number }>;
  score?: number;
}

export interface ReplayData {
  version: 1;
  recorded_at: string;
  total_ms: number;
  frames: ReplayFrame[];
}

export class ReplayRecorder {
  private frames: ReplayFrame[] = [];
  private recording = false;
  private startTime = 0;
  private lastPose: { x: number; y: number; heading_deg: number } | null = null;
  private minDeltaMs = 50;

  start(): void {
    this.frames = [];
    this.recording = true;
    this.startTime = Date.now();
    this.lastPose = null;
  }

  stop(): ReplayData {
    this.recording = false;
    const totalMs = this.frames.length > 0 ? this.frames[this.frames.length - 1].t_ms : 0;
    return {
      version: 1,
      recorded_at: new Date().toISOString(),
      total_ms: totalMs,
      frames: this.frames,
    };
  }

  recordFrame(frame: Omit<ReplayFrame, "t_ms">, elapsedMs?: number): void {
    if (!this.recording) return;

    const t_ms = elapsedMs ?? (Date.now() - this.startTime);

    if (this.frames.length > 0) {
      const lastFrame = this.frames[this.frames.length - 1];
      if (t_ms - lastFrame.t_ms < this.minDeltaMs) return;
    }

    if (this.lastPose) {
      const dx = frame.pose.x - this.lastPose.x;
      const dy = frame.pose.y - this.lastPose.y;
      const dh = frame.pose.heading_deg - this.lastPose.heading_deg;
      if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1 && Math.abs(dh) < 0.1 && !frame.score) {
        return;
      }
    }

    this.lastPose = { ...frame.pose };

    const entry: ReplayFrame = {
      t_ms,
      pose: { ...frame.pose },
    };

    if (frame.object_positions) {
      entry.object_positions = frame.object_positions.map((o) => ({ id: o.id, x: o.x, z: o.z }));
    }
    if (frame.score !== undefined) {
      entry.score = frame.score;
    }

    this.frames.push(entry);
  }

  isRecording(): boolean {
    return this.recording;
  }

  getFrameCount(): number {
    return this.frames.length;
  }

  clear(): void {
    this.frames = [];
    this.recording = false;
    this.lastPose = null;
  }
}

export class ReplayPlayer {
  private data: ReplayData;
  private currentIndex = 0;
  private playbackTime = 0;
  private speed = 1;

  constructor(data: ReplayData) {
    this.data = data;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(10, speed));
  }

  seek(timeMs: number): ReplayFrame | null {
    this.playbackTime = Math.max(0, Math.min(timeMs, this.data.total_ms));
    const frame = this.findFrameAt(this.playbackTime);
    return frame;
  }

  advance(dtMs: number): ReplayFrame | null {
    this.playbackTime += dtMs * this.speed;
    if (this.playbackTime >= this.data.total_ms) {
      this.playbackTime = this.data.total_ms;
    }
    return this.findFrameAt(this.playbackTime);
  }

  isFinished(): boolean {
    return this.playbackTime >= this.data.total_ms;
  }

  getProgress(): number {
    if (this.data.total_ms <= 0) return 1;
    return this.playbackTime / this.data.total_ms;
  }

  getTotalMs(): number {
    return this.data.total_ms;
  }

  reset(): void {
    this.currentIndex = 0;
    this.playbackTime = 0;
  }

  private findFrameAt(timeMs: number): ReplayFrame | null {
    const frames = this.data.frames;
    if (frames.length === 0) return null;

    while (this.currentIndex < frames.length - 1 && frames[this.currentIndex + 1].t_ms <= timeMs) {
      this.currentIndex++;
    }
    while (this.currentIndex > 0 && frames[this.currentIndex].t_ms > timeMs) {
      this.currentIndex--;
    }

    const cur = frames[this.currentIndex];
    const next = this.currentIndex < frames.length - 1 ? frames[this.currentIndex + 1] : null;

    if (!next || next.t_ms <= cur.t_ms) return cur;

    const t = (timeMs - cur.t_ms) / (next.t_ms - cur.t_ms);
    return {
      t_ms: timeMs,
      pose: {
        x: cur.pose.x + (next.pose.x - cur.pose.x) * t,
        y: cur.pose.y + (next.pose.y - cur.pose.y) * t,
        heading_deg: cur.pose.heading_deg + (next.pose.heading_deg - cur.pose.heading_deg) * t,
      },
      score: next.score ?? cur.score,
    };
  }
}
