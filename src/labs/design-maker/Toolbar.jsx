import React from 'react';
import Tippy from '@tippyjs/react';
import {
  Move, RotateCw, Maximize2, Grid3X3,
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
        <Tippy content="Undo (Ctrl+Z)">
          <button className="dml-tool-btn" onClick={undo} disabled={!canUndo}>
            <Undo2 size={16} />
          </button>
        </Tippy>
        <Tippy content="Redo (Ctrl+Shift+Z)">
          <button className="dml-tool-btn" onClick={redo} disabled={!canRedo}>
            <Redo2 size={16} />
          </button>
        </Tippy>
      </div>

      <div className="dml-toolbar-sep" />

      <div className="dml-toolbar-group">
        <span className="dml-toolbar-label">Transform</span>
        <Tippy content="Move (T)">
          <button
            className={`dml-tool-btn ${transformMode === 'translate' ? 'active' : ''}`}
            onClick={() => setTransformMode('translate')}
          >
            <Move size={16} />
          </button>
        </Tippy>
        <Tippy content="Rotate (R)">
          <button
            className={`dml-tool-btn ${transformMode === 'rotate' ? 'active' : ''}`}
            onClick={() => setTransformMode('rotate')}
          >
            <RotateCw size={16} />
          </button>
        </Tippy>
        <Tippy content="Scale (S)">
          <button
            className={`dml-tool-btn ${transformMode === 'scale' ? 'active' : ''}`}
            onClick={() => setTransformMode('scale')}
          >
            <Maximize2 size={16} />
          </button>
        </Tippy>
      </div>

      <div className="dml-toolbar-sep" />

      <div className="dml-toolbar-group">
        <span className="dml-toolbar-label">View</span>
        <div className="dml-view-toggle">
          <button
            className={`dml-view-toggle-btn ${!wireframe ? 'active' : ''}`}
            onClick={() => { if (wireframe) toggleWireframe(); }}
          >
            Solid
          </button>
          <button
            className={`dml-view-toggle-btn ${wireframe ? 'active' : ''}`}
            onClick={() => { if (!wireframe) toggleWireframe(); }}
          >
            Wire
          </button>
        </div>
        <Tippy content="Toggle Grid (G)">
          <button
            className={`dml-tool-btn ${gridVisible ? 'active' : ''}`}
            onClick={toggleGrid}
          >
            <Grid3X3 size={16} />
          </button>
        </Tippy>
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
            <Tippy content="Duplicate (Ctrl+D)">
              <button className="dml-tool-btn" onClick={duplicateSelected}>
                <Copy size={16} />
              </button>
            </Tippy>
            <Tippy content="Mirror X">
              <button className="dml-tool-btn" onClick={() => mirrorSelected('x')}>
                <FlipHorizontal size={16} />
              </button>
            </Tippy>
            <Tippy content="Mirror Z">
              <button className="dml-tool-btn" onClick={() => mirrorSelected('z')}>
                <FlipVertical size={16} />
              </button>
            </Tippy>
            <Tippy content="Delete (Del)">
              <button className="dml-tool-btn danger" onClick={removeSelected}>
                <Trash2 size={16} />
              </button>
            </Tippy>
          </div>
        </>
      )}

      {hasMulti && (
        <>
          <div className="dml-toolbar-sep" />
          <div className="dml-toolbar-group">
            <span className="dml-toolbar-label">Align</span>
            <Tippy content="Align Center X">
              <button className="dml-tool-btn" onClick={() => alignObjects('x', 'center')}>
                <AlignCenterHorizontal size={16} />
              </button>
            </Tippy>
            <Tippy content="Align Bottom Y">
              <button className="dml-tool-btn" onClick={() => alignObjects('y', 'min')}>
                <AlignCenterVertical size={16} />
              </button>
            </Tippy>
            <Tippy content="Align Center Z">
              <button className="dml-tool-btn" onClick={() => alignObjects('z', 'center')}>
                <AlignCenterHorizontal size={16} />
              </button>
            </Tippy>
          </div>
        </>
      )}
    </div>
  );
}
