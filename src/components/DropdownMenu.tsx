import React, { useEffect, useRef, useState } from 'react';

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

  useEffect(() => {
    if (!open || !menuRef.current) { setFlip(false); return; }
    const raf = requestAnimationFrame(() => {
      const rect = menuRef.current?.getBoundingClientRect();
      if (rect && rect.right > window.innerWidth) setFlip(true);
      else setFlip(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  return (
    <div className="relative">
      {trigger}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div
            ref={menuRef}
            className={`absolute top-full mt-2 bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-50 text-zinc-300 p-1 flex flex-col font-sans select-none ${width || ''} ${flip ? 'right-0' : align === 'right' ? 'right-0' : 'left-0'}`}
            style={flip ? { left: 0, right: 'auto' } : undefined}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}
