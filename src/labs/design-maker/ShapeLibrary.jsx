import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import Tippy from "@tippyjs/react";
import { ChevronDown, Shapes, X, GripVertical, Search } from "lucide-react";
import { useDesignStore } from "./store";
import { getShapeIcons } from "./shapeIcons";
import Tip from "./Tip";

const transparentImg = (() => {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  return c;
})();

// Inline capsule (pill) SVG so the capsule slot always shows something even if async icons fail
const CAPSULE_PLACEHOLDER_SVG =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="14" y="6" width="36" height="52" rx="18" ry="18" fill="%23d1d5db" stroke="%236b7280" stroke-width="2"/></svg>',
  );

function getIconSrc(icons, shape) {
  if (shape.type === "capsule") {
    return icons.capsule || icons.cylinder || CAPSULE_PLACEHOLDER_SVG;
  }
  return icons[shape.type];
}

const CATEGORIES = [
  {
    name: "Primitives",
    color: "#6366f1",
    shapes: [
      { type: "box", name: "Box" },
      { type: "sphere", name: "Sphere" },
      { type: "cylinder", name: "Cylinder" },
      { type: "capsule", name: "Capsule" },
      { type: "cone", name: "Cone" },
      { type: "torus", name: "Torus" },
      { type: "ellipsoid", name: "Ellipsoid" },
    ],
  },
  {
    name: "Text",
    color: "#3b82f6",
    isText: true,
    shapes: [
      { type: "text", name: "Solid Text", isHole: false },
      { type: "text", name: "Hole Text", isHole: true },
    ],
  },
  {
    name: "Polyhedra",
    color: "#10b981",
    shapes: [
      { type: "tetrahedron", name: "Tetrahedron" },
      { type: "octahedron", name: "Octahedron" },
      { type: "icosahedron", name: "Icosahedron" },
      { type: "dodecahedron", name: "Dodecahedron" },
    ],
  },
  {
    name: "Prisms & Pyramids",
    color: "#8b5cf6",
    shapes: [
      { type: "triangularPrism", name: "Triangular Prism" },
      { type: "pentagonalPrism", name: "Pentagonal Prism" },
      { type: "hexagonalPrism", name: "Hexagonal Prism" },
      { type: "pyramid", name: "Pyramid" },
      { type: "squarePyramid", name: "Square Pyramid" },
      { type: "pentagonalPyramid", name: "Pentagonal Pyramid" },
      { type: "wedge", name: "Wedge" },
    ],
  },
  {
    name: "Everyday",
    color: "#f97316",
    shapes: [
      { type: "wall", name: "Wall" },
      { type: "heart", name: "Heart" },
      { type: "star", name: "Star" },
      { type: "starSix", name: "Star (6-pointed)" },
      { type: "hemisphere", name: "Half Sphere" },
      { type: "tube", name: "Tube" },
      { type: "ring", name: "Ring" },
      { type: "paraboloid", name: "Paraboloid" },
    ],
  },
  {
    name: "Holes",
    color: "#ef4444",
    shapes: [
      { type: "box", name: "Box Hole", isHole: true },
      { type: "sphere", name: "Sphere Hole", isHole: true },
      { type: "cylinder", name: "Cylinder Hole", isHole: true },
      { type: "cone", name: "Cone Hole", isHole: true },
      { type: "torus", name: "Torus Hole", isHole: true },
      { type: "pyramid", name: "Pyramid Hole", isHole: true },
      { type: "star", name: "Star Hole", isHole: true },
      { type: "tube", name: "Tube Hole", isHole: true },
      { type: "wedge", name: "Wedge Hole", isHole: true },
      { type: "ring", name: "Ring Hole", isHole: true },
    ],
  },
];

