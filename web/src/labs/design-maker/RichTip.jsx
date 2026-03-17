import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Tippy from '@tippyjs/react';

const RING_DELAY = 1500;
const RING_DURATION = 2500;
const RING_SIZE = 36;

let activeCloseFn = null;

function ShortcutKeys({ shortcut }) {
  if (!shortcut) return null;
  const parts = shortcut.split('+').map(s => s.trim());
  return (
    <div className="dml-richtip-shortcut">
      {parts.map((key, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="dml-richtip-plus">+</span>}
          <kbd className="dml-richtip-key">{key}</kbd>
        </React.Fragment>
      ))}
    </div>
  );
}

function VideoPlayer({ src }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(true);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }, []);

  return (
    <div className="dml-richtip-video-wrap">
      <video
        ref={videoRef}
        src={src}
        autoPlay
        loop
        muted
        playsInline
        className="dml-richtip-video"
      />
      <button className="dml-richtip-playpause" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="5.5" y="4.5" width="4" height="13" rx="2" fill="currentColor" />
            <rect x="12.5" y="4.5" width="4" height="13" rx="2" fill="currentColor" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M7 4.5c0-.6.7-1 1.2-.6l9 6.2a.7.7 0 010 1.2l-9 6.2c-.5.4-1.2 0-1.2-.6V4.5z" fill="currentColor" />
          </svg>
        )}
      </button>
    </div>
  );
}

function ProgressRing({ x, y, progress }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dashLen = circ * progress;
  const gapLen = circ - dashLen;
  return createPortal(
    <div
      className="dml-richtip-ring"
      style={{ left: x - RING_SIZE / 2, top: y - RING_SIZE / 2 }}
    >
      <svg width={RING_SIZE} height={RING_SIZE} viewBox="0 0 36 36">
        <circle
          cx="18" cy="18" r={r}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="3.5"
        />
        <circle
          cx="18" cy="18" r={r}
          fill="none"
          stroke="#c084fc"
          strokeWidth="3.5"
          strokeDasharray={`${dashLen} ${gapLen}`}
          strokeLinecap="round"
          transform="rotate(-90 18 18)"
        />
        {progress > 0.02 && (
          <circle
            cx="18" cy="18" r={r}
            fill="none"
            stroke="#fff"
            strokeWidth="3.5"
            strokeDasharray={`${dashLen} ${gapLen}`}
            strokeLinecap="round"
            transform="rotate(-90 18 18)"
            opacity={0.25}
          />
        )}
      </svg>
      <span className="dml-richtip-ring-pct">
        {Math.round(progress * 100)}%
      </span>
    </div>,
    document.body,
  );
}

