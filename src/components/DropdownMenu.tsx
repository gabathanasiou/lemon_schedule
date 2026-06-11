import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface DropdownMenuProps {
  open: boolean;
  onClose: () => void;
  trigger: React.ReactNode;
  align?: 'left' | 'right';
  width?: string;
  children: React.ReactNode;
}

export default function DropdownMenu({
  open,
  onClose,
  trigger,
  align = 'right',
  width,
  children,
}: DropdownMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current) { setFlip(false); return; }
    const rect = menuRef.current.getBoundingClientRect();
    setFlip(rect.left < 0 || rect.right > window.innerWidth);
  }, [open]);

  const style: React.CSSProperties = (() => {
    if (align === 'right') {
      return flip ? { left: 0, right: 'auto' } : { right: 0, left: 'auto' };
    }
    return flip ? { right: 0, left: 'auto' } : { left: 0, right: 'auto' };
  })();

  return (
    <div className="relative">
      {trigger}

      {open && (
        <>
          <div className="fixed inset-0 z-[190]" onClick={onClose} />
          <div
            ref={menuRef}
            className={`absolute top-full mt-2 bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[200] text-zinc-300 p-1 flex flex-col font-sans select-none ${width || ''}`}
            style={style}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}
