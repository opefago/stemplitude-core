export interface PathWaypoint {
  x: number;
  z: number;
}

export type PathMode = "loop" | "pingpong";

export class PathDriver {
  private waypoints: PathWaypoint[];
  private speed: number;
  private mode: PathMode;
  private currentIndex = 0;
  private direction = 1;
  private progress = 0;

  constructor(waypoints: PathWaypoint[], speed: number, mode: PathMode = "loop") {
    this.waypoints = waypoints.length >= 2 ? waypoints : [{ x: 0, z: 0 }, { x: 100, z: 0 }];
    this.speed = Math.max(1, speed);
    this.mode = mode;
  }

  tick(dtS: number): { x: number; z: number; rotationDeg: number } {
    if (this.waypoints.length < 2) {
      return { x: this.waypoints[0]?.x ?? 0, z: this.waypoints[0]?.z ?? 0, rotationDeg: 0 };
    }

    const nextIndex = this.getNextIndex();
    const from = this.waypoints[this.currentIndex];
    const to = this.waypoints[nextIndex];
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const segLen = Math.hypot(dx, dz);

    if (segLen < 0.1) {
      this.advance();
      return this.tick(dtS);
    }

    this.progress += (this.speed * dtS) / segLen;

    if (this.progress >= 1) {
      this.progress -= 1;
      this.advance();
      return this.tick(0);
    }

    const t = Math.max(0, Math.min(1, this.progress));
    const rotationDeg = (Math.atan2(dz, dx) * 180) / Math.PI;
    return {
      x: from.x + dx * t,
      z: from.z + dz * t,
      rotationDeg,
    };
  }

  private getNextIndex(): number {
    if (this.mode === "pingpong") {
      const next = this.currentIndex + this.direction;
      if (next >= this.waypoints.length) return this.waypoints.length - 2;
      if (next < 0) return 1;
      return next;
    }
    return (this.currentIndex + 1) % this.waypoints.length;
  }

  private advance(): void {
    if (this.mode === "pingpong") {
      const next = this.currentIndex + this.direction;
      if (next >= this.waypoints.length || next < 0) {
        this.direction *= -1;
      }
      this.currentIndex = this.currentIndex + this.direction;
    } else {
      this.currentIndex = (this.currentIndex + 1) % this.waypoints.length;
    }
  }

  reset(): void {
    this.currentIndex = 0;
    this.direction = 1;
    this.progress = 0;
  }
}
