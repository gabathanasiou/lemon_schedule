import React from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight } from 'lucide-react';

interface DropdownSubmenuProps {
  label: string;
  icon?: React.ReactNode;
  width?: string;
  children: React.ReactNode;
}

export default function DropdownSubmenu({ label, icon, width, children }: DropdownSubmenuProps) {
  return (
    <RadixDropdownMenu.Sub>
      <RadixDropdownMenu.SubTrigger className="w-full text-left px-3 py-2 rounded flex items-center gap-2 text-xs transition-colors outline-none cursor-pointer select-none text-zinc-300 justify-between hover:bg-zinc-800 hover:text-white focus-visible:bg-zinc-800 focus-visible:text-white data-[state=open]:bg-zinc-800 data-[state=open]:text-white">
        <span className="flex items-center gap-2">
          {icon && <span className="text-zinc-400 shrink-0">{icon}</span>}
          {label}
        </span>
        <ChevronRight className="w-3 h-3 text-zinc-500" />
      </RadixDropdownMenu.SubTrigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.SubContent
          className={`bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[210] text-zinc-300 p-1 flex flex-col font-sans select-none max-h-80 overflow-y-auto min-w-0 ${width || 'w-48'}`}
          sideOffset={4}
          alignOffset={-4}
          collisionPadding={8}
        >
          {children}
        </RadixDropdownMenu.SubContent>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Sub>
  );
}
