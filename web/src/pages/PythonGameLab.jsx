import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Square, RotateCcw, ChevronDown, X, PanelLeftClose, PanelLeftOpen, Fullscreen, Shrink, Maximize2, Minimize2, HelpCircle, Save, Share2, FolderOpen, Trash2, Check, ArrowLeft, Plus } from 'lucide-react';
import { useLabExit } from '../features/labs/useLabExit';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { python, pythonLanguage } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { gameCompletionSource, signatureHelp } from '../labs/python-game/completions';
import { GameEngine } from '../labs/python-game/GameEngine';
import { AssetManager } from '../labs/python-game/AssetManager';
import { loadSkulpt, runPythonCode } from '../labs/python-game/skulptRunner';
import { examples } from '../labs/python-game/examples';
import SpritePanel from '../labs/python-game/SpritePanel';
import HelpPanel from '../labs/python-game/HelpPanel';
import './PythonGameLab.css';

const PROJECTS_KEY = 'stemplitude_pygame_projects';
const loadProjectsFromStorage = () => {
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]'); }
  catch { return []; }
};

const PythonGameLab = () => {
  const { exitLab } = useLabExit();
  const canvasRef = useRef(null);
  const editorContainerRef = useRef(null);
  const editorViewRef = useRef(null);
  const engineRef = useRef(null);
  const gameWrapperRef = useRef(null);
  const editorPanelRef = useRef(null);

  const [isRunning, setIsRunning] = useState(false);
  const [skulptReady, setSkulptReady] = useState(false);
  const [skulptLoading, setSkulptLoading] = useState(true);
  const [showExamples, setShowExamples] = useState(false);
  const [gameTitle, setGameTitle] = useState('My Game');
  const [currentExample, setCurrentExample] = useState('Catch the Star');
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [projectId, setProjectId] = useState(() => crypto.randomUUID());
  const [projectName, setProjectName] = useState('Untitled Project');
  const [showProjects, setShowProjects] = useState(false);
  const [savedProjects, setSavedProjects] = useState(loadProjectsFromStorage);
  const [shareStatus, setShareStatus] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);

  const assetManagerRef = useRef(new AssetManager());
  const [assetVersion, setAssetVersion] = useState(0);

  useEffect(() => {
    return assetManagerRef.current.onChange(() => setAssetVersion(v => v + 1));
  }, []);

  const customSprites = useMemo(() => assetManagerRef.current.list('sprite'), [assetVersion]);
  const customBackgrounds = useMemo(() => assetManagerRef.current.list('background'), [assetVersion]);
  const customSounds = useMemo(() => assetManagerRef.current.list('sound'), [assetVersion]);

  // Skulpt loader
  useEffect(() => {
    loadSkulpt()
      .then(() => { setSkulptReady(true); setSkulptLoading(false); })
      .catch(() => { setSkulptLoading(false); });
  }, []);

  // CodeMirror
  useEffect(() => {
    if (!editorContainerRef.current || editorViewRef.current) return;
    const defaultCode = examples.find(e => e.name === 'Catch the Star')?.code || examples[0].code;
    const gameCompletions = pythonLanguage.data.of({ autocomplete: gameCompletionSource });
    const state = EditorState.create({
      doc: defaultCode,
      extensions: [
        basicSetup,
        python(),
        gameCompletions,
        signatureHelp,
        oneDark,
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" },
          '.cm-content': { padding: '8px 0' },
          '.cm-gutters': { background: '#1e1e2e', border: 'none' },
        }),
      ],
    });
    editorViewRef.current = new EditorView({ state, parent: editorContainerRef.current });
    return () => { editorViewRef.current?.destroy(); editorViewRef.current = null; };
  }, []);

  // GameEngine
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = 600;
    canvas.height = 600;
    engineRef.current = new GameEngine(canvas, () => {}, (msg) => console.warn('[Game]', msg), assetManagerRef.current);
    engineRef.current.onTitleChange = (title) => setGameTitle(title);
    return () => { engineRef.current?.destroy(); engineRef.current = null; };
  }, []);

  // Engine reads directly from AssetManager — no sync needed

  // Canvas fullscreen
  const toggleCanvasFullscreen = useCallback(() => {
    if (!gameWrapperRef.current) return;
    if (!document.fullscreenElement) {
      gameWrapperRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsCanvasFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Editor fullscreen
  const toggleEditorFullscreen = useCallback(() => {
    if (!editorPanelRef.current) return;
    if (!document.fullscreenElement) {
      editorPanelRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      setIsEditorFullscreen(document.fullscreenElement === editorPanelRef.current);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Load shared project from URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#shared=')) {
      try {
        const encoded = decodeURIComponent(hash.slice(8));
        const code = decodeURIComponent(escape(atob(encoded)));
        if (editorViewRef.current && code) {
          editorViewRef.current.dispatch({
            changes: { from: 0, to: editorViewRef.current.state.doc.length, insert: code },
          });
          setProjectName('Shared Project');
          setProjectId(crypto.randomUUID());
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch (e) {
        console.warn('Failed to load shared project:', e);
      }
    }
  }, []);

  // Actions
  const handleRun = useCallback(() => {
    if (!skulptReady || !engineRef.current || !editorViewRef.current) return;
    engineRef.current.reset();
    setIsRunning(true);
    setGameTitle('My Game');

    const code = editorViewRef.current.state.doc.toString();
    runPythonCode(
      code,
      engineRef.current,
      () => {},
      (err) => { console.warn('[Game Error]', err); setIsRunning(false); }
    );
  }, [skulptReady]);

  const handleStop = useCallback(() => {
    if (engineRef.current) engineRef.current.stop();
    setIsRunning(false);
  }, []);

  const handleReset = useCallback(() => {
    handleStop();
    if (engineRef.current) engineRef.current.reset();
    setGameTitle('My Game');
  }, [handleStop]);

  const handleSaveProject = useCallback(() => {
    if (!editorViewRef.current) return;
    const code = editorViewRef.current.state.doc.toString();
    const now = new Date().toISOString();
    const projects = loadProjectsFromStorage();
    const idx = projects.findIndex(p => p.id === projectId);
    const project = { id: projectId, name: projectName, code, updatedAt: now,
      createdAt: idx >= 0 ? projects[idx].createdAt : now };
    if (idx >= 0) projects[idx] = project; else projects.unshift(project);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    setSavedProjects(projects);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(null), 1500);
  }, [projectId, projectName]);

  const handleLoadProject = useCallback((project) => {
    handleReset();
    if (editorViewRef.current) {
      editorViewRef.current.dispatch({
        changes: { from: 0, to: editorViewRef.current.state.doc.length, insert: project.code },
      });
    }
    setProjectId(project.id);
    setProjectName(project.name);
    setCurrentExample('');
    setShowProjects(false);
  }, [handleReset]);

  const handleDeleteProject = useCallback((id) => {
    const projects = loadProjectsFromStorage().filter(p => p.id !== id);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    setSavedProjects(projects);
  }, []);

  const handleShare = useCallback(() => {
    if (!editorViewRef.current) return;
    const code = editorViewRef.current.state.doc.toString();
    try {
      const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(code))));
      const url = `${window.location.origin}${window.location.pathname}#shared=${encoded}`;
      navigator.clipboard.writeText(url).then(() => {
        setShareStatus('copied');
        setTimeout(() => setShareStatus(null), 2000);
      }).catch(() => {
        setShareStatus('error');
        setTimeout(() => setShareStatus(null), 2000);
      });
    } catch (e) {
      console.warn('Failed to create share link:', e);
    }
  }, []);

  const loadExample = useCallback((example) => {
    handleReset();
    if (editorViewRef.current) {
      editorViewRef.current.dispatch({
        changes: { from: 0, to: editorViewRef.current.state.doc.length, insert: example.code },
      });
    }
    setCurrentExample(example.name);
    setProjectId(crypto.randomUUID());
    setProjectName(example.name);
    setShowExamples(false);
  }, [handleReset]);

  // Sprite panel callbacks — all go through AssetManager
  const am = assetManagerRef.current;

  const handleAddSprite = useCallback((sprite) => {
    am.register(sprite.name, 'sprite', sprite.source || 'created', {
      id: sprite.id, image: sprite.image, thumbnail: sprite.thumbnail,
      width: sprite.image?.width || 16, height: sprite.image?.height || 16,
      frames: sprite.frames, fps: sprite.fps,
    });
  }, [am]);

  const handleRemoveSprite = useCallback((id) => {
    const asset = am.list('sprite').find(a => a.id === id);
    if (asset) am.remove(asset.name);
  }, [am]);

  const handleRenameSprite = useCallback((id, newName) => {
    const asset = am.list('sprite').find(a => a.id === id);
    if (asset) am.rename(asset.name, newName);
  }, [am]);

  const handleAddBackground = useCallback((bg) => {
    am.register(bg.name, 'background', bg.source || 'upload', {
      id: bg.id, image: bg.image, thumbnail: bg.thumbnail,
      width: bg.image?.width, height: bg.image?.height,
    });
  }, [am]);

  const handleRemoveBackground = useCallback((id) => {
    const asset = am.list('background').find(a => a.id === id);
    if (asset) am.remove(asset.name);
    if (engineRef.current) engineRef.current.clearBackgroundImage();
  }, [am]);

  const handleRenameBackground = useCallback((id, newName) => {
    const asset = am.list('background').find(a => a.id === id);
    if (asset) am.rename(asset.name, newName);
  }, [am]);

  const handleAddSound = useCallback((snd) => {
    am.register(snd.name, 'sound', snd.source || 'upload', {
      id: snd.id, audioUrl: snd.audioUrl,
    });
  }, [am]);

  const handleRemoveSound = useCallback((id) => {
    const asset = am.list('sound').find(a => a.id === id);
    if (asset) am.remove(asset.name);
  }, [am]);

  const handleRenameSound = useCallback((id, newName) => {
    const asset = am.list('sound').find(a => a.id === id);
    if (asset) am.rename(asset.name, newName);
  }, [am]);

  const handleSelectBackground = useCallback((bg) => {
    if (!engineRef.current) return;
    if (bg) {
      engineRef.current.setBackgroundImage(bg.image);
    } else {
      engineRef.current.clearBackgroundImage();
    }
    engineRef.current._render();
  }, []);

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveProject();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleSaveProject]);

  // Click outside examples + Escape to close
  useEffect(() => {
    const handler = (e) => {
      if (showExamples && !e.target.closest('.pgl-examples-dropdown')) setShowExamples(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (showProjects) setShowProjects(false);
        if (showExamples) setShowExamples(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [showExamples, showProjects]);

  return (
    <div className="python-game-lab">
      {/* Top Bar */}
      <div className="pgl-topbar">
        <div className="pgl-controls-left">
          <div className="pgl-logo">
            <img src="/assets/python-logo.svg" alt="" aria-hidden className="pgl-logo-icon" />
            <span>Python Game Maker</span>
          </div>

          <div className="pgl-examples-dropdown">
            <button className="pgl-btn" onClick={() => setShowExamples(!showExamples)}>
              Examples <ChevronDown size={16} />
            </button>
            {showExamples && (
              <div className="pgl-examples-menu">
                {examples.map((ex, i) => (
                  <button
                    key={i}
                    className={`pgl-example-item ${currentExample === ex.name ? 'active' : ''}`}
                    onClick={() => loadExample(ex)}
                  >
                    <strong>{ex.name}</strong>
                    <span>{ex.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pgl-separator" />

          <button className="pgl-btn" onClick={() => setEditorCollapsed(!editorCollapsed)}>
            {editorCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            {editorCollapsed ? 'Show Code' : 'Hide Code'}
          </button>

          <button className="pgl-btn" onClick={() => setShowHelp(true)} title="Reference / Help">
            <HelpCircle size={16} /> Help
          </button>
        </div>

        <div className="pgl-controls-right">
          {skulptLoading && <span className="pgl-loading">Loading Python...</span>}
          <button type="button" className="pgl-exit-btn" onClick={exitLab}>
            <X size={18} /> Exit
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={`pgl-main ${editorCollapsed ? 'editor-collapsed' : ''}`}>
        {/* Code Editor Panel */}
        <div className={`pgl-editor-panel ${editorCollapsed ? 'collapsed' : ''}`} ref={editorPanelRef}>
          <div className="pgl-panel-header">
            <span>Code</span>
            <div className="pgl-panel-header-actions">
              <input
                className="pgl-project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                spellCheck={false}
                maxLength={40}
                title="Click to rename project"
              />
              <button className="pgl-btn pgl-btn-icon" onClick={handleSaveProject} title="Save project (Ctrl+S)">
                <Save size={14} />
              </button>
              {saveStatus && <span className="pgl-save-status">Saved!</span>}
              <button
                className={`pgl-btn pgl-btn-icon ${shareStatus === 'copied' ? 'pgl-btn-copied' : ''}`}
                onClick={handleShare}
                title={shareStatus === 'copied' ? 'Link copied!' : 'Copy share link'}
              >
                {shareStatus === 'copied' ? <Check size={14} /> : <Share2 size={14} />}
              </button>
              <button
                className="pgl-btn pgl-btn-icon"
                onClick={() => { setSavedProjects(loadProjectsFromStorage()); setShowProjects(true); }}
                title="My Projects"
              >
                <FolderOpen size={14} />
              </button>
              <button
                className="pgl-editor-fs-btn"
                onClick={toggleEditorFullscreen}
                title={isEditorFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen editor'}
              >
                {isEditorFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
            </div>
          </div>
          <div className="pgl-editor" ref={editorContainerRef} />
        </div>

        {/* Game + Sprite Panel */}
        <div className="pgl-game-panel">
          <div className="pgl-game-header">
            <div className="pgl-game-controls">
              <button onClick={handleRun} className="pgl-btn pgl-btn-run" disabled={!skulptReady || isRunning}>
                <Play size={16} /> Run
              </button>
              <button onClick={handleStop} className="pgl-btn pgl-btn-stop" disabled={!isRunning}>
                <Square size={16} /> Stop
              </button>
              <button onClick={handleReset} className="pgl-btn">
                <RotateCcw size={16} /> Reset
              </button>
            </div>
            <span className="pgl-game-title">{gameTitle}</span>
          </div>
          <div
            className={`pgl-canvas-wrapper ${isCanvasFullscreen ? 'fullscreen' : ''}`}
            ref={gameWrapperRef}
          >
            <canvas ref={canvasRef} className="pgl-canvas" />
            <button
              className="pgl-fullscreen-btn"
              onClick={toggleCanvasFullscreen}
              title={isCanvasFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            >
              {isCanvasFullscreen ? <Shrink size={18} /> : <Fullscreen size={18} />}
            </button>
          </div>

          <SpritePanel
            sprites={customSprites}
            backgrounds={customBackgrounds}
            sounds={customSounds}
            onAddSprite={handleAddSprite}
            onRemoveSprite={handleRemoveSprite}
            onRenameSprite={handleRenameSprite}
            onAddBackground={handleAddBackground}
            onRemoveBackground={handleRemoveBackground}
            onRenameBackground={handleRenameBackground}
            onSelectBackground={handleSelectBackground}
            onAddSound={handleAddSound}
            onRemoveSound={handleRemoveSound}
            onRenameSound={handleRenameSound}
          />
        </div>
      </div>

      {showProjects && (
        <div className="pgl-projects-screen">
          <div className="pgl-projects-topbar">
            <button className="pgl-projects-back" onClick={() => setShowProjects(false)}>
              <ArrowLeft size={20} />
              <span>Back to Editor</span>
            </button>
            <h2 className="pgl-projects-title">My Projects</h2>
            <button
              className="pgl-btn pgl-btn-new-project"
              onClick={() => {
                setProjectId(crypto.randomUUID());
                setProjectName('Untitled Project');
                if (editorViewRef.current) {
                  editorViewRef.current.dispatch({
                    changes: { from: 0, to: editorViewRef.current.state.doc.length, insert: '# New project\nimport game\n\ngame.title("My Game")\n\ngame.start()' },
                  });
                }
                setCurrentExample('');
                setShowProjects(false);
              }}
            >
              <Plus size={16} /> New Project
            </button>
          </div>
          <div className="pgl-projects-grid">
            {savedProjects.length === 0 ? (
              <div className="pgl-projects-empty">
                <FolderOpen size={48} />
                <h3>No saved projects yet</h3>
                <p>Click <strong>Save</strong> in the editor to save your current project, or start a new one.</p>
              </div>
            ) : (
              savedProjects.map((p) => (
                <div key={p.id} className={`pgl-project-card ${p.id === projectId ? 'active' : ''}`}>
                  <div className="pgl-project-info">
                    <span className="pgl-project-card-name">{p.name}</span>
                    <span className="pgl-project-date">
                      {new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="pgl-project-actions">
                    <button className="pgl-btn pgl-btn-open" onClick={() => handleLoadProject(p)}>Open</button>
                    <button className="pgl-project-delete" onClick={() => handleDeleteProject(p.id)} title="Delete project">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
    </div>
  );
};

export default PythonGameLab;
