import { useState, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PopoutWindowContext } from '../lib/popoutTarget';
import { useProject } from '../store';

interface PopoutWindowProps {
  title: string;
  win: Window;
  onClose: () => void;
  children: ReactNode;
}

let _cascadeIndex = 0;

export function cascadePosition(width = 1200, height = 800) {
  const offset = (_cascadeIndex % 10) * 30;
  _cascadeIndex++;
  return {
    left: Math.round((screen.width - width) / 2) + offset,
    top: Math.round((screen.height - height) / 2) + offset,
  };
}

export default function PopoutWindow({ title, win, onClose, children }: PopoutWindowProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const { state, dispatch } = useProject();
  const currentProjectIdRef = useRef(state.present.id);
  currentProjectIdRef.current = state.present.id;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const id = currentProjectIdRef.current;
      if (!id) return;
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      if (cmdOrCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      }
      if (cmdOrCtrl && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      }
      if (cmdOrCtrl && e.key === 's') {
        e.preventDefault();
      }
    };
    win.addEventListener('keydown', handler);
    return () => win.removeEventListener('keydown', handler);
  }, [win, dispatch]);

  useEffect(() => {
    const styleText = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(el => el.outerHTML)
      .join('');

    win.document.title = title;
    win.document.head.innerHTML = styleText;

    win.document.body.innerHTML = '<div id="portal" style="position:fixed;left:0;top:0;z-index:9999"></div><div id="popout-root"></div>';
    win.document.body.style.margin = '0';
    win.document.body.style.overflow = 'hidden';
    win.document.body.style.height = '100vh';
    win.document.body.style.width = '100vw';

    const root = win.document.getElementById('popout-root')!;
    root.style.height = '100vh';
    root.style.width = '100vw';
    setContainer(root);

    const handleUnload = () => onClose();
    win.addEventListener('beforeunload', handleUnload);

    const checkClosed = setInterval(() => {
      if (win.closed) onClose();
    }, 300);

    return () => {
      clearInterval(checkClosed);
      win.removeEventListener('beforeunload', handleUnload);
      setContainer(null);
    };
  }, []);

  useEffect(() => {
    if (!container) return;
    return () => {
      if (!win.closed) win.close();
    };
  }, [container, win]);

  if (!container) return null;

  return (
    <PopoutWindowContext.Provider value={win}>
      {createPortal(children, container)}
    </PopoutWindowContext.Provider>
  );
}

export function PopoutPlaceholder({ title, onBringBack }: { title: string; onBringBack: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-zinc-50 text-zinc-400 select-none">
      <div className="text-sm font-medium mb-2">{title} is open in a separate window</div>
      <button
        onClick={onBringBack}
        className="text-xs text-zinc-500 hover:text-zinc-700 underline underline-offset-2 transition-colors"
      >
        Bring back
      </button>
    </div>
  );
}
