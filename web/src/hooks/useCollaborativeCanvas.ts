/**
 * useCollaborativeCanvas — reusable collaborative whiteboard hook.
 *
 * Connects to the Yjs server via the existing lab sync infrastructure
 * (y-websocket + pycrdt backend) using a `board:{sessionId}` room.
 *
 * Stroke data model:
 *   - Y.Array "board_strokes": finalized (committed) strokes
 *   - Y.Map  "active_strokes": in-progress strokes keyed by actorId
 *     (throttle-updated during drawing so remote peers see live ink)
 *   - Y.Map  "board_config":   access mode + allowed student IDs
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import * as Y from "yjs";
import { useLabSync } from "../features/labs/useLabSync";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChalkboardAccessMode = "teacher_only" | "participants" | "selected_students";
export type ChalkTool = "chalk" | "eraser";

export interface ChalkboardStroke {
  id: string;
  author_id: string;
  color: string;
  size: number;
  eraser: boolean;
  points: number[];
}

export interface RemoteCursor {
  clientId: number;
  name: string;
  color: string;
  x: number;
  y: number;
}

export interface CollaborativeCanvasOptions {
  sessionId: string | null | undefined;
  actorId: string;
  actorName?: string;
  isInstructor: boolean;
  enabled: boolean;
}

export interface CollaborativeCanvasHandle {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  isConnected: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave: () => void;
  canDraw: boolean;
  tool: ChalkTool;
  setTool: (t: ChalkTool) => void;
  color: string;
  setColor: (c: string) => void;
  size: number;
  setSize: (s: number) => void;
  accessMode: ChalkboardAccessMode;
  setAccessMode: (m: ChalkboardAccessMode) => void;
  allowedStudentIds: string[];
  setAllowedStudentIds: (ids: string[]) => void;
  clearBoard: () => void;
  strokes: ChalkboardStroke[];
  remoteCursors: RemoteCursor[];
  resizeCanvas: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_STROKES = 300;
const BOARD_BG = "#0f2a1d";
const LIVE_STROKE_THROTTLE_MS = 50;
const CURSOR_COLORS = [
  "#f87171", "#fb923c", "#facc15", "#4ade80", "#22d3ee",
  "#818cf8", "#e879f9", "#f472b6", "#a3e635", "#38bdf8",
];

function buildBoardRoomId(sessionId: string): string {
  return `board:${sessionId}`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCollaborativeCanvas(options: CollaborativeCanvasOptions): CollaborativeCanvasHandle {
  const { sessionId, actorId, actorName, isInstructor, enabled } = options;

  const roomId = sessionId ? buildBoardRoomId(sessionId) : null;
  const { ydoc, provider, isConnected } = useLabSync(roomId, sessionId, false, enabled && Boolean(sessionId));

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<ChalkboardStroke | null>(null);
  const yStrokesRef = useRef<Y.Array<ChalkboardStroke> | null>(null);
  const yActiveStrokesRef = useRef<Y.Map<unknown> | null>(null);
  const yConfigRef = useRef<Y.Map<unknown> | null>(null);
  const lastLivePushRef = useRef(0);
  const cssSizeRef = useRef({ w: 0, h: 0 });

  const [strokes, setStrokes] = useState<ChalkboardStroke[]>([]);
  const [remoteActiveStrokes, setRemoteActiveStrokes] = useState<ChalkboardStroke[]>([]);
  const [accessMode, _setAccessMode] = useState<ChalkboardAccessMode>("teacher_only");
  const [allowedStudentIds, _setAllowedStudentIds] = useState<string[]>([]);
  const [tool, setTool] = useState<ChalkTool>("chalk");
  const [color, setColor] = useState("#ffffff");
  const [size, setSize] = useState(5);
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);

  const canDraw = useMemo(() => {
    if (isInstructor) return true;
    if (!actorId) return false;
    if (accessMode === "participants") return true;
    if (accessMode === "selected_students") return allowedStudentIds.includes(actorId);
    return false;
  }, [isInstructor, actorId, accessMode, allowedStudentIds]);

  // ── Sync Yjs committed strokes + config → React ─────────────────────────

  const syncFromYDoc = useCallback(() => {
    const yStrokes = yStrokesRef.current;
    const yConfig = yConfigRef.current;
    if (!yStrokes || !yConfig) return;

    const parsed = yStrokes
      .toArray()
      .filter((row) => row && typeof row.id === "string" && Array.isArray(row.points))
      .slice(-MAX_STROKES);
    setStrokes(parsed);

    const modeRaw = yConfig.get("access_mode");
    if (modeRaw === "participants" || modeRaw === "selected_students" || modeRaw === "teacher_only") {
      _setAccessMode(modeRaw as ChalkboardAccessMode);
    }
    const allowedRaw = yConfig.get("allowed_student_ids");
    if (Array.isArray(allowedRaw)) {
      _setAllowedStudentIds(allowedRaw.filter((id): id is string => typeof id === "string"));
    }
  }, []);

  // ── Sync Yjs active (in-progress) strokes from remote peers ─────────────

  const syncRemoteActive = useCallback(() => {
    const yActive = yActiveStrokesRef.current;
    if (!yActive) { setRemoteActiveStrokes([]); return; }
    const result: ChalkboardStroke[] = [];
    yActive.forEach((val, key) => {
      if (key === actorId) return;
      const s = val as ChalkboardStroke | null;
      if (s && typeof s.id === "string" && Array.isArray(s.points) && s.points.length >= 2) {
        result.push(s);
      }
    });
    setRemoteActiveStrokes(result);
  }, [actorId]);

  // ── Bind Y.Doc arrays/maps ──────────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const yStrokes = ydoc.getArray<ChalkboardStroke>("board_strokes");
    const yActive = ydoc.getMap("active_strokes");
    const yConfig = ydoc.getMap("board_config");
    yStrokesRef.current = yStrokes;
    yActiveStrokesRef.current = yActive;
    yConfigRef.current = yConfig;

    if (typeof yConfig.get("access_mode") !== "string") {
      yConfig.set("access_mode", "teacher_only");
    }
    if (!Array.isArray(yConfig.get("allowed_student_ids"))) {
      yConfig.set("allowed_student_ids", []);
    }

    const onStrokesChange = () => syncFromYDoc();
    const onActiveChange = () => syncRemoteActive();
    const onConfigChange = () => syncFromYDoc();
    yStrokes.observe(onStrokesChange);
    yActive.observe(onActiveChange);
    yConfig.observe(onConfigChange);
    syncFromYDoc();
    syncRemoteActive();

    return () => {
      yStrokes.unobserve(onStrokesChange);
      yActive.unobserve(onActiveChange);
      yConfig.unobserve(onConfigChange);
      yStrokesRef.current = null;
      yActiveStrokesRef.current = null;
      yConfigRef.current = null;
    };
  }, [ydoc, enabled, sessionId, syncFromYDoc, syncRemoteActive]);

  // ── Awareness (remote cursors) ──────────────────────────────────────────

  useEffect(() => {
    if (!provider?.awareness) return;
    const awareness = provider.awareness;

    awareness.setLocalStateField("user", {
      name: actorName || actorId || "Anonymous",
      color: CURSOR_COLORS[Math.abs(hashCode(actorId)) % CURSOR_COLORS.length],
    });

    const onChange = () => {
      const states = awareness.getStates();
      const cursors: RemoteCursor[] = [];
      states.forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const cursor = state.cursor;
        const user = state.user;
        if (!cursor || typeof cursor.x !== "number" || typeof cursor.y !== "number") return;
        cursors.push({
          clientId,
          name: user?.name ?? "Peer",
          color: user?.color ?? "#818cf8",
          x: cursor.x,
          y: cursor.y,
        });
      });
      setRemoteCursors(cursors);
    };
    awareness.on("change", onChange);
    return () => {
      awareness.off("change", onChange);
      setRemoteCursors([]);
    };
  }, [provider, actorId, actorName]);

  // ── Canvas rendering ────────────────────────────────────────────────────
  // Coordinates are normalized 0-1 and multiplied by CSS dimensions (not
  // pixel-buffer dimensions) because ctx.setTransform(dpr, …) already
  // handles the DPR scaling.

  const redraw = useCallback(
    (extraStroke?: ChalkboardStroke | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = cssSizeRef.current.w || canvas.getBoundingClientRect().width;
      const h = cssSizeRef.current.h || canvas.getBoundingClientRect().height;
      if (w <= 0 || h <= 0) return;

      ctx.save();
      ctx.fillStyle = BOARD_BG;
      ctx.fillRect(0, 0, w, h);

      const renderStroke = (stroke: ChalkboardStroke) => {
        if (!Array.isArray(stroke.points) || stroke.points.length < 4) return;
        ctx.save();
        ctx.globalCompositeOperation = stroke.eraser ? "destination-out" : "source-over";
        ctx.strokeStyle = stroke.eraser ? "rgba(0,0,0,1)" : stroke.color;
        ctx.lineWidth = Math.max(1, stroke.size);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(stroke.points[0] * w, stroke.points[1] * h);
        for (let i = 2; i < stroke.points.length; i += 2) {
          ctx.lineTo(stroke.points[i] * w, stroke.points[i + 1] * h);
        }
        ctx.stroke();
        ctx.restore();
      };

      for (const stroke of strokes) renderStroke(stroke);
      for (const stroke of remoteActiveStrokes) renderStroke(stroke);
      if (extraStroke) renderStroke(extraStroke);
      ctx.restore();
    },
    [strokes, remoteActiveStrokes],
  );

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    cssSizeRef.current = { w: rect.width, h: rect.height };
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw(activeStrokeRef.current);
  }, [redraw]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  useEffect(() => {
    redraw(activeStrokeRef.current);
  }, [strokes, remoteActiveStrokes, redraw]);

  // ── Pointer handlers ────────────────────────────────────────────────────

  const pointerToNorm = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = rect.width > 0 ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0;
    const y = rect.height > 0 ? Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) : 0;
    return { x, y };
  }, []);

  const pushActiveToYjs = useCallback(() => {
    const active = activeStrokeRef.current;
    const yActive = yActiveStrokesRef.current;
    if (!active || !yActive || !actorId) return;
    yActive.set(actorId, { ...active, points: [...active.points] });
    lastLivePushRef.current = Date.now();
  }, [actorId]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || !actorId) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = pointerToNorm(event);
    const stroke: ChalkboardStroke = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      author_id: actorId,
      color,
      size,
      eraser: tool === "eraser",
      points: [x, y],
    };
    activeStrokeRef.current = stroke;
    redraw(stroke);
    pushActiveToYjs();

    if (provider?.awareness) {
      provider.awareness.setLocalStateField("cursor", { x, y });
    }
  }, [actorId, color, size, tool, canDraw, pointerToNorm, redraw, provider, pushActiveToYjs]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointerToNorm(event);

    if (provider?.awareness && canDraw) {
      provider.awareness.setLocalStateField("cursor", { x, y });
    }

    const active = activeStrokeRef.current;
    if (!active) return;
    active.points.push(x, y);
    redraw(active);

    const now = Date.now();
    if (now - lastLivePushRef.current >= LIVE_STROKE_THROTTLE_MS) {
      pushActiveToYjs();
    }
  }, [pointerToNorm, redraw, provider, canDraw, pushActiveToYjs]);

  const finalizeStroke = useCallback(() => {
    const active = activeStrokeRef.current;
    activeStrokeRef.current = null;

    const yActive = yActiveStrokesRef.current;
    if (yActive && actorId) yActive.delete(actorId);

    if (!active || active.points.length < 4) {
      redraw(null);
      return;
    }
    const yStrokes = yStrokesRef.current;
    if (!yStrokes) return;
    yStrokes.push([active]);
    if (yStrokes.length > MAX_STROKES) {
      yStrokes.delete(0, yStrokes.length - MAX_STROKES);
    }
  }, [redraw, actorId]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    finalizeStroke();
  }, [finalizeStroke]);

  const onPointerLeave = useCallback(() => {
    finalizeStroke();
    if (provider?.awareness) {
      provider.awareness.setLocalStateField("cursor", null);
    }
  }, [finalizeStroke, provider]);

  // ── Moderation controls (write to Y.Map) ────────────────────────────────

  const setAccessMode = useCallback((mode: ChalkboardAccessMode) => {
    _setAccessMode(mode);
    yConfigRef.current?.set("access_mode", mode);
  }, []);

  const setAllowedStudentIds = useCallback((ids: string[]) => {
    _setAllowedStudentIds(ids);
    yConfigRef.current?.set("allowed_student_ids", ids);
  }, []);

  const clearBoard = useCallback(() => {
    const yStrokes = yStrokesRef.current;
    if (!yStrokes) return;
    if (yStrokes.length > 0) yStrokes.delete(0, yStrokes.length);
  }, []);

  return {
    canvasRef,
    isConnected,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    canDraw,
    tool,
    setTool,
    color,
    setColor,
    size,
    setSize,
    accessMode,
    setAccessMode,
    allowedStudentIds,
    setAllowedStudentIds,
    clearBoard,
    strokes,
    remoteCursors,
    resizeCanvas,
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
