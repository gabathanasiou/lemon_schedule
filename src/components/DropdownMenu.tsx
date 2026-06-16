import React from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';

interface DropdownMenuProps {
  open: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  trigger: React.ReactNode;
  align?: 'left' | 'right';
  width?: string;
  children: React.ReactNode;
}

export default function DropdownMenu({
  open,
  onClose,
  onOpenChange,
  trigger,
  align = 'right',
  width,
  children,
}: DropdownMenuProps) {
  return (
    <RadixDropdownMenu.Root open={open} onOpenChange={(o) => { if (onOpenChange) onOpenChange(o); else if (!o) onClose(); }} modal={false}>
      <RadixDropdownMenu.Trigger asChild>
        {trigger}
      </RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content
          className={`bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[200] text-zinc-300 p-1 flex flex-col font-sans select-none max-h-80 overflow-y-auto min-w-0 scrollbar-custom opacity-0 scale-95 data-[state=open]:opacity-100 data-[state=open]:scale-100 transition-all duration-150 ease-out ${width || ''}`}
          align={align === 'left' ? 'start' : 'end'}
          sideOffset={8}
          collisionPadding={8}
        >
          {children}
        </RadixDropdownMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  );
}
