import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Play, Square, RotateCcw, X, Puzzle, Code, Fullscreen, Shrink, HelpCircle, Save, FolderOpen, Trash2, ArrowLeft, Plus } from 'lucide-react';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { pythonGenerator } from 'blockly/python';
import { registerBlocks, generateCode } from '../labs/game-maker/blocks';
import { toolbox } from '../labs/game-maker/toolbox';
import { GameEngine } from '../labs/python-game/GameEngine';
import { AssetManager } from '../labs/python-game/AssetManager';
import { loadSkulpt, runPythonCode } from '../labs/python-game/skulptRunner';
import SpritePanel from '../labs/python-game/SpritePanel';
import './GameMakerLab.css';

const darkTheme = Blockly.Theme.defineTheme('gameMakerDark', {
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#1e2030',
    toolboxBackgroundColour: '#141620',
    toolboxForegroundColour: '#e0e0e0',
    flyoutBackgroundColour: '#1a1d2e',
    flyoutForegroundColour: '#e0e0e0',
    flyoutOpacity: 0.97,
    scrollbarColour: '#4a4f62',
    scrollbarOpacity: 0.6,
    insertionMarkerColour: '#a78bfa',
    insertionMarkerOpacity: 0.5,
  },
  fontStyle: {
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    weight: '500',
    size: 12,
  },
});

const PROJECTS_KEY = 'stemplitude_gamemaker_projects';
const loadProjectsFromStorage = () => {
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]'); }
  catch { return []; }
};

let blocksRegistered = false;

