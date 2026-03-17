import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  X, Play, Pause, Square, Scissors, Copy, Clipboard, Trash2,
  Volume2, VolumeX, Upload, Mic, MicOff, Save, ZoomIn, ZoomOut,
  Undo2, Redo2, Plus, Repeat,
} from 'lucide-react';
import './SoundMixer.css';

// ─── Audio utilities ────────────────────────────────────

function getAudioCtx() {
  if (!getAudioCtx._ctx) getAudioCtx._ctx = new (window.AudioContext || window.webkitAudioContext)();
  return getAudioCtx._ctx;
}

async function decodeAudioFile(file) {
  const ctx = getAudioCtx();
  const arrayBuf = await file.arrayBuffer();
  return ctx.decodeAudioData(arrayBuf);
}

async function decodeAudioUrl(url) {
  const ctx = getAudioCtx();
  const resp = await fetch(url);
  const arrayBuf = await resp.arrayBuffer();
  return ctx.decodeAudioData(arrayBuf);
}

function bufferToFloat32(buffer) {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const data = new Float32Array(len);
  if (ch === 1) {
    buffer.copyFromChannel(data, 0);
  } else {
    const left = new Float32Array(len);
    const right = new Float32Array(len);
    buffer.copyFromChannel(left, 0);
    buffer.copyFromChannel(right, 1);
    for (let i = 0; i < len; i++) data[i] = (left[i] + right[i]) / 2;
  }
  return data;
}

function float32ToBuffer(data, sampleRate) {
  const ctx = getAudioCtx();
  const buf = ctx.createBuffer(1, data.length, sampleRate);
  buf.copyToChannel(data, 0);
  return buf;
}

function sliceFloat(data, start, end) {
  return data.slice(start, end);
}

function concatFloat(...arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const result = new Float32Array(total);
  let offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}

// ─── Effects ────────────────────────────────────────────

function applyGain(data, factor) {
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = Math.max(-1, Math.min(1, data[i] * factor));
  return out;
}

function applyFadeIn(data, samples) {
  const out = new Float32Array(data);
  const n = Math.min(samples, data.length);
  for (let i = 0; i < n; i++) out[i] *= i / n;
  return out;
}

function applyFadeOut(data, samples) {
  const out = new Float32Array(data);
  const n = Math.min(samples, data.length);
  const start = data.length - n;
  for (let i = 0; i < n; i++) out[start + i] *= 1 - i / n;
  return out;
}

function applyReverse(data) {
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[data.length - 1 - i];
  return out;
}

function applySpeed(data, rate) {
  if (rate === 1) return new Float32Array(data);
  const newLen = Math.floor(data.length / rate);
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const srcIdx = i * rate;
    const idx = Math.floor(srcIdx);
    const frac = srcIdx - idx;
    out[i] = idx + 1 < data.length ? data[idx] * (1 - frac) + data[idx + 1] * frac : data[idx] || 0;
  }
  return out;
}

function applyMute(data) {
  return new Float32Array(data.length);
}

function applyRobot(data, sampleRate) {
  const out = new Float32Array(data.length);
  const modFreq = 50;
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] * Math.sin(2 * Math.PI * modFreq * i / sampleRate);
  }
  return out;
}

function applyEcho(data, sampleRate, delay = 0.15, decay = 0.4) {
  const delaySamples = Math.floor(delay * sampleRate);
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] + (i >= delaySamples ? out[i - delaySamples] * decay : 0);
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}

// ─── Waveform drawing ───────────────────────────────────

