import React, { useEffect, useLayoutEffect, useState } from 'react';

const MARGIN = 8;

export const ContextMenu: React.FC<{
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, x, y, onClose, children }) => {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: y, left: x });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handler, true);
    return () => window.removeEventListener('mousedown', handler, true);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = y;
    let left = x;
    if (rect.right > vw) left = vw - rect.width - MARGIN;
    if (rect.bottom > vh) top = vh - rect.height - MARGIN;
    setPos({ top, left });
  }, [open, x, y]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="fixed bg-white border border-zinc-200 shadow-xl rounded-lg py-1 z-[9999] font-sans text-[13px] text-zinc-700 min-w-[180px]"
      style={{ top: pos.top, left: pos.left }}
    >
      {children}
    </div>
  );
};

export const ContextMenuItem: React.FC<{
  onClick: () => void;
  variant?: 'default' | 'danger';
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ onClick, variant = 'default', icon, children }) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-4 py-2 flex items-center gap-2 transition-colors ${
      variant === 'danger'
        ? 'hover:bg-red-100 text-red-600'
        : 'hover:bg-zinc-100'
    }`}
  >
    {icon}
    {children}
  </button>
);

export const ContextMenuDivider: React.FC = () => (
  <div className="h-[1px] bg-zinc-200 my-1" />
);

export default ContextMenu;
