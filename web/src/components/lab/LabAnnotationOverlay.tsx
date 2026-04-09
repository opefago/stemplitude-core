/**
 * LabAnnotationOverlay — transparent layer for instructor annotations and cursors.
 *
 * Wraps any lab's content area. In instructor mode, provides a drawing surface
 * and toolbar. In student mode, renders the instructor's annotations and cursor.
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import type { WebsocketProvider } from "y-websocket";
import {
  useLabAnnotation,
  type AnnotationStroke,
  type RemoteAnnotationPeer,
} from "../../hooks/useLabAnnotation";
import "./lab-annotation.css";

const ANNOTATION_COLORS = ["#f87171", "#facc15", "#4ade80", "#60a5fa", "#e879f9", "#ffffff"];
const DEFAULT_SIZE = 4;

interface Props {
  provider: WebsocketProvider | null;
  actorId: string;
  actorName?: string;
  isInstructor: boolean;
  enabled: boolean;
  children: ReactNode;
}

function pointsToSvgPath(points: number[], w: number, h: number): string {
  if (points.length < 4) return "";
  let d = `M${points[0] * w},${points[1] * h}`;
  for (let i = 2; i < points.length; i += 2) {
    d += ` L${points[i] * w},${points[i + 1] * h}`;
  }
  return d;
}

function StrokePath({ stroke, w, h, fading }: { stroke: AnnotationStroke; w: number; h: number; fading: boolean }) {
  const d = pointsToSvgPath(stroke.points, w, h);
  if (!d) return null;
  return (
    <path
      d={d}
      className={`lab-annotation-overlay__stroke${fading ? " lab-annotation-overlay__stroke--fading" : ""}`}
      stroke={stroke.color}
      strokeWidth={stroke.size}
    />
  );
}

function CursorDot({ peer }: { peer: RemoteAnnotationPeer }) {
  if (!peer.cursor) return null;
  return (
    <div
      className="lab-annotation-cursor"
      style={{ left: `${peer.cursor.x * 100}%`, top: `${peer.cursor.y * 100}%` }}
    >
      <div className="lab-annotation-cursor__dot" style={{ borderColor: peer.color, background: `${peer.color}44` }} />
      <span className="lab-annotation-cursor__label" style={{ background: peer.color }}>
        {peer.name}
      </span>
    </div>
  );
}

export function LabAnnotationOverlay({
  provider,
  actorId,
  actorName,
  isInstructor,
  enabled,
  children,
}: Props) {
  const annotation = useLabAnnotation({ provider, actorId, actorName, isInstructor, enabled });
  const containerRef = useRef<HTMLDivElement>(null);

  const [drawingActive, setDrawingActive] = useState(false);
  const [penColor, setPenColor] = useState(ANNOTATION_COLORS[0]);
  const [penSize] = useState(DEFAULT_SIZE);
  const isDrawingRef = useRef(false);

  const getNorm = useCallback((e: React.PointerEvent) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0,
      y: rect.height > 0 ? Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) : 0,
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!drawingActive || !isInstructor) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      isDrawingRef.current = true;
      const { x, y } = getNorm(e);
      annotation.startAnnotation(x, y, penColor, penSize);
      annotation.setCursor(x, y);
    },
    [drawingActive, isInstructor, getNorm, annotation, penColor, penSize],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isInstructor) return;
      const { x, y } = getNorm(e);
      annotation.setCursor(x, y);
      if (isDrawingRef.current) {
        annotation.addAnnotationPoint(x, y);
      }
    },
    [isInstructor, getNorm, annotation],
  );

  const onPointerUp = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    annotation.finishAnnotation();
  }, [annotation]);

  const onPointerLeave = useCallback(() => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      annotation.finishAnnotation();
    }
    annotation.clearCursor();
  }, [annotation]);

  const allAnnotations: AnnotationStroke[] = [];
  for (const peer of annotation.peers) {
    if (peer.role === "instructor" && peer.annotations.length > 0) {
      allAnnotations.push(...peer.annotations);
    }
  }
  if (isInstructor && annotation.activeAnnotation) {
    allAnnotations.push(annotation.activeAnnotation);
  }

  const instructorPeers = isInstructor ? [] : annotation.peers.filter((p) => p.role === "instructor");
  const allCursorPeers = annotation.peers;

  const hasRealChildren = children != null && children !== false && (
    typeof children !== "object" || !("type" in (children as any)) || (children as any).type !== "span"
  );

  const wrapperStyle: React.CSSProperties = hasRealChildren
    ? { position: "relative", width: "100%", height: "100%" }
    : { position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1050 };

  return (
    <div ref={containerRef} style={wrapperStyle}>
      {hasRealChildren && children}

      {/* Cursors layer */}
      {enabled && allCursorPeers.map((peer) => (
        <CursorDot key={peer.clientId} peer={peer} />
      ))}

      {/* Annotation strokes layer (visible to students) */}
      {enabled && allAnnotations.length > 0 && (
        <svg className="lab-annotation-overlay__svg" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {allAnnotations.map((stroke) => (
            <StrokePath
              key={stroke.id}
              stroke={stroke}
              w={containerRef.current?.clientWidth ?? 1}
              h={containerRef.current?.clientHeight ?? 1}
              fading
            />
          ))}
        </svg>
      )}

      {/* Drawing capture surface (instructor only, when drawing tool active) */}
      {isInstructor && enabled && drawingActive && (
        <div
          className="lab-annotation-overlay lab-annotation-overlay--drawing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
        />
      )}

      {/* Instructor cursor on student side */}
      {!isInstructor && enabled && instructorPeers.map((peer) => (
        <CursorDot key={`inst-${peer.clientId}`} peer={peer} />
      ))}

      {/* Instructor toolbar */}
      {isInstructor && enabled && (
        <div className="lab-annotation-toolbar">
          <button
            type="button"
            className={`lab-annotation-toolbar__btn${drawingActive ? " lab-annotation-toolbar__btn--active" : ""}`}
            onClick={() => setDrawingActive((v) => !v)}
            title={drawingActive ? "Stop annotating" : "Annotate"}
          >
            {drawingActive ? <X size={16} /> : <Pencil size={16} />}
          </button>
          {drawingActive && (
            <>
              <div className="lab-annotation-toolbar__sep" />
              {ANNOTATION_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`lab-annotation-toolbar__color${penColor === c ? " lab-annotation-toolbar__color--active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setPenColor(c)}
                  title={c}
                />
              ))}
              <div className="lab-annotation-toolbar__sep" />
              <button
                type="button"
                className="lab-annotation-toolbar__btn"
                onClick={annotation.clearAnnotations}
                title="Clear annotations"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
