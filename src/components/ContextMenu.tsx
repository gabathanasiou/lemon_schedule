import React, { useEffect } from 'react';

export const ContextMenu: React.FC<{
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, x, y, onClose, children }) => {
  useEffect(() => {
    if (!open) return;
    const handler = () => onClose();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed bg-white border border-zinc-200 shadow-xl rounded-lg py-1 z-[9999] text-sm text-zinc-700 min-w-[180px]"
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
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
        ? 'hover:bg-red-50 text-red-600'
        : 'hover:bg-zinc-50'
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