function Popup({ label, description, shortcut, video, anchorRect, onClose, preferBelow }) {
  const popupRef = useRef(null);
  const [layout, setLayout] = useState(null);

  useEffect(() => {
    if (!popupRef.current || !anchorRect) return;
    const popup = popupRef.current;
    const rect = popup.getBoundingClientRect();
    const gap = 40;
    const anchorCx = anchorRect.left + anchorRect.width / 2;
    let left = anchorCx - rect.width / 2;
    let below = !!preferBelow;
    let top;
    if (below) {
      top = anchorRect.bottom + gap;
      if (top + rect.height > window.innerHeight - 12) { top = anchorRect.top - rect.height - gap; below = false; }
    } else {
      top = anchorRect.top - rect.height - gap;
      if (top < 12) { top = anchorRect.bottom + gap; below = true; }
    }
    if (left + rect.width > window.innerWidth - 12) left = window.innerWidth - rect.width - 12;
    if (left < 12) left = 12;
    if (top + rect.height > window.innerHeight - 12) top = 12;
    const notchX = Math.min(Math.max(anchorCx - left, 20), rect.width - 20);
    setLayout({ left, top, below, notchX });
  }, [anchorRect, preferBelow]);

  useEffect(() => {
    const handleDown = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [onClose]);

  return createPortal(
    <div
      ref={popupRef}
      className={`dml-richtip-popup ${layout?.below ? 'dml-richtip-below' : 'dml-richtip-above'}`}
      style={layout ? { left: layout.left, top: layout.top, opacity: 1 } : { left: -9999, top: -9999, opacity: 0 }}
    >
      {layout && (
        <div
          className="dml-richtip-notch"
          style={{ left: layout.notchX }}
        />
      )}
      <div className="dml-richtip-header">
        <span className="dml-richtip-title">{label}</span>
        <button className="dml-richtip-close" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>
      {video && <VideoPlayer src={video} />}
      {description && <p className="dml-richtip-desc">{description}</p>}
      <ShortcutKeys shortcut={shortcut} />
    </div>,
    document.body,
  );
}

/**
 * Drop-in replacement for Tip.
 *
 * Without `description` or `video`, behaves identically to Tip (Tippy tooltip).
 * With rich content the hover timeline is:
 *   0 – 1.5s   Tippy tooltip only (normal quick label)
 *   1.5 – 4s   Progress ring fades in and fills around the cursor
 *   4s+         Ring completes → rich popup with video/description/shortcut
 */
export default function RichTip({ label, shortcut, description, video, placement, children, ...rest }) {
  const wrapRef = useRef(null);
  const frameRef = useRef(null);
  const delayRef = useRef(null);
  const enterRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const frozenRect = useRef(null);

  const [showPopup, setShowPopup] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showRing, setShowRing] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [tippyVisible, setTippyVisible] = useState(false);

  const hasRich = !!(description || video);

  const cleanup = useCallback(() => {
    clearTimeout(delayRef.current);
    cancelAnimationFrame(frameRef.current);
    setProgress(0);
    setShowRing(false);
  }, []);

  const tick = useCallback(() => {
    const elapsed = Date.now() - enterRef.current - RING_DELAY;
    const p = Math.min(Math.max(elapsed / RING_DURATION, 0), 1);
    setProgress(p);
    setMousePos({ ...mouseRef.current });
    if (p >= 1) {
      if (activeCloseFn) activeCloseFn();
      frozenRect.current = wrapRef.current?.getBoundingClientRect() ?? null;
      setShowRing(false);
      setTippyVisible(false);
      setShowPopup(true);
    } else {
      frameRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const startRing = useCallback(() => {
    setShowRing(true);
    setMousePos({ ...mouseRef.current });
    frameRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const onEnter = useCallback(() => {
    if (!hasRich) return;
    enterRef.current = Date.now();
    delayRef.current = setTimeout(startRing, RING_DELAY);
  }, [hasRich, startRing]);

  const onLeave = useCallback(() => {
    cleanup();
    setTippyVisible(false);
  }, [cleanup]);

  const onMouseMove = useCallback((e) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const closePopup = useCallback(() => {
    setShowPopup(false);
    frozenRect.current = null;
    if (activeCloseFn === closePopupRef.current) activeCloseFn = null;
    cleanup();
  }, [cleanup]);

  const closePopupRef = useRef(closePopup);
  closePopupRef.current = closePopup;

  useEffect(() => {
    if (showPopup) {
      activeCloseFn = closePopupRef.current;
    }
  }, [showPopup]);

  useEffect(() => () => {
    clearTimeout(delayRef.current);
    cancelAnimationFrame(frameRef.current);
    if (activeCloseFn === closePopupRef.current) activeCloseFn = null;
  }, []);

  if (!hasRich) {
    return (
      <Tippy
        zIndex={100001}
        placement={placement}
        content={
          <div className="dml-tip">
            <span className="dml-tip-label">{label}</span>
            {shortcut && <span className="dml-tip-shortcut">{shortcut}</span>}
          </div>
        }
        {...rest}
      >
        {children}
      </Tippy>
    );
  }

  const anchorRect = frozenRect.current;

  return (
    <Tippy
      zIndex={100001}
      placement={placement}
      content={
        <div className="dml-tip">
          <span className="dml-tip-label">{label}</span>
          {shortcut && <span className="dml-tip-shortcut">{shortcut}</span>}
        </div>
      }
      visible={tippyVisible && !showPopup}
      onClickOutside={() => setTippyVisible(false)}
      {...rest}
    >
      <span
        ref={wrapRef}
        onMouseEnter={() => { setTippyVisible(true); onEnter(); }}
        onMouseLeave={() => { onLeave(); }}
        onMouseMove={onMouseMove}
        style={{ display: 'inline-flex' }}
      >
        {children}
        {showRing && !showPopup && (
          <ProgressRing x={mousePos.x} y={mousePos.y} progress={progress} />
        )}
        {showPopup && anchorRect && (
          <Popup
            label={label}
            description={description}
            shortcut={shortcut}
            video={video}
            anchorRect={anchorRect}
            onClose={closePopup}
            preferBelow={placement === 'bottom'}
          />
        )}
      </span>
    </Tippy>
  );
}
