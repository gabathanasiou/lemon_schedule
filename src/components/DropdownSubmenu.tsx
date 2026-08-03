import React, { useContext } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight } from 'lucide-react';
import { useDropdownTheme, SubmenuContext } from './DropdownMenu';
import { IS_COARSE } from '../lib/device';
import { usePortalTarget } from '../lib/popoutTarget';

const SUB_ITEM = IS_COARSE ? 'px-4 py-3 text-sm' : 'px-3 py-2 text-xs';

interface DropdownSubmenuProps {
  id: string;
  label: string;
  icon?: React.ReactNode;
  width?: string;
  side?: 'left' | 'right';
  children: React.ReactNode;
}

export default function DropdownSubmenu({ id, label, icon, width, side = 'right', children }: DropdownSubmenuProps) {
  const { activeSub, setActiveSub } = useContext(SubmenuContext);
  const subOpen = activeSub === id;
  const theme = useDropdownTheme();
  const isLight = theme === 'light';
  const isBlue = theme === 'blue';
  const portalTarget = usePortalTarget();

  const triggerClasses = isLight
    ? `w-full text-left ${SUB_ITEM} rounded flex items-center gap-2 transition-colors active:transition-none outline-none cursor-pointer select-none text-zinc-700 justify-between hover:bg-zinc-100 hover:text-zinc-900 focus-visible:bg-zinc-100 focus-visible:text-zinc-900 active:bg-zinc-200 active:text-zinc-900 data-[state=open]:bg-zinc-100 data-[state=open]:text-zinc-900`
    : isBlue
    ? `w-full text-left ${SUB_ITEM} rounded flex items-center gap-2 transition-colors active:transition-none outline-none cursor-pointer select-none text-white justify-between hover:bg-white/10 focus-visible:bg-white/10 active:bg-white/15 data-[state=open]:bg-white/10`
    : `w-full text-left ${SUB_ITEM} rounded flex items-center gap-2 transition-colors active:transition-none outline-none cursor-pointer select-none text-zinc-300 justify-between hover:bg-zinc-800 hover:text-white focus-visible:bg-zinc-800 focus-visible:text-white active:bg-zinc-700 active:text-white data-[state=open]:bg-zinc-800 data-[state=open]:text-white`;

  const contentClasses = isLight
    ? `bg-white border border-zinc-200 rounded-lg shadow-xl z-[210] text-zinc-700 p-1 flex flex-col font-sans select-none max-h-[min(75vh,30rem)] overflow-y-auto min-w-0 ${width || 'w-48'}`
    : isBlue
    ? `bg-blue-950/95 backdrop-blur-md border border-blue-900/50 rounded-lg shadow-2xl z-[210] text-white p-1 flex flex-col font-sans select-none max-h-[min(75vh,30rem)] overflow-y-auto min-w-0 ${width || 'w-48'}`
    : `bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-xl z-[210] text-zinc-300 p-1 flex flex-col font-sans select-none max-h-[min(75vh,30rem)] overflow-y-auto min-w-0 ${width || 'w-48'}`;

  const chevronColor = isLight ? 'text-zinc-400' : isBlue ? 'text-white' : 'text-zinc-500';

  return (
      <RadixDropdownMenu.Sub open={subOpen} onOpenChange={(o) => setActiveSub(o ? id : null)}>
        <RadixDropdownMenu.SubTrigger
          className={triggerClasses}
          onTouchStart={() => {}}
          onPointerDown={(e) => {
            // Pen is hover-capable: hover opens the submenu, so a tap would
            // toggle it closed. Open on tap instead, like a finger.
            if (e.pointerType === 'pen') {
              e.preventDefault();
              setActiveSub(subOpen ? null : id);
            }
          }}
        >
        {side === 'left' && <ChevronRight className={`w-3 h-3 ${chevronColor} rotate-180 order-first`} />}
        <span className="flex items-center gap-2">
          {icon && <span className={`${chevronColor} shrink-0`}>{icon}</span>}
          {label}
        </span>
        {side === 'right' && <ChevronRight className={`w-3 h-3 ${chevronColor}`} />}
      </RadixDropdownMenu.SubTrigger>
      <RadixDropdownMenu.Portal container={portalTarget ?? undefined}>
        <RadixDropdownMenu.SubContent
          className={contentClasses}
          side={side}
          sideOffset={8}
          alignOffset={-4}
          collisionPadding={8}
        >
          {children}
        </RadixDropdownMenu.SubContent>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Sub>
  );
}