function drawWaveform(canvas, data, color = '#58a6ff', selStart = -1, selEnd = -1) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!data || data.length === 0) return;

  const step = data.length / w;
  const mid = h / 2;

  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, w, h);

  // Center line
  ctx.strokeStyle = '#21262d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();

  // Waveform bars
  for (let i = 0; i < w; i++) {
    const idx = Math.floor(i * step);
    const end = Math.min(Math.floor((i + 1) * step), data.length);
    let min = 1, max = -1;
    for (let j = idx; j < end; j++) {
      if (data[j] < min) min = data[j];
      if (data[j] > max) max = data[j];
    }
    const y1 = mid + min * mid * 0.9;
    const y2 = mid + max * mid * 0.9;

    const sampleI = i / w;
    const inSelection = selStart >= 0 && selEnd >= 0 && sampleI >= selStart && sampleI <= selEnd;
    ctx.fillStyle = inSelection ? '#f0883e' : color;
    ctx.fillRect(i, y1, 1, Math.max(1, y2 - y1));
  }
}

function drawRuler(canvas, duration, pxPerSec) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#161b22';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#8b949e';
  ctx.font = '10px monospace';
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;

  const step = pxPerSec >= 100 ? 0.1 : pxPerSec >= 50 ? 0.25 : pxPerSec >= 20 ? 0.5 : 1;
  for (let t = 0; t <= duration; t += step) {
    const x = t * pxPerSec;
    const isMajor = Math.abs(t - Math.round(t)) < 0.001;
    ctx.beginPath();
    ctx.moveTo(x, isMajor ? 0 : h * 0.5);
    ctx.lineTo(x, h);
    ctx.stroke();
    if (isMajor) {
      ctx.fillText(`${t.toFixed(1)}s`, x + 3, 12);
    }
  }
}

// ─── Main Component ─────────────────────────────────────

const SAMPLE_RATE = 44100;

