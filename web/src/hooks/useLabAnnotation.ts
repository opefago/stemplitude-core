/**
 * useLabAnnotation — awareness-based cursor + temporary annotation hook.
 *
 * Uses the y-websocket awareness protocol to broadcast:
 *   - Cursor position (all participants)
 *   - Temporary annotation strokes (instructor only, auto-expire after TTL)
 *
 * Both instructor (observer) and student (writer) call this hook with
 * the same Yjs provider. Instructor writes annotations; student reads them.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { WebsocketProvider } from "y-websocket";

const ANNOTATION_TTL_MS = 8000;
const CLEANUP_INTERVAL_MS = 1000;

const INSTRUCTOR_COLORS = [
  "#f87171", "#fb923c", "#facc15", "#4ade80", "#22d3ee",
  "#818cf8", "#e879f9", "#f472b6",
];

export interface AnnotationStroke {
  id: string;
  color: string;
  size: number;
  points: number[];
  createdAt: number;
}

export interface RemoteAnnotationPeer {
  clientId: number;
  name: string;
  color: string;
  role: "instructor" | "student";
  cursor: { x: number; y: number } | null;
  annotations: AnnotationStroke[];
}

export interface UseLabAnnotationOptions {
  provider: WebsocketProvider | null;
  actorId: string;
  actorName?: string;
  isInstructor: boolean;
  enabled: boolean;
}

export interface UseLabAnnotationHandle {
  peers: RemoteAnnotationPeer[];
  setCursor: (x: number, y: number) => void;
  clearCursor: () => void;
  addAnnotationPoint: (x: number, y: number) => void;
  startAnnotation: (x: number, y: number, color: string, size: number) => void;
  finishAnnotation: () => void;
  clearAnnotations: () => void;
  activeAnnotation: AnnotationStroke | null;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function useLabAnnotation(options: UseLabAnnotationOptions): UseLabAnnotationHandle {
  const { provider, actorId, actorName, isInstructor, enabled } = options;

  const [peers, setPeers] = useState<RemoteAnnotationPeer[]>([]);
  const activeRef = useRef<AnnotationStroke | null>(null);
  const annotationsRef = useRef<AnnotationStroke[]>([]);
  const [activeAnnotation, setActiveAnnotation] = useState<AnnotationStroke | null>(null);

  const myColor = INSTRUCTOR_COLORS[Math.abs(hashCode(actorId)) % INSTRUCTOR_COLORS.length];

  useEffect(() => {
    if (!provider?.awareness || !enabled) return;
    const awareness = provider.awareness;

    awareness.setLocalStateField("user", {
      name: actorName || actorId || "Participant",
      color: myColor,
      role: isInstructor ? "instructor" : "student",
    });

    const syncPeers = () => {
      const states = awareness.getStates();
      const result: RemoteAnnotationPeer[] = [];
      states.forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const user = state.user;
        if (!user) return;
        result.push({
          clientId,
          name: user.name ?? "Peer",
          color: user.color ?? "#818cf8",
          role: user.role ?? "student",
          cursor: state.cursor ?? null,
          annotations: Array.isArray(state.annotations) ? state.annotations : [],
        });
      });
      setPeers(result);
    };

    awareness.on("change", syncPeers);
    syncPeers();

    return () => {
      awareness.off("change", syncPeers);
      setPeers([]);
    };
  }, [provider, actorId, actorName, isInstructor, enabled, myColor]);

  // Auto-expire old annotations (instructor side)
  useEffect(() => {
    if (!isInstructor || !provider?.awareness || !enabled) return;
    const awareness = provider.awareness;

    const timer = window.setInterval(() => {
      const now = Date.now();
      const before = annotationsRef.current.length;
      annotationsRef.current = annotationsRef.current.filter(
        (s) => now - s.createdAt < ANNOTATION_TTL_MS,
      );
      if (annotationsRef.current.length !== before) {
        awareness.setLocalStateField("annotations", [...annotationsRef.current]);
      }
    }, CLEANUP_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isInstructor, provider, enabled]);

  const setCursor = useCallback(
    (x: number, y: number) => {
      provider?.awareness?.setLocalStateField("cursor", { x, y });
    },
    [provider],
  );

  const clearCursor = useCallback(() => {
    provider?.awareness?.setLocalStateField("cursor", null);
  }, [provider]);

  const startAnnotation = useCallback(
    (x: number, y: number, color: string, size: number) => {
      if (!isInstructor) return;
      const stroke: AnnotationStroke = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        color,
        size,
        points: [x, y],
        createdAt: Date.now(),
      };
      activeRef.current = stroke;
      setActiveAnnotation(stroke);
    },
    [isInstructor],
  );

  const addAnnotationPoint = useCallback(
    (x: number, y: number) => {
      const active = activeRef.current;
      if (!active || !isInstructor) return;
      active.points.push(x, y);
      setActiveAnnotation({ ...active });

      if (provider?.awareness) {
        provider.awareness.setLocalStateField("annotations", [
          ...annotationsRef.current,
          active,
        ]);
      }
    },
    [isInstructor, provider],
  );

  const finishAnnotation = useCallback(() => {
    const active = activeRef.current;
    if (!active || !isInstructor) return;
    activeRef.current = null;
    setActiveAnnotation(null);

    if (active.points.length >= 4) {
      annotationsRef.current = [...annotationsRef.current, active];
      provider?.awareness?.setLocalStateField("annotations", [...annotationsRef.current]);
    }
  }, [isInstructor, provider]);

  const clearAnnotations = useCallback(() => {
    if (!isInstructor) return;
    annotationsRef.current = [];
    activeRef.current = null;
    setActiveAnnotation(null);
    provider?.awareness?.setLocalStateField("annotations", []);
  }, [isInstructor, provider]);

  return {
    peers,
    setCursor,
    clearCursor,
    addAnnotationPoint,
    startAnnotation,
    finishAnnotation,
    clearAnnotations,
    activeAnnotation,
  };
}
