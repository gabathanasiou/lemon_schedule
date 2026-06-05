import React from 'react';

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
    ? 'hover:bg-rose-950/40 hover:text-rose-400'
    : 'hover:bg-zinc-800 hover:text-white';

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-xs transition-colors ${variantStyles} ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
    >
      {icon && <span className="text-zinc-400 shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
