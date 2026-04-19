import { useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { toonGradientMap } from "../../../lib/three/cartoonStyle";
import type { SimulatorSceneObject } from "../../../labs/robotics/simulator/types";

interface CustomObjectConfig {
  name: string;
  shape: "box" | "cylinder" | "sphere";
  width: number;
  height: number;
  depth: number;
  color: string;
  physicsBody: "static" | "dynamic";
}

interface CustomObjectCreatorProps {
  open: boolean;
  onClose: () => void;
  onCreateObject: (object: SimulatorSceneObject) => void;
}

const DEFAULT_CONFIG: CustomObjectConfig = {
  name: "Custom Object",
  shape: "box",
  width: 20,
  height: 20,
  depth: 20,
  color: "#3b82f6",
  physicsBody: "static",
};

function PreviewScene({ config }: { config: CustomObjectConfig }) {
  const { shape, width, height, depth, color } = config;
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 2]} intensity={0.8} />
      <mesh castShadow>
        {shape === "sphere" ? (
          <sphereGeometry args={[Math.min(width, height, depth) / 2, 24, 24]} />
        ) : shape === "cylinder" ? (
          <cylinderGeometry args={[Math.min(width, depth) / 2, Math.min(width, depth) / 2, height, 24]} />
        ) : (
          <boxGeometry args={[width, height, depth]} />
        )}
        <meshToonMaterial color={color} gradientMap={toonGradientMap} />
      </mesh>
      <gridHelper args={[80, 8]} position={[0, -height / 2, 0]} />
      <OrbitControls enablePan={false} />
    </>
  );
}

export function CustomObjectCreator({ open, onClose, onCreateObject }: CustomObjectCreatorProps) {
  const [config, setConfig] = useState<CustomObjectConfig>({ ...DEFAULT_CONFIG });

  const handleCreate = useCallback(() => {
    const object: SimulatorSceneObject = {
      id: `custom_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      type: "obstacle",
      position: { x: 0, y: 0, z: 0 },
      size_cm: { x: config.width, y: config.height, z: config.depth },
      metadata: {
        color: config.color,
        physics_body: config.physicsBody,
        render_shape: config.shape === "sphere" ? "sphere" : config.shape === "cylinder" ? "cylinder" : "default",
        custom_name: config.name,
        is_custom: true,
      },
    };
    onCreateObject(object);
    onClose();
    setConfig({ ...DEFAULT_CONFIG });
  }, [config, onClose, onCreateObject]);

  if (!open) return null;

  return (
    <div className="robotics-preset-dialog" onClick={onClose}>
      <div
        className="robotics-custom-object-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, width: "100%", background: "#1a2332", borderRadius: 12, border: "1px solid #30363d", padding: 20 }}
      >
        <div className="robotics-preset-dialog-header" style={{ marginBottom: 16 }}>
          <h4 style={{ margin: 0, color: "#e6eefb" }}>Create Custom Object</h4>
          <button className="robotics-lab-btn" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ height: 200, borderRadius: 8, overflow: "hidden", border: "1px solid #30363d", marginBottom: 12 }}>
              <Canvas camera={{ position: [40, 30, 40], fov: 50 }} dpr={[1, 1.5]}>
                <color attach="background" args={["#0d1117"]} />
                <PreviewScene config={config} />
              </Canvas>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label className="robotics-form-field">
              <span>Name</span>
              <input
                type="text"
                value={config.name}
                onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))}
                maxLength={80}
              />
            </label>

            <label className="robotics-form-field">
              <span>Shape</span>
              <select
                value={config.shape}
                onChange={(e) => setConfig((c) => ({ ...c, shape: e.target.value as CustomObjectConfig["shape"] }))}
              >
                <option value="box">Box</option>
                <option value="cylinder">Cylinder</option>
                <option value="sphere">Sphere</option>
              </select>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              <label className="robotics-form-field">
                <span>W (cm)</span>
                <input type="number" min={2} max={200} value={config.width} onChange={(e) => setConfig((c) => ({ ...c, width: Math.max(2, Number(e.target.value) || 2) }))} />
              </label>
              <label className="robotics-form-field">
                <span>H (cm)</span>
                <input type="number" min={2} max={200} value={config.height} onChange={(e) => setConfig((c) => ({ ...c, height: Math.max(2, Number(e.target.value) || 2) }))} />
              </label>
              <label className="robotics-form-field">
                <span>D (cm)</span>
                <input type="number" min={2} max={200} value={config.depth} onChange={(e) => setConfig((c) => ({ ...c, depth: Math.max(2, Number(e.target.value) || 2) }))} />
              </label>
            </div>

            <label className="robotics-form-field">
              <span>Color</span>
              <input type="color" value={config.color} onChange={(e) => setConfig((c) => ({ ...c, color: e.target.value }))} />
            </label>

            <label className="robotics-form-field">
              <span>Physics</span>
              <select
                value={config.physicsBody}
                onChange={(e) => setConfig((c) => ({ ...c, physicsBody: e.target.value as "static" | "dynamic" }))}
              >
                <option value="static">Static (fixed)</option>
                <option value="dynamic">Dynamic (pushable)</option>
              </select>
            </label>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="robotics-lab-btn" onClick={onClose}>Cancel</button>
          <button className="robotics-lab-btn" onClick={handleCreate} style={{ background: "#3b82f6", color: "white" }}>
            Create Object
          </button>
        </div>
      </div>
    </div>
  );
}