export default function SoundMixer({ defaultName, onSave, onClose, existingSounds }) {
  const [name, setName] = useState(defaultName || 'mix1');
  const [audioData, setAudioData] = useState(null);
  const [sampleRate, setSampleRate] = useState(SAMPLE_RATE);
  const [selStart, setSelStart] = useState(-1);
  const [selEnd, setSelEnd] = useState(-1);
  const [playheadPos, setPlayheadPos] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopMode, setLoopMode] = useState(false);
  const loopRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [clipboard, setClipboard] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const waveCanvasRef = useRef(null);
  const rulerCanvasRef = useRef(null);
  const timelineRef = useRef(null);
  const playSourceRef = useRef(null);
  const playStartRef = useRef(0);
  const playOffsetRef = useRef(0);
  const animFrameRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const fileInputRef = useRef(null);

  const duration = audioData ? audioData.length / sampleRate : 0;
  const pxPerSec = zoom;
  const totalWidth = Math.max(600, duration * pxPerSec);

  // ─── Escape to close ──────────────────────────────────
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ─── Draw waveform ────────────────────────────────────
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(600, totalWidth);
    canvas.height = 180;
    const selS = selStart >= 0 ? selStart : -1;
    const selE = selEnd >= 0 ? selEnd : -1;
    drawWaveform(canvas, audioData, '#58a6ff', selS, selE);
  }, [audioData, totalWidth, selStart, selEnd]);

  useEffect(() => {
    const canvas = rulerCanvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(600, totalWidth);
    canvas.height = 24;
    drawRuler(canvas, duration, pxPerSec);
  }, [duration, totalWidth, pxPerSec]);

  // ─── Undo/Redo helpers ────────────────────────────────
  const pushUndo = useCallback((data) => {
    setUndoStack(prev => [...prev.slice(-30), data]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setRedoStack(s => [...s, audioData]);
    setAudioData(prev);
    setSelStart(-1);
    setSelEnd(-1);
  }, [undoStack, audioData]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(s => s.slice(0, -1));
    setUndoStack(s => [...s, audioData]);
    setAudioData(next);
    setSelStart(-1);
    setSelEnd(-1);
  }, [redoStack, audioData]);

  // ─── Import audio ─────────────────────────────────────
  const importFile = useCallback(async (file) => {
    try {
      const buffer = await decodeAudioFile(file);
      const data = bufferToFloat32(buffer);
      if (audioData) {
        pushUndo(audioData);
        setAudioData(concatFloat(audioData, data));
      } else {
        setAudioData(data);
      }
      setSampleRate(buffer.sampleRate);
    } catch (e) {
      console.warn('Failed to decode audio:', e);
    }
  }, [audioData, pushUndo]);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) importFile(file);
    e.target.value = '';
  }, [importFile]);

  const importExisting = useCallback(async (url) => {
    try {
      const buffer = await decodeAudioUrl(url);
      const data = bufferToFloat32(buffer);
      if (audioData) {
        pushUndo(audioData);
        setAudioData(concatFloat(audioData, data));
      } else {
        setAudioData(data);
      }
      setSampleRate(buffer.sampleRate);
    } catch (e) {
      console.warn('Failed to decode audio:', e);
    }
  }, [audioData, pushUndo]);

  // ─── Recording ────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        await importExisting(url);
        URL.revokeObjectURL(url);
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      alert('Microphone access denied or not available.');
    }
  }, [importExisting]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
  }, []);

  // ─── Playback ─────────────────────────────────────────
  useEffect(() => { loopRef.current = loopMode; }, [loopMode]);

  const stopPlayback = useCallback(() => {
    if (playSourceRef.current) {
      try { playSourceRef.current.stop(); } catch {}
      playSourceRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(() => {
    if (!audioData) return;
    stopPlayback();

    const hasSel = selStart >= 0 && selEnd > selStart;
    const startSample = hasSel ? Math.floor(selStart * audioData.length) : 0;
    const endSample = hasSel ? Math.floor(selEnd * audioData.length) : audioData.length;
    const offset = startSample / sampleRate;
    const dur = (endSample - startSample) / sampleRate;

    const playOnce = () => {
      const ctx = getAudioCtx();
      const buffer = float32ToBuffer(audioData, sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0, offset, dur);
      playSourceRef.current = source;
      playStartRef.current = ctx.currentTime;
      playOffsetRef.current = offset;

      const tick = () => {
        const elapsed = ctx.currentTime - playStartRef.current;
        const pos = (playOffsetRef.current + elapsed) / duration;
        setPlayheadPos(Math.min(1, pos));
        if (elapsed < dur) {
          animFrameRef.current = requestAnimationFrame(tick);
        } else if (loopRef.current) {
          playOnce();
        } else {
          setIsPlaying(false);
          playSourceRef.current = null;
        }
      };
      animFrameRef.current = requestAnimationFrame(tick);

      source.onended = () => {
        if (playSourceRef.current === source && !loopRef.current) {
          setIsPlaying(false);
          playSourceRef.current = null;
        }
      };
    };

    setIsPlaying(true);
    playOnce();
  }, [audioData, sampleRate, duration, selStart, selEnd, stopPlayback]);

  useEffect(() => { return () => stopPlayback(); }, [stopPlayback]);

  // ─── Selection via mouse ──────────────────────────────
  const handleWaveMouseDown = useCallback((e) => {
    if (!audioData) return;
    const canvas = waveCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const startX = (e.clientX - rect.left) * scaleX;
    const startFrac = Math.max(0, Math.min(1, startX / canvas.width));

    const handleMove = (ev) => {
      const curX = (ev.clientX - rect.left) * scaleX;
      const curFrac = Math.max(0, Math.min(1, curX / canvas.width));
      setSelStart(Math.min(startFrac, curFrac));
      setSelEnd(Math.max(startFrac, curFrac));
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    setSelStart(startFrac);
    setSelEnd(startFrac);
    setPlayheadPos(startFrac);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [audioData]);

  // ─── Selection helpers ────────────────────────────────
  const hasSelection = selStart >= 0 && selEnd > selStart && selEnd - selStart > 0.001;
  const selSampleStart = hasSelection ? Math.floor(selStart * audioData?.length) : 0;
  const selSampleEnd = hasSelection ? Math.floor(selEnd * audioData?.length) : (audioData?.length || 0);

  const selectAll = useCallback(() => {
    if (!audioData) return;
    setSelStart(0);
    setSelEnd(1);
  }, [audioData]);

  // ─── Edit operations ──────────────────────────────────
  const applyToSelection = useCallback((fn) => {
    if (!audioData) return;
    pushUndo(audioData);
    const s = hasSelection ? selSampleStart : 0;
    const e = hasSelection ? selSampleEnd : audioData.length;
    const before = audioData.slice(0, s);
    const region = audioData.slice(s, e);
    const after = audioData.slice(e);
    const processed = fn(region);
    setAudioData(concatFloat(before, processed, after));
  }, [audioData, hasSelection, selSampleStart, selSampleEnd, pushUndo]);

  const applyToAll = useCallback((fn) => {
    if (!audioData) return;
    pushUndo(audioData);
    setAudioData(fn(audioData));
  }, [audioData, pushUndo]);

  const cutSelection = useCallback(() => {
    if (!audioData || !hasSelection) return;
    pushUndo(audioData);
    const region = audioData.slice(selSampleStart, selSampleEnd);
    setClipboard(region);
    const before = audioData.slice(0, selSampleStart);
    const after = audioData.slice(selSampleEnd);
    setAudioData(concatFloat(before, after));
    setSelStart(-1);
    setSelEnd(-1);
  }, [audioData, hasSelection, selSampleStart, selSampleEnd, pushUndo]);

  const copySelection = useCallback(() => {
    if (!audioData || !hasSelection) return;
    setClipboard(audioData.slice(selSampleStart, selSampleEnd));
  }, [audioData, hasSelection, selSampleStart, selSampleEnd]);

  const pasteAtCursor = useCallback(() => {
    if (!clipboard) return;
    pushUndo(audioData);
    if (!audioData) {
      setAudioData(new Float32Array(clipboard));
      return;
    }
    const insertAt = hasSelection ? selSampleStart : Math.floor(playheadPos * audioData.length);
    const before = audioData.slice(0, insertAt);
    const after = audioData.slice(insertAt);
    setAudioData(concatFloat(before, clipboard, after));
    setSelStart(-1);
    setSelEnd(-1);
  }, [clipboard, audioData, hasSelection, selSampleStart, playheadPos, pushUndo]);

  const deleteSelection = useCallback(() => {
    if (!audioData || !hasSelection) return;
    pushUndo(audioData);
    const before = audioData.slice(0, selSampleStart);
    const after = audioData.slice(selSampleEnd);
    const result = concatFloat(before, after);
    setAudioData(result.length > 0 ? result : null);
    setSelStart(-1);
    setSelEnd(-1);
  }, [audioData, hasSelection, selSampleStart, selSampleEnd, pushUndo]);

  // ─── Effects ──────────────────────────────────────────
  const louder = () => applyToSelection(d => applyGain(d, 1.5));
  const softer = () => applyToSelection(d => applyGain(d, 0.6));
  const mute = () => applyToSelection(applyMute);
  const fadeIn = () => applyToSelection(d => applyFadeIn(d, d.length));
  const fadeOut = () => applyToSelection(d => applyFadeOut(d, d.length));
  const reverse = () => applyToSelection(applyReverse);
  const faster = () => applyToSelection(d => applySpeed(d, 1.5));
  const slower = () => applyToSelection(d => applySpeed(d, 0.75));
  const robot = () => applyToSelection(d => applyRobot(d, sampleRate));
  const echo = () => applyToSelection(d => applyEcho(d, sampleRate));

  // ─── Save / Export ────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!audioData || !name.trim()) return;
    const buffer = float32ToBuffer(audioData, sampleRate);
    const offlineCtx = new OfflineAudioContext(1, buffer.length, sampleRate);
    const src = offlineCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(offlineCtx.destination);
    src.start();
    offlineCtx.startRendering().then(renderedBuffer => {
      const wav = encodeWav(renderedBuffer);
      const blob = new Blob([wav], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      onSave(name.trim(), url);
    });
  }, [audioData, name, sampleRate, onSave]);

  // ─── Selection time display ───────────────────────────
  const selDuration = hasSelection ? ((selSampleEnd - selSampleStart) / sampleRate) : 0;

  // ─── Existing sounds list ─────────────────────────────
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    if (showImport && (!existingSounds || existingSounds.length === 0)) {
      const t = setTimeout(() => setShowImport(false), 2500);
      return () => clearTimeout(t);
    }
  }, [showImport, existingSounds]);

  return (
    <div className="smx-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="smx-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="smx-header">
          <span>Sound Mixer</span>
          <input
            className="smx-name-input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
            placeholder="sound name"
          />
          <button className="smx-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Toolbar */}
        <div className="smx-toolbar">
          <div className="smx-tool-group">
            <button className="smx-btn" onClick={isPlaying ? stopPlayback : startPlayback} disabled={!audioData}>
              {isPlaying ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Play</>}
            </button>
            <button className="smx-btn" onClick={stopPlayback} disabled={!isPlaying}>
              <Square size={13} /> Stop
            </button>
            <button
              className={`smx-btn smx-loop-toggle ${loopMode ? 'active' : ''}`}
              onClick={() => setLoopMode(m => !m)}
              title={loopMode ? 'Loop: ON' : 'Loop: OFF'}
            >
              <Repeat size={13} />
            </button>
          </div>

          <div className="smx-tool-sep" />

          <div className="smx-tool-group">
            <button className="smx-btn" onClick={() => fileInputRef.current?.click()}>
              <Upload size={13} /> Import
            </button>
            <button
              className={`smx-btn ${isRecording ? 'recording' : ''}`}
              onClick={isRecording ? stopRecording : startRecording}
            >
              {isRecording ? <><MicOff size={13} /> Stop Rec</> : <><Mic size={13} /> Record</>}
            </button>
            <div style={{ position: 'relative' }}>
              <button className="smx-btn" onClick={() => setShowImport(!showImport)}>
                <Plus size={13} /> Add Sound
              </button>
              {showImport && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 10,
                  background: '#21262d', border: '1px solid #30363d', borderRadius: 6,
                  padding: 4, minWidth: 180, maxHeight: 240, overflowY: 'auto',
                }}>
                  {existingSounds?.length > 0 ? existingSounds.map(s => (
                    <button
                      key={s.id || s.name}
                      className="smx-btn"
                      style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 2 }}
                      onClick={() => { importExisting(s.audioUrl); setShowImport(false); }}
                    >
                      {s.name}
                    </button>
                  )) : (
                    <div style={{ padding: '8px 10px', color: '#8b949e', fontSize: '0.72rem', textAlign: 'center', animation: 'smxFadeMsg 2.5s ease forwards' }}>
                      No project sounds yet.<br />Upload or record a sound first.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="smx-tool-sep" />

          <div className="smx-tool-group">
            <button className="smx-btn" onClick={cutSelection} disabled={!hasSelection} title="Cut selection">
              <Scissors size={13} /> Cut
            </button>
            <button className="smx-btn" onClick={copySelection} disabled={!hasSelection} title="Copy selection">
              <Copy size={13} /> Copy
            </button>
            <button className="smx-btn" onClick={pasteAtCursor} disabled={!clipboard} title="Paste at cursor">
              <Clipboard size={13} /> Paste
            </button>
            <button className="smx-btn" onClick={deleteSelection} disabled={!hasSelection} title="Delete selection">
              <Trash2 size={13} /> Delete
            </button>
          </div>

          <div className="smx-tool-sep" />

          <div className="smx-tool-group">
            <button className="smx-btn" onClick={undo} disabled={undoStack.length === 0} title="Undo">
              <Undo2 size={13} />
            </button>
            <button className="smx-btn" onClick={redo} disabled={redoStack.length === 0} title="Redo">
              <Redo2 size={13} />
            </button>
          </div>

          <div className="smx-tool-sep" />

          <div className="smx-tool-group">
            <button className="smx-btn" onClick={() => setZoom(z => Math.min(400, z * 1.5))} title="Zoom in">
              <ZoomIn size={13} />
            </button>
            <button className="smx-btn" onClick={() => setZoom(z => Math.max(20, z / 1.5))} title="Zoom out">
              <ZoomOut size={13} />
            </button>
          </div>
        </div>

        {/* Effects bar */}
        <div className="smx-toolbar" style={{ borderBottom: '1px solid #21262d' }}>
          <div className="smx-tool-group">
            <button className="smx-btn" onClick={louder} disabled={!audioData}>Louder</button>
            <button className="smx-btn" onClick={softer} disabled={!audioData}>Softer</button>
            <button className="smx-btn" onClick={mute} disabled={!audioData}>
              <VolumeX size={13} /> Mute
            </button>
          </div>
          <div className="smx-tool-sep" />
          <div className="smx-tool-group">
            <button className="smx-btn" onClick={faster} disabled={!audioData}>Faster</button>
            <button className="smx-btn" onClick={slower} disabled={!audioData}>Slower</button>
          </div>
          <div className="smx-tool-sep" />
          <div className="smx-tool-group">
            <button className="smx-btn" onClick={fadeIn} disabled={!audioData}>Fade In</button>
            <button className="smx-btn" onClick={fadeOut} disabled={!audioData}>Fade Out</button>
          </div>
          <div className="smx-tool-sep" />
          <div className="smx-tool-group">
            <button className="smx-btn" onClick={reverse} disabled={!audioData}>Reverse</button>
            <button className="smx-btn" onClick={robot} disabled={!audioData}>Robot</button>
            <button className="smx-btn" onClick={echo} disabled={!audioData}>Echo</button>
          </div>
          <div className="smx-tool-sep" />
          <button className="smx-btn" onClick={selectAll} disabled={!audioData}>Select All</button>
        </div>

        {/* Waveform body */}
        <div className="smx-body">
          <div className="smx-timeline-area" ref={timelineRef}>
            {!audioData ? (
              <div className="smx-empty">
                <strong>No audio yet</strong>
                <span>Click <strong>Import</strong> to add a file, <strong>Record</strong> to capture from mic,</span>
                <span>or <strong>Add Sound</strong> to import an existing project sound.</span>
              </div>
            ) : (
              <>
                <div className="smx-timeline-ruler">
                  <canvas ref={rulerCanvasRef} />
                </div>
                <div className="smx-waveform-container" style={{ width: totalWidth }}>
                  <canvas
                    ref={waveCanvasRef}
                    className="smx-waveform-canvas"
                    onPointerDown={handleWaveMouseDown}
                    style={{ width: totalWidth, height: 180 }}
                  />
                  {hasSelection && (
                    <div
                      className="smx-selection"
                      style={{
                        left: `${selStart * 100}%`,
                        width: `${(selEnd - selStart) * 100}%`,
                      }}
                    />
                  )}
                  <div
                    className="smx-playhead"
                    style={{ left: `${playheadPos * 100}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Info bar */}
        <div className="smx-info-bar">
          <span>Duration: {duration.toFixed(2)}s</span>
          {hasSelection && <span>Selection: {selDuration.toFixed(2)}s</span>}
          <span>Rate: {sampleRate}Hz</span>
          <span>Zoom: {Math.round(zoom)}px/s</span>
          {clipboard && <span>Clipboard: {(clipboard.length / sampleRate).toFixed(2)}s</span>}
        </div>

        {/* Footer */}
        <div className="smx-footer">
          <button className="smx-cancel" onClick={onClose}>Cancel</button>
          <button className="smx-save" onClick={handleSave} disabled={!audioData || !name.trim()}>
            <Save size={14} /> Save Sound
          </button>
        </div>

        <input ref={fileInputRef} type="file" accept="audio/*" hidden onChange={handleFileUpload} />
      </div>
    </div>
  );
}

// ─── WAV encoder ────────────────────────────────────────

function encodeWav(audioBuffer) {
  const numChannels = 1;
  const sampleRate = audioBuffer.sampleRate;
  const data = audioBuffer.getChannelData(0);
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = data.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}
