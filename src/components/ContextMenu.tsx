import React, { useEffect, useLayoutEffect } from 'react';

const MARGIN = 8;

export const ContextMenu: React.FC<{
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, x, y, onClose, children }) => {
  const menuRef = React.useRef<HTMLDivElement>(null);

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
    let top = Math.max(MARGIN, y);
    let left = Math.max(MARGIN, x);
    if (rect.right > vw) left = vw - rect.width - MARGIN;
    if (rect.bottom > vh) top = Math.max(MARGIN, vh - rect.height - MARGIN);
    menuRef.current.style.top = `${top}px`;
    menuRef.current.style.left = `${left}px`;
  }, [open, x, y]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="fixed bg-white border border-zinc-200 shadow-xl rounded-lg py-1 z-[9999] font-sans text-[13px] text-zinc-700 min-w-[180px] max-h-80 overflow-y-auto"
      style={{ top: y, left: x }}
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
