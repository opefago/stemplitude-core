import { useState, useEffect, useRef } from 'react';
import { X, Save, FolderOpen, Download, Plus } from 'lucide-react';
import { useLabExit } from '../features/labs/useLabExit';
import './Labs.css';

const MAKECODE_URL = 'https://arcade.makecode.com';

const GameDevLab = () => {
  const { exitLab } = useLabExit();
  const iframeRef = useRef(null);
  const [projectName, setProjectName] = useState('My Game');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [editorReady, setEditorReady] = useState(false);

  useEffect(() => {
    const handleMessage = (event) => {
      const data = event.data;
      if (!data) return;

      // MakeCode sends 'pxthost' messages when the editor is ready
      if (data.type === 'pxthost') {
        if (data.action === 'workspacesync') {
          // Editor is asking for workspace data - respond to complete init
          iframeRef.current?.contentWindow?.postMessage({
            type: 'pxthost',
            action: 'workspacesync',
            projects: []
          }, '*');
          setEditorReady(true);
          console.log('MakeCode editor ready');
        }
      }

      if (data.type === 'pxteditor') {
        console.log('MakeCode editor message:', data.action);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleNewProject = () => {
    if (iframeRef.current) {
      iframeRef.current.src = MAKECODE_URL + '/#editor';
    }
  };

  const handleSaveProject = async () => {
    setIsSaving(true);
    setSaveMessage('Saving...');
    
    // TODO: Integrate with STEMplitude backend
    setTimeout(() => {
      setIsSaving(false);
      setSaveMessage('Project saved!');
      setTimeout(() => setSaveMessage(''), 3000);
    }, 1000);
  };

  const handleLoadProject = () => {
    setSaveMessage('Loading...');
    setTimeout(() => {
      setSaveMessage('Project loaded!');
      setTimeout(() => setSaveMessage(''), 3000);
    }, 1000);
  };

  const handleDownload = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'pxteditor',
        action: 'saveproject'
      }, '*');
    }
  };

  return (
    <div className="lab-page gamedev-lab-fullscreen">
      {/* Top Bar */}
      <div className="gamedev-topbar">
        <div className="gamedev-controls">
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="project-name-input"
            placeholder="Project Name"
          />

          <button onClick={handleNewProject} className="gamedev-btn gamedev-btn-new">
            <Plus size={20} />
            New Project
          </button>
          
          <button onClick={handleSaveProject} className="gamedev-btn" disabled={isSaving}>
            <Save size={20} />
            Save
          </button>
          
          <button onClick={handleLoadProject} className="gamedev-btn">
            <FolderOpen size={20} />
            Load
          </button>
          
          <button onClick={handleDownload} className="gamedev-btn">
            <Download size={20} />
            Download
          </button>
          
          {saveMessage && (
            <span className="save-message">{saveMessage}</span>
          )}
        </div>

        <button type="button" className="gamedev-exit-btn" onClick={exitLab}>
          <X size={20} />
          Exit Lab
        </button>
      </div>

      {/* MakeCode Arcade */}
      <iframe
        ref={iframeRef}
        src={MAKECODE_URL + '/#editor'}
        title="MakeCode Arcade"
        className="makecode-iframe"
        allow="camera;microphone;xr-spatial-tracking;gamepad;gyroscope;accelerometer;magnetometer;serial;usb;midi;clipboard-read;clipboard-write"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
};

export default GameDevLab;
