import React from 'react';
import Tippy from '@tippyjs/react';

export default function Tip({ label, shortcut, children, ...rest }) {
  return (
    <Tippy
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
