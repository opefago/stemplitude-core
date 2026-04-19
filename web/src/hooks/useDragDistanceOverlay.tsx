import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DragDistanceInfo {
  objectId: string;
  startX: number;
  startZ: number;
  currentX: number;
  currentZ: number;
  fadeOpacity: number;
  phase: "dragging" | "idle" | "editing" | "fading";
}

interface DragDistanceInfoWithCallbacks extends DragDistanceInfo {
  onStartEditing?: () => void;
  onStopEditing?: () => void;
}

interface DragDistanceOverlayProps {
  info: DragDistanceInfoWithCallbacks;
  onApplyDelta: (objectId: string, dx: number, dz: number) => void;
}

/* ------------------------------------------------------------------ */
/*  Isolated overlay scene – keeps lines out of the main scene so      */
/*  ContactShadows / SSAO / EffectComposer never see them.             */
/* ------------------------------------------------------------------ */

const overlayScene = new THREE.Scene();
let overlayObjectCount = 0;

export function OverlayRenderPass() {
  const { gl, camera } = useThree();

  useFrame(() => {
    gl.autoClear = true;
    if (overlayObjectCount <= 0) return;

    gl.autoClear = false;
    gl.render(overlayScene, camera);
    gl.autoClear = true;
  }, 2);

  return null;
}

/* ------------------------------------------------------------------ */
/*  DragDistanceOverlay – imperative Three.js lines + editable labels  */
/* ------------------------------------------------------------------ */

