import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  X, Pencil, Eraser, PaintBucket, Trash2, Save,
  Square, Minus, Circle, Type,
  FlipHorizontal, FlipVertical, Copy, Clipboard,
  ZoomIn, ZoomOut, Plus, Play, Pause, CopyPlus,
  Undo2, Redo2,
} from 'lucide-react';
import './PixelArtEditor.css';

const PALETTE = [
  '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
  '#ffff00', '#ff6600', '#ff00ff', '#00ffff', '#8b4513',
  '#808080', '#c0c0c0', '#800000', '#008000', '#000080',
  '#ffd700', '#4ade80', '#f472b6', '#a78bfa', '#38bdf8',
  '#fb923c', '#34d399', '#f87171', '#60a5fa', 'transparent',
];

const GRID_SIZES = [8, 16, 32];
const BG_GRID_SIZES = [
  { w: 30, h: 20, label: '30x20' },
  { w: 40, h: 30, label: '40x30' },
  { w: 60, h: 40, label: '60x40' },
];
const SHAPE_TOOLS = ['rect', 'line', 'circle'];
const BRUSH_SIZES = [1, 3, 5];

function getBrushCells(cx, cy, size, cols, rows) {
  const half = Math.floor(size / 2);
  const cells = [];
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < cols && y >= 0 && y < rows) cells.push([x, y]);
    }
  }
  return cells;
}

function makeGrid(w, h) {
  const rows = h || w;
  const cols = w;
  return Array.from({ length: rows }, () => Array(cols).fill('transparent'));
}

function floodFill(grid, x, y, newColor) {
  const target = grid[y][x];
  if (target === newColor) return grid;
  const copy = grid.map(r => [...r]);
  const stack = [[x, y]];
  const rows = copy.length, cols = copy[0].length;
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
    if (copy[cy][cx] !== target) continue;
    copy[cy][cx] = newColor;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return copy;
}

function getLinePoints(x0, y0, x1, y1) {
  const pts = [];
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, cx = x0, cy = y0;
  while (true) {
    pts.push([cx, cy]);
    if (cx === x1 && cy === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
  return pts;
}

function getRectPoints(x0, y0, x1, y1) {
  const pts = [];
  const [mnX, mxX] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [mnY, mxY] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let x = mnX; x <= mxX; x++) { pts.push([x, mnY]); pts.push([x, mxY]); }
  for (let y = mnY + 1; y < mxY; y++) { pts.push([mnX, y]); pts.push([mxX, y]); }
  return pts;
}

function getCirclePoints(cx, cy, ex, ey) {
  const r = Math.round(Math.sqrt((ex - cx) ** 2 + (ey - cy) ** 2));
  if (r === 0) return [[cx, cy]];
  const set = new Set();
  let x = r, y = 0, d = 1 - r;
  const add = (px, py) => set.add(`${cx + px},${cy + py}`);
  while (x >= y) {
    add(x, y); add(-x, y); add(x, -y); add(-x, -y);
    add(y, x); add(-y, x); add(y, -x); add(-y, -x);
    y++;
    if (d < 0) d += 2 * y + 1;
    else { x--; d += 2 * (y - x) + 1; }
  }
  return [...set].map(s => { const [a, b] = s.split(','); return [+a, +b]; });
}

function textToPixels(text, px, py, gridSize) {
  const fontSize = gridSize <= 8 ? 6 : gridSize <= 16 ? 8 : 12;
  const c = document.createElement('canvas');
  c.width = gridSize; c.height = gridSize;
  const ctx = c.getContext('2d');
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, px, py);
  const data = ctx.getImageData(0, 0, gridSize, gridSize);
  const pts = [];
  for (let y = 0; y < gridSize; y++)
    for (let x = 0; x < gridSize; x++)
      if (data.data[(y * gridSize + x) * 4 + 3] > 64) pts.push([x, y]);
  return pts;
}

