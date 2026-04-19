import { useCallback, useRef, useState } from "react";
import type { SimulatorSceneObject } from "../../labs/robotics/simulator/types";

export interface WorldSceneSnapshot {
  objects: SimulatorSceneObject[];
  groups?: SimulatorObjectGroup[];
  width_cells?: number;
  height_cells?: number;
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
  version = 0;

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
    this.version += 1;
  }

  undo(): WorldSceneSnapshot | null {
    if (this.pointer < 0) return null;
    const entry = this.stack[this.pointer];
    this.pointer -= 1;
    this.version += 1;
    return entry.before;
  }

  redo(): WorldSceneSnapshot | null {
    if (this.pointer >= this.stack.length - 1) return null;
    this.pointer += 1;
    this.version += 1;
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
    this.version += 1;
  }

  get currentLabel(): string | null {
    if (this.pointer < 0) return null;
    return this.stack[this.pointer].label;
  }

  get length(): number {
    return this.stack.length;
  }
}

export function snapshotScene(
  objects: SimulatorSceneObject[],
  groups?: SimulatorObjectGroup[],
  widthCells?: number,
  heightCells?: number,
): WorldSceneSnapshot {
  return {
    objects: objects.map((o) => ({
      ...o,
      position: { ...o.position },
      size_cm: { ...o.size_cm },
      rotation_deg: o.rotation_deg ? { ...o.rotation_deg } : undefined,
      metadata: o.metadata ? { ...o.metadata } : undefined,
    })),
    groups: groups?.map((g) => ({ ...g, objectIds: [...g.objectIds] })),
    width_cells: widthCells,
    height_cells: heightCells,
  };
}

interface UndoActions {
  beginAction: (label: string) => void;
  commitAction: () => void;
  cancelAction: () => void;
  undo: () => WorldSceneSnapshot | null;
  redo: () => WorldSceneSnapshot | null;
  canUndo: boolean;
  canRedo: boolean;
  pendingLabel: string | null;
  /** Call to capture the current scene; returns snapshot for external use */
  snapshot: () => WorldSceneSnapshot;
}

interface UseUndoStackOptions {
  getObjects: () => SimulatorSceneObject[];
  getGroups: () => SimulatorObjectGroup[];
  getWidthCells: () => number;
  getHeightCells: () => number;
}

export function useUndoStack(opts: UseUndoStackOptions): UndoActions {
  const stackRef = useRef(new UndoStack(50));
  const [version, setVersion] = useState(0);
  const pendingRef = useRef<{ label: string; before: WorldSceneSnapshot } | null>(null);

  const captureSnapshot = useCallback(
    () => snapshotScene(opts.getObjects(), opts.getGroups(), opts.getWidthCells(), opts.getHeightCells()),
    [opts],
  );

  const syncVersion = useCallback(() => {
    setVersion(stackRef.current.version);
  }, []);

  const beginAction = useCallback(
    (label: string) => {
      if (pendingRef.current) return;
      pendingRef.current = { label, before: captureSnapshot() };
    },
    [captureSnapshot],
  );

  const commitAction = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    const after = captureSnapshot();
    stackRef.current.push(pending.label, pending.before, after);
    syncVersion();
  }, [captureSnapshot, syncVersion]);

  const cancelAction = useCallback(() => {
    pendingRef.current = null;
  }, []);

  const undo = useCallback((): WorldSceneSnapshot | null => {
    if (pendingRef.current) pendingRef.current = null;
    const result = stackRef.current.undo();
    syncVersion();
    return result;
  }, [syncVersion]);

  const redo = useCallback((): WorldSceneSnapshot | null => {
    if (pendingRef.current) pendingRef.current = null;
    const result = stackRef.current.redo();
    syncVersion();
    return result;
  }, [syncVersion]);

  const snapshot = useCallback(() => captureSnapshot(), [captureSnapshot]);

  const canUndo = version >= 0 && stackRef.current.canUndo();
  const canRedo = version >= 0 && stackRef.current.canRedo();
  const pendingLabel = pendingRef.current?.label ?? null;

  return { beginAction, commitAction, cancelAction, undo, redo, canUndo, canRedo, pendingLabel, snapshot };
}