const GameMakerLab = () => {
  const blocklyDiv = useRef(null);
  const workspaceRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const gameWrapperRef = useRef(null);

  const [isRunning, setIsRunning] = useState(false);
  const [skulptReady, setSkulptReady] = useState(false);
  const [skulptLoading, setSkulptLoading] = useState(true);
  const [gameTitle, setGameTitle] = useState('My Game');
  const [viewMode, setViewMode] = useState('blocks');
  const [generatedCode, setGeneratedCode] = useState('');
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [projectId, setProjectId] = useState(() => crypto.randomUUID());
  const [projectName, setProjectName] = useState('Untitled Project');
  const [showProjects, setShowProjects] = useState(false);
  const [savedProjects, setSavedProjects] = useState(loadProjectsFromStorage);
  const [saveStatus, setSaveStatus] = useState(null);

  const assetManagerRef = useRef(new AssetManager());
  const [assetVersion, setAssetVersion] = useState(0);

  useEffect(() => {
    return assetManagerRef.current.onChange(() => setAssetVersion(v => v + 1));
  }, []);

  const customSprites = useMemo(() => assetManagerRef.current.list('sprite'), [assetVersion]);
  const customBackgrounds = useMemo(() => assetManagerRef.current.list('background'), [assetVersion]);
  const customSounds = useMemo(() => assetManagerRef.current.list('sound'), [assetVersion]);

  useEffect(() => {
    loadSkulpt()
      .then(() => { setSkulptReady(true); setSkulptLoading(false); })
      .catch(() => { setSkulptLoading(false); });
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = 600;
    canvas.height = 600;
    engineRef.current = new GameEngine(canvas, () => {}, (msg) => console.warn('[Game]', msg), assetManagerRef.current);
    engineRef.current.onTitleChange = (title) => setGameTitle(title);
    return () => { engineRef.current?.destroy(); engineRef.current = null; };
  }, []);

  useEffect(() => {
    if (!blocklyDiv.current || workspaceRef.current) return;

    if (!blocksRegistered) {
      registerBlocks();
      blocksRegistered = true;
    }

    const workspace = Blockly.inject(blocklyDiv.current, {
      toolbox,
      theme: darkTheme,
      renderer: 'zelos',
      grid: { spacing: 25, length: 3, colour: '#2a2f3a', snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.85, maxScale: 2, minScale: 0.3 },
      trashcan: true,
      move: { scrollbars: true, drag: true, wheel: true },
    });
    workspaceRef.current = workspace;

    const updateCode = () => {
      try {
        const code = generateCode(workspace);
        setGeneratedCode(code);
      } catch (e) {
        console.warn('Code gen error:', e);
      }
    };
    workspace.addChangeListener(updateCode);
    updateCode();

    return () => {
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (workspaceRef.current && viewMode === 'blocks') {
      setTimeout(() => Blockly.svgResize(workspaceRef.current), 50);
    }
  }, [viewMode]);

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

  const handleRun = useCallback(() => {
    if (!skulptReady || !engineRef.current || !workspaceRef.current) return;
    engineRef.current.reset();
    setIsRunning(true);
    setGameTitle('My Game');

    const code = generateCode(workspaceRef.current);
    setGeneratedCode(code);
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
    if (!workspaceRef.current) return;
    const state = Blockly.serialization.workspaces.save(workspaceRef.current);
    const now = new Date().toISOString();
    const projects = loadProjectsFromStorage();
    const idx = projects.findIndex(p => p.id === projectId);
    const project = { id: projectId, name: projectName, workspace: state, updatedAt: now,
      createdAt: idx >= 0 ? projects[idx].createdAt : now };
    if (idx >= 0) projects[idx] = project; else projects.unshift(project);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    setSavedProjects(projects);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(null), 1500);
  }, [projectId, projectName]);

  const handleLoadProject = useCallback((project) => {
    handleReset();
    if (workspaceRef.current && project.workspace) {
      workspaceRef.current.clear();
      Blockly.serialization.workspaces.load(project.workspace, workspaceRef.current);
    }
    setProjectId(project.id);
    setProjectName(project.name);
    setShowProjects(false);
  }, [handleReset]);

  const handleDeleteProject = useCallback((id) => {
    const projects = loadProjectsFromStorage().filter(p => p.id !== id);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    setSavedProjects(projects);
  }, []);

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
    am.register(snd.name, 'sound', snd.source || 'upload', { id: snd.id, audioUrl: snd.audioUrl });
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
    if (bg) engineRef.current.setBackgroundImage(bg.image);
    else engineRef.current.clearBackgroundImage();
    engineRef.current._render();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveProject();
      }
      if (e.key === 'Escape') {
        if (showProjects) setShowProjects(false);
        if (showHelp) setShowHelp(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleSaveProject, showProjects, showHelp]);

  return (
    <div className="game-maker-lab">
      {/* Top Bar */}
      <div className="gml-topbar">
        <div className="gml-controls-left">
          <div className="gml-logo">
            <Puzzle size={20} />
            <span>Game Maker</span>
          </div>

          <div className="gml-view-toggle">
            <button
              className={`gml-toggle-btn ${viewMode === 'blocks' ? 'active' : ''}`}
              onClick={() => setViewMode('blocks')}
            >
              <Puzzle size={14} /> Blocks
            </button>
            <button
              className={`gml-toggle-btn ${viewMode === 'code' ? 'active' : ''}`}
              onClick={() => setViewMode('code')}
            >
              <Code size={14} /> Code
            </button>
          </div>

          <div className="gml-separator" />

          <button className="gml-btn" onClick={() => setShowHelp(!showHelp)} title="Help">
            <HelpCircle size={16} /> Help
          </button>
        </div>

        <div className="gml-controls-right">
          {skulptLoading && <span className="gml-loading">Loading Python...</span>}
          <Link to="/playground" className="gml-exit-btn">
            <X size={18} /> Exit
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="gml-main">
        {/* Editor Panel */}
        <div className="gml-editor-panel">
          <div className="gml-panel-header">
            <span>{viewMode === 'blocks' ? 'Blocks' : 'Generated Python'}</span>
            <div className="gml-panel-header-actions">
              <input
                className="gml-project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                spellCheck={false}
                maxLength={40}
                title="Click to rename project"
              />
              <button className="gml-btn gml-btn-icon" onClick={handleSaveProject} title="Save project (Ctrl+S)">
                <Save size={14} />
              </button>
              {saveStatus && <span className="gml-save-status">Saved!</span>}
              <button
                className="gml-btn gml-btn-icon"
                onClick={() => { setSavedProjects(loadProjectsFromStorage()); setShowProjects(true); }}
                title="My Projects"
              >
                <FolderOpen size={14} />
              </button>
            </div>
          </div>

          <div className="gml-workspace-area">
            <div
              ref={blocklyDiv}
              className="gml-blockly"
              style={{ display: viewMode === 'blocks' ? 'block' : 'none' }}
            />
            {viewMode === 'code' && (
              <pre className="gml-code-view">{generatedCode}</pre>
            )}
          </div>
        </div>

        {/* Game Panel */}
        <div className="gml-game-panel">
          <div className="gml-game-header">
            <div className="gml-game-controls">
              <button onClick={handleRun} className="gml-btn gml-btn-run" disabled={!skulptReady || isRunning}>
                <Play size={16} /> Run
              </button>
              <button onClick={handleStop} className="gml-btn gml-btn-stop" disabled={!isRunning}>
                <Square size={16} /> Stop
              </button>
              <button onClick={handleReset} className="gml-btn">
                <RotateCcw size={16} /> Reset
              </button>
            </div>
            <span className="gml-game-title">{gameTitle}</span>
          </div>
          <div
            className={`gml-canvas-wrapper ${isCanvasFullscreen ? 'fullscreen' : ''}`}
            ref={gameWrapperRef}
          >
            <canvas ref={canvasRef} className="gml-canvas" />
            <button
              className="gml-fullscreen-btn"
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

      {/* Projects Screen */}
      {showProjects && (
        <div className="gml-projects-screen">
          <div className="gml-projects-topbar">
            <button className="gml-projects-back" onClick={() => setShowProjects(false)}>
              <ArrowLeft size={20} /> <span>Back</span>
            </button>
            <h2 className="gml-projects-title">My Projects</h2>
            <button
              className="gml-btn gml-btn-new"
              onClick={() => {
                setProjectId(crypto.randomUUID());
                setProjectName('Untitled Project');
                if (workspaceRef.current) workspaceRef.current.clear();
                setShowProjects(false);
              }}
            >
              <Plus size={16} /> New Project
            </button>
          </div>
          <div className="gml-projects-grid">
            {savedProjects.length === 0 ? (
              <div className="gml-projects-empty">
                <FolderOpen size={48} />
                <h3>No saved projects yet</h3>
                <p>Click Save in the editor to save your current project.</p>
              </div>
            ) : (
              savedProjects.map((p) => (
                <div key={p.id} className={`gml-project-card ${p.id === projectId ? 'active' : ''}`}>
                  <div className="gml-project-info">
                    <span className="gml-project-card-name">{p.name}</span>
                    <span className="gml-project-date">
                      {new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="gml-project-actions">
                    <button className="gml-btn gml-btn-open" onClick={() => handleLoadProject(p)}>Open</button>
                    <button className="gml-project-delete" onClick={() => handleDeleteProject(p.id)} title="Delete project">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Help Overlay */}
      {showHelp && (
        <div className="gml-help-overlay" onClick={() => setShowHelp(false)}>
          <div className="gml-help-modal" onClick={e => e.stopPropagation()}>
            <div className="gml-help-header">
              <span>Game Maker — Quick Reference</span>
              <button className="gml-help-close" onClick={() => setShowHelp(false)}><X size={18} /></button>
            </div>
            <div className="gml-help-body">
              <h4>Getting Started</h4>
              <ol>
                <li>Drag blocks from the left panel onto the workspace</li>
                <li>Use <strong>Setup</strong> blocks to set title and background</li>
                <li>Create game objects with <strong>Objects</strong> blocks (put them in "set variable to")</li>
                <li>Use the <strong>Every Frame</strong> block to add game logic that runs continuously</li>
                <li>Click <strong>Run</strong> to see your game!</li>
              </ol>
              <h4>Tips</h4>
              <ul>
                <li>Switch to <strong>Code</strong> view to see the Python your blocks generate</li>
                <li>Use <strong>Variables</strong> to name your game objects (player, enemy, etc.)</li>
                <li>Put <strong>key pressed?</strong> inside <strong>if</strong> blocks to handle input</li>
                <li>Use <strong>touches?</strong> to detect collisions between objects</li>
                <li>Press <strong>Ctrl+S</strong> to save your project</li>
              </ul>
              <h4>Block Categories</h4>
              <ul>
                <li><strong>Events</strong> — Every Frame (game loop)</li>
                <li><strong>Setup</strong> — Title, background color</li>
                <li><strong>Objects</strong> — Create rectangles, circles, text, sprites</li>
                <li><strong>Motion</strong> — Move objects, keep inside screen</li>
                <li><strong>Looks</strong> — Set properties, speech bubbles, effects</li>
                <li><strong>Sensing</strong> — Keyboard, mouse, collision detection</li>
                <li><strong>Sound</strong> — Play tones and notes</li>
                <li><strong>Logic / Loops / Math / Variables</strong> — Standard programming blocks</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameMakerLab;
