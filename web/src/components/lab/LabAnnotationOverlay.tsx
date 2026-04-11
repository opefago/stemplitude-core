/**
 * LabAnnotationOverlay — transparent layer for instructor annotations and cursors.
 *
 * Wraps any lab's content area. In instructor mode, provides a drawing surface
 * and toolbar. In student mode, renders the instructor's annotations and cursor.
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  normalizationTargetSelector?: string;
  children: ReactNode;
}

function StrokePath({
  stroke,
  fading,
  targetRect,
}: {
  stroke: AnnotationStroke;
  fading: boolean;
  targetRect: { left: number; top: number; width: number; height: number };
}) {
  if (stroke.points.length < 4) return null;
  let d = `M${targetRect.left + stroke.points[0] * targetRect.width},${targetRect.top + stroke.points[1] * targetRect.height}`;
  for (let i = 2; i < stroke.points.length; i += 2) {
    d += ` L${targetRect.left + stroke.points[i] * targetRect.width},${targetRect.top + stroke.points[i + 1] * targetRect.height}`;
  }
  return (
    <path
      d={d}
      className={`lab-annotation-overlay__stroke${fading ? " lab-annotation-overlay__stroke--fading" : ""}`}
      stroke={stroke.color}
      strokeWidth={stroke.size}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function CursorDot({
  peer,
  targetRect,
}: {
  peer: RemoteAnnotationPeer;
  targetRect: { left: number; top: number; width: number; height: number };
}) {
  if (!peer.cursor) return null;
  return (
    <div
      className="lab-annotation-cursor"
      style={{
        position: "fixed",
        left: targetRect.left + peer.cursor.x * targetRect.width,
        top: targetRect.top + peer.cursor.y * targetRect.height,
      }}
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
  normalizationTargetSelector,
  children,
}: Props) {
  const annotation = useLabAnnotation({ provider, actorId, actorName, isInstructor, enabled });
  const containerRef = useRef<HTMLDivElement>(null);

  const [drawingActive, setDrawingActive] = useState(false);
  const [penColor, setPenColor] = useState(ANNOTATION_COLORS[0]);
  const [penSize] = useState(DEFAULT_SIZE);
  const isDrawingRef = useRef(false);

  const getOverlayBounds = useCallback(() => {
    const root = containerRef.current;
    const selector = normalizationTargetSelector?.trim();
    const selectorTarget =
      selector && selector.length > 0
        ? (document.querySelector(selector) as HTMLElement | null)
        : null;
    const selectorCanvasTarget =
      selectorTarget?.querySelector("canvas") instanceof HTMLCanvasElement
        ? (selectorTarget.querySelector("canvas") as HTMLCanvasElement)
        : null;
    const rootCanvasTarget =
      root?.querySelector("canvas") instanceof HTMLCanvasElement
        ? (root.querySelector("canvas") as HTMLCanvasElement)
        : null;
    const target =
      selectorCanvasTarget ??
      selectorTarget ??
      rootCanvasTarget ??
      root;
    const rect = target?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) return rect;
    return {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }, [normalizationTargetSelector]);

  const getNorm = useCallback((e: React.PointerEvent) => {
    const bounds = getOverlayBounds();
    const w = bounds.width;
    const h = bounds.height;
    return {
      x: w > 0 ? Math.max(0, Math.min(1, (e.clientX - bounds.left) / w)) : 0,
      y: h > 0 ? Math.max(0, Math.min(1, (e.clientY - bounds.top) / h)) : 0,
    };
  }, [getOverlayBounds]);

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
  if (isInstructor && annotation.localAnnotations.length > 0) {
    allAnnotations.push(...annotation.localAnnotations);
  }

  const instructorPeers = isInstructor ? [] : annotation.peers.filter((p) => p.role === "instructor");
  const allCursorPeers = annotation.peers;

  const hasRealChildren = children != null && children !== false && (
    typeof children !== "object" || !("type" in (children as any)) || (children as any).type !== "span"
  );

  const wrapperStyle: React.CSSProperties = hasRealChildren
    ? { position: "relative", width: "100%", height: "100%" }
    : { position: "fixed", inset: 0, pointerEvents: "none", zIndex: 10050 };
  const overlayBounds = getOverlayBounds();

  const overlayContent = (
    <div ref={containerRef} style={wrapperStyle}>
      {hasRealChildren && children}

      {/* Cursors layer */}
      {enabled && allCursorPeers.map((peer) => (
        <CursorDot key={peer.clientId} peer={peer} targetRect={overlayBounds} />
      ))}

      {/* Annotation strokes layer (visible to students) */}
      {enabled && allAnnotations.length > 0 && (
        <svg
          className="lab-annotation-overlay__svg"
          viewBox={`0 0 ${Math.max(window.innerWidth, 1)} ${Math.max(window.innerHeight, 1)}`}
          preserveAspectRatio="none"
          style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 10050 }}
        >
          {allAnnotations.map((stroke) => (
            <StrokePath
              key={stroke.id}
              stroke={stroke}
              fading
              targetRect={overlayBounds}
            />
          ))}
        </svg>
      )}

      {/* Drawing capture surface (instructor only, when drawing tool active) */}
      {isInstructor && enabled && drawingActive && (
        <div
          className="lab-annotation-overlay lab-annotation-overlay--drawing"
          style={{ position: "absolute", inset: 0, zIndex: 10050 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
        />
      )}

      {/* Instructor cursor on student side */}
      {!isInstructor && enabled && instructorPeers.map((peer) => (
        <CursorDot key={`inst-${peer.clientId}`} peer={peer} targetRect={overlayBounds} />
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

  if (!hasRealChildren) {
    return createPortal(overlayContent, document.body);
  }
  return overlayContent;
}
