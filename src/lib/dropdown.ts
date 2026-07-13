import { useEffect, useCallback, type RefObject } from 'react';
import { CastMember } from '../types';
import { IS_COARSE } from './device';
import { useCurrentDocument } from './popoutTarget';

const DD_ITEM_BASE = IS_COARSE ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs';

export const DD_ITEM = (active: boolean) =>
  `${DD_ITEM_BASE} rounded cursor-pointer font-[Helvetica,sans-serif] font-normal transition-colors active:transition-none ${active ? 'bg-blue-50 text-blue-700 active:bg-blue-200' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200 active:text-zinc-900'}`;

export const DD_CONTAINER =
  "absolute top-full z-[100] bg-white border border-zinc-200 rounded-lg shadow-lg p-1 max-h-48 overflow-y-auto mt-1";

export type CloseRef = { current: (() => void) | null };

export const globalDropdownCloseRef: CloseRef = { current: null };

export function useDropdown(open: boolean, ref: RefObject<HTMLDivElement>, onClose?: () => void, panelRef?: RefObject<HTMLDivElement>) {
  const currentDocument = useCurrentDocument();
  useEffect(() => {
    if (open) {
      globalDropdownCloseRef.current = () => onClose?.();
      const onClick = (e: PointerEvent) => {
        const inWrapper = ref.current && ref.current.contains(e.target as Node);
        const inPanel = panelRef?.current && panelRef.current.contains(e.target as Node);
        if (!inWrapper && !inPanel) {
          onClose?.();
        }
      };
      currentDocument.addEventListener('pointerdown', onClick);
      return () => {
        currentDocument.removeEventListener('pointerdown', onClick);
        globalDropdownCloseRef.current = undefined;
      };
    }
  }, [open, ref, onClose, panelRef, currentDocument]);
}

export function useOpenHandler(setOpen: (v: boolean) => void) {
  return useCallback(() => {
    globalDropdownCloseRef.current?.();
    setOpen(true);
  }, [setOpen]);
}

export function sortCastMembers(list: CastMember[], currentIds: string[], displayMode: 'id' | 'name' = 'id') {
  return [...list].sort((a, b) => {
    if (displayMode === 'name') {
      const aSel = currentIds.includes(a.name);
      const bSel = currentIds.includes(b.name);
      if (aSel !== bSel) return aSel ? -1 : 1;
      if (aSel && bSel) return currentIds.indexOf(a.name) - currentIds.indexOf(b.name);
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    }
    const aMatch = a.id || a.name;
    const bMatch = b.id || b.name;
    const aSel = currentIds.includes(aMatch);
    const bSel = currentIds.includes(bMatch);
    if (aSel !== bSel) return aSel ? -1 : 1;
    const na = parseInt(aMatch, 10);
    const nb = parseInt(bMatch, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return aMatch.localeCompare(bMatch, undefined, { numeric: true });
  });
}
