import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Paintbrush, Upload, LayoutGrid, Image, X, Plus, Search, Film, Volume2, Mic, MicOff, Play as PlayIcon, Trash2, AudioLines } from 'lucide-react';
import { getSpriteNames, getBuiltInSprite, getSpriteInfo, getCategories, renderPixelArt } from './sprites';
import { getBgCategories, getBgNames, getBgDef, renderBg, renderBgThumb } from './backgrounds';
import PixelArtEditor from './PixelArtEditor';
import SoundMixer from './SoundMixer';
import './SpritePanel.css';

function nextName(prefix, existingNames) {
  let n = 1;
  while (existingNames.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

function GalleryModal({ thumbs, addedNames, onPick, onClose }) {
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const categories = useMemo(() => getCategories(), []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    let list = thumbs;
    if (activeCat !== 'all') list = list.filter(t => t.category === activeCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.category.includes(q));
    }
    return list;
  }, [thumbs, activeCat, search]);

  return (
    <div className="sp-gallery-overlay" onClick={onClose}>
      <div className="sp-gallery-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sp-gallery-header">
          <span>Sprite Gallery</span>
          <button className="sp-gallery-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="sp-gallery-search">
          <Search size={14} className="sp-search-icon" />
          <input
            type="text"
            placeholder="Search sprites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="sp-gallery-cats">
          <button
            className={`sp-cat-pill ${activeCat === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCat('all')}
          >
            All ({thumbs.length})
          </button>
          {categories.map(c => {
            const count = thumbs.filter(t => t.category === c.id).length;
            if (!count) return null;
            return (
              <button
                key={c.id}
                className={`sp-cat-pill ${activeCat === c.id ? 'active' : ''}`}
                onClick={() => setActiveCat(c.id)}
              >
                {c.name} ({count})
              </button>
            );
          })}
        </div>

        <div className="sp-gallery-grid">
          {filtered.length === 0 && (
            <div className="sp-gallery-empty">No sprites match your search.</div>
          )}
          {filtered.map(({ name, dataUrl, animated }) => {
            const added = addedNames.has(name);
            return (
              <button
                key={name}
                className={`sp-gallery-item ${added ? 'added' : ''}`}
                onClick={() => { if (!added) onPick(name); }}
                title={added ? `"${name}" already added` : `Add "${name}"`}
              >
                <img src={dataUrl} alt={name} />
                <span>{name}</span>
                {animated && <Film size={9} className="sp-gallery-anim" />}
                {added && <span className="sp-gallery-check">Added</span>}
                {!added && <Plus size={12} className="sp-gallery-plus" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BgGalleryModal({ addedNames, onPick, onClose }) {
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const categories = useMemo(() => getBgCategories(), []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const thumbs = useMemo(() => {
    return getBgNames().map(name => {
      const def = getBgDef(name);
      const canvas = renderBgThumb(name);
      return { name, dataUrl: canvas.toDataURL(), category: def.cat };
    });
  }, []);

  const filtered = useMemo(() => {
    let list = thumbs;
    if (activeCat !== 'all') list = list.filter(t => t.category === activeCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.category.includes(q));
    }
    return list;
  }, [thumbs, activeCat, search]);

  return (
    <div className="sp-gallery-overlay" onClick={onClose}>
      <div className="sp-gallery-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sp-gallery-header">
          <span>Background Gallery</span>
          <button className="sp-gallery-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="sp-gallery-search">
          <Search size={14} className="sp-search-icon" />
          <input
            type="text"
            placeholder="Search backgrounds..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="sp-gallery-cats">
          <button
            className={`sp-cat-pill ${activeCat === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCat('all')}
          >
            All ({thumbs.length})
          </button>
          {categories.map(c => {
            const count = thumbs.filter(t => t.category === c.id).length;
            if (!count) return null;
            return (
              <button
                key={c.id}
                className={`sp-cat-pill ${activeCat === c.id ? 'active' : ''}`}
                onClick={() => setActiveCat(c.id)}
              >
                {c.name} ({count})
              </button>
            );
          })}
        </div>

        <div className="sp-gallery-grid sp-bg-gallery-grid">
          {filtered.length === 0 && (
            <div className="sp-gallery-empty">No backgrounds match your search.</div>
          )}
          {filtered.map(({ name, dataUrl }) => {
            const added = addedNames.has(name);
            return (
              <button
                key={name}
                className={`sp-gallery-item sp-bg-gallery-item ${added ? 'added' : ''}`}
                onClick={() => { if (!added) onPick(name); }}
                title={added ? `"${name}" already added` : `Add "${name}"`}
              >
                <img src={dataUrl} alt={name} />
                <span>{name.replace(/_/g, ' ')}</span>
                {added && <span className="sp-gallery-check">Added</span>}
                {!added && <Plus size={12} className="sp-gallery-plus" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function SpritePanel({ sprites, backgrounds, sounds, onAddSprite, onRemoveSprite, onRenameSprite, onAddBackground, onRemoveBackground, onRenameBackground, onSelectBackground, onAddSound, onRemoveSound, onRenameSound }) {
  const [tab, setTab] = useState('sprites');
  const [showPainter, setShowPainter] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showBgGallery, setShowBgGallery] = useState(false);
  const [showBgPainter, setShowBgPainter] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [showFab, setShowFab] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const spriteUploadRef = useRef(null);
  const bgUploadRef = useRef(null);
  const soundUploadRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const playingAudioRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (showMixer) setShowMixer(false);
        else if (showBgPainter) setShowBgPainter(false);
        else if (showBgGallery) setShowBgGallery(false);
        else if (showFab) setShowFab(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showFab, showBgGallery, showBgPainter, showMixer]);

  const spriteNames = useMemo(() => new Set(sprites.map(s => s.name)), [sprites]);
  const bgNames = useMemo(() => new Set(backgrounds.map(b => b.name)), [backgrounds]);
  const soundNames = useMemo(() => new Set((sounds || []).map(s => s.name)), [sounds]);

  const builtInThumbs = useMemo(() => {
    const names = getSpriteNames();
    return names.map(name => {
      const data = getBuiltInSprite(name);
      const info = getSpriteInfo(name);
      const canvas = renderPixelArt(data, 3);
      return {
        name,
        dataUrl: canvas.toDataURL(),
        category: info?.category || 'other',
        animated: (info?.frameCount || 1) > 1,
      };
    });
  }, []);

  const defaultSpriteName = useMemo(() => nextName('sprite', spriteNames), [spriteNames]);
  const defaultBgName = useMemo(() => nextName('bg', bgNames), [bgNames]);

  const handleRename = useCallback((id, newName, type) => {
    const trimmed = newName.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!trimmed) return;
    const names = type === 'sprite' ? spriteNames : bgNames;
    if (names.has(trimmed)) return;
    if (type === 'sprite') onRenameSprite(id, trimmed);
    else onRenameBackground(id, trimmed);
  }, [spriteNames, bgNames, onRenameSprite, onRenameBackground]);

  const handlePaintSave = useCallback((name, data) => {
    if (spriteNames.has(name)) {
      alert(`Sprite "${name}" already exists. Choose a different name.`);
      return;
    }
    const preview = data.preview || data;
    const entry = {
      id: `sprite_${Date.now()}`,
      name,
      source: 'painted',
      thumbnail: preview.toDataURL(),
      image: preview,
    };
    if (data.frames && data.frames.length > 1) {
      entry.frames = data.frames;
      entry.fps = data.fps || 4;
    }
    onAddSprite(entry);
    setShowPainter(false);
    setShowFab(false);
  }, [spriteNames, onAddSprite]);

  const handleGalleryPick = useCallback((name) => {
    if (spriteNames.has(name)) return;
    const info = getSpriteInfo(name);
    const firstFrame = info.frames[0];
    const canvas = renderPixelArt(firstFrame, 1);
    const thumbCanvas = renderPixelArt(firstFrame, 3);
    const entry = {
      id: `sprite_${Date.now()}`,
      name,
      source: 'gallery',
      thumbnail: thumbCanvas.toDataURL(),
      image: canvas,
    };
    if (info.frameCount > 1) {
      entry.frames = info.frames.map(f => renderPixelArt(f, 1));
      entry.fps = info.fps || 4;
    }
    onAddSprite(entry);
    setShowGallery(false);
  }, [spriteNames, onAddSprite]);

  const handleBgGalleryPick = useCallback((name) => {
    if (bgNames.has(name)) return;
    const canvas = renderBg(name, 20);
    const thumbCanvas = renderBgThumb(name);
    onAddBackground({
      id: `bg_${Date.now()}`,
      name,
      source: 'gallery',
      thumbnail: thumbCanvas.toDataURL(),
      image: canvas,
    });
    setShowBgGallery(false);
  }, [bgNames, onAddBackground]);

  const handleBgPaintSave = useCallback((name, data) => {
    if (bgNames.has(name)) {
      alert(`Background "${name}" already exists. Choose a different name.`);
      return;
    }
    const preview = data.preview || data;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 80;
    thumbCanvas.height = 60;
    const tCtx = thumbCanvas.getContext('2d');
    tCtx.imageSmoothingEnabled = false;
    tCtx.drawImage(preview, 0, 0, 80, 60);
    onAddBackground({
      id: `bg_${Date.now()}`,
      name,
      source: 'created',
      thumbnail: thumbCanvas.toDataURL(),
      image: preview,
    });
    setShowBgPainter(false);
    setShowFab(false);
  }, [bgNames, onAddBackground]);

  const handleSpriteUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const autoName = nextName('sprite', spriteNames);
    const img = new window.Image();
    img.onload = () => {
      const thumb = document.createElement('canvas');
      const ts = 48;
      thumb.width = ts; thumb.height = ts;
      const tc = thumb.getContext('2d');
      tc.imageSmoothingEnabled = false;
      const scale = Math.min(ts / img.width, ts / img.height);
      const w = img.width * scale, h = img.height * scale;
      tc.drawImage(img, (ts - w) / 2, (ts - h) / 2, w, h);
      onAddSprite({
        id: `sprite_${Date.now()}`,
        name: autoName,
        source: 'uploaded',
        thumbnail: thumb.toDataURL(),
        image: img,
      });
    };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
    setShowFab(false);
  }, [spriteNames, onAddSprite]);

  const handleBgUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const autoName = nextName('bg', bgNames);
    const img = new window.Image();
    img.onload = () => {
      const thumb = document.createElement('canvas');
      thumb.width = 80; thumb.height = 60;
      const tc = thumb.getContext('2d');
      tc.drawImage(img, 0, 0, 80, 60);
      onAddBackground({
        id: `bg_${Date.now()}`,
        name: autoName,
        thumbnail: thumb.toDataURL(),
        image: img,
      });
    };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
    setShowFab(false);
  }, [bgNames, onAddBackground]);

  // ===== Sound handlers =====
  const handleSoundUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const autoName = nextName('sound', soundNames);
    const url = URL.createObjectURL(file);
    onAddSound?.({
      id: `sound_${Date.now()}`,
      name: autoName,
      source: 'uploaded',
      audioUrl: url,
    });
    e.target.value = '';
    setShowFab(false);
  }, [soundNames, onAddSound]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const autoName = nextName('sound', soundNames);
        onAddSound?.({
          id: `sound_${Date.now()}`,
          name: autoName,
          source: 'recorded',
          audioUrl: url,
        });
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setShowFab(false);
    } catch {
      alert('Microphone access denied or not available.');
    }
  }, [soundNames, onAddSound]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
  }, []);

  const handleMixerSave = useCallback((mixName, audioUrl) => {
    if (soundNames.has(mixName)) {
      alert(`Sound "${mixName}" already exists. Choose a different name.`);
      return;
    }
    onAddSound?.({
      id: `sound_${Date.now()}`,
      name: mixName,
      source: 'created',
      audioUrl,
    });
    setShowMixer(false);
  }, [soundNames, onAddSound]);

  const playPreview = useCallback((snd) => {
    if (playingAudioRef.current) {
      playingAudioRef.current.pause();
      playingAudioRef.current = null;
    }
    if (playingId === snd.id) { setPlayingId(null); return; }
    const audio = new Audio(snd.audioUrl);
    audio.volume = 0.6;
    audio.play().catch(() => {});
    audio.addEventListener('ended', () => { setPlayingId(null); playingAudioRef.current = null; });
    playingAudioRef.current = audio;
    setPlayingId(snd.id);
  }, [playingId]);

  const handleSoundRename = useCallback((id, newName) => {
    const trimmed = newName.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!trimmed || soundNames.has(trimmed)) return;
    onRenameSound?.(id, trimmed);
  }, [soundNames, onRenameSound]);

  return (
    <div className="sp-panel">
      {/* Tabs */}
      <div className="sp-tabs">
        <button className={`sp-tab ${tab === 'sprites' ? 'active' : ''}`} onClick={() => { setTab('sprites'); setShowGallery(false); }}>
          <LayoutGrid size={13} /> Sprites
          {sprites.length > 0 && <span className="sp-badge">{sprites.length}</span>}
        </button>
        <button className={`sp-tab ${tab === 'backgrounds' ? 'active' : ''}`} onClick={() => { setTab('backgrounds'); setShowGallery(false); }}>
          <Image size={13} /> Backgrounds
        </button>
        <button className={`sp-tab ${tab === 'sounds' ? 'active' : ''}`} onClick={() => { setTab('sounds'); setShowGallery(false); }}>
          <Volume2 size={13} /> Sounds
          {sounds?.length > 0 && <span className="sp-badge">{sounds.length}</span>}
        </button>
      </div>

      {/* Sprites Tab */}
      {tab === 'sprites' && (
        <div className="sp-content">
          <div className="sp-grid">
            {sprites.length === 0 && !showGallery && (
              <div className="sp-empty">
                No sprites yet.<br />Use the <strong>+</strong> button to paint, upload, or pick from the gallery.
                <br /><br />
                <em>Built-in sprites (player, enemy, star, etc.) are always available in code.</em>
              </div>
            )}
            {sprites.map(s => (
              <div key={s.id} className="sp-card">
                <img src={s.thumbnail} alt={s.name} className="sp-card-img" />
                <input
                  className="sp-card-name-input"
                  value={s.name}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                    handleRename(s.id, v, 'sprite');
                  }}
                  maxLength={20}
                  spellCheck={false}
                />
                <button className="sp-card-delete" onClick={() => onRemoveSprite(s.id)} title="Delete sprite">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <input ref={spriteUploadRef} type="file" accept="image/*" hidden onChange={handleSpriteUpload} />
        </div>
      )}

      {/* Backgrounds Tab */}
      {tab === 'backgrounds' && (
        <div className="sp-content">
          <div className="sp-grid">
            {backgrounds.length === 0 && (
              <div className="sp-empty">
                No background images.<br />Use the <strong>+</strong> button to upload one.
                <br /><br />
                <em>You can also use <code>game.background(&quot;#color&quot;)</code> in code.</em>
              </div>
            )}
            {backgrounds.map(bg => (
              <div
                key={bg.id}
                className="sp-bg-card"
                onClick={() => onSelectBackground(bg)}
                title={`Click to set as background`}
              >
                <img src={bg.thumbnail} alt={bg.name} className="sp-bg-img" />
                <input
                  className="sp-card-name-input"
                  value={bg.name}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                    handleRename(bg.id, v, 'background');
                  }}
                  onClick={(e) => e.stopPropagation()}
                  maxLength={20}
                  spellCheck={false}
                />
                <button
                  className="sp-card-delete"
                  onClick={(e) => { e.stopPropagation(); onRemoveBackground(bg.id); }}
                  title="Delete background"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <input ref={bgUploadRef} type="file" accept="image/*" hidden onChange={handleBgUpload} />
        </div>
      )}

      {/* Sounds Tab */}
      {tab === 'sounds' && (
        <div className="sp-content">
          {isRecording && (
            <div className="sp-recording-bar">
              <span className="sp-rec-dot" />
              <span>Recording...</span>
              <button className="sp-rec-stop" onClick={stopRecording}><MicOff size={14} /> Stop</button>
            </div>
          )}
          <div className="sp-grid sp-sound-grid">
            {(!sounds || sounds.length === 0) && !isRecording && (
              <div className="sp-empty">
                No sounds yet.<br />Use the <strong>+</strong> button to upload or record a sound.
                <br /><br />
                <em>Generate tones in code with <code>game.tone()</code> or <code>game.note("C4")</code></em>
              </div>
            )}
            {(sounds || []).map(snd => (
              <div key={snd.id} className="sp-sound-card">
                <button className="sp-sound-play" onClick={() => playPreview(snd)} title="Play">
                  {playingId === snd.id ? <Volume2 size={16} /> : <PlayIcon size={16} />}
                </button>
                <input
                  className="sp-card-name-input"
                  value={snd.name}
                  onChange={(e) => handleSoundRename(snd.id, e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  maxLength={20}
                  spellCheck={false}
                />
                <span className="sp-sound-src">{snd.source === 'recorded' ? 'mic' : 'file'}</span>
                <button className="sp-card-delete" onClick={() => onRemoveSound?.(snd.id)} title="Delete sound">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <input ref={soundUploadRef} type="file" accept="audio/*" hidden onChange={handleSoundUpload} />
        </div>
      )}

      {/* Floating Action Button */}
      <div className="sp-fab-wrap">
        {showFab && (
          <div className="sp-fab-menu">
            {tab === 'sprites' ? (
              <>
                <button className="sp-fab-item" onClick={() => { setShowPainter(true); setShowFab(false); }}>
                  <Paintbrush size={14} /> Paint
                </button>
                <button className="sp-fab-item" onClick={() => { spriteUploadRef.current?.click(); }}>
                  <Upload size={14} /> Upload
                </button>
                <button className="sp-fab-item" onClick={() => { setShowGallery(true); setShowFab(false); }}>
                  <LayoutGrid size={14} /> Gallery
                </button>
              </>
            ) : tab === 'backgrounds' ? (
              <>
                <button className="sp-fab-item" onClick={() => { setShowBgPainter(true); setShowFab(false); }}>
                  <Paintbrush size={14} /> Paint
                </button>
                <button className="sp-fab-item" onClick={() => { bgUploadRef.current?.click(); }}>
                  <Upload size={14} /> Upload
                </button>
                <button className="sp-fab-item" onClick={() => { setShowBgGallery(true); setShowFab(false); }}>
                  <LayoutGrid size={14} /> Gallery
                </button>
                <button className="sp-fab-item" onClick={() => { onSelectBackground(null); setShowFab(false); }}>
                  <X size={14} /> Clear BG
                </button>
              </>
            ) : (
              <>
                <button className="sp-fab-item" onClick={() => { setShowMixer(true); setShowFab(false); }}>
                  <AudioLines size={14} /> Mix
                </button>
                <button className="sp-fab-item" onClick={() => { soundUploadRef.current?.click(); }}>
                  <Upload size={14} /> Upload
                </button>
                <button className="sp-fab-item" onClick={() => { startRecording(); }}>
                  <Mic size={14} /> Record
                </button>
              </>
            )}
          </div>
        )}
        <button className={`sp-fab ${showFab ? 'open' : ''}`} onClick={() => setShowFab(!showFab)} title="Add sprite or background">
          <Plus size={20} />
        </button>
      </div>

      {showGallery && (
        <GalleryModal
          thumbs={builtInThumbs}
          addedNames={spriteNames}
          onPick={handleGalleryPick}
          onClose={() => setShowGallery(false)}
        />
      )}

      {showBgGallery && (
        <BgGalleryModal
          addedNames={bgNames}
          onPick={handleBgGalleryPick}
          onClose={() => setShowBgGallery(false)}
        />
      )}

      {showPainter && (
        <PixelArtEditor
          defaultName={defaultSpriteName}
          onSave={handlePaintSave}
          onClose={() => setShowPainter(false)}
        />
      )}

      {showBgPainter && (
        <PixelArtEditor
          defaultName={defaultBgName}
          mode="background"
          onSave={handleBgPaintSave}
          onClose={() => setShowBgPainter(false)}
        />
      )}

      {showMixer && (
        <SoundMixer
          defaultName={nextName('mix', soundNames)}
          existingSounds={sounds}
          onSave={handleMixerSave}
          onClose={() => setShowMixer(false)}
        />
      )}
    </div>
  );
}
