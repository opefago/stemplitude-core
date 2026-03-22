import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Tippy from '@tippyjs/react';
import { Play, Square, RotateCcw, X, Puzzle, Code, Fullscreen, Shrink, HelpCircle, Save, FolderOpen, Trash2, ArrowLeft, Plus, Upload, Mic, AudioLines, Grid3x3 } from 'lucide-react';
import { useLabExit } from '../features/labs/useLabExit';
import * as Blockly from 'blockly';
import { pythonGenerator } from 'blockly/python';
import { registerBlocks, generateCode } from '../labs/game-maker/blocks';
import { toolbox } from '../labs/game-maker/toolbox';
import { GameEngine } from '../labs/python-game/GameEngine';
import { AssetManager } from '../labs/python-game/AssetManager';
import { loadSkulpt, runPythonCode } from '../labs/python-game/skulptRunner';
import SpritePanel from '../labs/python-game/SpritePanel';
import SoundMixer from '../labs/python-game/SoundMixer';
import { getSpriteNames, getSpriteInfo, renderPixelArt } from '../labs/python-game/sprites';
import 'tippy.js/animations/shift-away.css';
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

const tipProps = {
  theme: 'gml-dark',
  animation: 'shift-away',
  arrow: true,
  delay: [400, 0],
  duration: [200, 150],
};

const PROJECTS_KEY = 'stemplitude_gamemaker_projects';
const loadProjectsFromStorage = () => {
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]'); }
  catch { return []; }
};

let blocksRegistered = false;

function createBuiltInSpriteEntry(name) {
  const info = getSpriteInfo(name);
  if (!info) return null;

  const firstFrame = info.frames[0];
  const image = renderPixelArt(firstFrame, 1);
  const thumbnail = renderPixelArt(firstFrame, 3).toDataURL();
  const entry = {
    id: `builtin_sprite_${name}`,
    name,
    source: 'gallery',
    image,
    thumbnail,
    width: image.width,
    height: image.height,
  };

  if (info.frameCount > 1) {
    entry.frames = info.frames.map(frame => renderPixelArt(frame, 1));
    entry.fps = info.fps || 4;
  }

  return entry;
}

function createSeededAssetManager() {
  const assetManager = new AssetManager();
  const playerSprite = createBuiltInSpriteEntry('player');
  if (playerSprite) {
    assetManager.register(playerSprite.name, 'sprite', playerSprite.source, playerSprite);
  }
  return assetManager;
}

function resetAssetManager(assetManager) {
  assetManager.clear();
  const playerSprite = createBuiltInSpriteEntry('player');
  if (playerSprite) {
    assetManager.register(playerSprite.name, 'sprite', playerSprite.source, playerSprite);
  }
}

function imageToDataUrl(image) {
  if (!image) return null;
  if (typeof image.toDataURL === 'function') return image.toDataURL();

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width || 0;
  canvas.height = image.naturalHeight || image.height || 0;
  if (!canvas.width || !canvas.height) return null;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  return canvas.toDataURL();
}

