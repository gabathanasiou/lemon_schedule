import React, { createContext, useContext, useCallback, useState, useRef, useEffect } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { Pencil, Copy, Trash2, Plus, Check, X, RotateCcw } from 'lucide-react';
import { usePortalTarget } from '../lib/popoutTarget';

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
  const portalTarget = usePortalTarget();

  const contentClasses = theme === 'light'
    ? 'bg-white border border-zinc-200 rounded-lg shadow-xl z-[200] text-zinc-700 p-1 flex flex-col font-sans select-none max-h-[min(75vh,30rem)] overflow-y-auto min-w-0 scrollbar-custom opacity-0 scale-95 data-[state=open]:opacity-100 data-[state=open]:scale-100 transition-all duration-150 ease-out'
    : theme === 'blue'
    ? 'bg-blue-950/95 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl z-[200] text-white p-1 flex flex-col font-sans select-none max-h-[min(75vh,30rem)] overflow-y-auto min-w-0 scrollbar-custom opacity-0 scale-95 data-[state=open]:opacity-100 data-[state=open]:scale-100 transition-all duration-150 ease-out'
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
      <RadixDropdownMenu.Portal container={portalTarget ?? undefined}>
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

// ── Item Manager Dropdown ──

interface ItemManagerDropdownProps {
  open: boolean;
  onClose: (open: boolean) => void;
  items: { id: string; name: string }[];
  activeId: string;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => string | void;
  onDelete: (id: string) => void;
  onCreate?: () => string | void;
  onImport?: () => void;
  onExport?: () => void;
  onReset?: () => void;
  onTrash?: () => void;
  closeOnSelect?: boolean;
  readOnly?: boolean;
  theme?: DropdownTheme;
  label: string;
  header: string;
  itemLabel?: string;
  trigger: React.ReactNode;
  minItems?: number;
}