function DragDistanceOverlay({ info, onApplyDelta }: DragDistanceOverlayProps) {
  const { startX, startZ, currentX, currentZ, fadeOpacity } = info;
  const dx = currentX - startX;
  const dz = currentZ - startZ;
  const absDx = Math.abs(dx);
  const absDz = Math.abs(dz);

  const [editingX, setEditingX] = useState(false);
  const [editingZ, setEditingZ] = useState(false);
  const xInputRef = useRef<HTMLInputElement>(null);
  const zInputRef = useRef<HTMLInputElement>(null);

  const containerRef = useRef<THREE.Group | null>(null);
  const linesRef = useRef<{
    xLine: THREE.LineSegments | null;
    xTicks: THREE.LineSegments | null;
    zLine: THREE.LineSegments | null;
    zTicks: THREE.LineSegments | null;
    material: THREE.LineBasicMaterial | null;
    tickMaterial: THREE.LineBasicMaterial | null;
  }>({ xLine: null, xTicks: null, zLine: null, zTicks: null, material: null, tickMaterial: null });

  const Y = 0.6;

  useEffect(() => {
    const container = new THREE.Group();
    containerRef.current = container;
    overlayScene.add(container);
    overlayObjectCount++;

    return () => {
      overlayObjectCount--;
      const refs = linesRef.current;
      for (const key of ["xLine", "xTicks", "zLine", "zTicks"] as const) {
        const obj = refs[key];
        if (obj) {
          container.remove(obj);
          obj.geometry.dispose();
          refs[key] = null;
        }
      }
      refs.material?.dispose();
      refs.material = null;
      refs.tickMaterial?.dispose();
      refs.tickMaterial = null;
      overlayScene.remove(container);
      containerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const refs = linesRef.current;

    if (!refs.material) {
      refs.material = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false });
    }
    if (!refs.tickMaterial) {
      refs.tickMaterial = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false });
    }

    refs.material.opacity = fadeOpacity * 0.85;
    refs.tickMaterial.opacity = fadeOpacity * 0.7;

    const makeLine = (mat: THREE.LineBasicMaterial, vertCount: number): THREE.LineSegments => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(vertCount * 3), 3));
      const line = new THREE.LineSegments(geo, mat);
      line.frustumCulled = false;
      container.add(line);
      return line;
    };

    if (absDx >= 0.5) {
      if (!refs.xLine) refs.xLine = makeLine(refs.material, 2);
      const xArr = refs.xLine.geometry.getAttribute("position").array as Float32Array;
      xArr[0] = startX; xArr[1] = Y; xArr[2] = startZ;
      xArr[3] = currentX; xArr[4] = Y; xArr[5] = startZ;
      refs.xLine.geometry.getAttribute("position").needsUpdate = true;
      refs.xLine.visible = true;

      const xTickLen = Math.min(6, Math.max(3, absDz * 0.15));
      if (!refs.xTicks) refs.xTicks = makeLine(refs.tickMaterial, 4);
      const xtArr = refs.xTicks.geometry.getAttribute("position").array as Float32Array;
      xtArr[0] = startX; xtArr[1] = Y; xtArr[2] = startZ - xTickLen;
      xtArr[3] = startX; xtArr[4] = Y; xtArr[5] = startZ + xTickLen;
      xtArr[6] = currentX; xtArr[7] = Y; xtArr[8] = startZ - xTickLen;
      xtArr[9] = currentX; xtArr[10] = Y; xtArr[11] = startZ + xTickLen;
      refs.xTicks.geometry.getAttribute("position").needsUpdate = true;
      refs.xTicks.visible = true;
    } else {
      if (refs.xLine) refs.xLine.visible = false;
      if (refs.xTicks) refs.xTicks.visible = false;
    }

    if (absDz >= 0.5) {
      if (!refs.zLine) refs.zLine = makeLine(refs.material, 2);
      const zArr = refs.zLine.geometry.getAttribute("position").array as Float32Array;
      zArr[0] = currentX; zArr[1] = Y; zArr[2] = startZ;
      zArr[3] = currentX; zArr[4] = Y; zArr[5] = currentZ;
      refs.zLine.geometry.getAttribute("position").needsUpdate = true;
      refs.zLine.visible = true;

      const zTickLen = Math.min(6, Math.max(3, absDx * 0.15));
      if (!refs.zTicks) refs.zTicks = makeLine(refs.tickMaterial, 4);
      const ztArr = refs.zTicks.geometry.getAttribute("position").array as Float32Array;
      ztArr[0] = currentX - zTickLen; ztArr[1] = Y; ztArr[2] = startZ;
      ztArr[3] = currentX + zTickLen; ztArr[4] = Y; ztArr[5] = startZ;
      ztArr[6] = currentX - zTickLen; ztArr[7] = Y; ztArr[8] = currentZ;
      ztArr[9] = currentX + zTickLen; ztArr[10] = Y; ztArr[11] = currentZ;
      refs.zTicks.geometry.getAttribute("position").needsUpdate = true;
      refs.zTicks.visible = true;
    } else {
      if (refs.zLine) refs.zLine.visible = false;
      if (refs.zTicks) refs.zTicks.visible = false;
    }
  });

  const onStartEditing = info.onStartEditing;
  const onStopEditing = info.onStopEditing;

  const handleXSubmit = useCallback(() => {
    const parsed = parseFloat(xInputRef.current?.value ?? "");
    if (Number.isFinite(parsed)) {
      const targetDx = (dx >= 0 ? 1 : -1) * parsed;
      const delta = targetDx - dx;
      onApplyDelta(info.objectId, delta, 0);
    }
    setEditingX(false);
    onStopEditing?.();
  }, [dx, info.objectId, onApplyDelta, onStopEditing]);

  const handleZSubmit = useCallback(() => {
    const parsed = parseFloat(zInputRef.current?.value ?? "");
    if (Number.isFinite(parsed)) {
      const targetDz = (dz >= 0 ? 1 : -1) * parsed;
      const delta = targetDz - dz;
      onApplyDelta(info.objectId, 0, delta);
    }
    setEditingZ(false);
    onStopEditing?.();
  }, [dz, info.objectId, onApplyDelta, onStopEditing]);

  const handleXCancel = useCallback(() => {
    setEditingX(false);
    onStopEditing?.();
  }, [onStopEditing]);

  const handleZCancel = useCallback(() => {
    setEditingZ(false);
    onStopEditing?.();
  }, [onStopEditing]);

  const interactive = info.phase !== "fading";

  const labelStyle: React.CSSProperties = {
    background: "rgba(30, 41, 59, 0.92)",
    color: "#fff",
    padding: "2px 8px",
    borderRadius: 5,
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    opacity: fadeOpacity,
    transition: "opacity 0.3s",
    cursor: interactive ? "pointer" : "default",
    userSelect: "none",
  };

  const inputStyle: React.CSSProperties = {
    width: 58,
    background: "rgba(30, 41, 59, 0.96)",
    color: "#fff",
    border: "1px solid #60a5fa",
    borderRadius: 4,
    padding: "2px 6px",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "center",
    outline: "none",
  };

  if (absDx < 0.5 && absDz < 0.5) return null;

  return (
    <group>
      {absDx >= 0.5 && (
        <Html
          center
          position={[(startX + currentX) / 2, 0.8, startZ]}
          style={{ pointerEvents: interactive ? "auto" : "none" }}
        >
          {editingX ? (
            <input
              ref={xInputRef}
              style={inputStyle}
              autoFocus
              defaultValue={absDx.toFixed(1)}
              onBlur={handleXSubmit}
              onKeyDown={(e) => { if (e.key === "Enter") handleXSubmit(); if (e.key === "Escape") handleXCancel(); }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              style={labelStyle}
              onClick={(e) => {
                e.stopPropagation();
                if (!interactive) return;
                onStartEditing?.();
                setEditingX(true);
              }}
            >
              {absDx.toFixed(2)}
            </div>
          )}
        </Html>
      )}
      {absDz >= 0.5 && (
        <Html
          center
          position={[currentX, 0.8, (startZ + currentZ) / 2]}
          style={{ pointerEvents: interactive ? "auto" : "none" }}
        >
          {editingZ ? (
            <input
              ref={zInputRef}
              style={inputStyle}
              autoFocus
              defaultValue={absDz.toFixed(1)}
              onBlur={handleZSubmit}
              onKeyDown={(e) => { if (e.key === "Enter") handleZSubmit(); if (e.key === "Escape") handleZCancel(); }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              style={labelStyle}
              onClick={(e) => {
                e.stopPropagation();
                if (!interactive) return;
                onStartEditing?.();
                setEditingZ(true);
              }}
            >
              {absDz.toFixed(2)}
            </div>
          )}
        </Html>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  useDragDistanceOverlay – reusable hook                             */
/* ------------------------------------------------------------------ */

export interface UseDragDistanceOverlayOptions {
  onApplyDelta: (objectId: string, dx: number, dz: number) => void;
}

export function useDragDistanceOverlay({ onApplyDelta }: UseDragDistanceOverlayOptions) {
  const [distanceInfo, setDistanceInfo] = useState<DragDistanceInfo | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onApplyDeltaRef = useRef(onApplyDelta);
  onApplyDeltaRef.current = onApplyDelta;

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    };
  }, []);

  const beginFadeAnimation = useCallback(() => {
    setDistanceInfo((prev) => prev && prev.phase !== "editing" ? { ...prev, phase: "fading" } : prev);
    let opacity = 1;
    fadeIntervalRef.current = setInterval(() => {
      opacity -= 0.05;
      if (opacity <= 0) {
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
        setDistanceInfo(null);
      } else {
        setDistanceInfo((prev) => prev ? { ...prev, fadeOpacity: opacity } : null);
      }
    }, 30);
  }, []);

  const scheduleFade = useCallback(() => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    if (fadeIntervalRef.current) { clearInterval(fadeIntervalRef.current); fadeIntervalRef.current = null; }
    setDistanceInfo((prev) => prev ? { ...prev, phase: "idle", fadeOpacity: 1 } : null);
    fadeTimerRef.current = setTimeout(() => {
      fadeTimerRef.current = null;
      beginFadeAnimation();
    }, 3000);
  }, [beginFadeAnimation]);

  const handleStartEditing = useCallback(() => {
    if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = null; }
    if (fadeIntervalRef.current) { clearInterval(fadeIntervalRef.current); fadeIntervalRef.current = null; }
    setDistanceInfo((prev) => prev ? { ...prev, phase: "editing", fadeOpacity: 1 } : null);
  }, []);

  const handleStopEditing = useCallback(() => {
    scheduleFade();
  }, [scheduleFade]);

  const startTracking = useCallback((objectId: string, startX: number, startZ: number) => {
    if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = null; }
    if (fadeIntervalRef.current) { clearInterval(fadeIntervalRef.current); fadeIntervalRef.current = null; }
    setDistanceInfo({
      objectId,
      startX,
      startZ,
      currentX: startX,
      currentZ: startZ,
      fadeOpacity: 1,
      phase: "dragging",
    });
  }, []);

  const updateTracking = useCallback((objectId: string, currentX: number, currentZ: number) => {
    setDistanceInfo((prev) =>
      prev && prev.objectId === objectId
        ? { ...prev, currentX, currentZ }
        : prev,
    );
  }, []);

  const wrappedApplyDelta = useCallback((objectId: string, dx: number, dz: number) => {
    onApplyDeltaRef.current(objectId, dx, dz);
    setDistanceInfo((prev) =>
      prev && prev.objectId === objectId
        ? { ...prev, currentX: prev.currentX + dx, currentZ: prev.currentZ + dz }
        : prev,
    );
  }, []);

  const stopTracking = useCallback(() => {
    scheduleFade();
  }, [scheduleFade]);

  const overlayElement = distanceInfo ? (
    <DragDistanceOverlay
      info={{ ...distanceInfo, onStartEditing: handleStartEditing, onStopEditing: handleStopEditing }}
      onApplyDelta={wrappedApplyDelta}
    />
  ) : null;

  return {
    distanceInfo,
    startTracking,
    updateTracking,
    stopTracking,
    overlayElement,
  };
}
