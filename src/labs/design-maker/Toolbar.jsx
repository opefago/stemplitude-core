import React from 'react';
import Tip from './Tip';
import {
  Move, RotateCw, Maximize2, Grid3X3, Box, BoxSelect, Ruler,
  Copy, Trash2, FlipHorizontal, FlipVertical,
  AlignCenterHorizontal, AlignCenterVertical,
  Undo2, Redo2,
} from 'lucide-react';
import { useDesignStore } from './store';

export default function Toolbar() {
  const transformMode = useDesignStore(s => s.transformMode);
  const gridVisible = useDesignStore(s => s.gridVisible);
  const wireframe = useDesignStore(s => s.wireframe);
  const snapIncrement = useDesignStore(s => s.snapIncrement);
  const selectedIds = useDesignStore(s => s.selectedIds);

  const setTransformMode = useDesignStore(s => s.setTransformMode);
  const toggleGrid = useDesignStore(s => s.toggleGrid);
  const toggleWireframe = useDesignStore(s => s.toggleWireframe);
  const rulerVisible = useDesignStore(s => s.rulerVisible);
  const toggleRuler = useDesignStore(s => s.toggleRuler);
  const setSnapIncrement = useDesignStore(s => s.setSnapIncrement);
  const removeSelected = useDesignStore(s => s.removeSelected);
  const duplicateSelected = useDesignStore(s => s.duplicateSelected);
  const mirrorSelected = useDesignStore(s => s.mirrorSelected);
  const alignObjects = useDesignStore(s => s.alignObjects);
  const undo = useDesignStore(s => s.undo);
  const redo = useDesignStore(s => s.redo);
  const canUndo = useDesignStore(s => s._past.length > 0);
  const canRedo = useDesignStore(s => s._future.length > 0);

  const hasSelection = selectedIds.length > 0;
  const hasMulti = selectedIds.length > 1;

  return (
    <div className="dml-toolbar">
      <div className="dml-toolbar-group">
        <Tip label="Undo" shortcut="Ctrl+Z">
          <button className="dml-tool-btn" onClick={undo} disabled={!canUndo}>
            <Undo2 size={20} />
          </button>
        </Tip>
        <Tip label="Redo" shortcut="Ctrl+Shift+Z">
          <button className="dml-tool-btn" onClick={redo} disabled={!canRedo}>
            <Redo2 size={20} />
          </button>
        </Tip>
      </div>

      <div className="dml-toolbar-sep" />

      <div className="dml-toolbar-group">
        <Tip label="Move" shortcut="T">
          <button
            className={`dml-tool-btn ${transformMode === 'translate' ? 'active' : ''}`}
            onClick={() => setTransformMode('translate')}
          >
            <Move size={20} />
          </button>
        </Tip>
        <Tip label="Rotate" shortcut="R">
          <button
            className={`dml-tool-btn ${transformMode === 'rotate' ? 'active' : ''}`}
            onClick={() => setTransformMode('rotate')}
          >
            <RotateCw size={20} />
          </button>
        </Tip>
        <Tip label="Resize" shortcut="S">
          <button
            className={`dml-tool-btn ${transformMode === 'scale' ? 'active' : ''}`}
            onClick={() => setTransformMode('scale')}
          >
            <Maximize2 size={20} />
          </button>
        </Tip>
      </div>

      <div className="dml-toolbar-sep" />

      <div className="dml-toolbar-group">
        <Tip label="Solid View">
          <button
            className={`dml-tool-btn ${!wireframe ? 'active' : ''}`}
            onClick={() => { if (wireframe) toggleWireframe(); }}
          >
            <Box size={20} />
          </button>
        </Tip>
        <Tip label="Wireframe">
          <button
            className={`dml-tool-btn ${wireframe ? 'active' : ''}`}
            onClick={() => { if (!wireframe) toggleWireframe(); }}
          >
            <BoxSelect size={20} />
          </button>
        </Tip>
        <Tip label="Grid" shortcut="G">
          <button
            className={`dml-tool-btn ${gridVisible ? 'active' : ''}`}
            onClick={toggleGrid}
          >
            <Grid3X3 size={20} />
          </button>
        </Tip>
        <Tip label="Ruler">
          <button
            className={`dml-tool-btn ${rulerVisible ? 'active' : ''}`}
            onClick={toggleRuler}
          >
            <Ruler size={20} />
          </button>
        </Tip>
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
            <Tip label="Duplicate" shortcut="Ctrl+D">
              <button className="dml-tool-btn" onClick={duplicateSelected}>
                <Copy size={20} />
              </button>
            </Tip>
            <Tip label="Mirror X">
              <button className="dml-tool-btn" onClick={() => mirrorSelected('x')}>
                <FlipHorizontal size={20} />
              </button>
            </Tip>
            <Tip label="Mirror Z">
              <button className="dml-tool-btn" onClick={() => mirrorSelected('z')}>
                <FlipVertical size={20} />
              </button>
            </Tip>
            <Tip label="Delete" shortcut="Del">
              <button className="dml-tool-btn danger" onClick={removeSelected}>
                <Trash2 size={20} />
              </button>
            </Tip>
          </div>
        </>
      )}

      {hasMulti && (
        <>
          <div className="dml-toolbar-sep" />
          <div className="dml-toolbar-group">
            <span className="dml-toolbar-label">Align</span>
            <Tip label="Align X">
              <button className="dml-tool-btn" onClick={() => alignObjects('x', 'center')}>
                <AlignCenterHorizontal size={20} />
              </button>
            </Tip>
            <Tip label="Align Y">
              <button className="dml-tool-btn" onClick={() => alignObjects('y', 'min')}>
                <AlignCenterVertical size={20} />
              </button>
            </Tip>
            <Tip label="Align Z">
              <button className="dml-tool-btn" onClick={() => alignObjects('z', 'center')}>
                <AlignCenterHorizontal size={20} />
              </button>
            </Tip>
          </div>
        </>
      )}
    </div>
  );
}
