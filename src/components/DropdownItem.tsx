import React from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';

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
  const variantStyles = variant === 'danger'
    ? 'text-red-400 hover:bg-red-900/30 hover:text-red-300 focus-visible:bg-red-900/30 focus-visible:text-red-300'
    : 'text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:bg-zinc-800 focus-visible:text-white';

  return (
    <RadixDropdownMenu.Item
      className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-xs transition-colors outline-none cursor-pointer select-none ${variantStyles} ${disabled ? 'opacity-30 pointer-events-none' : ''} ${className}`}
      onSelect={(e) => { onClick(); }}
      disabled={disabled}
    >
      {icon && <span className="text-zinc-400 shrink-0">{icon}</span>}
      {children}
    </RadixDropdownMenu.Item>
  );
}
