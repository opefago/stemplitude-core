/**
 * useCircuitAwareness — broadcasts and receives live circuit interaction
 * state via Yjs awareness. Used for:
 *   - Student drag-in-progress (component being moved)
 *   - Student wire-in-progress (wire being drawn)
 *   - Cursor position (both instructor and student)
 *   - Instructor commands (place component, create wire)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { WebsocketProvider } from "y-websocket";
import type * as Y from "yjs";

export interface CircuitPeerState {
  clientId: number;
  name: string;
  role: "student" | "instructor";
  cursor?: { x: number; y: number } | null;
  drag?: {
    componentName: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  } | null;
  wireProgress?: {
    points: { x: number; y: number }[];
  } | null;
}

export interface InstructorCommand {
  id: string;
  type: "place_component" | "create_wire";
  payload: Record<string, unknown>;
  timestamp: number;
}

const THROTTLE_MS = 50;

export function useCircuitAwareness(
  provider: WebsocketProvider | null,
  ydoc: Y.Doc | null,
  opts: {
    actorName: string;
    role: "student" | "instructor";
    enabled: boolean;
  },
) {
  const [peers, setPeers] = useState<CircuitPeerState[]>([]);
  const lastPushRef = useRef(0);
  const localStateRef = useRef<Record<string, unknown>>({});

  // Set local identity on awareness
  useEffect(() => {
    if (!provider || !opts.enabled) return;
    const awareness = provider.awareness;
    awareness.setLocalStateField("circuit_user", {
      name: opts.actorName,
      role: opts.role,
    });
    return () => {
      awareness.setLocalStateField("circuit_user", null);
    };
  }, [provider, opts.actorName, opts.role, opts.enabled]);

  // Listen for remote peer changes
  useEffect(() => {
    if (!provider || !opts.enabled) return;
    const awareness = provider.awareness;

    const update = () => {
      const states = awareness.getStates();
      const result: CircuitPeerState[] = [];
      states.forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const cu = state.circuit_user;
        if (!cu) return;
        result.push({
          clientId,
          name: cu.name ?? "Peer",
          role: cu.role ?? "student",
          cursor: state.circuit_cursor ?? null,
          drag: state.circuit_drag ?? null,
          wireProgress: state.circuit_wire ?? null,
        });
      });
      setPeers(result);
    };

    awareness.on("change", update);
    update();
    return () => {
      awareness.off("change", update);
    };
  }, [provider, opts.enabled]);

  const pushField = useCallback(
    (field: string, value: unknown) => {
      if (!provider || !opts.enabled) return;
      const now = Date.now();
      if (now - lastPushRef.current < THROTTLE_MS) return;
      lastPushRef.current = now;
      localStateRef.current[field] = value;
      provider.awareness.setLocalStateField(field, value);
    },
    [provider, opts.enabled],
  );

  const pushFieldImmediate = useCallback(
    (field: string, value: unknown) => {
      if (!provider || !opts.enabled) return;
      localStateRef.current[field] = value;
      provider.awareness.setLocalStateField(field, value);
    },
    [provider, opts.enabled],
  );

  const setCursor = useCallback(
    (x: number, y: number) => pushField("circuit_cursor", { x, y }),
    [pushField],
  );

  const clearCursor = useCallback(
    () => pushFieldImmediate("circuit_cursor", null),
    [pushFieldImmediate],
  );

  const setDrag = useCallback(
    (componentName: string, fromX: number, fromY: number, toX: number, toY: number) =>
      pushField("circuit_drag", { componentName, fromX, fromY, toX, toY }),
    [pushField],
  );

  const clearDrag = useCallback(
    () => pushFieldImmediate("circuit_drag", null),
    [pushFieldImmediate],
  );

  const setWireProgress = useCallback(
    (points: { x: number; y: number }[]) =>
      pushField("circuit_wire", { points }),
    [pushField],
  );

  const clearWireProgress = useCallback(
    () => pushFieldImmediate("circuit_wire", null),
    [pushFieldImmediate],
  );

  // Instructor commands via Y.Array
  const sendCommand = useCallback(
    (cmd: Omit<InstructorCommand, "id" | "timestamp">) => {
      if (!ydoc || !opts.enabled) return;
      const yCommands = ydoc.getArray("instructor_commands");
      yCommands.push([
        {
          ...cmd,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ]);
    },
    [ydoc, opts.enabled],
  );

  return {
    peers,
    setCursor,
    clearCursor,
    setDrag,
    clearDrag,
    setWireProgress,
    clearWireProgress,
    sendCommand,
  };
}
