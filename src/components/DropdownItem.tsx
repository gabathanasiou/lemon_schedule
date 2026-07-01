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
}

export default function DropdownItem({
  onClick,
  icon,
  disabled = false,
  variant = 'default',
  className = '',
  children,
}: DropdownItemProps) {
  const theme = useDropdownTheme();
  const isLight = theme === 'light';

  const variantStyles = variant === 'danger'
    ? isLight
      ? 'text-red-600 hover:bg-red-100 focus-visible:bg-red-100'
      : 'text-red-400 hover:bg-red-900/30 hover:text-red-300 focus-visible:bg-red-900/30 focus-visible:text-red-300'
    : isLight
      ? 'text-zinc-700 hover:bg-zinc-100 focus-visible:bg-zinc-100'
      : 'text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:bg-zinc-800 focus-visible:text-white';

  const iconColor = isLight ? 'text-zinc-500' : 'text-zinc-400';

  return (
    <RadixDropdownMenu.Item
      className={`w-full text-left ${ITEM_CLASS} rounded flex items-center gap-2 transition-colors outline-none cursor-pointer select-none ${variantStyles} ${disabled ? 'opacity-30 pointer-events-none' : ''} ${className}`}
      onSelect={(e) => { onClick(); }}
      onPointerDown={(e) => {
        if ((e as any).pointerType === 'pen') {
          onClick();
        }
      }}
      disabled={disabled}
    >
      {icon && <span className={`${iconColor} shrink-0`}>{icon}</span>}
      {children}
    </RadixDropdownMenu.Item>
  );
}
