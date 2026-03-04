import React, { useState, useRef, useEffect, useCallback } from 'react';
import Tippy from '@tippyjs/react';
import {
  Box, Circle, Triangle, Star, Heart, Square, Type,
  ChevronDown, Minus, Donut, Shapes, X, GripVertical,
} from 'lucide-react';
import { useDesignStore } from './store';

const transparentImg = (() => {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  return c;
})();

const CATEGORIES = [
  {
    name: 'Primitives',
    color: '#6366f1',
    shapes: [
      { type: 'box', name: 'Box', icon: Box },
      { type: 'sphere', name: 'Sphere', icon: Circle },
      { type: 'cylinder', name: 'Cylinder', icon: Minus },
      { type: 'cone', name: 'Cone', icon: Triangle },
      { type: 'torus', name: 'Torus', icon: Donut },
    ],
  },
  {
    name: 'Everyday',
    color: '#f97316',
    shapes: [
      { type: 'wall', name: 'Wall', icon: Square },
      { type: 'pyramid', name: 'Pyramid', icon: Triangle },
      { type: 'heart', name: 'Heart', icon: Heart },
      { type: 'star', name: 'Star', icon: Star },
      { type: 'hemisphere', name: 'Half Sphere', icon: Circle },
      { type: 'tube', name: 'Tube', icon: Circle },
      { type: 'wedge', name: 'Wedge', icon: Triangle },
    ],
  },
  {
    name: 'Text',
    color: '#3b82f6',
    isText: true,
    shapes: [
      { type: 'text', name: 'Solid Text', icon: Type, isHole: false },
      { type: 'text', name: 'Hole Text', icon: Type, isHole: true },
    ],
  },
];

export default function ShapeLibrary() {
  const [open, setOpen] = useState(false);
  const [textInput, setTextInput] = useState('Hello');
  const panelRef = useRef(null);
  const setDraggingShape = useDesignStore(s => s.setDraggingShape);
  const clearDraggingShape = useDesignStore(s => s.clearDraggingShape);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const handleDragStart = useCallback((e, shape) => {
    const payload = {
      type: shape.type,
      isHole: shape.isHole || false,
    };
    if (shape.type === 'text') {
      payload.text = textInput || 'Text';
    }
    e.dataTransfer.setData('application/x-design-shape', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setDragImage(transparentImg, 0, 0);
    setDraggingShape(payload);
  }, [textInput, setDraggingShape]);

  const handleDragEnd = useCallback(() => {
    clearDraggingShape();
  }, [clearDraggingShape]);

  return (
    <div className="dml-shapes-dropdown" ref={panelRef}>
      <Tippy content="Shape Library" disabled={open}>
        <button
          className={`dml-shapes-trigger ${open ? 'active' : ''}`}
          onClick={() => setOpen(!open)}
        >
          <Shapes size={18} />
          <span>Shapes</span>
          <ChevronDown size={14} className={`dml-shapes-chevron ${open ? 'open' : ''}`} />
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

          <div className="dml-shapes-panel-body">
            {CATEGORIES.map(cat => (
              <div key={cat.name} className="dml-shapes-group">
                <div className="dml-shapes-group-label">
                  <span className="dml-shapes-group-dot" style={{ background: cat.color }} />
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
                  {cat.shapes.map((shape, i) => {
                    const Icon = shape.icon;
                    return (
                      <div
                        key={i}
                        className={`dml-shapes-item ${shape.isHole ? 'hole' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, shape)}
                        onDragEnd={handleDragEnd}
                        title={`Drag ${shape.name} to workplane`}
                      >
                        <div className="dml-shapes-item-icon">
                          <Icon size={22} />
                        </div>
                        <span>{shape.name}</span>
                        <GripVertical size={10} className="dml-drag-grip" />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
