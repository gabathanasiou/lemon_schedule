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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; flip: boolean }>({ top: 0, left: 0, flip: false });

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const panelW = menuRef.current?.offsetWidth || 200;
    const panelH = menuRef.current?.scrollHeight || 300;
    const rightEdge = align === 'right'
      ? rect.right
      : rect.left + panelW;
    const overflowX = rightEdge > window.innerWidth;
    const overflowY = rect.bottom + 8 + panelH > window.innerHeight && rect.top - panelH - 8 > 0;
    const left = align === 'right'
      ? rect.right - panelW
      : rect.left;
    setPos({
      top: overflowY ? rect.top - panelH - 8 : rect.bottom + 8,
      left: overflowX ? rect.left : left,
      flip: overflowX,
    });
  }, [open, align]);

  return (
    <div ref={wrapperRef} className="relative">
      {trigger}

      {open && (
        <>
          <div className="fixed inset-0 z-[190]" onClick={onClose} />
          <div
            ref={menuRef}
            className={`fixed bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[200] text-zinc-300 p-1 flex flex-col font-sans select-none max-h-80 overflow-y-auto ${width || ''}`}
            style={{ top: pos.top, left: pos.left, position: 'fixed' }}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}
