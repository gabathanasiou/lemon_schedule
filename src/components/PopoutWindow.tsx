import { useState, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PopoutWindowProps {
  title: string;
  win: Window;
  onClose: () => void;
  children: ReactNode;
}

export default function PopoutWindow({ title, win, onClose, children }: PopoutWindowProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const styleText = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(el => el.outerHTML)
      .join('');

    win.document.title = title;
    win.document.head.innerHTML = styleText;

    win.document.body.innerHTML = '<div id="popout-root"></div>';
    win.document.body.style.margin = '0';
    win.document.body.style.overflow = 'hidden';
    win.document.body.style.height = '100vh';
    win.document.body.style.width = '100vw';

    const root = win.document.getElementById('popout-root')!;
    root.style.height = '100vh';
    root.style.width = '100vw';
    root.style.overflow = 'hidden';
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

  return createPortal(children, container);
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
