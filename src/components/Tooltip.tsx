import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget, useCurrentWindow } from '../lib/popoutTarget';

export const Tooltip: React.FC<{ content: string; children: React.ReactNode }> = ({ content, children }) => {
  const portalTarget = usePortalTarget();
  const currentWindow = useCurrentWindow();
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const updatePos = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
  };

  useEffect(() => {
    if (show) { updatePos(); currentWindow.addEventListener('scroll', updatePos, true); }
    return () => currentWindow.removeEventListener('scroll', updatePos, true);
  }, [show]);

  return (
    <div
      ref={ref}
      className="inline-flex"
      onMouseEnter={() => { updatePos(); setShow(true); }}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && createPortal(
        <div
          className="fixed px-2.5 py-1.5 bg-zinc-900 text-white text-[10px] rounded shadow-xl whitespace-nowrap leading-relaxed max-w-xs border border-white/20"
          style={{ left: pos.x, top: pos.y - 20, transform: 'translate(-50%, -100%)', zIndex: 99999 }}
        >
          {content.split('\n• ').map((line, i) => (
            <div key={i} className={i > 0 ? 'mt-0.5 pt-0.5 border-t border-zinc-700' : ''}>{line}</div>
          ))}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-900" />
        </div>,
        portalTarget ?? document.body
      )}
    </div>
  );
};
