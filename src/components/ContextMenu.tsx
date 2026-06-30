import React, { useEffect, useLayoutEffect } from 'react';

const MARGIN = 8;

export const ContextMenu: React.FC<{
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
  containerRef?: React.RefObject<HTMLElement>;
}> = ({ open, x, y, onClose, children, containerRef }) => {
  const menuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('pointerdown', handler, true);
    return () => window.removeEventListener('pointerdown', handler, true);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const containerRect = containerRef?.current?.getBoundingClientRect();
    const vw = containerRect ? containerRect.right : window.innerWidth;
    const vh = containerRect ? containerRect.bottom : window.innerHeight;
    const minLeft = containerRect ? containerRect.left : 0;
    const minTop = containerRect ? containerRect.top : 0;
    let top = Math.max(minTop + MARGIN, y);
    let left = Math.max(minLeft + MARGIN, x);
    if (left + rect.width > vw) left = vw - rect.width - MARGIN;
    if (top + rect.height > vh) top = Math.max(minTop + MARGIN, vh - rect.height - MARGIN);
    menuRef.current.style.top = `${top}px`;
    menuRef.current.style.left = `${left}px`;
  }, [open, x, y, containerRef]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="fixed bg-white border border-zinc-200 shadow-xl rounded-lg p-1 z-[9999] font-sans text-xs text-zinc-700 min-w-[180px] max-h-80 overflow-y-auto"
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
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, variant = 'default', icon, disabled = false, children }) => (
  <button
    onClick={disabled ? undefined : onClick}
    className={`w-full text-left px-3 py-2 flex items-center gap-2 rounded transition-colors ${
      disabled ? 'opacity-40 cursor-default' :
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
  <div className="border-t border-zinc-200 my-1" />
);

export default ContextMenu;