export function ItemManagerDropdown({
  open,
  onClose,
  items,
  activeId,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
  onCreate,
  onImport,
  onExport,
  onReset,
  onTrash,
  closeOnSelect,
  readOnly = false,
  theme,
  label,
  header,
  itemLabel,
  trigger,
  minItems = 1,
}: ItemManagerDropdownProps) {
  const isBlue = theme === 'blue';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const th = {
    text: isBlue ? 'text-white' : 'text-zinc-300',
    textBright: isBlue ? 'text-white' : 'text-white',
    textDim: isBlue ? 'text-white/60' : 'text-zinc-500',
    textActive: isBlue ? 'text-white font-semibold' : 'text-blue-200 font-medium',
    hoverBg: isBlue ? 'hover:bg-white/10' : 'hover:bg-zinc-800',
    hoverBgBright: isBlue ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-zinc-800 hover:text-white',
    hoverText: isBlue ? 'hover:text-white' : 'hover:text-white',
    activeBg: isBlue ? 'bg-white/15' : 'bg-blue-600/20',
    separator: isBlue ? 'border-t border-white/10 my-1' : 'border-t border-zinc-800 my-1',
    inputBg: isBlue ? 'bg-white/10 border-white/10 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-200',
    inputFocus: isBlue ? 'focus:border-white/30' : 'focus:border-zinc-500',
    iconColor: isBlue ? 'text-white/70' : 'text-zinc-400',
    btnBase: isBlue ? 'text-white/60 hover:text-white' : 'text-zinc-500 hover:text-zinc-300',
    btnActive: isBlue ? 'text-white hover:text-white' : 'text-blue-300 hover:text-blue-200',
    btnDelete: isBlue ? 'text-white/60 hover:text-red-400' : 'text-zinc-500 hover:text-red-400',
    btnDeleteActive: isBlue ? 'text-white hover:text-red-400' : 'text-blue-300 hover:text-red-400',
    btnDeleteDisabled: 'text-zinc-700 pointer-events-none',
  };

  useEffect(() => {
    if (editingId) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
      const item = items.find(i => i.id === editingId);
      if (item && !editValue) {
        setEditValue(item.name);
      }
    }
  }, [editingId]);

  useEffect(() => {
    if (editingId) {
      const item = items.find(i => i.id === editingId);
      if (item && !editValue) {
        setEditValue(item.name);
      }
    }
  }, [editingId, items]);

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setEditValue(name);
  };

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const cancelRename = () => {
    setEditingId(null);
  };

  const createLabel = itemLabel || header.replace(/S$/, '').replace(/s$/, '');

  return (
    <DropdownMenu open={open} onOpenChange={(o) => { if (!o) { setEditingId(null); setEditValue(''); } if (!o || !readOnly) onClose(o); }} width="w-80" theme={theme} trigger={trigger}>
      <div className={`px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider ${th.textDim}`}>
        {header}
      </div>
      {items.map(item => {
        const isActive = item.id === activeId;
        const isEditing = editingId === item.id;
        return (
          <div key={item.id} className={`flex items-center gap-1 rounded my-0.5 ${isActive ? th.activeBg : th.hoverBg} ${editingId && !isEditing ? 'opacity-40 pointer-events-none' : ''}`}>
            {isEditing ? (
              <>
                <div
                  className="flex-1 min-w-0 px-3 py-2 rounded text-xs outline-none flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitRename(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelRename(); } }}
                    className={`w-full border rounded px-1.5 py-0.5 text-xs outline-none ${th.inputBg} ${th.inputFocus}`}
                  />
                </div>
                <RadixDropdownMenu.Item
                  className="shrink-0 w-6 h-6 rounded flex items-center justify-center hover:text-green-400 outline-none cursor-pointer"
                  onSelect={e => { e.preventDefault(); commitRename(); }}
                  onTouchStart={() => {}}
                >
                  <Check className="w-3 h-3" />
                </RadixDropdownMenu.Item>
                <RadixDropdownMenu.Item
                  className="shrink-0 w-6 h-6 rounded flex items-center justify-center hover:text-red-400 outline-none cursor-pointer"
                  onSelect={e => { e.preventDefault(); cancelRename(); }}
                  onTouchStart={() => {}}
                >
                  <X className="w-3 h-3" />
                </RadixDropdownMenu.Item>
              </>
            ) : (
              <>
                <RadixDropdownMenu.Item
                  className={`flex-1 min-w-0 px-3 py-2 rounded text-xs outline-none cursor-pointer flex items-center ${th.text} ${isActive ? '' : th.hoverText}`}
                  onSelect={closeOnSelect ? () => { onSelect(item.id); } : e => { e.preventDefault(); onSelect(item.id); }}
                  onTouchStart={() => {}}
                >
                  <span className={`truncate ${isActive ? th.textActive + ' font-medium' : ''}`}>{item.name}</span>
                </RadixDropdownMenu.Item>
                <RadixDropdownMenu.Item
                  className={`shrink-0 w-6 h-6 rounded flex items-center justify-center outline-none cursor-pointer ${isActive ? th.btnActive : th.btnBase}`}
                  onSelect={e => { e.preventDefault(); startRename(item.id, item.name); }}
                  onTouchStart={() => {}}
                  disabled={readOnly}
                >
                  <Pencil className="w-3 h-3" />
                </RadixDropdownMenu.Item>
                <RadixDropdownMenu.Item
                  className={`shrink-0 w-6 h-6 rounded flex items-center justify-center outline-none cursor-pointer ${isActive ? th.btnActive : th.btnBase}`}
                  onSelect={e => { e.preventDefault(); const newId = onDuplicate(item.id); if (newId) startRename(newId, `${item.name} Copy`); }}
                  onTouchStart={() => {}}
                  disabled={readOnly}
                >
                  <Copy className="w-3 h-3" />
                </RadixDropdownMenu.Item>
                <RadixDropdownMenu.Item
                  className={`shrink-0 w-6 h-6 rounded flex items-center justify-center outline-none cursor-pointer ${items.length <= minItems ? th.btnDeleteDisabled : isActive ? th.btnDeleteActive : th.btnDelete}`}
                  onSelect={e => { e.preventDefault(); onDelete(item.id); }}
                  onTouchStart={() => {}}
                  disabled={readOnly || items.length <= minItems}
                >
                  <Trash2 className="w-3 h-3" />
                </RadixDropdownMenu.Item>
              </>
            )}
          </div>
        );
      })}
      <div className={editingId ? 'opacity-40 pointer-events-none' : ''}>
        {onReset && (
          <>
            <RadixDropdownMenu.Separator className={th.separator} />
            <RadixDropdownMenu.Item
              className={`w-full text-left px-3 py-2 text-xs rounded flex items-center gap-2 transition-colors outline-none cursor-pointer select-none ${th.text} ${th.hoverBgBright}`}
              onSelect={e => { e.preventDefault(); onReset(); }}
              onTouchStart={() => {}}
              disabled={readOnly}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${th.iconColor}`} />
              Reset to Default
            </RadixDropdownMenu.Item>
          </>
        )}
        {(onCreate || onImport || onExport || onTrash) && (
          <RadixDropdownMenu.Separator className={th.separator} />
        )}
        {onCreate && (
          <RadixDropdownMenu.Item
            className={`w-full text-left px-3 py-2 text-xs rounded flex items-center gap-2 transition-colors outline-none cursor-pointer select-none ${th.text} ${th.hoverBgBright}`}
            onSelect={e => { e.preventDefault(); const newId = onCreate(); if (newId) startRename(newId, ''); }}
            onTouchStart={() => {}}
            disabled={readOnly}
          >
            <Plus className={`w-3.5 h-3.5 ${th.iconColor}`} />
            New {createLabel}
          </RadixDropdownMenu.Item>
        )}
        {onImport && (
          <RadixDropdownMenu.Item
            className={`w-full text-left px-3 py-2 text-xs rounded flex items-center gap-2 transition-colors outline-none cursor-pointer select-none ${th.text} ${th.hoverBgBright}`}
            onSelect={e => { e.preventDefault(); onImport(); }}
            onTouchStart={() => {}}
            disabled={readOnly}
          >
            <svg className={`w-3.5 h-3.5 ${th.iconColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Import
          </RadixDropdownMenu.Item>
        )}
        {onExport && (
          <RadixDropdownMenu.Item
            className={`w-full text-left px-3 py-2 text-xs rounded flex items-center gap-2 transition-colors outline-none cursor-pointer select-none ${th.text} ${th.hoverBgBright}`}
            onSelect={e => { e.preventDefault(); onExport(); }}
            onTouchStart={() => {}}
            disabled={readOnly}
          >
            <svg className={`w-3.5 h-3.5 ${th.iconColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Export
          </RadixDropdownMenu.Item>
        )}
        {onTrash && (
          <RadixDropdownMenu.Item
            className={`w-full text-left px-3 py-2 text-xs rounded flex items-center gap-2 transition-colors outline-none cursor-pointer select-none ${th.text} ${th.hoverBgBright}`}
            onSelect={e => { e.preventDefault(); onTrash(); }}
            onTouchStart={() => {}}
            disabled={readOnly}
          >
            <Trash2 className={`w-3.5 h-3.5 ${th.iconColor}`} />
            Trash
          </RadixDropdownMenu.Item>
        )}
      </div>
    </DropdownMenu>
  );
}
