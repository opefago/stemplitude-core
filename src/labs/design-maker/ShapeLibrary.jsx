import React, { useState } from 'react';
import {
  Box, Circle, Triangle, Hexagon, Star, Heart, Square, Type,
  ChevronDown, ChevronRight, Minus, Pentagon, Donut,
} from 'lucide-react';
import { useDesignStore } from './store';

const CATEGORIES = [
  {
    name: 'Primitives',
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
    isText: true,
    shapes: [
      { type: 'text', name: '+ Solid Text', isHole: false },
      { type: 'text', name: '- Hole Text', isHole: true },
    ],
  },
];

export default function ShapeLibrary() {
  const [expanded, setExpanded] = useState({ Primitives: true, Everyday: true, Text: true });
  const [textInput, setTextInput] = useState('Hello');
  const addObject = useDesignStore(s => s.addObject);

  const handleAddShape = (shape) => {
    if (shape.type === 'text') {
      addObject('text', {
        isHole: !!shape.isHole,
        geometry: { text: textInput || 'Text', size: 10, height: 5 },
      });
    } else {
      addObject(shape.type);
    }
  };

  return (
    <div className="dml-shape-library">
      <h3 className="dml-panel-title">Shapes</h3>
      {CATEGORIES.map(cat => (
        <div key={cat.name} className="dml-shape-category">
          <button
            className="dml-category-header"
            onClick={() => setExpanded(p => ({ ...p, [cat.name]: !p[cat.name] }))}
          >
            {expanded[cat.name] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>{cat.name}</span>
          </button>

          {expanded[cat.name] && (
            <div className="dml-shape-section">
              {cat.isText && (
                <input
                  className="dml-text-input"
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type text..."
                />
              )}
              <div className="dml-shape-grid">
                {cat.shapes.map((shape, i) => {
                  const Icon = shape.icon || Type;
                  return (
                    <button
                      key={i}
                      className={`dml-shape-btn ${shape.isHole ? 'hole' : ''}`}
                      onClick={() => handleAddShape(shape)}
                      title={shape.name}
                    >
                      <Icon size={20} />
                      <span>{shape.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
