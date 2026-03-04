import React from 'react';
import {
  Move, RotateCw, Maximize2, Eye, EyeOff, Grid3X3, Box, Cuboid,
  Copy, Trash2, FlipHorizontal, FlipVertical,
  AlignCenterHorizontal, AlignCenterVertical,
  Home, ZoomIn,
} from 'lucide-react';
import { useDesignStore } from './store';

export default function Toolbar() {
  const transformMode = useDesignStore(s => s.transformMode);
  const cameraMode = useDesignStore(s => s.cameraMode);
  const gridVisible = useDesignStore(s => s.gridVisible);
  const wireframe = useDesignStore(s => s.wireframe);
  const snapIncrement = useDesignStore(s => s.snapIncrement);
  const selectedIds = useDesignStore(s => s.selectedIds);

  const setTransformMode = useDesignStore(s => s.setTransformMode);
  const setCameraMode = useDesignStore(s => s.setCameraMode);
  const toggleGrid = useDesignStore(s => s.toggleGrid);
  const toggleWireframe = useDesignStore(s => s.toggleWireframe);
  const setSnapIncrement = useDesignStore(s => s.setSnapIncrement);
  const removeSelected = useDesignStore(s => s.removeSelected);
  const duplicateSelected = useDesignStore(s => s.duplicateSelected);
  const mirrorSelected = useDesignStore(s => s.mirrorSelected);
  const alignObjects = useDesignStore(s => s.alignObjects);

  const hasSelection = selectedIds.length > 0;
  const hasMulti = selectedIds.length > 1;

  return (
    <div className="dml-toolbar">
      <div className="dml-toolbar-group">
        <span className="dml-toolbar-label">Transform</span>
        <button
          className={`dml-tool-btn ${transformMode === 'translate' ? 'active' : ''}`}
          onClick={() => setTransformMode('translate')}
          title="Move (T)"
        >
          <Move size={16} />
        </button>
        <button
          className={`dml-tool-btn ${transformMode === 'rotate' ? 'active' : ''}`}
          onClick={() => setTransformMode('rotate')}
          title="Rotate (R)"
        >
          <RotateCw size={16} />
        </button>
        <button
          className={`dml-tool-btn ${transformMode === 'scale' ? 'active' : ''}`}
          onClick={() => setTransformMode('scale')}
          title="Scale (S)"
        >
          <Maximize2 size={16} />
        </button>
      </div>

      <div className="dml-toolbar-sep" />

      <div className="dml-toolbar-group">
        <span className="dml-toolbar-label">View</span>
        <button
          className={`dml-tool-btn ${wireframe ? 'active' : ''}`}
          onClick={toggleWireframe}
          title="Toggle Wireframe"
        >
          {wireframe ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button
          className={`dml-tool-btn ${gridVisible ? 'active' : ''}`}
          onClick={toggleGrid}
          title="Toggle Grid (G)"
        >
          <Grid3X3 size={16} />
        </button>
        <button
          className="dml-tool-btn"
          onClick={() => setCameraMode(cameraMode === 'perspective' ? 'orthographic' : 'perspective')}
          title={cameraMode === 'perspective' ? 'Switch to Orthographic' : 'Switch to Perspective'}
        >
          {cameraMode === 'perspective' ? <Cuboid size={16} /> : <Box size={16} />}
        </button>
      </div>

      <div className="dml-toolbar-sep" />

      <div className="dml-toolbar-group">
        <span className="dml-toolbar-label">Snap</span>
        <select
          className="dml-snap-select"
          value={snapIncrement}
          onChange={(e) => setSnapIncrement(Number(e.target.value))}
        >
          <option value={0.1}>0.1mm</option>
          <option value={1}>1mm</option>
          <option value={5}>5mm</option>
          <option value={10}>10mm</option>
        </select>
      </div>

      {hasSelection && (
        <>
          <div className="dml-toolbar-sep" />
          <div className="dml-toolbar-group">
            <span className="dml-toolbar-label">Edit</span>
            <button className="dml-tool-btn" onClick={duplicateSelected} title="Duplicate (Ctrl+D)">
              <Copy size={16} />
            </button>
            <button className="dml-tool-btn" onClick={() => mirrorSelected('x')} title="Mirror X">
              <FlipHorizontal size={16} />
            </button>
            <button className="dml-tool-btn" onClick={() => mirrorSelected('z')} title="Mirror Z">
              <FlipVertical size={16} />
            </button>
            <button className="dml-tool-btn danger" onClick={removeSelected} title="Delete (Del)">
              <Trash2 size={16} />
            </button>
          </div>
        </>
      )}

      {hasMulti && (
        <>
          <div className="dml-toolbar-sep" />
          <div className="dml-toolbar-group">
            <span className="dml-toolbar-label">Align</span>
            <button className="dml-tool-btn" onClick={() => alignObjects('x', 'center')} title="Align Center X">
              <AlignCenterHorizontal size={16} />
            </button>
            <button className="dml-tool-btn" onClick={() => alignObjects('y', 'min')} title="Align Bottom Y">
              <AlignCenterVertical size={16} />
            </button>
            <button className="dml-tool-btn" onClick={() => alignObjects('z', 'center')} title="Align Center Z">
              <AlignCenterHorizontal size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
