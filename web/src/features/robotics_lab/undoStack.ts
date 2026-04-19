import type { SimulatorSceneObject } from "../../labs/robotics/simulator/types";

export interface WorldSceneSnapshot {
  objects: SimulatorSceneObject[];
  groups?: SimulatorObjectGroup[];
}

export interface SimulatorObjectGroup {
  id: string;
  name: string;
  objectIds: string[];
}

interface UndoEntry {
  label: string;
  before: WorldSceneSnapshot;
  after: WorldSceneSnapshot;
}

export class UndoStack {
  private stack: UndoEntry[] = [];
  private pointer = -1;
  private maxDepth: number;

  constructor(maxDepth = 50) {
    this.maxDepth = maxDepth;
  }

  push(label: string, before: WorldSceneSnapshot, after: WorldSceneSnapshot) {
    this.stack = this.stack.slice(0, this.pointer + 1);
    this.stack.push({ label, before, after });
    if (this.stack.length > this.maxDepth) {
      this.stack.shift();
    } else {
      this.pointer += 1;
    }
  }

  undo(): WorldSceneSnapshot | null {
    if (this.pointer < 0) return null;
    const entry = this.stack[this.pointer];
    this.pointer -= 1;
    return entry.before;
  }

  redo(): WorldSceneSnapshot | null {
    if (this.pointer >= this.stack.length - 1) return null;
    this.pointer += 1;
    return this.stack[this.pointer].after;
  }

  canUndo(): boolean {
    return this.pointer >= 0;
  }

  canRedo(): boolean {
    return this.pointer < this.stack.length - 1;
  }

  clear() {
    this.stack = [];
    this.pointer = -1;
  }

  get currentLabel(): string | null {
    if (this.pointer < 0) return null;
    return this.stack[this.pointer].label;
  }

  get length(): number {
    return this.stack.length;
  }
}

export function snapshotScene(objects: SimulatorSceneObject[], groups?: SimulatorObjectGroup[]): WorldSceneSnapshot {
  return {
    objects: objects.map((o) => ({ ...o, position: { ...o.position }, size_cm: { ...o.size_cm }, rotation_deg: o.rotation_deg ? { ...o.rotation_deg } : undefined, metadata: o.metadata ? { ...o.metadata } : undefined })),
    groups: groups?.map((g) => ({ ...g, objectIds: [...g.objectIds] })),
  };
}
