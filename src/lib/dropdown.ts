import { useEffect, useCallback, useRef, type RefObject } from 'react';
import { CastMember } from '../types';
import { IS_COARSE } from './device';
import { useCurrentDocument } from './popoutTarget';

const DD_ITEM_BASE = IS_COARSE ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs';

export const DD_ITEM = (active: boolean) =>
  `${DD_ITEM_BASE} rounded cursor-pointer font-[Helvetica,sans-serif] font-normal transition-colors active:transition-none ${active ? 'bg-blue-50 text-blue-700 active:bg-blue-200' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200 active:text-zinc-900'}`;

export const DD_CONTAINER =
  "absolute top-full z-[100] bg-white border border-zinc-200 rounded-lg shadow-lg p-1 max-h-48 overflow-y-auto mt-1";

export const DD_ITEM_BASE_LIB = IS_COARSE ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs';

export const DD_ITEM_CLASS_LIB = (active: boolean) =>
  `w-full text-left ${DD_ITEM_BASE_LIB} rounded cursor-pointer transition-colors active:transition-none flex items-center gap-2 ${active ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 active:bg-blue-200' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200 active:text-zinc-900'}`;

const DD_INPUT_TOUCH_LIB = IS_COARSE ? 'px-4 py-3 text-base' : 'px-3 py-2 text-sm';

export const DD_PANEL_CLASS_LIB = (positioning: string) =>
  positioning === 'fixed'
    ? 'z-[10010] bg-white border border-zinc-200 rounded-md shadow-lg p-1 min-w-[200px] flex flex-col pointer-events-auto'
    : 'absolute top-full left-0 z-[100] bg-white border border-zinc-200 rounded-lg shadow-lg p-1 mt-1 min-w-[180px] flex flex-col';

export const DD_INPUT_CLASS_LIB = (standalone: boolean) =>
  standalone
    ? `w-full border border-zinc-300 rounded-md ${DD_INPUT_TOUCH_LIB} focus:outline-none focus:ring-2 focus:ring-zinc-900`
    : 'text-inherit placeholder:text-inherit placeholder:opacity-50 bg-transparent w-full h-full outline-none text-left';

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

/**
 * Escape inside an open dropdown must dismiss ONLY the dropdown — NEVER the
 * enclosing app Modal (a Radix dialog closes on Escape via a document
 * CAPTURE listener registered when the dialog opens). This interceptor is
 * registered at MOUNT (capture listeners run in registration order, so a
 * mount-time registration always wins over the dialog's later one) and, while
 * `active`, swallows Escape at the very start (stopImmediatePropagation) and
 * runs `onEscape` (the dropdown's own dismiss logic — its input-level handler
 * never fires because the native event is stopped before it reaches the tree).
 * When no dropdown is open the interceptor stays silent and the modal closes
 * as usual.
 */
export function useEscapeCapture(active: boolean, onEscape: () => void) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const currentDocument = useCurrentDocument();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !activeRef.current) return;
      e.stopImmediatePropagation();
      onEscapeRef.current();
    };
    currentDocument.addEventListener('keydown', onKey, { capture: true });
    return () => currentDocument.removeEventListener('keydown', onKey, { capture: true });
  }, [currentDocument]);
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
