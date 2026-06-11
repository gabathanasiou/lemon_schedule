import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';

interface DropdownSubmenuProps {
  label: string;
  icon?: React.ReactNode;
  width?: string;
  children: React.ReactNode;
}

export default function DropdownSubmenu({ label, icon, width, children }: DropdownSubmenuProps) {
  const [open, setOpen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !itemRef.current) return;
    const itemRect = itemRef.current.getBoundingClientRect();
    const panelW = menuRef.current?.offsetWidth || 180;

    let left = itemRect.right + 4;
    if (left + panelW > window.innerWidth) {
      left = itemRect.left - panelW - 4;
    }

    let top = itemRect.top;
    const panelH = menuRef.current?.scrollHeight || 300;
    if (top + panelH > window.innerHeight) {
      top = Math.max(0, window.innerHeight - panelH - 8);
    }

    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (itemRef.current && !itemRef.current.contains(target) &&
          menuRef.current && !menuRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={itemRef} className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full text-left px-3 py-2 rounded flex items-center gap-2 text-xs transition-colors hover:bg-zinc-800 hover:text-white cursor-pointer text-zinc-300 justify-between"
      >
        <span className="flex items-center gap-2">
          {icon && <span className="text-zinc-400 shrink-0">{icon}</span>}
          {label}
        </span>
        <ChevronRight className="w-3 h-3 text-zinc-500" />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="fixed bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[210] text-zinc-300 p-1 flex flex-col font-sans select-none max-h-80 overflow-y-auto"
          style={{ top: pos.top, left: pos.left, position: 'fixed', minWidth: width || '160px' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
