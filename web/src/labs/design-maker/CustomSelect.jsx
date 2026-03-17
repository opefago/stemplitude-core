import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';

export default function CustomSelect({ value, options, onChange, className = '', placeholder = '' }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ top: true, left: false });
  const ref = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const reposition = useCallback(() => {
    if (!ref.current || !menuRef.current) return;
    const triggerRect = ref.current.getBoundingClientRect();
    const menu = menuRef.current;
    const menuH = menu.scrollHeight;
    const menuW = menu.scrollWidth;

    const spaceBelow = window.innerHeight - triggerRect.bottom - 8;
    const spaceAbove = triggerRect.top - 8;
    const spaceRight = window.innerWidth - triggerRect.left - 8;

    const openDown = spaceBelow >= menuH || spaceBelow >= spaceAbove;
    const alignRight = menuW > spaceRight;

    setPlacement({ top: !openDown, left: alignRight });
  }, []);

  useEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  const selected = options.find(o => String(o.value) === String(value));

  const menuStyle = {};
  if (placement.top) {
    menuStyle.bottom = 'calc(100% + 4px)';
    menuStyle.top = 'auto';
  } else {
    menuStyle.top = 'calc(100% + 4px)';
    menuStyle.bottom = 'auto';
  }
  if (placement.left) {
    menuStyle.right = 0;
    menuStyle.left = 'auto';
  } else {
    menuStyle.left = 0;
    menuStyle.right = 'auto';
  }

  return (
    <div className={`dml-cselect ${className}`} ref={ref}>
      <button
        className={`dml-cselect-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className="dml-cselect-label">{selected ? selected.label : placeholder}</span>
        <ChevronDown size={12} className={`dml-cselect-arrow ${open ? 'flipped' : ''}`} />
      </button>
      {open && (
        <div className="dml-cselect-menu" ref={menuRef} style={menuStyle}>
          {options.map(opt => (
            <button
              key={String(opt.value)}
              className={`dml-cselect-option ${String(opt.value) === String(value) ? 'active' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              type="button"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
