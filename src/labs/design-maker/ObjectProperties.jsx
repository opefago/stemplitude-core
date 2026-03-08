import React, { useState } from "react";
import { Trash2, Copy, Lock, Unlock, Link2, Unlink2 } from "lucide-react";
import { useDesignStore } from "./store";
import { FONT_MAP, FONT_LABELS } from "./Scene";
import CustomSelect from "./CustomSelect";

const COLOR_SWATCHES = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#64748b",
  "#ffffff",
  "#1a1a1a",
];

function NumberInput({ label, value, onChange, step = 1, min, max }) {
  return (
    <div className="dml-prop-field">
      <label>{label}</label>
      <input
        type="number"
        value={Number(value).toFixed(1)}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step={step}
        min={min}
        max={max}
      />
    </div>
  );
}

function GeometryProps({ obj, updateGeometry }) {
  const p = obj.geometry;
  switch (obj.type) {
    case "box":
    case "wall":
      return (
        <>
          <NumberInput
            label="Width"
            value={p.width}
            onChange={(v) => updateGeometry("width", v)}
          />
          <NumberInput
            label="Height"
            value={p.height}
            onChange={(v) => updateGeometry("height", v)}
          />
          <NumberInput
            label="Depth"
            value={p.depth}
            onChange={(v) => updateGeometry("depth", v)}
          />
          <div className="dml-prop-field">
            <label>Edges</label>
            <CustomSelect
              value={p.edgeStyle || "none"}
              options={[
                { value: "none", label: "Sharp" },
                { value: "fillet", label: "Fillet (Round)" },
                { value: "chamfer", label: "Chamfer (Flat)" },
              ]}
              onChange={(v) => updateGeometry("edgeStyle", v)}
            />
          </div>
          {(p.edgeStyle === "fillet" || p.edgeStyle === "chamfer") && (
            <NumberInput
              label="Edge Size"
              value={p.edgeRadius || 0}
              onChange={(v) => updateGeometry("edgeRadius", Math.max(0.5, v))}
              step={0.5}
            />
          )}
        </>
      );
    case "sphere":
    case "hemisphere":
      return (
        <NumberInput
          label="Radius"
          value={p.radius}
          onChange={(v) => updateGeometry("radius", Math.max(0.1, v))}
        />
      );
    case "cylinder":
      return (
        <>
          <NumberInput
            label="Top Radius"
            value={p.radiusTop}
            onChange={(v) => updateGeometry("radiusTop", v)}
          />
          <NumberInput
            label="Bottom Radius"
            value={p.radiusBottom}
            onChange={(v) => updateGeometry("radiusBottom", v)}
          />
          <NumberInput
            label="Height"
            value={p.height}
            onChange={(v) => updateGeometry("height", v)}
          />
          <div className="dml-prop-field">
            <label>Edges</label>
            <CustomSelect
              value={p.edgeStyle || "none"}
              options={[
                { value: "none", label: "Sharp" },
                { value: "fillet", label: "Fillet (Round)" },
                { value: "chamfer", label: "Chamfer (Flat)" },
              ]}
              onChange={(v) => updateGeometry("edgeStyle", v)}
            />
          </div>
          {(p.edgeStyle === "fillet" || p.edgeStyle === "chamfer") && (
            <NumberInput
              label="Edge Size"
              value={p.edgeRadius || 0}
              onChange={(v) => updateGeometry("edgeRadius", Math.max(0.5, v))}
              step={0.5}
            />
          )}
        </>
      );
    case "cone":
    case "capsule":
    case "pyramid":
    case "pentagonalPyramid":
    case "squarePyramid":
    case "paraboloid":
      return (
        <>
          <NumberInput
            label="Radius"
            value={p.radius}
            onChange={(v) => updateGeometry("radius", Math.max(0.1, v))}
          />
          <NumberInput
            label="Height"
            value={p.height}
            onChange={(v) => updateGeometry("height", Math.max(0.1, v))}
          />
        </>
      );
    case "triangularPrism":
    case "hexagonalPrism":
    case "pentagonalPrism":
      return (
        <>
          <NumberInput
            label="Radius"
            value={p.radius}
            onChange={(v) => updateGeometry("radius", Math.max(0.1, v))}
          />
          <NumberInput
            label="Height"
            value={p.height}
            onChange={(v) => updateGeometry("height", Math.max(0.1, v))}
          />
        </>
      );
    case "tetrahedron":
    case "dodecahedron":
    case "octahedron":
    case "icosahedron":
      return (
        <NumberInput
          label="Radius"
          value={p.radius}
          onChange={(v) => updateGeometry("radius", Math.max(0.1, v))}
        />
      );
    case "ellipsoid":
      return (
        <>
          <NumberInput
            label="Radius X"
            value={p.radiusX}
            onChange={(v) => updateGeometry("radiusX", Math.max(0.1, v))}
          />
          <NumberInput
            label="Radius Y"
            value={p.radiusY}
            onChange={(v) => updateGeometry("radiusY", Math.max(0.1, v))}
          />
          <NumberInput
            label="Radius Z"
            value={p.radiusZ}
            onChange={(v) => updateGeometry("radiusZ", Math.max(0.1, v))}
          />
        </>
      );
    case "ring":
      return (
        <>
          <NumberInput
            label="Outer Radius"
            value={p.outerRadius}
            onChange={(v) => updateGeometry("outerRadius", Math.max(p.innerRadius + 0.5, v))}
          />
          <NumberInput
            label="Inner Radius"
            value={p.innerRadius}
            onChange={(v) => updateGeometry("innerRadius", Math.max(0.1, Math.min(v, p.outerRadius - 0.5)))}
          />
          <NumberInput
            label="Height"
            value={p.height}
            onChange={(v) => updateGeometry("height", Math.max(0.1, v))}
          />
        </>
      );
    case "torus":
    case "tube":
      return (
        <>
          <NumberInput
            label="Ring Radius"
            value={p.radius}
            onChange={(v) => updateGeometry("radius", Math.max(0.5, v))}
          />
          <NumberInput
            label="Tube Radius"
            value={p.tube}
            onChange={(v) => updateGeometry("tube", Math.max(0.1, v))}
            step={0.5}
          />
          <NumberInput
            label="Segments"
            value={p.tubularSegments || 48}
            onChange={(v) =>
              updateGeometry("tubularSegments", Math.max(3, Math.floor(v)))
            }
            step={1}
          />
        </>
      );
    case "wedge":
      return (
        <>
          <NumberInput
            label="Width"
            value={p.width}
            onChange={(v) => updateGeometry("width", v)}
          />
          <NumberInput
            label="Height"
            value={p.height}
            onChange={(v) => updateGeometry("height", v)}
          />
          <NumberInput
            label="Depth"
            value={p.depth}
            onChange={(v) => updateGeometry("depth", v)}
          />
        </>
      );
    case "text":
      return (
        <>
          <div className="dml-prop-field">
            <label>Text</label>
            <input
              type="text"
              value={p.text}
              onChange={(e) => updateGeometry("text", e.target.value)}
              className="dml-text-prop-input"
            />
          </div>
          <div className="dml-prop-field">
            <label>Font</label>
            <CustomSelect
              value={p.font || "helvetiker"}
              onChange={(v) => updateGeometry("font", v)}
              options={Object.keys(FONT_MAP).map((k) => ({
                value: k,
                label: FONT_LABELS[k],
              }))}
            />
          </div>
          <NumberInput
            label="Size"
            value={p.size}
            onChange={(v) => updateGeometry("size", v)}
          />
          <NumberInput
            label="Depth"
            value={p.height}
            onChange={(v) => updateGeometry("height", v)}
          />
        </>
      );
    case "heart":
      return (
        <>
          <NumberInput
            label="Size"
            value={p.size}
            onChange={(v) => updateGeometry("size", v)}
          />
          <NumberInput
            label="Depth"
            value={p.depth}
            onChange={(v) => updateGeometry("depth", v)}
          />
        </>
      );
    case "star":
    case "starSix":
      return (
        <>
          <NumberInput
            label="Outer R"
            value={p.outerRadius}
            onChange={(v) => updateGeometry("outerRadius", v)}
          />
          <NumberInput
            label="Inner R"
            value={p.innerRadius}
            onChange={(v) => updateGeometry("innerRadius", v)}
          />
          <NumberInput
            label="Points"
            value={p.points}
            onChange={(v) =>
              updateGeometry("points", Math.max(3, Math.floor(v)))
            }
            step={1}
          />
          <NumberInput
            label="Depth"
            value={p.depth}
            onChange={(v) => updateGeometry("depth", v)}
          />
        </>
      );
    default:
      return <p className="dml-text-muted">No editable geometry</p>;
  }
}