export default function ShapeLibrary() {
  const [open, setOpen] = useState(false);
  const [textInput, setTextInput] = useState("Hello");
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);
  const panelRef = useRef(null);
  const setDraggingShape = useDesignStore((s) => s.setDraggingShape);
  const clearDraggingShape = useDesignStore((s) => s.clearDraggingShape);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.map((cat) => ({
      ...cat,
      shapes: cat.shapes.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q),
      ),
    })).filter((cat) => cat.shapes.length > 0);
  }, [search]);

  const handleDragStart = useCallback(
    (e, shape) => {
      const payload = {
        type: shape.type,
        isHole: shape.isHole || false,
      };
      if (shape.type === "text") {
        payload.text = textInput || "Text";
      }
      e.dataTransfer.setData(
        "application/x-design-shape",
        JSON.stringify(payload),
      );
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setDragImage(transparentImg, 0, 0);
      setDraggingShape(payload);
    },
    [textInput, setDraggingShape],
  );

  const handleDragEnd = useCallback(() => {
    clearDraggingShape();
  }, [clearDraggingShape]);

  const [icons, setIcons] = useState({});

  useEffect(() => {
    const result = getShapeIcons();
    if (result instanceof Promise) {
      result.then(setIcons).catch(() => setIcons({}));
    } else {
      setIcons(result);
    }
  }, []);

  return (
    <div className="dml-shapes-dropdown" ref={panelRef}>
      <Tippy content="Shape Library" disabled={open}>
        <button
          className={`dml-shapes-trigger ${open ? "active" : ""}`}
          onClick={() => setOpen(!open)}
        >
          <Shapes size={18} />
          <span>Shapes</span>
          <ChevronDown
            size={14}
            className={`dml-shapes-chevron ${open ? "open" : ""}`}
          />
        </button>
      </Tippy>

      {open && (
        <div className="dml-shapes-panel">
          <div className="dml-shapes-panel-header">
            <h3>Shape Library</h3>
            <span className="dml-drag-hint">Drag onto workplane</span>
            <button className="dml-shapes-close" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </div>

          <div className="dml-shapes-search">
            <Search size={14} className="dml-shapes-search-icon" />
            <input
              ref={searchRef}
              type="text"
              className="dml-shapes-search-input"
              placeholder="Search shapes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            {search && (
              <button
                className="dml-shapes-search-clear"
                onClick={() => setSearch("")}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="dml-shapes-panel-body">
            {filteredCategories.length === 0 && (
              <p className="dml-shapes-no-results">
                No shapes match "{search}"
              </p>
            )}
            {filteredCategories.map((cat) => (
              <div key={cat.name} className="dml-shapes-group">
                <div className="dml-shapes-group-label">
                  <span
                    className="dml-shapes-group-dot"
                    style={{ background: cat.color }}
                  />
                  <span>{cat.name}</span>
                </div>

                {cat.isText && (
                  <input
                    className="dml-shapes-text-input"
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type text..."
                    onClick={(e) => e.stopPropagation()}
                  />
                )}

                <div className="dml-shapes-group-grid">
                  {cat.shapes.map((shape, i) => (
                    <Tip key={i} label={shape.name} placement="bottom">
                      <div
                        className={`dml-shapes-item ${shape.isHole ? "hole" : ""}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, shape)}
                        onDragEnd={handleDragEnd}
                      >
                        <div
                          className={`dml-shapes-item-icon ${shape.type === "capsule" ? "dml-shapes-item-icon-capsule" : ""}`}
                        >
                          {getIconSrc(icons, shape) ? (
                            <img
                              src={getIconSrc(icons, shape)}
                              alt={shape.name}
                              draggable={false}
                              loading="eager"
                            />
                          ) : (
                            <span
                              className="dml-shapes-item-icon-placeholder"
                              aria-hidden
                            >
                              {shape.name.charAt(0)}
                            </span>
                          )}
                        </div>
                        <span>{shape.name}</span>
                        <GripVertical size={10} className="dml-drag-grip" />
                      </div>
                    </Tip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
