/**
 * DesignLabObserver — live read-only view of the design-maker scene.
 *
 * • Syncs objects from Yjs into the shared Zustand store.
 * • Blocks all drag / selection interactions via sceneReadOnly.
 * • Optional "Follow camera" mode: applies the student's camera state in real-time.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — JS store, no type declarations
import { useDesignStore, sceneCamera, sceneOrbitControls, sceneReadOnly } from "../design-maker/store";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — JSX component, no type declarations
import Scene from "../design-maker/Scene";

interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
}

interface Props {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
}

export function DesignLabObserver({ ydoc, provider: _provider }: Props) {
  const [followCamera, setFollowCamera] = useState(false);
  const followRef = useRef(false);

  // Keep ref in sync so the Yjs observer closure always reads the latest value.
  useEffect(() => {
    followRef.current = followCamera;
  }, [followCamera]);

  // Enforce read-only: block drag/select in Scene while this observer is mounted.
  useEffect(() => {
    sceneReadOnly.current = true;
    return () => {
      sceneReadOnly.current = false;
    };
  }, []);

  useEffect(() => {
    const yScene = ydoc.getMap("scene");

    const applyRemote = () => {
      const objects = yScene.get("objects") as unknown[] | undefined;
      if (Array.isArray(objects)) {
        useDesignStore.setState({ objects, selectedIds: [] });
      }

      // Apply student camera when follow mode is on.
      if (followRef.current) {
        const cam = yScene.get("camera") as CameraState | undefined;
        if (cam?.position && cam?.target) {
          const camera = sceneCamera.current as THREE.Camera | null;
          const orbit = sceneOrbitControls.current as { target: THREE.Vector3; update: () => void } | null;
          if (camera) {
            camera.position.set(...cam.position);
          }
          if (orbit) {
            orbit.target.set(...cam.target);
            orbit.update();
          }
        }
      }
    };

    yScene.observe(applyRemote);
    applyRemote();

    return () => {
      yScene.unobserve(applyRemote);
      useDesignStore.setState({ objects: [], selectedIds: [] });
    };
  }, [ydoc]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Camera follow toggle */}
      <button
        onClick={() => setFollowCamera((v) => !v)}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 10,
          padding: "6px 12px",
          borderRadius: 8,
          border: followCamera ? "2px solid #3b82f6" : "2px solid #4b5563",
          background: followCamera ? "#1d4ed8" : "#1f2937",
          color: "#f9fafb",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          userSelect: "none",
        }}
        title="Mirror the student's camera angle and zoom"
      >
        <span style={{ fontSize: 14 }}>{followCamera ? "📷" : "🔭"}</span>
        {followCamera ? "Following student view" : "Follow student camera"}
      </button>

      <Suspense
        fallback={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
              color: "#9ca3af",
              fontSize: 14,
            }}
          >
            Loading scene…
          </div>
        }
      >
        <Scene />
      </Suspense>
    </div>
  );
}
