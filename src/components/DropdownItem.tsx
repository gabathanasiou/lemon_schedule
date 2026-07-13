import React from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { useDropdownTheme } from './DropdownMenu';
import { IS_COARSE } from '../lib/device';

const ITEM_CLASS = IS_COARSE ? 'px-4 py-3 text-sm' : 'px-3 py-2 text-xs';

interface DropdownItemProps {
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  variant?: 'default' | 'danger';
  className?: string;
  children: React.ReactNode;
  key?: string;
  keepOpen?: boolean;
  rightAction?: {
    icon: React.ReactNode;
    onClick: () => void;
    title?: string;
  };
}

export default function DropdownItem({
  onClick,
  icon,
  disabled = false,
  variant = 'default',
  className = '',
  children,
  keepOpen = false,
  rightAction,
}: DropdownItemProps) {
  const theme = useDropdownTheme();
  const isLight = theme === 'light';
  const isBlue = theme === 'blue';

  const variantStyles = variant === 'danger'
    ? isLight
      ? 'text-red-600 hover:bg-red-100 focus-visible:bg-red-100 active:bg-red-200'
      : 'text-red-400 hover:bg-red-900/30 hover:text-red-300 focus-visible:bg-red-900/30 focus-visible:text-red-300 active:bg-red-900/50 active:text-red-200'
    : isLight
      ? 'text-zinc-700 hover:bg-zinc-100 focus-visible:bg-zinc-100 active:bg-zinc-200'
      : isBlue
      ? 'text-white hover:bg-white/10 focus-visible:bg-white/10 active:bg-white/15'
      : 'text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:bg-zinc-800 focus-visible:text-white active:bg-zinc-700 active:text-white';

  const iconColor = isLight ? 'text-zinc-500' : isBlue ? 'text-white' : 'text-zinc-400';
  const rightActionColor = isLight ? 'text-zinc-400 hover:text-zinc-600' : 'text-zinc-500 hover:text-zinc-300';

  return (
    <RadixDropdownMenu.Item
      className={`w-full text-left ${ITEM_CLASS} rounded flex items-center gap-2 transition-colors active:transition-none outline-none cursor-pointer select-none ${variantStyles} ${disabled ? 'opacity-30 pointer-events-none' : ''} ${className}`}
      onSelect={(e) => { if (keepOpen) e.preventDefault(); onClick(); }}
      onTouchStart={() => {}}
      onPointerDown={(e) => {
        if ((e as any).pointerType === 'pen') {
          const el = e.currentTarget;
          el.classList.add(isLight ? 'pen-pulse' : 'pen-pulse-dark');
          setTimeout(() => el.classList.remove(isLight ? 'pen-pulse' : 'pen-pulse-dark'), 350);
          onClick();
        }
      }}
      disabled={disabled}
    >
      {icon && <span className={`${iconColor} shrink-0`}>{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {rightAction && (
        <span
          className={`shrink-0 ml-1 p-0.5 rounded transition-colors ${rightActionColor}`}
          title={rightAction.title}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            rightAction.onClick();
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          {rightAction.icon}
        </span>
      )}
    </RadixDropdownMenu.Item>
  );
}
