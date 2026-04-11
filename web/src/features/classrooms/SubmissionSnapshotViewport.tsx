import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, RotateCcw } from "lucide-react";

type Props = {
  imageSrc: string | null | undefined;
  label?: string;
  className?: string;
  emptyHint?: string;
};

/**
 * Small clipped viewport over a lab snapshot: wheel zoom (cursor-anchored) and drag to pan.
 */
export function SubmissionSnapshotViewport({
  imageSrc,
  label,
  className = "",
  emptyHint = "No snapshot",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ px: number; py: number; tx: number; ty: number } | null>(null);
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 });
  viewRef.current = { scale, tx, ty };

  const resetView = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !imageSrc) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const { scale: s, tx: ox, ty: oy } = viewRef.current;
      const delta = -e.deltaY * 0.0015;
      const nextScale = Math.min(4, Math.max(0.5, s + delta));
      if (nextScale === s) return;
      const worldX = (cx - ox) / s;
      const worldY = (cy - oy) / s;
      setScale(nextScale);
      setTx(cx - worldX * nextScale);
      setTy(cy - worldY * nextScale);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [imageSrc]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!imageSrc) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { px: e.clientX, py: e.clientY, tx, ty };
    },
    [imageSrc, tx, ty],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setTx(d.tx + (e.clientX - d.px));
    setTy(d.ty + (e.clientY - d.py));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
  }, []);

  if (!imageSrc) {
    return (
      <div
        className={`submission-snapshot submission-snapshot--empty ${className}`.trim()}
        role="img"
        aria-label={label || emptyHint}
      >
        <span>{emptyHint}</span>
      </div>
    );
  }

  return (
    <div
      className={`submission-snapshot ${className}`.trim()}
      ref={wrapRef}
      role="img"
      aria-label={label || "Lab snapshot; scroll to zoom, drag to pan"}
    >
      <div
        className="submission-snapshot__transform"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        <img src={imageSrc} alt="" draggable={false} className="submission-snapshot__img" />
      </div>
      <div className="submission-snapshot__toolbar">
        <button
          type="button"
          className="submission-snapshot__icon-btn"
          onClick={resetView}
          title="Reset zoom and pan"
          aria-label="Reset zoom and pan"
        >
          <RotateCcw size={14} aria-hidden />
        </button>
        <span className="submission-snapshot__hint" title="Scroll to zoom, drag to move">
          <Maximize2 size={12} aria-hidden />
        </span>
      </div>
    </div>
  );
}
