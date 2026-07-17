import React, { useRef } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { useDropdownTheme, getDropdownClasses } from './DropdownMenu';
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
  const d = getDropdownClasses(theme);
  const isLight = theme === 'light';
  const skipClickRef = useRef(false);

  const variantStyles = variant === 'danger' ? d.itemDanger : d.itemDefault;

  return (
    <RadixDropdownMenu.Item
      className={`w-full text-left ${d.itemPad} rounded flex items-center gap-2 transition-colors active:transition-none outline-none cursor-pointer select-none ${variantStyles} ${disabled ? 'opacity-30 pointer-events-none' : ''} ${className}`}
      onSelect={(e) => {
        if (skipClickRef.current) { skipClickRef.current = false; return; }
        if (keepOpen) e.preventDefault(); onClick();
      }}
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
      {icon && <span className={`${d.icon} shrink-0`}>{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {rightAction && (
        <span
          className={`shrink-0 ml-1 p-0.5 rounded transition-colors ${d.rightAction}`}
          title={rightAction.title}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            skipClickRef.current = true;
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
