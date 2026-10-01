import { useEffect, useCallback, useRef, type RefObject } from 'react';
import { CastMember } from '../types';
import { IS_COARSE } from './device';
import { useCurrentDocument } from './popoutTarget';

/**
 * Dark chip trigger — the shared "chip button" look for ANY dropdown/menu
 * trigger inside a dark modal (EntityDropdown `variant="chip"`,
 * CategoryDropdown triggers, the day-status menu trigger, …). Text size is
 * NOT included — consumers add `text-xs` (or their size); real `<button>`
 * triggers add `cursor-pointer`. Layout-specific extras (a `relative` wrapper
 * for an absolute value overlay, `justify-between`, min-widths) append on top.
 */
export const DD_CHIP_TRIGGER_CLASS =
  `flex items-center gap-1.5 ${IS_COARSE ? 'px-3.5 py-2.5' : 'px-2.5 py-1.5'} bg-zinc-950 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-900`;

/**
 * Padding for the `wrapValue` chip's absolute textarea so its caret sits
 * exactly on the in-flow value span's glyphs: left = the chip's px, right =
 * the chip's px + the span's `pr-4` chevron clearance (chevron `right-2 w-3`).
 * The plain chip input needs no padding — it lives in the content box.
 */
export const DD_CHIP_WRAP_EDITOR_PAD = IS_COARSE ? 'pl-3.5 pr-[30px] py-2.5' : 'pl-2.5 pr-[26px] py-1.5';

const DD_ITEM_BASE = IS_COARSE ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs';

export const DD_ITEM = (active: boolean) =>
  `${DD_ITEM_BASE} rounded cursor-pointer font-[Helvetica,sans-serif] font-normal transition-colors active:transition-none ${active ? 'bg-blue-50 text-blue-700 active:bg-blue-200' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200 active:text-zinc-900'}`;

export const DD_CONTAINER =
  "absolute top-full z-[100] bg-white border border-zinc-200 rounded-lg shadow-lg p-1 max-h-48 overflow-y-auto mt-1";

export const DD_ITEM_BASE_LIB = IS_COARSE ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs';

/* Dark panel item base (EntityDropdown variant="chip" / DropdownPanel dark) —
   scales with IS_COARSE like the kit menu (DropdownMenu ITEM_PAD) and the
   light panel, so iPad tap targets are as big as every other dropdown. */
export const DD_ITEM_BASE_DARK_LIB = IS_COARSE ? 'px-4 py-3 text-sm' : 'px-3 py-2 text-xs';

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

/** Latest pointerdown per document — lets `useDropdown` recognize the second
 *  press of the gesture that opened a dropdown. Glide's permissive
 *  double-click detection activates a cell editor on the FIRST mouseup of a
 *  double-click, so the second mousedown lands on the overlay chrome just
 *  after the editor opened and would close it (or blur-commit it). That press
 *  is within a few px of the opener and inside the double-click window. */
const lastDownByDoc = new WeakMap<Document, { at: number; x: number; y: number }>();
const trackedDocs = new WeakSet<Document>();
function trackPointerDowns(doc: Document) {
  if (trackedDocs.has(doc)) return;
  trackedDocs.add(doc);
  doc.addEventListener('pointerdown', (e) => {
    lastDownByDoc.set(doc, { at: performance.now(), x: e.clientX, y: e.clientY });
  }, { capture: true });
}
const DOUBLE_CLICK_MS = 500;
const DOUBLE_CLICK_SLOP_PX = 24;

export function useDropdown(open: boolean, ref: RefObject<HTMLElement | null>, onClose?: () => void, panelRef?: RefObject<HTMLElement | null>) {
  const currentDocument = useCurrentDocument();
  useEffect(() => {
    if (open) {
      trackPointerDowns(currentDocument);
      const opener = lastDownByDoc.get(currentDocument);
      globalDropdownCloseRef.current = () => onClose?.();
      const onClick = (e: PointerEvent) => {
        const inWrapper = ref.current && ref.current.contains(e.target as Node);
        const inPanel = panelRef?.current && panelRef.current.contains(e.target as Node);
        if (inWrapper || inPanel) return;
        // Second press of the opening double-click — swallow it whole: the
        // close AND the focus change (a blur would commit and close anyway).
        if (opener &&
            performance.now() - opener.at < DOUBLE_CLICK_MS &&
            Math.hypot(e.clientX - opener.x, e.clientY - opener.y) < DOUBLE_CLICK_SLOP_PX) {
          e.preventDefault();
          return;
        }
        onClose?.();
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
 * enclosing app Modal (a Radix dialog closes on Escape via a document CAPTURE
 * listener). This interceptor runs on the WINDOW in the capture phase, which
 * beats any document-level listener regardless of registration order (a
 * dropdown mounted after the dialog — e.g. a Glide cell editor's entity
 * dropdown — used to lose the registration race and let the dialog swallow
 * Escape). While `active` it swallows Escape at the very start
 * (stopImmediatePropagation) and runs `onEscape` (the dropdown's own dismiss
 * logic — its input-level handler never fires because the native event is
 * stopped before it reaches the tree). When no dropdown is open the
 * interceptor stays silent and the modal closes as usual.
 */
export function useEscapeCapture(active: boolean, onEscape: () => void) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const currentDocument = useCurrentDocument();
  useEffect(() => {
    const win = currentDocument?.defaultView;
    if (!win) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !activeRef.current) return;
      e.stopImmediatePropagation();
      onEscapeRef.current();
    };
    win.addEventListener('keydown', onKey, { capture: true });
    return () => win.removeEventListener('keydown', onKey, { capture: true });
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