function frameToCanvas(frame, w, h) {
  const rows = h || w;
  const cols = w;
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      if (frame[y]?.[x] && frame[y][x] !== 'transparent') {
        ctx.fillStyle = frame[y][x];
        ctx.fillRect(x, y, 1, 1);
      }
  return canvas;
}

export default function PixelArtEditor({ defaultName, onSave, onClose, mode = 'sprite' }) {
  const isBg = mode === 'background';
  const initW = isBg ? 30 : 16;
  const initH = isBg ? 20 : 16;
  const [gridW, setGridW] = useState(initW);
  const [gridH, setGridH] = useState(initH);
  const gridSize = gridW;
  const [frames, setFrames] = useState(() => [makeGrid(initW, initH)]);
  const [activeFrame, setActiveFrame] = useState(0);
  const [color, setColor] = useState('#ff0000');
  const [tool, setTool] = useState('pencil');
  const [brushSize, setBrushSize] = useState(1);
  const [name, setName] = useState(defaultName || '');
  const [zoomLevel, setZoomLevel] = useState(0);
  const [clipboardGrid, setClipboardGrid] = useState(null);
  const [shapeStart, setShapeStart] = useState(null);
  const [shapeEnd, setShapeEnd] = useState(null);
  const [isPainting, setIsPainting] = useState(false);
  const [textValue, setTextValue] = useState('A');
  const [fps, setFps] = useState(4);
  const [playing, setPlaying] = useState(false);
  const [customW, setCustomW] = useState(initW);
  const [customH, setCustomH] = useState(initH);
  const gridRef = useRef(null);
  const historyRef = useRef({ past: [], future: [] });
  const isUndoRedoRef = useRef(false);
  const [historyLen, setHistoryLen] = useState({ past: 0, future: 0 });

  const grid = frames[activeFrame] || makeGrid(gridW, gridH);

  const pushHistory = useCallback(() => {
    if (isUndoRedoRef.current) return;
    const snapshot = frames.map(f => f.map(r => [...r]));
    historyRef.current.past.push({ frames: snapshot, activeFrame });
    historyRef.current.future = [];
    if (historyRef.current.past.length > 50) historyRef.current.past.shift();
    setHistoryLen({ past: historyRef.current.past.length, future: 0 });
  }, [frames, activeFrame]);

  const undo = useCallback(() => {
    if (historyRef.current.past.length === 0 || playing) return;
    isUndoRedoRef.current = true;
    const prev = historyRef.current.past.pop();
    historyRef.current.future.push({ frames: frames.map(f => f.map(r => [...r])), activeFrame });
    setFrames(prev.frames);
    setActiveFrame(prev.activeFrame);
    setHistoryLen({ past: historyRef.current.past.length, future: historyRef.current.future.length });
    isUndoRedoRef.current = false;
  }, [frames, activeFrame, playing]);

  const redo = useCallback(() => {
    if (historyRef.current.future.length === 0 || playing) return;
    isUndoRedoRef.current = true;
    const next = historyRef.current.future.pop();
    historyRef.current.past.push({ frames: frames.map(f => f.map(r => [...r])), activeFrame });
    setFrames(next.frames);
    setActiveFrame(next.activeFrame);
    setHistoryLen({ past: historyRef.current.past.length, future: historyRef.current.future.length });
    isUndoRedoRef.current = false;
  }, [frames, activeFrame, playing]);

  const updateGrid = useCallback((updater, skipHistory = false) => {
    if (!skipHistory) pushHistory();
    setFrames(prev => {
      const copy = [...prev];
      const old = copy[activeFrame] || makeGrid(gridW, gridH);
      copy[activeFrame] = typeof updater === 'function' ? updater(old) : updater;
      return copy;
    });
  }, [activeFrame, gridW, gridH, pushHistory]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.target.closest('input, textarea')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'z') { e.preventDefault(); undo(); return; }
      if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (ctrl) return;
      if (e.key === 'p' || e.key === 'b') { e.preventDefault(); setTool('pencil'); return; }
      if (e.key === 'e') { e.preventDefault(); setTool('eraser'); return; }
      if (e.key === 'g') { e.preventDefault(); setTool('fill'); return; }
      if (e.key === 'l') { e.preventDefault(); setTool('line'); return; }
      if (e.key === 'u') { e.preventDefault(); setTool('rect'); return; }
      if (e.key === 'c') { e.preventDefault(); setTool('circle'); return; }
      if (e.key === 't') { e.preventDefault(); setTool('text'); return; }
      if (e.key === ',' || e.key === '<') { e.preventDefault(); setBrushSize(s => { const i = BRUSH_SIZES.indexOf(s); const idx = i < 0 ? 0 : (i > 0 ? i - 1 : BRUSH_SIZES.length - 1); return BRUSH_SIZES[idx]; }); return; }
      if (e.key === '.' || e.key === '>') { e.preventDefault(); setBrushSize(s => { const i = BRUSH_SIZES.indexOf(s); const idx = i < 0 ? 0 : (i < BRUSH_SIZES.length - 1 ? i + 1 : 0); return BRUSH_SIZES[idx]; }); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, undo, redo]);

  // ========== Animation preview ==========
  useEffect(() => {
    if (!playing || frames.length <= 1) return;
    const id = setInterval(() => {
      setActiveFrame(f => (f + 1) % frames.length);
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [playing, fps, frames.length]);

  // ========== Shape preview ==========
  const previewSet = useMemo(() => {
    if (!shapeStart || !shapeEnd || !SHAPE_TOOLS.includes(tool)) return null;
    let pts;
    switch (tool) {
      case 'rect': pts = getRectPoints(shapeStart.x, shapeStart.y, shapeEnd.x, shapeEnd.y); break;
      case 'line': pts = getLinePoints(shapeStart.x, shapeStart.y, shapeEnd.x, shapeEnd.y); break;
      case 'circle': pts = getCirclePoints(shapeStart.x, shapeStart.y, shapeEnd.x, shapeEnd.y); break;
      default: return null;
    }
    const valid = pts.filter(([x, y]) => x >= 0 && y >= 0 && x < gridW && y < gridH);
    return new Set(valid.map(([x, y]) => `${x},${y}`));
  }, [shapeStart, shapeEnd, tool, gridW, gridH]);

  // ========== Frame thumbnails ==========
  const frameThumbs = useMemo(() =>
    frames.map(f => frameToCanvas(f, gridW, gridH).toDataURL())
  , [frames, gridW, gridH]);

  // ========== Pointer handlers ==========
  const applyBrush = useCallback((g, x, y, value) => {
    const copy = g.map(r => [...r]);
    const cells = (tool === 'pencil' || tool === 'eraser')
      ? getBrushCells(x, y, brushSize, gridW, gridH)
      : [[x, y]];
    for (const [px, py] of cells) copy[py][px] = value;
    return copy;
  }, [tool, brushSize, gridW, gridH]);

  const handlePointerDown = useCallback((x, y) => {
    if (playing) return;
    if (SHAPE_TOOLS.includes(tool)) {
      setShapeStart({ x, y });
      setShapeEnd({ x, y });
      return;
    }
    if (tool === 'text') {
      if (!textValue.trim()) return;
      const pts = textToPixels(textValue, x, y, Math.max(gridW, gridH));
      updateGrid(g => {
        const copy = g.map(r => [...r]);
        for (const [px, py] of pts) copy[py][px] = color;
        return copy;
      });
      return;
    }
    setIsPainting(true);
    if (tool === 'fill') {
      updateGrid(g => floodFill(g, x, y, color));
    } else {
      const value = tool === 'eraser' ? 'transparent' : color;
      updateGrid(g => applyBrush(g, x, y, value));
    }
  }, [tool, color, textValue, gridW, gridH, updateGrid, applyBrush, playing]);

  const handlePointerMove = useCallback((x, y) => {
    if (SHAPE_TOOLS.includes(tool) && shapeStart) {
      setShapeEnd({ x, y });
      return;
    }
    if (isPainting && tool !== 'fill' && tool !== 'text') {
      const value = tool === 'eraser' ? 'transparent' : color;
      updateGrid(g => applyBrush(g, x, y, value), true);
    }
  }, [tool, isPainting, color, shapeStart, updateGrid, applyBrush]);

  const handlePointerUp = useCallback(() => {
    setIsPainting(false);
    if (SHAPE_TOOLS.includes(tool) && shapeStart && shapeEnd && previewSet) {
      updateGrid(g => {
        const copy = g.map(r => [...r]);
        for (const key of previewSet) {
          const [px, py] = key.split(',').map(Number);
          copy[py][px] = color;
        }
        return copy;
      });
    }
    setShapeStart(null);
    setShapeEnd(null);
  }, [tool, color, shapeStart, shapeEnd, previewSet, updateGrid]);

  // ========== Actions ==========
  const flipH = () => updateGrid(g => g.map(r => [...r].reverse()));
  const flipV = () => updateGrid(g => [...g].reverse());
  const copyFrame = () => setClipboardGrid(grid.map(r => [...r]));
  const pasteFrame = () => { if (clipboardGrid) updateGrid(clipboardGrid.map(r => [...r])); };
  const clearFrame = () => updateGrid(makeGrid(gridW, gridH));

  const clearHistory = useCallback(() => {
    historyRef.current = { past: [], future: [] };
    setHistoryLen({ past: 0, future: 0 });
  }, []);

  const changeSize = (w, h) => {
    const hVal = h || w;
    setGridW(w);
    setGridH(hVal);
    setCustomW(w);
    setCustomH(hVal);
    setFrames([makeGrid(w, hVal)]);
    setActiveFrame(0);
    setZoomLevel(0);
    setPlaying(false);
    clearHistory();
  };

  const applyCustomSize = () => {
    const minDim = isBg ? 10 : 4;
    const maxDim = isBg ? 240 : 128;
    const w = Math.max(minDim, Math.min(maxDim, Math.round(customW) || minDim));
    const h = Math.max(minDim, Math.min(maxDim, Math.round(customH) || minDim));
    changeSize(w, h);
  };

  const addFrame = () => {
    setPlaying(false);
    const newFrames = [...frames, makeGrid(gridW, gridH)];
    setFrames(newFrames);
    setActiveFrame(newFrames.length - 1);
  };
  const dupFrame = () => {
    setPlaying(false);
    const dup = grid.map(r => [...r]);
    const newFrames = [...frames];
    newFrames.splice(activeFrame + 1, 0, dup);
    setFrames(newFrames);
    setActiveFrame(activeFrame + 1);
  };
  const delFrame = () => {
    if (frames.length <= 1) return;
    setPlaying(false);
    const newFrames = frames.filter((_, i) => i !== activeFrame);
    setFrames(newFrames);
    setActiveFrame(Math.min(activeFrame, newFrames.length - 1));
  };

  // ========== Save ==========
  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const canvases = frames.map(f => frameToCanvas(f, gridW, gridH));
    onSave(trimmed, {
      preview: canvases[0],
      frames: canvases,
      fps: frames.length > 1 ? fps : 0,
    });
  };

  // ========== Render ==========
  const maxDim = Math.max(gridW, gridH);
  const baseCell = Math.min(Math.floor((isBg ? 500 : 340) / maxDim), isBg ? 16 : 28);
  const cellSize = Math.max(3, baseCell + zoomLevel * 3);

  return (
    <div className="pae-overlay" onPointerUp={handlePointerUp}>
      <div className={`pae-modal ${isBg ? 'pae-modal-bg' : ''}`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="pae-header">
          <span>{isBg ? 'Paint Background' : 'Paint Sprite'}</span>
          <input
            className="pae-name-input"
            type="text"
            placeholder="Sprite name..."
            value={name}
            onChange={e => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
            maxLength={20}
          />
          <button className="pae-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Top toolbar: zoom, dimensions, copy, paste, delete */}
        <div className="pae-top-toolbar">
          <div className="pae-top-group">
            <button className={`pae-tool ${historyLen.past ? '' : 'disabled'}`} onClick={undo} title="Undo (Ctrl+Z)"><Undo2 size={16} /></button>
            <button className={`pae-tool ${historyLen.future ? '' : 'disabled'}`} onClick={redo} title="Redo (Ctrl+Y)"><Redo2 size={16} /></button>
          </div>
          <div className="pae-top-group">
            <button className="pae-tool" onClick={() => setZoomLevel(z => Math.min(z + 1, 5))} title="Zoom In"><ZoomIn size={16} /></button>
            <button className="pae-tool" onClick={() => setZoomLevel(z => Math.max(z - 1, -3))} title="Zoom Out"><ZoomOut size={16} /></button>
          </div>
          <div className="pae-top-group pae-top-dimensions">
            <div className="pae-sizes pae-sizes-horiz">
              {isBg ? BG_GRID_SIZES.map(s => (
                <button key={s.label} className={`pae-size-btn ${gridW === s.w && gridH === s.h ? 'active' : ''}`} onClick={() => changeSize(s.w, s.h)}>
                  {s.label}
                </button>
              )) : GRID_SIZES.map(s => (
                <button key={s} className={`pae-size-btn ${gridW === s && gridH === s ? 'active' : ''}`} onClick={() => changeSize(s)}>
                  {s}×{s}
                </button>
              ))}
            </div>
            <div className="pae-custom-size">
              <input
                type="number"
                className="pae-dim-input"
                value={customW}
                onChange={e => setCustomW(Math.max(1, +(e.target.value) || 1))}
                min={isBg ? 10 : 4}
                max={isBg ? 240 : 128}
                title="Width"
              />
              <span className="pae-dim-sep">×</span>
              <input
                type="number"
                className="pae-dim-input"
                value={customH}
                onChange={e => setCustomH(Math.max(1, +(e.target.value) || 1))}
                min={isBg ? 10 : 4}
                max={isBg ? 240 : 128}
                title="Height"
              />
              <button className="pae-apply-btn" onClick={applyCustomSize} title="Apply custom size">
                Apply
              </button>
            </div>
          </div>
          <div className="pae-top-group">
            <button className="pae-tool" onClick={flipH} title="Flip Horizontal"><FlipHorizontal size={16} /></button>
            <button className="pae-tool" onClick={flipV} title="Flip Vertical"><FlipVertical size={16} /></button>
          </div>
          <div className="pae-top-group">
            <button className="pae-tool" onClick={copyFrame} title="Copy Frame"><Copy size={16} /></button>
            <button className={`pae-tool ${clipboardGrid ? '' : 'disabled'}`} onClick={pasteFrame} title="Paste Frame"><Clipboard size={16} /></button>
            <button className="pae-tool" onClick={clearFrame} title="Clear Frame"><Trash2 size={16} /></button>
          </div>
        </div>

        {/* Body: sidebar + canvas + palette */}
        <div className="pae-body">
          {/* Left toolbar */}
          <div className="pae-sidebar">
            <div className="pae-sidebar-section">
              <div className="pae-tool-stack">
                {[
                  ['pencil', Pencil, 'Pencil (P)'],
                  ['eraser', Eraser, 'Eraser (E)'],
                  ['fill', PaintBucket, 'Fill (G)'],
                  ['rect', Square, 'Rectangle (U)'],
                  ['line', Minus, 'Line (L)'],
                  ['circle', Circle, 'Circle (C)'],
                  ['text', Type, 'Text (T)'],
                ].map(([id, Icon, tip]) => (
                  <button
                    key={id}
                    className={`pae-tool ${tool === id ? 'active' : ''}`}
                    onClick={() => setTool(id)}
                    title={tip}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
              {tool === 'text' && (
                <input
                  className="pae-text-input pae-sidebar-input"
                  value={textValue}
                  onChange={e => setTextValue(e.target.value)}
                  maxLength={8}
                  placeholder="Text"
                  title="Type text, then click on canvas to place"
                />
              )}
              {(tool === 'pencil' || tool === 'eraser') && (
                <div className="pae-brush-sizes pae-brush-sizes-vert">
                  {BRUSH_SIZES.map(s => (
                    <button
                      key={s}
                      className={`pae-brush-btn ${brushSize === s ? 'active' : ''}`}
                      onClick={() => setBrushSize(s)}
                      title={`Brush ${s}×${s}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Canvas + palette */}
          <div className="pae-content">
          <div className="pae-canvas-area">
            <div
              className="pae-grid-wrap"
              ref={gridRef}
              onPointerLeave={() => setIsPainting(false)}
            >
              <div
                className="pae-grid"
                style={{
                  gridTemplateColumns: `repeat(${gridW}, ${cellSize}px)`,
                  gridTemplateRows: `repeat(${gridH}, ${cellSize}px)`,
                }}
              >
                {grid.map((row, y) =>
                  row.map((c, x) => {
                    const isPreview = previewSet?.has(`${x},${y}`);
                    return (
                      <div
                        key={`${x}-${y}`}
                        className={`pae-cell ${c === 'transparent' && !isPreview ? 'empty' : ''} ${isPreview ? 'preview' : ''}`}
                        style={isPreview ? { background: color } : c !== 'transparent' ? { background: c } : undefined}
                        onPointerDown={() => handlePointerDown(x, y)}
                        onPointerEnter={() => handlePointerMove(x, y)}
                      />
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="pae-palette-area">
            <div className="pae-palette">
              {PALETTE.map(c => (
                <button
                  key={c}
                  className={`pae-swatch ${color === c ? 'active' : ''} ${c === 'transparent' ? 'trans' : ''}`}
                  style={c !== 'transparent' ? { background: c } : undefined}
                  onClick={() => { setColor(c); if (tool === 'eraser') setTool('pencil'); }}
                  title={c}
                />
              ))}
            </div>
            <div className="pae-current">
              <span>Color:</span>
              <div
                className={`pae-current-swatch ${color === 'transparent' ? 'trans' : ''}`}
                style={color !== 'transparent' ? { background: color } : undefined}
              />
            </div>
          </div>
          </div>
        </div>

        {/* Frame timeline */}
        <div className="pae-frames">
          <div className="pae-frame-strip">
            {frameThumbs.map((url, i) => (
              <button
                key={i}
                className={`pae-frame-thumb ${i === activeFrame ? 'active' : ''}`}
                onClick={() => { setPlaying(false); setActiveFrame(i); }}
                title={`Frame ${i + 1}`}
              >
                <img src={url} alt={`Frame ${i + 1}`} />
                <span className="pae-frame-num">{i + 1}</span>
              </button>
            ))}
          </div>
          <div className="pae-frame-controls">
            <button className="pae-frame-btn" onClick={addFrame} title="Add blank frame"><Plus size={13} /></button>
            <button className="pae-frame-btn" onClick={dupFrame} title="Duplicate frame"><CopyPlus size={13} /></button>
            <button className="pae-frame-btn" onClick={delFrame} title="Delete frame" disabled={frames.length <= 1}><X size={13} /></button>
            <div className="pae-tool-sep" />
            {frames.length > 1 && (
              <>
                <button className="pae-frame-btn" onClick={() => setPlaying(p => !p)} title={playing ? 'Pause' : 'Play'}>
                  {playing ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <label className="pae-fps-label">
                  FPS
                  <input
                    type="number"
                    className="pae-fps-input"
                    value={fps}
                    onChange={e => setFps(Math.max(1, Math.min(24, +e.target.value || 1)))}
                    min={1} max={24}
                  />
                </label>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pae-footer">
          <button className="pae-cancel" onClick={onClose}>Cancel</button>
          <button className="pae-save" onClick={handleSave} disabled={!name.trim()}>
            <Save size={14} /> Save{frames.length > 1 ? ` (${frames.length} frames)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