function serializeAssets(assetManager) {
  return assetManager.list().map((asset) => ({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    source: asset.source,
    thumbnail: asset.thumbnail || null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    fps: asset.fps ?? null,
    audioUrl: asset.audioUrl || null,
    imageDataUrl: imageToDataUrl(asset.image),
    frameDataUrls: Array.isArray(asset.frames) ? asset.frames.map(imageToDataUrl).filter(Boolean) : [],
  }));
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    if (!dataUrl) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function restoreAssets(assetManager, assets) {
  resetAssetManager(assetManager);
  if (!Array.isArray(assets)) return;

  for (const asset of assets) {
    if (!asset?.name || !asset?.type) continue;
    if (asset.name === 'player' && assetManager.has('player')) continue;

    const entry = {
      id: asset.id,
      thumbnail: asset.thumbnail || null,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
      fps: asset.fps ?? undefined,
      audioUrl: asset.audioUrl || undefined,
    };

    if (asset.type === 'sprite' || asset.type === 'background') {
      entry.image = await loadImageFromDataUrl(asset.imageDataUrl);
    }
    if (asset.type === 'sprite' && Array.isArray(asset.frameDataUrls) && asset.frameDataUrls.length > 0) {
      entry.frames = (await Promise.all(asset.frameDataUrls.map(loadImageFromDataUrl))).filter(Boolean);
    }

    assetManager.register(asset.name, asset.type, asset.source || 'created', entry);
  }
}

function loadStarterBlocks(workspace) {
  if (!workspace) return;

  const getOrCreateVariable = (name) => {
    const variableMap = workspace.getVariableMap();
    const existing = variableMap.getAllVariables().find((variable) => variable.name === name);
    return existing || variableMap.createVariable(name);
  };

  const makeBlock = (type, x, y) => {
    const block = workspace.newBlock(type);
    block.initSvg?.();
    block.render?.();
    block.moveBy(x, y);
    return block;
  };

  getOrCreateVariable('Player');
  makeBlock('game_on_start', 40, 40);
  makeBlock('game_every_frame', 40, 220);
}

const GameMakerLab = () => {
  const { exitLab } = useLabExit();
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
  const [isGridVisible, setIsGridVisible] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const consoleLogsRef = useRef([]);

  const [projectId, setProjectId] = useState(() => crypto.randomUUID());
  const [projectName, setProjectName] = useState('Untitled Project');
  const [showProjects, setShowProjects] = useState(false);
  const [savedProjects, setSavedProjects] = useState(loadProjectsFromStorage);
  const [saveStatus, setSaveStatus] = useState(null);

  const [promptDialog, setPromptDialog] = useState(null);
  const promptInputRef = useRef(null);

  const [soundAddDialog, setSoundAddDialog] = useState(null);
  const soundFileRef = useRef(null);
  const soundAddCallbackRef = useRef(null);
  const [spriteAddDialog, setSpriteAddDialog] = useState(null);
  const spriteAddCallbackRef = useRef(null);
  const bgAddCallbackRef = useRef(null);
  const recorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showMixerOverlay, setShowMixerOverlay] = useState(false);

  const assetManagerRef = useRef(null);
  if (!assetManagerRef.current) {
    assetManagerRef.current = createSeededAssetManager();
  }
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
    if (!engineRef.current) return;
    engineRef.current.gridVisible = isGridVisible;
    engineRef.current._render();
  }, [isGridVisible]);

  useEffect(() => {
    Blockly.dialog.setPrompt((message, defaultValue, callback) => {
      setPromptDialog({ message, defaultValue, callback });
    });
  }, []);

  useEffect(() => {
    if (promptDialog && promptInputRef.current) {
      promptInputRef.current.focus();
      promptInputRef.current.select();
    }
  }, [promptDialog]);

  const handlePromptOk = useCallback(() => {
    if (!promptDialog) return;
    const value = promptInputRef.current?.value ?? '';
    promptDialog.callback(value);
    setPromptDialog(null);
  }, [promptDialog]);

  const handlePromptCancel = useCallback(() => {
    if (!promptDialog) return;
    promptDialog.callback(null);
    setPromptDialog(null);
  }, [promptDialog]);

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

    workspace.registerToolboxCategoryCallback('GM_PROCEDURES', function(ws) {
      const xmlList = [];

      const defBlock = Blockly.utils.xml.createElement('block');
      defBlock.setAttribute('type', 'procedures_defnoreturn');
      const defMutation = Blockly.utils.xml.createElement('mutation');
      const defName = Blockly.utils.xml.createElement('field');
      defName.setAttribute('name', 'NAME');
      defName.textContent = 'do something';
      defBlock.appendChild(defName);
      xmlList.push(defBlock);

      const procedures = Blockly.Procedures.allProcedures(ws);
      for (const proc of procedures[0]) {
        const callBlock = Blockly.utils.xml.createElement('block');
        callBlock.setAttribute('type', 'procedures_callnoreturn');
        callBlock.setAttribute('gap', '16');
        const mutation = Blockly.utils.xml.createElement('mutation');
        mutation.setAttribute('name', proc[0]);
        for (const a of proc[1]) {
          const arg = Blockly.utils.xml.createElement('arg');
          arg.setAttribute('name', a);
          mutation.appendChild(arg);
        }
        callBlock.appendChild(mutation);
        xmlList.push(callBlock);
      }
      for (const proc of procedures[1]) {
        const callBlock = Blockly.utils.xml.createElement('block');
        callBlock.setAttribute('type', 'procedures_callreturn');
        callBlock.setAttribute('gap', '16');
        const mutation = Blockly.utils.xml.createElement('mutation');
        mutation.setAttribute('name', proc[0]);
        for (const a of proc[1]) {
          const arg = Blockly.utils.xml.createElement('arg');
          arg.setAttribute('name', a);
          mutation.appendChild(arg);
        }
        callBlock.appendChild(mutation);
        xmlList.push(callBlock);
      }

      const sep = Blockly.utils.xml.createElement('sep');
      sep.setAttribute('gap', '24');
      xmlList.push(sep);
      const retBlock = Blockly.utils.xml.createElement('block');
      retBlock.setAttribute('type', 'gm_return');
      xmlList.push(retBlock);

      return xmlList;
    });

    loadStarterBlocks(workspace);

    workspace._getSoundNames = () =>
      assetManagerRef.current.list('sound').map(s => s.name);

    workspace._onAddSound = (callback) => {
      soundAddCallbackRef.current = callback;
      setSoundAddDialog(true);
    };

    workspace._getSpriteNames = () =>
      assetManagerRef.current.list('sprite').map(s => s.name);

    workspace._onAddSprite = (callback) => {
      spriteAddCallbackRef.current = callback;
      setSpriteAddDialog(true);
    };

    workspace._getBackgroundNames = () =>
      assetManagerRef.current.list('background').map(b => b.name);

    workspace._onAddBackground = (callback) => {
      bgAddCallbackRef.current = callback;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) { bgAddCallbackRef.current?.(null); bgAddCallbackRef.current = null; return; }
        const img = new Image();
        img.onload = () => {
          const mgr = assetManagerRef.current;
          const existing = new Set(mgr.list('background').map(b => b.name));
          let n = 1; while (existing.has(`bg${n}`)) n++;
          const autoName = `bg${n}`;
          const canvas = document.createElement('canvas');
          canvas.width = img.width; canvas.height = img.height;
          canvas.getContext('2d').drawImage(img, 0, 0);
          mgr.register(autoName, 'background', 'upload', {
            id: `bg_${Date.now()}`, image: img, thumbnail: canvas.toDataURL(),
            width: img.width, height: img.height,
          });
          bgAddCallbackRef.current?.(autoName);
          bgAddCallbackRef.current = null;
        };
        img.src = URL.createObjectURL(file);
      };
      input.click();
    };

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

  const addConsoleEntry = useCallback((text, type = 'log') => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = { text: String(text), type, time };
    consoleLogsRef.current = [...consoleLogsRef.current, entry];
    setConsoleLogs(consoleLogsRef.current);
  }, []);

  const handleRun = useCallback(() => {
    if (!skulptReady || !engineRef.current || !workspaceRef.current) return;
    engineRef.current.reset();
    consoleLogsRef.current = [];
    setConsoleLogs([]);
    setIsRunning(true);
    setGameTitle('My Game');

    engineRef.current.onRestart = () => {
      setTimeout(() => handleRun(), 50);
    };

    const code = generateCode(workspaceRef.current);
    setGeneratedCode(code);
    runPythonCode(
      code,
      engineRef.current,
      (text) => { if (text && text.trim()) addConsoleEntry(text.trim()); },
      (err) => {
        console.warn('[Game Error]', err);
        addConsoleEntry(String(err), 'error');
        setIsRunning(false);
      }
    );
  }, [skulptReady, addConsoleEntry]);

  const handleStop = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current.onRestart = null;
    }
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
    const project = { id: projectId, name: projectName, workspace: state, assets: serializeAssets(assetManagerRef.current), updatedAt: now,
      createdAt: idx >= 0 ? projects[idx].createdAt : now };
    if (idx >= 0) projects[idx] = project; else projects.unshift(project);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    setSavedProjects(projects);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(null), 1500);
  }, [projectId, projectName]);

  const handleLoadProject = useCallback(async (project) => {
    handleReset();
    await restoreAssets(assetManagerRef.current, project.assets);
    if (engineRef.current) engineRef.current.clearBackgroundImage();
    if (workspaceRef.current && project.workspace) {
      workspaceRef.current.clear();
      try {
        Blockly.serialization.workspaces.load(project.workspace, workspaceRef.current);
      } catch (e) {
        console.warn('Some blocks could not be restored (block definitions may have changed):', e.message);
      }
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

  const ensureSpriteAsset = useCallback((name) => {
    if (!name) return null;
    if (am.has(name)) return name;

    const sprite = createBuiltInSpriteEntry(name);
    if (!sprite) return null;

    am.register(sprite.name, 'sprite', sprite.source, sprite);
    return sprite.name;
  }, [am]);

  const loadDefaultWorkspace = useCallback((workspace) => {
    if (!workspace) return;
    resetAssetManager(am);
    if (engineRef.current) engineRef.current.clearBackgroundImage();
    workspace.clear();
    loadStarterBlocks(workspace);
  }, [am]);

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

  const nextSoundName = useCallback(() => {
    const existing = new Set(am.list('sound').map(s => s.name));
    let n = 1;
    while (existing.has(`sound${n}`)) n++;
    return `sound${n}`;
  }, [am]);

  const finishSoundAdd = useCallback((name) => {
    setSoundAddDialog(null);
    soundAddCallbackRef.current?.(name);
    soundAddCallbackRef.current = null;
  }, []);

  const cancelSoundAdd = useCallback(() => {
    setSoundAddDialog(null);
    soundAddCallbackRef.current?.(null);
    soundAddCallbackRef.current = null;
  }, []);

  const handleSoundUploadFromBlock = useCallback(() => {
    setSoundAddDialog(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) { soundAddCallbackRef.current?.(null); soundAddCallbackRef.current = null; return; }
      const autoName = nextSoundName();
      const url = URL.createObjectURL(file);
      handleAddSound({ id: `sound_${Date.now()}`, name: autoName, source: 'uploaded', audioUrl: url });
      finishSoundAdd(autoName);
    };
    input.click();
  }, [nextSoundName, handleAddSound, finishSoundAdd]);

  const handleSoundRecordFromBlock = useCallback(async () => {
    if (isRecording) {
      recorderRef.current?.stop();
      recorderRef.current = null;
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const autoName = nextSoundName();
        handleAddSound({ id: `sound_${Date.now()}`, name: autoName, source: 'recorded', audioUrl: url });
        stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        finishSoundAdd(autoName);
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      alert('Microphone access denied or not available.');
    }
  }, [isRecording, nextSoundName, handleAddSound, finishSoundAdd]);

  const handleSoundMixFromBlock = useCallback(() => {
    setSoundAddDialog(null);
    setShowMixerOverlay(true);
  }, []);

  const handleMixerSaveFromBlock = useCallback((mixName, audioUrl) => {
    const existing = new Set(am.list('sound').map(s => s.name));
    if (existing.has(mixName)) {
      alert(`Sound "${mixName}" already exists. Choose a different name.`);
      return;
    }
    handleAddSound({ id: `sound_${Date.now()}`, name: mixName, source: 'created', audioUrl });
    setShowMixerOverlay(false);
    finishSoundAdd(mixName);
  }, [am, handleAddSound, finishSoundAdd]);

  const cancelSpriteAdd = useCallback(() => {
    setSpriteAddDialog(null);
    spriteAddCallbackRef.current?.(null);
    spriteAddCallbackRef.current = null;
  }, []);

  const handleSpriteUploadFromBlock = useCallback(() => {
    setSpriteAddDialog(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) { spriteAddCallbackRef.current?.(null); spriteAddCallbackRef.current = null; return; }
      const img = new Image();
      img.onload = () => {
        const existing = new Set(am.list('sprite').map(s => s.name));
        let n = 1; while (existing.has(`sprite${n}`)) n++;
        const autoName = `sprite${n}`;
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        handleAddSprite({
          id: `sprite_${Date.now()}`, name: autoName, source: 'uploaded',
          image: img, thumbnail: canvas.toDataURL(),
        });
        setSpriteAddDialog(null);
        spriteAddCallbackRef.current?.(autoName);
        spriteAddCallbackRef.current = null;
      };
      img.src = URL.createObjectURL(file);
    };
    input.click();
  }, [am, handleAddSprite]);

  const handleSpriteGalleryFromBlock = useCallback(() => {
    setSpriteAddDialog('gallery');
  }, []);

  const handleGalleryPick = useCallback((name) => {
    setSpriteAddDialog(null);
    spriteAddCallbackRef.current?.(ensureSpriteAsset(name));
    spriteAddCallbackRef.current = null;
  }, [ensureSpriteAsset]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveProject();
      }
      if (e.key === 'Escape') {
        if (showProjects) setShowProjects(false);
        if (showHelp) setShowHelp(false);
        if (soundAddDialog) cancelSoundAdd();
        if (spriteAddDialog) cancelSpriteAdd();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleSaveProject, showProjects, showHelp, soundAddDialog, cancelSoundAdd, spriteAddDialog, cancelSpriteAdd]);

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
            <Tippy content="Block editor" {...tipProps}>
              <button
                className={`gml-toggle-btn ${viewMode === 'blocks' ? 'active' : ''}`}
                onClick={() => setViewMode('blocks')}
              >
                <Puzzle size={14} /> Blocks
              </button>
            </Tippy>
            <Tippy content="Generated Python code" {...tipProps}>
              <button
                className={`gml-toggle-btn ${viewMode === 'code' ? 'active' : ''}`}
                onClick={() => setViewMode('code')}
              >
                <Code size={14} /> Code
              </button>
            </Tippy>
          </div>

          <div className="gml-separator" />

          <Tippy content="Help" {...tipProps}>
            <button className="gml-btn" onClick={() => setShowHelp(!showHelp)}>
              <HelpCircle size={16} /> Help
            </button>
          </Tippy>
        </div>

        <div className="gml-controls-right">
          {skulptLoading && <span className="gml-loading">Loading Python...</span>}
          <Tippy content="Return to Playground" {...tipProps}>
            <button type="button" className="gml-exit-btn" onClick={exitLab}>
              <X size={18} /> Exit
            </button>
          </Tippy>
        </div>
      </div>

      {/* Main Content */}
      <div className="gml-main">
        {/* Editor Panel */}
        <div className="gml-editor-panel">
          <div className="gml-panel-header">
            <span>{viewMode === 'blocks' ? 'Blocks' : 'Generated Python'}</span>
            <div className="gml-panel-header-actions">
              <Tippy content="Click to rename project" {...tipProps}>
                <input
                  className="gml-project-name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                  spellCheck={false}
                  maxLength={40}
                />
              </Tippy>
              <Tippy content="Save project (Ctrl+S)" {...tipProps}>
                <button className="gml-btn gml-btn-icon" onClick={handleSaveProject}>
                  <Save size={14} />
                </button>
              </Tippy>
              {saveStatus && <span className="gml-save-status">Saved!</span>}
              <Tippy content="My Projects" {...tipProps}>
                <button
                  className="gml-btn gml-btn-icon"
                  onClick={() => { setSavedProjects(loadProjectsFromStorage()); setShowProjects(true); }}
                >
                  <FolderOpen size={14} />
                </button>
              </Tippy>
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
              <Tippy content="Run the game" {...tipProps}>
                <button onClick={handleRun} className="gml-btn gml-btn-run" disabled={!skulptReady || isRunning}>
                  <Play size={16} /> Run
                </button>
              </Tippy>
              <Tippy content="Stop the game" {...tipProps}>
                <button onClick={handleStop} className="gml-btn gml-btn-stop" disabled={!isRunning}>
                  <Square size={16} /> Stop
                </button>
              </Tippy>
              <Tippy content="Reset and restart" {...tipProps}>
                <button onClick={handleReset} className="gml-btn">
                  <RotateCcw size={16} /> Reset
                </button>
              </Tippy>
              <Tippy content={isGridVisible ? 'Hide placement grid' : 'Show placement grid'} {...tipProps}>
                <button
                  onClick={() => setIsGridVisible((visible) => !visible)}
                  className={`gml-btn ${isGridVisible ? 'gml-btn-active' : ''}`}
                  aria-pressed={isGridVisible}
                >
                  <Grid3x3 size={16} /> Grid
                </button>
              </Tippy>
            </div>
            <span className="gml-game-title">{gameTitle}</span>
          </div>
          <div
            className={`gml-canvas-wrapper ${isCanvasFullscreen ? 'fullscreen' : ''}`}
            ref={gameWrapperRef}
          >
            <canvas ref={canvasRef} className="gml-canvas" />
            <Tippy content={isCanvasFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'} {...tipProps}>
              <button
                className="gml-fullscreen-btn"
                onClick={toggleCanvasFullscreen}
              >
                {isCanvasFullscreen ? <Shrink size={18} /> : <Fullscreen size={18} />}
              </button>
            </Tippy>
          </div>

          <SpritePanel
            sprites={customSprites}
            backgrounds={customBackgrounds}
            sounds={customSounds}
            consoleLogs={consoleLogs}
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
            onClearConsole={() => { consoleLogsRef.current = []; setConsoleLogs([]); }}
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
                if (workspaceRef.current) loadDefaultWorkspace(workspaceRef.current);
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
                    <Tippy content="Delete project" {...tipProps}>
                      <button className="gml-project-delete" onClick={() => handleDeleteProject(p.id)}>
                        <Trash2 size={15} />
                      </button>
                    </Tippy>
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

      {/* Custom Blockly Prompt Dialog */}
      {promptDialog && (
        <div className="gml-prompt-overlay" onClick={handlePromptCancel}>
          <div className="gml-prompt-dialog" onClick={e => e.stopPropagation()}>
            <div className="gml-prompt-header">
              <span>New Variable</span>
              <button className="gml-prompt-close" onClick={handlePromptCancel}>
                <X size={18} />
              </button>
            </div>
            <div className="gml-prompt-body">
              <label className="gml-prompt-label">{promptDialog.message}</label>
              <input
                ref={promptInputRef}
                className="gml-prompt-input"
                type="text"
                defaultValue={promptDialog.defaultValue || ''}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePromptOk();
                  if (e.key === 'Escape') handlePromptCancel();
                }}
              />
            </div>
            <div className="gml-prompt-actions">
              <button className="gml-prompt-btn gml-prompt-btn-cancel" onClick={handlePromptCancel}>
                Cancel
              </button>
              <button className="gml-prompt-btn gml-prompt-btn-ok" onClick={handlePromptOk}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sound Add Dialog */}
      {soundAddDialog && !isRecording && (
        <div className="gml-prompt-overlay" onClick={cancelSoundAdd}>
          <div className="gml-sound-add-dialog" onClick={e => e.stopPropagation()}>
            <div className="gml-prompt-header">
              <span>Add Sound</span>
              <button className="gml-prompt-close" onClick={cancelSoundAdd}>
                <X size={18} />
              </button>
            </div>
            <div className="gml-sound-add-options">
              <button className="gml-sound-add-option" onClick={handleSoundUploadFromBlock}>
                <Upload size={24} />
                <span>Upload</span>
                <small>From a file</small>
              </button>
              <button className="gml-sound-add-option" onClick={handleSoundRecordFromBlock}>
                <Mic size={24} />
                <span>Record</span>
                <small>Use microphone</small>
              </button>
              <button className="gml-sound-add-option" onClick={handleSoundMixFromBlock}>
                <AudioLines size={24} />
                <span>Mix</span>
                <small>Sound mixer</small>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recording Overlay */}
      {isRecording && (
        <div className="gml-prompt-overlay">
          <div className="gml-sound-add-dialog" onClick={e => e.stopPropagation()}>
            <div className="gml-prompt-header" style={{ background: 'linear-gradient(135deg, #da3633, #f85149)' }}>
              <span>Recording...</span>
            </div>
            <div className="gml-sound-record-body">
              <div className="gml-sound-record-indicator" />
              <p>Recording from microphone</p>
              <button className="gml-prompt-btn gml-prompt-btn-ok" onClick={handleSoundRecordFromBlock}>
                Stop Recording
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sound Mixer Overlay */}
      {showMixerOverlay && (
        <div className="gml-prompt-overlay">
          <div className="gml-mixer-wrapper" onClick={e => e.stopPropagation()}>
            <SoundMixer
              defaultName={nextSoundName()}
              existingSounds={customSounds}
              onSave={handleMixerSaveFromBlock}
              onClose={() => { setShowMixerOverlay(false); cancelSoundAdd(); }}
            />
          </div>
        </div>
      )}

      {/* Sprite Add Dialog */}
      {spriteAddDialog && spriteAddDialog !== 'gallery' && (
        <div className="gml-prompt-overlay" onClick={cancelSpriteAdd}>
          <div className="gml-sound-add-dialog" onClick={e => e.stopPropagation()}>
            <div className="gml-prompt-header">
              <span>Add Sprite</span>
              <button className="gml-prompt-close" onClick={cancelSpriteAdd}>
                <X size={18} />
              </button>
            </div>
            <div className="gml-sound-add-options">
              <button className="gml-sound-add-option" onClick={handleSpriteGalleryFromBlock}>
                <Puzzle size={24} />
                <span>Gallery</span>
                <small>Built-in sprites</small>
              </button>
              <button className="gml-sound-add-option" onClick={handleSpriteUploadFromBlock}>
                <Upload size={24} />
                <span>Upload</span>
                <small>From a file</small>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sprite Gallery Picker */}
      {spriteAddDialog === 'gallery' && (
        <div className="gml-prompt-overlay" onClick={cancelSpriteAdd}>
          <div className="gml-gallery-dialog" onClick={e => e.stopPropagation()}>
            <div className="gml-prompt-header">
              <span>Choose a Sprite</span>
              <button className="gml-prompt-close" onClick={cancelSpriteAdd}>
                <X size={18} />
              </button>
            </div>
            <div className="gml-gallery-grid">
              {getSpriteNames().map(name => (
                <Tippy key={name} content={name} {...tipProps}>
                  <button
                    className="gml-gallery-item"
                    onClick={() => handleGalleryPick(name)}
                  >
                    <span className="gml-gallery-name">{name}</span>
                  </button>
                </Tippy>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameMakerLab;
