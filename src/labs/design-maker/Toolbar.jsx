import React, { useState } from 'react';
import Tip from './Tip';
import CustomSelect from './CustomSelect';
import {
  Move, RotateCw, Maximize2, Grid3X3, Box, BoxSelect, Ruler, PencilRuler,
  Copy, Trash2, FlipHorizontal, FlipVertical,
  AlignCenterHorizontal, AlignCenterVertical,
  Undo2, Redo2, LayoutGrid, Magnet,
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
  const measureActive = useDesignStore(s => s.measureActive);
  const toggleMeasure = useDesignStore(s => s.toggleMeasure);
  const faceSnap = useDesignStore(s => s.faceSnap);
  const toggleFaceSnap = useDesignStore(s => s.toggleFaceSnap);
  const setSnapIncrement = useDesignStore(s => s.setSnapIncrement);
  const removeSelected = useDesignStore(s => s.removeSelected);
  const duplicateSelected = useDesignStore(s => s.duplicateSelected);
  const mirrorSelected = useDesignStore(s => s.mirrorSelected);
  const arraySelected = useDesignStore(s => s.arraySelected);
  const alignObjects = useDesignStore(s => s.alignObjects);
  const undo = useDesignStore(s => s.undo);
  const redo = useDesignStore(s => s.redo);
  const canUndo = useDesignStore(s => s._past.length > 0);
  const canRedo = useDesignStore(s => s._future.length > 0);

  const [arrayOpen, setArrayOpen] = useState(false);
  const [arrayAxis, setArrayAxis] = useState('x');
  const [arrayCount, setArrayCount] = useState(3);
  const [arraySpacing, setArraySpacing] = useState(25);

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
        <Tip label="Measure" shortcut="M">
          <button
            className={`dml-tool-btn ${measureActive ? 'active' : ''}`}
            onClick={toggleMeasure}
          >
            <PencilRuler size={20} />
          </button>
        </Tip>
        <Tip label="Snap to Face">
          <button
            className={`dml-tool-btn ${faceSnap ? 'active' : ''}`}
            onClick={toggleFaceSnap}
          >
            <Magnet size={20} />
          </button>
        </Tip>
      </div>

      <div className="dml-toolbar-sep" />

      <div className="dml-toolbar-group">
        <span className="dml-toolbar-label">Snap</span>
        <CustomSelect
          className="dml-snap-select"
          value={snapIncrement}
          onChange={(v) => setSnapIncrement(Number(v))}
          options={[
            { value: 0, label: 'Off' },
            { value: 0.1, label: '0.1mm' },
            { value: 0.25, label: '0.25mm' },
            { value: 0.5, label: '0.5mm' },
            { value: 1, label: '1mm' },
            { value: 2, label: '2mm' },
            { value: 5, label: '5mm' },
            { value: 10, label: '10mm' },
          ]}
        />
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
            <div className="dml-array-wrap">
              <Tip label="Linear Array">
                <button className={`dml-tool-btn ${arrayOpen ? 'active' : ''}`} onClick={() => setArrayOpen(!arrayOpen)}>
                  <LayoutGrid size={20} />
                </button>
              </Tip>
              {arrayOpen && (
                <div className="dml-array-popover">
                  <div className="dml-array-row">
                    <label>Axis</label>
                    <CustomSelect
                      value={arrayAxis}
                      onChange={(v) => setArrayAxis(v)}
                      options={[
                        { value: 'x', label: 'X' },
                        { value: 'y', label: 'Y' },
                        { value: 'z', label: 'Z' },
                      ]}
                    />
                  </div>
                  <div className="dml-array-row">
                    <label>Count</label>
                    <input type="number" value={arrayCount} min={1} max={20} onChange={e => setArrayCount(Math.max(1, parseInt(e.target.value) || 1))} />
                  </div>
                  <div className="dml-array-row">
                    <label>Spacing</label>
                    <input type="number" value={arraySpacing} step={5} onChange={e => setArraySpacing(parseFloat(e.target.value) || 10)} />
                  </div>
                  <button className="dml-array-apply" onClick={() => { arraySelected(arrayAxis, arrayCount, arraySpacing); setArrayOpen(false); }}>
                    Create Array
                  </button>
                </div>
              )}
            </div>
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