export default function ObjectProperties() {
  const selectedIds = useDesignStore((s) => s.selectedIds);
  const objects = useDesignStore((s) => s.objects);
  const updateObject = useDesignStore((s) => s.updateObject);
  const removeSelected = useDesignStore((s) => s.removeSelected);
  const duplicateSelected = useDesignStore((s) => s.duplicateSelected);
  const toggleLock = useDesignStore((s) => s.toggleLock);
  const groupSelected = useDesignStore((s) => s.groupSelected);
  const ungroupSelected = useDesignStore((s) => s.ungroupSelected);
  const [lockScale, setLockScale] = useState(true);

  if (selectedIds.length === 0) {
    return (
      <div className="dml-properties">
        <h3 className="dml-panel-title">Properties</h3>
        <p className="dml-no-selection">Select an object to view properties</p>
      </div>
    );
  }

  if (selectedIds.length > 1) {
    const selectedObjects = objects.filter((o) => selectedIds.includes(o.id));
    const canUngroup = selectedObjects.some((o) => !!o.groupId);
    return (
      <div className="dml-properties">
        <h3 className="dml-panel-title">Properties</h3>
        <p className="dml-multi-selection">
          {selectedIds.length} objects selected
        </p>
        <div className="dml-prop-actions">
          <button className="dml-action-btn" onClick={groupSelected}>
            <Link2 size={14} /> Group
          </button>
          <button
            className="dml-action-btn"
            onClick={ungroupSelected}
            disabled={!canUngroup}
          >
            <Unlink2 size={14} /> Ungroup
          </button>
          <button className="dml-action-btn" onClick={duplicateSelected}>
            <Copy size={14} /> Duplicate All
          </button>
          <button className="dml-action-btn danger" onClick={removeSelected}>
            <Trash2 size={14} /> Delete All
          </button>
        </div>
      </div>
    );
  }

  const obj = objects.find((o) => o.id === selectedIds[0]);
  if (!obj) return null;

  const updatePos = (axis, val) => {
    const pos = [...obj.position];
    pos[axis] = val;
    updateObject(obj.id, { position: pos });
  };

  const updateRot = (axis, val) => {
    const rot = [...obj.rotation];
    rot[axis] = (val * Math.PI) / 180;
    updateObject(obj.id, { rotation: rot });
  };

  const updateScale = (axis, val) => {
    const scale = [...obj.scale];
    if (lockScale) {
      const ratio = obj.scale[axis] !== 0 ? val / obj.scale[axis] : 1;
      scale[0] = obj.scale[0] * ratio;
      scale[1] = obj.scale[1] * ratio;
      scale[2] = obj.scale[2] * ratio;
    } else {
      scale[axis] = val;
    }
    updateObject(obj.id, { scale });
  };

  const updateGeometry = (key, val) => {
    updateObject(obj.id, { geometry: { ...obj.geometry, [key]: val } });
  };

  const isLocked = !!obj.locked;

  return (
    <div className="dml-properties">
      <h3 className="dml-panel-title">Properties</h3>

      <div className="dml-prop-section">
        <div className="dml-lock-edit-row">
          <input
            className="dml-name-input"
            value={obj.name}
            onChange={(e) => updateObject(obj.id, { name: e.target.value })}
            spellCheck={false}
            disabled={isLocked}
          />
          <button
            className={`dml-lock-edit-btn ${isLocked ? "locked" : ""}`}
            onClick={() => toggleLock(obj.id)}
            title={isLocked ? "Unlock editing" : "Lock editing"}
          >
            {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
        </div>
        <span className="dml-type-badge">{obj.type}</span>
      </div>

      <fieldset className="dml-prop-fieldset" disabled={isLocked}>
        <div className="dml-prop-section">
          <h4>Position</h4>
          <div className="dml-prop-row">
            <NumberInput
              label="X"
              value={obj.position[0]}
              onChange={(v) => updatePos(0, v)}
            />
            <NumberInput
              label="Y"
              value={obj.position[1]}
              onChange={(v) => updatePos(1, v)}
            />
            <NumberInput
              label="Z"
              value={obj.position[2]}
              onChange={(v) => updatePos(2, v)}
            />
          </div>
        </div>

        <div className="dml-prop-section">
          <h4>Rotation</h4>
          <div className="dml-prop-row">
            <NumberInput
              label="X"
              value={(obj.rotation[0] * 180) / Math.PI}
              onChange={(v) => updateRot(0, v)}
              step={5}
            />
            <NumberInput
              label="Y"
              value={(obj.rotation[1] * 180) / Math.PI}
              onChange={(v) => updateRot(1, v)}
              step={5}
            />
            <NumberInput
              label="Z"
              value={(obj.rotation[2] * 180) / Math.PI}
              onChange={(v) => updateRot(2, v)}
              step={5}
            />
          </div>
        </div>

        <div className="dml-prop-section">
          <div className="dml-prop-header">
            <h4>Scale</h4>
            <button
              className={`dml-lock-btn ${lockScale ? "locked" : ""}`}
              onClick={() => setLockScale(!lockScale)}
              title={lockScale ? "Unlock proportions" : "Lock proportions"}
            >
              {lockScale ? <Lock size={13} /> : <Unlock size={13} />}
            </button>
          </div>
          <div className="dml-prop-row">
            <NumberInput
              label="X"
              value={obj.scale[0]}
              onChange={(v) => updateScale(0, v)}
              step={0.1}
              min={0.01}
            />
            <NumberInput
              label="Y"
              value={obj.scale[1]}
              onChange={(v) => updateScale(1, v)}
              step={0.1}
              min={0.01}
            />
            <NumberInput
              label="Z"
              value={obj.scale[2]}
              onChange={(v) => updateScale(2, v)}
              step={0.1}
              min={0.01}
            />
          </div>
        </div>

        <div className="dml-prop-section">
          <h4>Appearance</h4>
          <div className="dml-swatches">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                className={`dml-swatch ${obj.color === c ? "active" : ""}`}
                style={{ background: c }}
                onClick={() => updateObject(obj.id, { color: c })}
              />
            ))}
          </div>
          <div className="dml-color-row">
            <label>Custom</label>
            <input
              type="color"
              value={obj.color}
              onChange={(e) => updateObject(obj.id, { color: e.target.value })}
              className="dml-color-input"
            />
            <span className="dml-color-hex">{obj.color}</span>
          </div>
          <label className="dml-checkbox-label">
            <input
              type="checkbox"
              checked={obj.isHole}
              onChange={(e) =>
                updateObject(obj.id, { isHole: e.target.checked })
              }
            />
            <span>Hole (Subtraction)</span>
          </label>
        </div>

        <div className="dml-prop-section">
          <h4>Geometry</h4>
          <GeometryProps obj={obj} updateGeometry={updateGeometry} />
        </div>

        <div className="dml-prop-actions">
          <button className="dml-action-btn" onClick={duplicateSelected}>
            <Copy size={14} /> Duplicate
          </button>
          <button className="dml-action-btn danger" onClick={removeSelected}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </fieldset>
    </div>
  );
}
