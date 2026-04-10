/**
 * CircuitLabObserver — renders a read-only view of a student's circuit
 * synced via Yjs. The `ydoc.getMap("circuit_scene")` holds the serialized
 * snapshot that the student's CircuitLabContainer pushes every ~2s.
 */
import { useEffect, useRef, useState } from "react";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { Application } from "pixi.js";
import { GameManager } from "../mcu/lib/shared/GameManager";
import {
  CircuitScene,
  type CircuitSceneSnapshot,
} from "../mcu/lib/circuit/CircuitScene";

interface Props {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
}

export function CircuitLabObserver({ ydoc, provider: _provider }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<CircuitScene | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setConnected(_provider?.wsconnected ?? false);
    const onChange = ({ status }: { status: string }) => setConnected(status === "connected");
    _provider?.on("status", onChange);
    return () => { _provider?.off("status", onChange); };
  }, [_provider]);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    const initApp = async () => {
      const app = new Application();
      await app.init({
        width: containerRef.current!.clientWidth || 800,
        height: containerRef.current!.clientHeight || 600,
        backgroundColor: 0x1e1e2e,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (destroyed) { app.destroy(true); return; }

      appRef.current = app;
      containerRef.current!.appendChild(app.canvas);

      const gm = GameManager.create(app);
      const scene = new CircuitScene();
      scene.readOnly = true;
      sceneRef.current = scene;
      setSceneReady(true);
      gm.registerScene("circuit", scene);
      gm.switchToScene("circuit");
    };

    void initApp();

    return () => {
      destroyed = true;
      try { sceneRef.current?.destroy(); } catch { /* already destroyed */ }
      try { appRef.current?.destroy(true); } catch { /* already destroyed */ }
      sceneRef.current = null;
      appRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ydoc || !sceneRef.current) return;
    const yScene = ydoc.getMap("circuit_scene");

    const applySnapshot = () => {
      const raw = yScene.get("snapshot_json");
      if (typeof raw !== "string" || !raw) return;
      try {
        const snap = JSON.parse(raw) as CircuitSceneSnapshot;
        sceneRef.current?.importSnapshot(snap);
      } catch { /* ignore */ }
    };
    const applySimulationState = () => {
      const running = yScene.get("simulation_running");
      if (typeof running !== "boolean") return;
      (sceneRef.current as any)?.setSimulationRunning?.(running);
    };

    const onSceneChange = (event: { keysChanged?: Set<string> }) => {
      const changed = event.keysChanged;
      if (!changed || changed.has("snapshot_json")) {
        applySnapshot();
      }
      if (!changed || changed.has("simulation_running")) {
        applySimulationState();
      }
    };
    yScene.observe(onSceneChange);
    applySnapshot();
    applySimulationState();

    return () => { yScene.unobserve(onSceneChange); };
  }, [ydoc, sceneReady]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        ref={containerRef}
        id="observer-pixi-container"
        style={{ width: "100%", height: "100%", background: "#1e1e2e" }}
      />
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 8,
          background: "rgba(0,0,0,0.5)",
          color: "#9ca3af",
          fontSize: 12,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: connected ? "#4ade80" : "#f87171",
          }}
        />
        {connected ? "Live sync" : "Reconnecting"}
      </div>
    </div>
  );
}
