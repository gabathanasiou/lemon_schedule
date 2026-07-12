import React, { createContext, useContext, useCallback, useState } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';

export type DropdownTheme = 'light' | 'dark' | 'blue';

export const DropdownThemeContext = createContext<DropdownTheme>('dark');
export const useDropdownTheme = () => useContext(DropdownThemeContext);

export const SubmenuContext = createContext<{
  activeSub: string | null;
  setActiveSub: (id: string | null) => void;
}>({ activeSub: null, setActiveSub: () => {} });

interface DropdownMenuProps {
  open: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  trigger: React.ReactNode;
  align?: 'left' | 'right';
  width?: string;
  theme?: DropdownTheme;
  children: React.ReactNode;
}

export default function DropdownMenu({
  open,
  onClose,
  onOpenChange,
  trigger,
  align = 'right',
  width,
  theme = 'dark',
  children,
}: DropdownMenuProps) {
  const [activeSub, setActiveSub] = useState<string | null>(null);

  const contentClasses = theme === 'light'
    ? 'bg-white border border-zinc-200 rounded-lg shadow-xl z-[200] text-zinc-700 p-1 flex flex-col font-sans select-none max-h-[min(75vh,30rem)] overflow-y-auto min-w-0 scrollbar-custom opacity-0 scale-95 data-[state=open]:opacity-100 data-[state=open]:scale-100 transition-all duration-150 ease-out'
    : theme === 'blue'
    ? 'bg-blue-950/95 backdrop-blur-md border border-blue-800 rounded-lg shadow-xl z-[200] text-zinc-300 p-1 flex flex-col font-sans select-none max-h-[min(75vh,30rem)] overflow-y-auto min-w-0 scrollbar-custom opacity-0 scale-95 data-[state=open]:opacity-100 data-[state=open]:scale-100 transition-all duration-150 ease-out'
    : 'bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-xl z-[200] text-zinc-300 p-1 flex flex-col font-sans select-none max-h-[min(75vh,30rem)] overflow-y-auto min-w-0 scrollbar-custom opacity-0 scale-95 data-[state=open]:opacity-100 data-[state=open]:scale-100 transition-all duration-150 ease-out';

  const handlePointerDownOutside = useCallback((e: Event) => {
    if ((e as any).nativeEvent?.pointerType === 'pen') {
      e.preventDefault();
    }
  }, []);

  return (
    <RadixDropdownMenu.Root open={open} onOpenChange={(o) => { if (onOpenChange) onOpenChange(o); else if (!o) onClose(); }} modal={false}>
      <RadixDropdownMenu.Trigger asChild>
        {trigger}
      </RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <DropdownThemeContext.Provider value={theme}>
          <SubmenuContext.Provider value={{ activeSub, setActiveSub }}>
            <RadixDropdownMenu.Content
              className={`${contentClasses} ${width || ''}`}
              align={align === 'left' ? 'start' : 'end'}
              sideOffset={8}
              collisionPadding={8}
              style={{ touchAction: 'manipulation' }}
              onPointerDownOutside={handlePointerDownOutside}
            >
              {children}
            </RadixDropdownMenu.Content>
          </SubmenuContext.Provider>
        </DropdownThemeContext.Provider>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  );
}
