import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { TB_BTN_ICON, ToolButton } from '@gabriel/ui-kit';
import { ReportBlock, ReportCollection, Project, ReportTextStyle, ReportViewMode } from '../../types';
import { ReportCtx, resolveCollectionItems, resolveRelativeItems, reportItemLabel, locationsOfItem, filterItemsByScope, ReportCollectionItem } from '../../lib/reportData';
import { FieldAux, ReportFieldDef } from '../../lib/reportFields';
import { sampleRepeatItem } from '../../lib/reportSampling';
import { COLLECTION_LABELS, findBlock, parentCollectionOf, insideColumnsBlock, listOwnerOf, tableItemCollection, scopedCollectionLabel } from '../../lib/reportBlocks';
import { normalizeColWidths } from '../../lib/ribbonDefaults';
import { IS_COARSE } from '../../lib/device';
import { useColumnResize, ColumnResizeStrip, splitBoundaryEven } from '../columnResize';
import { CellRef } from '../../lib/reportTableMerges';
import { hasCalculatedContent, CALCULATED_CONTENT_TIP } from '../../lib/reportTips';
import { ReportBlockView } from './ReportBlockView';
import { ReportTextStyleRules } from './ReportTextStyleRules';
import { CustomCellSelection } from './useCustomTableCells';
import { RichTextEditorHandle, RichTextState, RICH_TEXT_STATE_IDLE } from './RichTextEditor';
import { DROP_MIME, PaletteDropPayload } from './ReportPalette';
import {
  BLOCK_TYPE_META,
  BlockEditorContent,
} from './blockControls';
import { ColumnsColumnEditorContent, TableColumnEditorContent } from './reportColumnControls';
import { FloatingChrome } from '../FloatingChrome';
import Checkbox from '../Checkbox';
import { TEST_IDS } from '../../lib/testIds';
import type { ReportLocation } from '../../lib/reportWeather';
import { Columns3, GripVertical, Filter, Plus, ArrowRightLeft } from 'lucide-react';

export interface ColSel { colsId: string; colIndex: number; }

/** Container-style block header (repeat/table/columns/relative + the leaf text
 *  header, roadmap 203) — one class string, one look. */
const BLOCK_HEADER_CLS = 'flex items-center gap-1 text-[10px] font-semibold text-sky-700 uppercase tracking-wider px-1';

/** Designer-only ★ for blocks with calculated content (roadmap 203). */
const TipStar: React.FC = () => (
  <span className="report-tip-star" title={CALCULATED_CONTENT_TIP}>★</span>
);

interface ReportDesignerCanvasProps {
  blocks: ReportBlock[];
  headerBlocks: ReportBlock[];
  footerBlocks: ReportBlock[];
  skipFirstHeader: boolean;
  skipFirstFooter: boolean;
  onToggleHeaderSkipFirst: () => void;
  onToggleFooterSkipFirst: () => void;
  selId: string | null;
  selCol: ColSel | null;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  readOnly: boolean;
  /** Global display/edit mode (roadmap 203) — designer-only. `fields` drives
   *  the key↔value seam (`showKeys`) and keeps text/free tables live. */
  mode: ReportViewMode;
  /** Just-added text/free-table block: enter editing + focus once rendered
   *  (the Reports Designer sets it on insert / Free-table switch). */
  autoEditId?: string | null;
  onAutoEditHandled?: () => void;
  project: Project;
  parentCollection?: ReportCollection;
  parentCategory?: string;
  /** Root item in scope (Call Sheet zone: the selected day) — lets the embedded
   *  canvas resolve `{{tokens}}` against it instead of showing raw tags. */
  rootItem?: any;
  onSaveTextStyles?: (styles: ReportTextStyle[]) => void;
  onSelect: (id: string | null) => void;
  onSelectCol: (sel: ColSel | null) => void;
  onPatch: (id: string, patch: Partial<ReportBlock>) => void;
  onInsertAfter: (id: string | null, payload: PaletteDropPayload) => void;
  onInsertBefore: (id: string | null, payload: PaletteDropPayload) => void;
  onInsertInto: (id: string | null, payload: PaletteDropPayload) => void;
  onMoveInto: (containerId: string, moveId: string) => void;
  onDuplicateInto: (containerId: string, moveId: string) => void;
  onMoveTo: (moveId: string, targetId: string, pos: 'before' | 'after') => void;
  onDuplicateTo: (moveId: string, targetId: string, pos: 'before' | 'after') => void;
  onWrap: (targetId: string, payload: PaletteDropPayload, side: 'left' | 'right') => void;
  onInsertIntoColumn: (columnsId: string, colIndex: number, payload: PaletteDropPayload) => void;
  onMoveIntoColumn: (moveId: string, columnsId: string, colIndex: number) => void;
  onDuplicateIntoColumn: (moveId: string, columnsId: string, colIndex: number) => void;
  onInsertNewColumn: (columnsId: string, colIndex: number, payload: PaletteDropPayload) => void;
  onMoveToNewColumn: (moveId: string, columnsId: string, colIndex: number) => void;
  onDuplicateToNewColumn: (moveId: string, columnsId: string, colIndex: number) => void;
  onRemoveColumn: (columnsId: string, colIndex: number) => void;
  onMoveColumn: (columnsId: string, from: number, to: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onMenu: (e: React.MouseEvent, id: string, colIndex?: number) => void;
  /** Switch the editor surface (floating ↔ docked) — hosted in the floating
   *  chrome headers (roadmap 205). */
  onToggleEditorMode?: () => void;
  onInsertTableColumnAt: (tableId: string, colIndex: number) => void;
  onRemoveTableColumn: (tableId: string, colIndex: number) => void;
  onMoveTableColumn: (tableId: string, from: number, to: number) => void;
  /** Free-table cell selection (roadmap 189), owned by ReportDesigner so the
   *  docked inspector mirrors the canvas. `blockId` identifies the table. */
  cellSel?: (CustomCellSelection & { blockId: string }) | null;
  onCellSel?: (blockId: string, sel: CustomCellSelection | null) => void;
  cellEditorRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  onCellRtStateChange?: (state: RichTextState) => void;
  /** Inline text editing channel (roadmap 191): the Reports Designer supplies
   *  its own so the docked toolbar shares the exact instance; the Call Sheet
   *  zone designer omits it and the canvas owns a local fallback. */
  textEditorRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  textRtState?: RichTextState;
  onTextRtStateChange?: (state: RichTextState) => void;
  textChipKey?: string | null;
  onTextSelectionChange?: (sel: { key: string; pos: number } | null) => void;
  onInsertIntoZone: (zone: 'header' | 'body' | 'footer', payload: PaletteDropPayload) => void;
  editorMode: 'floating' | 'toolbar';
  viewWidth?: number | null;
  pageSize?: 'portrait' | 'landscape';
  /** Bare embed (Call Sheet zone editor, roadmap 10): render ONLY the editable
   *  block list — no Header/Footer zones, no page-width/scroll wrapper — so the
   *  same DnD + floating-chrome canvas can sit inside another surface. */
  bare?: boolean;
  /** Designer-picked production day (section index, roadmap 198) — day-scoped
   *  repeats sample this day instead of always Day 1. */
  previewSectionIndex?: number;
}

type ZoneKind = 'header' | 'body' | 'footer';

/** Shared drag-over/drop behavior for the header/footer zones and an empty body. */
function zoneDropHandlers(
  zone: ZoneKind,
  onInsert: (zone: ZoneKind, payload: PaletteDropPayload) => void,
  isDrag: (e: React.DragEvent) => boolean,
  pendingRef: React.MutableRefObject<{ id: string; pos: 'before' | 'after' } | null>,
  endDrag: () => void,
) {
  return {
    onDragOver(e: React.DragEvent) {
      if (!isDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setAttribute('data-active', '1');
      pendingRef.current = { id: '', pos: 'after' };
    },
    onDragLeave(e: React.DragEvent) {
      const cur = e.currentTarget;
      if (e.relatedTarget && cur.contains(e.relatedTarget as Node)) return;
      cur.removeAttribute('data-active');
      pendingRef.current = null;
    },
    onDrop(e: React.DragEvent) {
      if (!isDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      let payload: PaletteDropPayload | null = null;
      try { payload = JSON.parse(e.dataTransfer.getData(DROP_MIME)); } catch { /* ignore */ }
      if (payload) onInsert(zone, payload);
      endDrag();
    },
  };
}

/** Empty-container drop target shared by repeat/relative/callSheetEdit: click
 *  adds a text block, dropping a palette item or an existing block inserts. */
const EmptyDropZone: React.FC<{
  blockId: string;
  label: string;
  pendingRef: React.MutableRefObject<{ id: string; pos: 'before' | 'after' } | null>;
  onInsertInto: (id: string, payload: PaletteDropPayload) => void;
  onMoveInto: (containerId: string, moveId: string) => void;
  onDuplicateInto: (containerId: string, moveId: string) => void;
  endDrag: () => void;
}> = ({ blockId, label, pendingRef, onInsertInto, onMoveInto, onDuplicateInto, endDrag }) => (
  <div
    className="repeat-drop-empty"
    style={{ minHeight: 56, border: '2px dashed #c4c4cc', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
    onClick={e => { e.stopPropagation(); onInsertInto(blockId, { kind: 'block', type: 'text' }); }}
    onDragOver={e => {
      if (!e.dataTransfer.types.includes(DROP_MIME)) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setAttribute('data-active', '1');
      pendingRef.current = { id: blockId, pos: 'after' };
    }}
    onDragLeave={e => {
      const cur = e.currentTarget;
      if (e.relatedTarget && cur.contains(e.relatedTarget as Node)) return;
      cur.removeAttribute('data-active');
      pendingRef.current = null;
    }}
    onDrop={e => {
      if (!e.dataTransfer.types.includes(DROP_MIME)) return;
      e.preventDefault();
      e.stopPropagation();
      let payload: PaletteDropPayload | null = null;
      try { payload = JSON.parse(e.dataTransfer.getData(DROP_MIME)); } catch { /* ignore */ }
      if (payload) {
        if (payload.moveId) {
          if (payload.duplicate) onDuplicateInto(blockId, payload.moveId);
          else onMoveInto(blockId, payload.moveId);
        } else {
          onInsertInto(blockId, payload);
        }
      }
      endDrag();
    }}
  >
    <Plus className="w-3.5 h-3.5 text-zinc-400" />
    <span className="text-[10px] text-zinc-400 italic">{label}</span>
  </div>
);

const ReportDesignerCanvas: React.FC<ReportDesignerCanvasProps> = ({ blocks, headerBlocks, footerBlocks, skipFirstHeader, skipFirstFooter, onToggleHeaderSkipFirst, onToggleFooterSkipFirst, selId, selCol, ctx, fieldMap, readOnly, mode, autoEditId, onAutoEditHandled, project, parentCollection, parentCategory, rootItem, onSaveTextStyles, viewWidth, pageSize, onSelect, onSelectCol, onPatch, onInsertAfter, onInsertBefore, onInsertInto, onMoveInto, onDuplicateInto, onMoveTo, onDuplicateTo, onWrap, onInsertIntoColumn, onMoveIntoColumn, onDuplicateIntoColumn, onInsertNewColumn, onMoveToNewColumn, onDuplicateToNewColumn, onRemoveColumn, onMoveColumn, onDuplicate, onRemove, onMove, onMenu, onToggleEditorMode, onInsertTableColumnAt, onRemoveTableColumn, onMoveTableColumn, onInsertIntoZone, editorMode, bare, previewSectionIndex, cellSel, onCellSel, cellEditorRef, onCellRtStateChange, textEditorRef: textEditorRefProp, textRtState: textRtStateProp, onTextRtStateChange: onTextRtStateChangeProp, textChipKey: textChipKeyProp, onTextSelectionChange: onTextSelectionChangeProp }) => {

  const allBlocks = React.useMemo(() => [...headerBlocks, ...blocks, ...footerBlocks], [headerBlocks, blocks, footerBlocks]);
  const [dragging, setDragging] = useState(false);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  // A drag that starts inside a free-table cell is a TEXT selection — the
  // card's native block drag must be off until the pointer is released.
  const [cellDragBlockId, setCellDragBlockId] = useState<string | null>(null);
  // Inline editing (roadmaps 191/203): the block currently entered in Values
  // mode (text OR free table), which text block's editor holds DOM focus
  // (drag suppression — drag resumes on blur) and the editor channel. Fields
  // mode needs no entry state: text and free tables render live directly.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [textFocusedId, setTextFocusedId] = useState<string | null>(null);
  // Values free-table entry: the cell the double-click/tap-again landed on —
  // the table focuses it once it goes live.
  const [tableFocusCell, setTableFocusCell] = useState<CellRef | null>(null);
  const [ownTextEditorRef] = useState<React.MutableRefObject<RichTextEditorHandle | null>>(() => ({ current: null }));
  const [ownTextRtState, setOwnTextRtState] = useState<RichTextState>(RICH_TEXT_STATE_IDLE);
  const [ownTextChipKey, setOwnTextChipKey] = useState<string | null>(null);
  const textEditorRef = textEditorRefProp ?? ownTextEditorRef;
  const textRtState = textRtStateProp ?? ownTextRtState;
  const handleTextRtState = onTextRtStateChangeProp ?? setOwnTextRtState;
  const textChipKey = textChipKeyProp !== undefined ? textChipKeyProp : ownTextChipKey;
  const handleTextSelection = onTextSelectionChangeProp ?? ((sel: { key: string; pos: number } | null) => setOwnTextChipKey(sel?.key ?? null));
  // Leave the editing block (another block / the background selected) → end
  // inline editing and reset the channel.
  useEffect(() => {
    if (editingId && selId !== editingId) {
      setEditingId(null);
      setTextFocusedId(null);
      setTableFocusCell(null);
      handleTextSelection(null);
      handleTextRtState(RICH_TEXT_STATE_IDLE);
    }
  }, [selId, editingId, handleTextSelection, handleTextRtState]);
  // Switching mode ends any Values entry (Fields renders live directly).
  useEffect(() => {
    setEditingId(null);
    setTextFocusedId(null);
    setTableFocusCell(null);
  }, [mode]);
  // Freshly added text / free-table blocks (palette, context menu, or a table
  // switched to Free table): enter editing with the caret inside once the
  // block has rendered.
  useEffect(() => {
    if (!autoEditId) return;
    const target = findBlock(allBlocks, autoEditId)?.block;
    if (!target) return;
    // Insert paths already select the new block — only correct a mismatch
    // (`onSelect` would also clear a sibling column selection).
    if (selId !== autoEditId) onSelect(autoEditId);
    if (mode === 'values' && target.type === 'text') {
      setEditingId(autoEditId);
    } else if (mode === 'values' && target.type === 'table' && target.custom) {
      const row = target.customRows?.[0];
      const col = (target.columns || [])[0];
      setTableFocusCell(row && col ? { rowId: row.id, colId: col.id } : null);
      setEditingId(autoEditId);
    } else {
      // Fields mode (or nothing focusable in the block): focus the first live
      // editor / header input directly.
      requestAnimationFrame(() => {
        const root = containerRef.current?.querySelector<HTMLElement>(`[data-block-id="${autoEditId}"]`);
        const el = root?.querySelector<HTMLElement>('.tiptap') ?? root?.querySelector<HTMLElement>('.report-ct-header-input');
        el?.focus();
      });
    }
    onAutoEditHandled?.();
  }, [autoEditId, allBlocks, mode, selId, onSelect, onAutoEditHandled]);
  // Canvas unmount (design switch / preview) resets the parent's channel too.
  const textChannelRef = useRef({ sel: handleTextSelection, state: handleTextRtState });
  textChannelRef.current = { sel: handleTextSelection, state: handleTextRtState };
  useEffect(() => () => {
    textChannelRef.current.sel(null);
    textChannelRef.current.state(RICH_TEXT_STATE_IDLE);
  }, []);
  // HTML5 drags (palette or block) must not be intercepted by the floating
  // editors — they hide for the duration of any DROP_MIME drag.
  const [externalDrag, setExternalDrag] = useState(false);
  const pendingRef = useRef<{ id: string; pos: 'before' | 'after' } | null>(null);
  const performRef = useRef<(id: string, pos: 'before' | 'after', payload: PaletteDropPayload) => void>(() => {});
  const containerRef = useRef<HTMLDivElement>(null);

  // Floating editors live in FloatingChrome (portal to the current window's
  // body, positioned by Floating UI with flip/shift/size middleware) so they
  // always stay fully inside the viewport — see src/components/FloatingChrome.tsx.

  performRef.current = (id, pos, payload) => {
    if (payload.moveId) {
      if (payload.duplicate) onDuplicateTo(payload.moveId, id, pos);
      else onMoveTo(payload.moveId, id, pos);
    } else if (pos === 'before') onInsertBefore(id, payload);
    else onInsertAfter(id, payload);
  };

  /** Removes every lingering drop indicator inside the canvas (dragleave often
   *  doesn't fire before a drop, leaving data-active highlights stuck). */
  const clearActiveZones = () => {
    containerRef.current?.querySelectorAll('[data-active="1"]').forEach(el => el.removeAttribute('data-active'));
  };

  const endDrag = () => {
    pendingRef.current = null;
    clearActiveZones();
    setDragging(false);
    setDragSourceId(null);
  };

  useEffect(() => {
    const end = (e: Event) => {
      const p = pendingRef.current;
      if (p) {
        let payload: PaletteDropPayload | null = null;
        try {
          if (e instanceof DragEvent && e.dataTransfer) payload = JSON.parse(e.dataTransfer.getData(DROP_MIME));
        } catch { /* ignore */ }
        if (payload) performRef.current(p.id, p.pos, payload);
      }
      endDrag();
    };
    window.addEventListener('dragend', end);
    return () => window.removeEventListener('dragend', end);
  }, []);

  // Hide the floating editors while any DROP_MIME drag is in flight so they
  // never intercept palette/block drops meant for dropzones underneath.
  useEffect(() => {
    const onStart = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes(DROP_MIME)) setExternalDrag(true);
    };
    const onEnd = () => {
      setExternalDrag(false);
      clearActiveZones();
    };
    document.addEventListener('dragstart', onStart, true);
    document.addEventListener('dragend', onEnd);
    document.addEventListener('drop', onEnd);
    return () => {
      document.removeEventListener('dragstart', onStart, true);
      document.removeEventListener('dragend', onEnd);
      document.removeEventListener('drop', onEnd);
    };
  }, []);

  const isDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DROP_MIME);

  const startBlockDrag = (e: React.DragEvent, b: ReportBlock) => {
    e.stopPropagation();
    e.dataTransfer.setData(DROP_MIME, JSON.stringify({ kind: 'block', type: 'text', moveId: b.id, duplicate: e.altKey }));
    e.dataTransfer.effectAllowed = e.altKey ? 'copy' : 'move';
    setDragging(true);
    setDragSourceId(b.id);
    const card = e.currentTarget as HTMLElement;
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.style.position = 'fixed';
    ghost.style.left = '-9999px';
    ghost.style.top = '0';
    ghost.style.width = '260px';
    ghost.style.background = '#ffffff';
    ghost.style.outline = '1px solid #3b82f6';
    ghost.style.borderRadius = '6px';
    ghost.style.boxShadow = '0 10px 28px rgba(0,0,0,0.35)';
    ghost.style.zIndex = '9999';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 20, 20);
    setTimeout(() => ghost.remove(), 200);
  };

  const renderZone = (b: ReportBlock, pos: 'before' | 'after', depth: number) => (
    <div
      className="block-dropzone"
      data-zone={`${b.id}:${pos}`}
      style={{ height: 10, borderRadius: 4, display: 'flex', alignItems: 'center' }}
      onDragOver={e => {
        if (!isDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setAttribute('data-active', '1');
        pendingRef.current = { id: b.id, pos };
      }}
      onDragLeave={e => {
        const cur = e.currentTarget;
        if (e.relatedTarget && cur.contains(e.relatedTarget as Node)) return;
        cur.removeAttribute('data-active');
        if (pendingRef.current && pendingRef.current.id === b.id && pendingRef.current.pos === pos) pendingRef.current = null;
      }}
      onDrop={e => {
        if (!isDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        const p = pendingRef.current;
        let payload: PaletteDropPayload | null = null;
        try { payload = JSON.parse(e.dataTransfer.getData(DROP_MIME)); } catch { /* ignore */ }
        if (p && payload) performRef.current(p.id, p.pos, payload);
        endDrag();
      }}
    >
      <div className="zone-line" style={{ display: 'none', height: 2, background: '#3b82f6', width: '100%', borderRadius: 2 }} />
    </div>
  );

  /** The cell an event's element stack resolves to (cell contents, headers,
   *  overlays and resize handles all included). */
  const cellFromEvent = (e: { target: EventTarget | null; clientX: number; clientY: number }): CellRef | null => {
    const target = e.target as HTMLElement | null;
    const fromEl = (el: Element | null | undefined): CellRef | null => {
      const cell = (el as HTMLElement | null)?.closest?.('[data-cell]');
      const [rowId, colId] = (cell?.getAttribute('data-cell') || '').split(':');
      return rowId && colId ? { rowId, colId } : null;
    };
    const direct = fromEl(target);
    if (direct) return direct;
    for (const el of target?.ownerDocument?.elementsFromPoint?.(e.clientX, e.clientY) ?? []) {
      const hit = fromEl(el);
      if (hit) return hit;
    }
    return null;
  };
  // A selected text block enters editing on a single click of its body — but
  // DEFERRED a beat: entering on the opening click of a double-click would
  // mount the editor under the second click and word-select natively. A real
  // double-click (or another pointerdown) cancels the timer and enters/selects
  // instead, so both gestures land exactly like roadmap 191.
  const textEntryTimerRef = useRef<number | null>(null);
  const selIdNowRef = useRef(selId);
  selIdNowRef.current = selId;
  const cancelTextEntry = () => {
    if (textEntryTimerRef.current != null) { clearTimeout(textEntryTimerRef.current); textEntryTimerRef.current = null; }
  };
  const scheduleTextEntry = (id: string) => {
    cancelTextEntry();
    textEntryTimerRef.current = window.setTimeout(() => {
      textEntryTimerRef.current = null;
      if (selIdNowRef.current === id) setEditingId(id);
    }, 250);
  };
  useEffect(() => () => { if (textEntryTimerRef.current != null) clearTimeout(textEntryTimerRef.current); }, []);

  // The cell each of the last two pointerdowns resolved to, plus whether they
  // form a double-click pair (time + distance). Selecting the card inserts the
  // in-flow resize strip, which SHIFTS the table before the second click — and
  // an empty row is only a few px tall, so the second click often lands on a
  // DIFFERENT cell. The paired first click is the truthful entry target.
  const pointerCellRef = useRef<{ paired: boolean; prev: CellRef | null; last: { cell: CellRef | null; t: number; x: number; y: number } | null }>({ paired: false, prev: null, last: null });
  const recordPointerCell = (e: React.PointerEvent) => {
    const h = pointerCellRef.current;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const paired = !!h.last && now - h.last.t < 700 && Math.hypot(e.clientX - h.last.x, e.clientY - h.last.y) < 16;
    pointerCellRef.current = { paired, prev: paired && h.last ? h.last.cell : null, last: { cell: cellFromEvent(e), t: now, x: e.clientX, y: e.clientY } };
  };
  /** Entry target: a paired first click's cell wins (it saw the pre-shift
   *  layout); a lone click uses its own resolution. */
  const entryCellFromEvent = (e: { target: EventTarget | null; clientX: number; clientY: number }): CellRef | null =>
    pointerCellRef.current.paired ? pointerCellRef.current.prev : cellFromEvent(e);

  /** Free-table cell selection props for one block (roadmap 189). */
  const cellPropsFor = (b: ReportBlock) => (!b.custom ? {} : {
    cellSelection: cellSel && cellSel.blockId === b.id ? { anchor: cellSel.anchor, focus: cellSel.focus } : null,
    onCellSelectionChange: onCellSel ? (sel: CustomCellSelection | null) => onCellSel(b.id, sel) : undefined,
    cellEditorRef,
    onCellRtStateChange,
    cellDocked: editorMode === 'toolbar',
    onToggleEditorMode,
    onCellSaveTextStyles: onSaveTextStyles,
    mode,
    tableEditing: editingId === b.id,
    focusCell: editingId === b.id ? tableFocusCell : null,
  });

  const renderBlocks = (list: ReportBlock[], depth: number, parentColl?: ReportCollection, parentItem?: any, parentCategory?: string, onceIds?: Set<string>, ancestors?: any, parentItems?: ReportCollectionItem[], parentItemIndex?: number): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    list.forEach((b, i) => {
      const selected = selId === b.id;
      const parentCollection = parentColl || parentCollectionOf(allBlocks, b.id);
      const meta = BLOCK_TYPE_META[b.type] || { label: b.type, icon: null };
      const isTable = b.type === 'table';
      const selectedTableCol = isTable && selCol && selCol.colsId === b.id ? selCol : null;
      // Designer chrome extras (sampled template context): the relative block's
      // resolved target label + a text/field block's item locations (the
      // "Show location" picker needs the item's available locations).
      const relItems = b.type === 'relative'
        ? resolveRelativeItems(ctx, b, parentCollection, parentCategory, undefined, parentItems, parentItem, parentItemIndex, ancestors)
        : null;
      const relTarget = b.type === 'relative' && relItems && relItems.length > 0 && parentCollection
        ? `→ ${reportItemLabel(parentCollection, relItems[0])}`
        : null;
      const itemLocations = (b.type === 'text' || b.type === 'field' || b.type === 'map') && parentItem ? locationsOfItem(ctx, parentItem) : [];
      // Inline text editing (roadmaps 191/203): Fields mode ALWAYS renders the
      // live chip editor; Values enters it on double-click / tap-again. Only
      // the Values ENTRY wears the editing outline — Fields editors are the
      // normal state, never a selection look.
      const isEditingText = b.type === 'text' && (mode === 'fields' || editingId === b.id);
      const enteredTextEditing = b.type === 'text' && mode === 'values' && editingId === b.id;
      const textEditProps = b.type === 'text' ? {
        editing: isEditingText,
        textAutoFocus: mode === 'values',
        textEditorRef,
        onTextStateChange: handleTextRtState,
        onTextSelectionChange: handleTextSelection,
        onTextEditEnd: () => { setEditingId(null); setTextFocusedId(null); },
        onTextFocusChange: (focused: boolean) => setTextFocusedId(focused ? b.id : null),
      } : {};

      out.push(
        <div key={`z-${b.id}`}>{renderZone(b, 'before', depth)}</div>,
        <div key={b.id}>
          <div
            data-block-id={b.id}
            className={`block-card block-type-${b.type}${selected ? ' selected' : ''}${enteredTextEditing ? ' block-text-editing' : ''}`}
            onClick={e => {
              e.stopPropagation();
              // Collection-table cells own their clicks (column select/reorder);
              // a click that lands on one must not select the card and clear the
              // column. Free-table cells own their selection too: a click on a
              // CELL keeps it (selecting the block just reveals the resize
              // strip), a click on the card itself deselects the cells so the
              // table's own block chrome returns.
              const el = e.target as HTMLElement;
              if (!b.custom && el.closest?.('[data-table-col-ci]')) return;
              const clickedCell = b.custom ? cellFromEvent(e) : null;
              if (b.custom && onCellSel && !clickedCell) onCellSel(b.id, null);
              if (!readOnly && mode === 'values') {
                const exitEditing = () => {
                  setEditingId(null);
                  setTextFocusedId(null);
                  setTableFocusCell(null);
                  handleTextSelection(null);
                  handleTextRtState(RICH_TEXT_STATE_IDLE);
                };
                if (b.custom && editingId === b.id) {
                  // Editing: a click on the card (padding/header) exits; cells
                  // stay live (the click places the caret natively).
                  if (!clickedCell) exitEditing();
                } else if (b.type === 'text' && editingId === b.id) {
                  // Same for text: a click outside the live editor (leaf
                  // header / card padding) exits, so a following double-click
                  // re-enters cleanly instead of leaving a blurred editor.
                  if (!el.closest?.('.report-text-editor')) exitEditing();
                } else if (b.custom && selId === b.id) {
                  // Selected card + click on a cell → enter editing (coarse
                  // second taps are pair-aware; the strip shift can move rows).
                  const cell = IS_COARSE ? entryCellFromEvent(e) : clickedCell;
                  if (cell) { setTableFocusCell(cell); setEditingId(b.id); }
                } else if (b.type === 'text' && selId === b.id && !isEditingText && (IS_COARSE || el.closest?.('.report-text-block'))) {
                  // Already-selected text block: clicking its BODY enters
                  // inline editing (the same second-click rule free tables
                  // use). Desktop keeps the leaf header as the pure
                  // select/drag handle; coarse pointers can't double-click
                  // cleanly, so a second tap anywhere on the card enters.
                  if (IS_COARSE) setEditingId(b.id);
                  else scheduleTextEntry(b.id);
                }
              }
              onSelect(b.id);
            }}
            onDoubleClick={!readOnly && mode === 'values' && (b.type === 'text' || b.custom) ? e => {
              e.stopPropagation();
              cancelTextEntry();
              onSelect(b.id);
              if (b.custom) {
                const cell = entryCellFromEvent(e);
                if (!cell) return;
                setTableFocusCell(cell);
              }
              setEditingId(b.id);
            } : undefined}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onMenu(e, b.id); }}
            onPointerDown={e => {
              cancelTextEntry();
              if (!b.custom) return;
              recordPointerCell(e);
              // Suppress the block drag only while the table is LIVE (Fields /
              // Values entry): there the cells are text surfaces. Values-static
              // cells keep the card draggable — and, critically, no state update
              // means no re-render between mousedown and mouseup (a re-render
              // remounts the cell content and the browser then swallows the
              // click/dblclick, so the block never selects or enters editing).
              if ((mode === 'fields' || editingId === b.id) && (e.target as HTMLElement).closest?.('[data-cell]')) setCellDragBlockId(b.id);
            }}
            onPointerUp={b.custom ? () => setCellDragBlockId(null) : undefined}
            onPointerCancel={b.custom ? () => setCellDragBlockId(null) : undefined}
            // While a Values-mode editor holds the card (text focus / cell
            // drag) the card must not drag — text selection never starts a
            // block drag. Fields mode keeps the card draggable (the leaf header
            // and padding drag) and cancels body drags in onDragStart instead.
            draggable={!readOnly && !(b.custom && cellDragBlockId === b.id) && !(b.type === 'text' && mode === 'values' && textFocusedId === b.id)}
            onDragStart={e => {
              if (b.custom && cellDragBlockId === b.id) { e.preventDefault(); return; }
              const from = e.target as HTMLElement;
              // Fields mode: live editor bodies (text + free-table cells) are
              // text surfaces — cancel the card drag so gestures select text.
              // The leaf header and card padding still drag the block.
              if (mode === 'fields' && (from.closest?.('.report-text-editor') || from.closest?.('[data-cell]'))) { e.preventDefault(); return; }
              startBlockDrag(e, b);
            }}
            style={{
              cursor: 'pointer',
              position: 'relative',
              opacity: dragging && dragSourceId === b.id ? 0.35 : 1,
              transition: 'opacity 150ms ease',
            }}
          >
            {dragging && (!insideColumnsBlock(allBlocks, b.id) || listOwnerOf(allBlocks, b.id)?.colIndex !== undefined) && (
              <>
                <EdgeZone side="left" b={b} depth={depth} onWrap={(id, payload, side) => { onWrap(id, payload, side); endDrag(); }} pendingRef={pendingRef} />
                <EdgeZone side="right" b={b} depth={depth} onWrap={(id, payload, side) => { onWrap(id, payload, side); endDrag(); }} pendingRef={pendingRef} />
              </>
            )}
            {selected && editorMode === 'floating' && !externalDrag
              && !(b.custom && cellSel?.blockId === b.id) && (
              <BlockChrome
                block={b}
                project={project}
                parentCollection={parentCollection}
                parentCategory={parentCategory}
                readOnly={readOnly}
                onSaveTextStyles={onSaveTextStyles}
                onPatch={p => onPatch(b.id, p)}
                onDuplicate={() => onDuplicate(b.id)}
                onRemove={() => onRemove(b.id)}
                onMove={d => onMove(b.id, d)}
                onToggleEditorMode={onToggleEditorMode}
                relativeTarget={relTarget}
                availableLocations={itemLocations}
                editorRef={textEditorRef}
                active={textRtState}
                chipKey={textChipKey}
                ctx={ctx}
              />
            )}
            {selectedTableCol && editorMode === 'floating' && !externalDrag && (
              <TableColumnChrome
                block={b}
                colIndex={selectedTableCol.colIndex}
                project={project}
                parentCollection={parentCollection}
                readOnly={readOnly}
                ctx={ctx}
                onPatch={p => onPatch(b.id, p)}
                onInsertAt={i => onInsertTableColumnAt(b.id, i)}
                onRemove={() => onRemoveTableColumn(b.id, selectedTableCol.colIndex)}
                onMoveCol={d => onMoveTableColumn(b.id, selectedTableCol.colIndex, selectedTableCol.colIndex + d)}
                onToggleEditorMode={onToggleEditorMode}
              />
            )}

            {(b.type === 'repeat' || b.type === 'table' || b.type === 'relative') ? (
              <div className="flex flex-col gap-2">
                <div className={BLOCK_HEADER_CLS}>
                  {meta.icon}
                  {b.type === 'relative'
                    ? `Advance · ${b.relativeOffset ?? 1} ${(b.relativeOffset ?? 1) < 0 ? 'back' : 'ahead'} × ${Math.max(1, b.relativeCount ?? 1)}${relTarget ? ` — ${relTarget}` : ''}`
                    : b.type === 'table'
                      ? b.custom
                        ? 'Free table'
                        : `Table: ${scopedCollectionLabel(tableItemCollection(b, parentCollection as ReportCollection | undefined), parentCollection as ReportCollection | undefined, b.scopedToParent !== false)}`
                      : `Repeat: ${scopedCollectionLabel(b.collection || 'scenes', parentCollection as ReportCollection | undefined, b.scopedToParent !== false)}`}
                  {b.collection === 'elements' ? ` (${b.category || 'props'})` : ''}
                  {b.collection === 'locations' && b.category ? ` (${(project.locationTypes || []).find(t => t.key === b.category)?.label || b.category})` : ''}
                  {b.type === 'table' && !b.custom && (b.axis ?? 'columns') === 'rows' ? ' · rows mode' : ''}
                  {b.type === 'table' && b.custom && hasCalculatedContent(b) && <TipStar />}
                  {b.itemFilter && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-700 px-1.5 py-px text-[9px] font-bold normal-case tracking-normal" title={`Filtered: ${b.itemFilter.field} = ${b.itemFilter.values.join(', ')}`}>
                      <Filter className="w-2.5 h-2.5" /> Filtered
                    </span>
                  )}
                </div>
                {resizeTarget && resizeTarget.id === b.id && (
                  <TableResizeBar
                    block={resizeTarget}
                    canvasRef={containerRef}
                    onResize={widths => onPatch(resizeTarget.id, { columns: (resizeTarget.columns || []).map((c, i) => ({ ...c, width: widths[i] ?? c.width })) })}
                  />
                )}
                {b.type === 'repeat' && b.children && b.children.length > 0 ? (
                  <div className="repeat-children" style={{ display: 'flex', flexDirection: 'column' }}>
                    {(() => {
                      const coll = b.collection as ReportCollection | undefined;
                      const onceTables = (b.children || []).filter(cb => cb.type === 'table' && coll === 'elementsOfCategory' && tableItemCollection(cb, coll) === coll);
                      const onceIds = new Set(onceTables.map(cb => cb.id));
                      const regular = (b.children || []).filter(cb => !onceIds.has(cb.id));
                      const childItem = sampleRepeatItem(ctx, b, fieldMap, parentItem, parentCategory, ancestors, previewSectionIndex);
                      const parentList = coll ? filterItemsByScope(resolveCollectionItems(ctx, coll, b.category, parentItem, parentCategory, b, ancestors) as ReportCollectionItem[], coll, coll === 'elements' ? b.category : undefined, undefined) : [];
                      const childIdx = childItem ? parentList.findIndex(it => it === childItem) : -1;
                      return (
                        <>
                          {renderBlocks(regular, depth + 1, b.collection, childItem, b.category, undefined, childItem ? [childItem, ...(ancestors || [])] : undefined, parentList, childIdx >= 0 ? childIdx : undefined)}
                          {onceTables.length > 0 && renderBlocks(onceTables, depth + 1, b.collection, parentItem, parentCategory, onceIds, parentItem ? [parentItem, ...(ancestors || [])] : undefined)}
                        </>
                      );
                    })()}
                  </div>
                ) : b.type === 'relative' && b.children && b.children.length > 0 ? (
                  <div className="repeat-children" style={{ display: 'flex', flexDirection: 'column' }}>
                    {(() => {
                      const relChildren = b.children || [];
                      const childItem = relItems && relItems.length > 0 ? relItems[0] : undefined;
                      return renderBlocks(relChildren, depth + 1, parentCollection, childItem, parentCategory, undefined, childItem ? [childItem, ...(ancestors || [])] : undefined, relItems || [], 0);
                    })()}
                  </div>
                ) : b.type === 'repeat' || b.type === 'relative' ? (
                  <EmptyDropZone
                    blockId={b.id}
                    label={`Drop inside ${b.type === 'relative' ? 'relative' : 'repeat'} (or click to add text)`}
                    pendingRef={pendingRef}
                    onInsertInto={onInsertInto}
                    onMoveInto={onMoveInto}
                    onDuplicateInto={onDuplicateInto}
                    endDrag={endDrag}
                  />
                ) : (
                  <ReportBlockView block={b} ctx={ctx} fieldMap={fieldMap} item={parentItem} parentCategory={parentCategory} parentCollection={parentCollection} hint mode={mode} showUnresolved aux={{ index: 0, pageSize }} onceTable={onceIds?.has(b.id)} ancestors={ancestors} editorTableLimit onColumnSelect={isTable ? (ci => onSelectCol({ colsId: b.id, colIndex: ci })) : undefined} onColumnContextMenu={isTable ? ((e, ci) => onMenu(e, b.id, ci)) : undefined} onMoveColumn={isTable ? ((from, to) => onMoveTableColumn(b.id, from, to)) : undefined} selectedColumn={selectedTableCol?.colIndex ?? null} onPatchBlock={p => onPatch(b.id, p)} selected={selected} {...cellPropsFor(b)} {...textEditProps} />
                )}
              </div>
            ) : b.type === 'pageBreak' ? (
              <div className="flex items-center gap-2 py-1 select-none">
                <div style={{ flex: 1, borderTop: '2px dashed #a1a1aa' }} />
                <span className="text-[10px] font-semibold text-zinc-500 tracking-wider">PAGE BREAK</span>
                <div style={{ flex: 1, borderTop: '2px dashed #a1a1aa' }} />
              </div>
            ) : b.type === 'columns' ? (
              (() => {
                const cols = b.cols || [];
                const total = cols.reduce((a, c) => a + c.width, 0);
                const dropNewColumn = (colIndex: number, payload: PaletteDropPayload) => {
                  if (payload.moveId) {
                    if (payload.duplicate) onDuplicateToNewColumn(payload.moveId, b.id, colIndex);
                    else onMoveToNewColumn(payload.moveId, b.id, colIndex);
                  } else {
                    onInsertNewColumn(b.id, colIndex, payload);
                  }
                  endDrag();
                };
                const colWidths = cols.map(c => c.width);
                return (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-sky-700 uppercase tracking-wider px-1">
                      <Columns3 className="w-3 h-3" />
                      Columns · {cols.length}
                    </div>
                    <div className="columns-row relative" style={{ display: 'flex' }} data-dragging={dragging ? '1' : '0'}>
                      {cols.map((col, ci) => {
                        const colSelected = !!selCol && selCol.colsId === b.id && selCol.colIndex === ci;
                        const resizable = ci >= 1 && ci < cols.length;
                        return (
                          <React.Fragment key={col.id}>
                            <GutterZone
                              colIndex={ci}
                              edge={ci === 0 ? 'left' : undefined}
                              resizable={resizable}
                              widths={colWidths}
                              canvasRef={containerRef}
                              onDrop={dropNewColumn}
                              onCommitWidths={cw => onPatch(b.id, { cols: cols.map((c, i) => ({ ...c, width: cw[i] })) })}
                            />
                            <div
                              className={`columns-col${colSelected ? ' selected' : ''}${ci > 0 ? ' col-has-prev' : ''}${ci < cols.length - 1 ? ' col-has-next' : ''}`}
                              data-col-width={col.width}
                              style={{
                                flex: `${total > 0 ? col.width / total : 1 / cols.length} 1 0%`,
                                minWidth: 0,
                              }}
                              onClick={e => { e.stopPropagation(); onSelectCol({ colsId: b.id, colIndex: ci }); }}
                              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onMenu(e, b.id, ci); }}
                            >
                              {colSelected && editorMode === 'floating' && !externalDrag && (
                                <ColumnBlockChrome
                                  colIndex={ci}
                                  colsCount={cols.length}
                                  readOnly={readOnly}
                                  onInsertAt={at => onInsertNewColumn(b.id, at, { kind: 'block', type: 'text' })}
                                  onMove={d => onMoveColumn(b.id, ci, ci + d)}
                                  onDelete={() => onRemoveColumn(b.id, ci)}
                                  onToggleEditorMode={onToggleEditorMode}
                                />
                              )}
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {renderBlocks(col.blocks || [], depth, parentCollection, parentItem, parentCategory, undefined, ancestors)}
                              </div>
                              {(col.blocks || []).length === 0 && (
                                <div
                                  className="column-drop-empty"
                                  style={{ minHeight: 48, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  onDragOver={e => {
                                    if (!isDrag(e)) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.currentTarget.setAttribute('data-active', '1');
                                  }}
                                  onDragLeave={e => {
                                    const cur = e.currentTarget;
                                    if (e.relatedTarget && cur.contains(e.relatedTarget as Node)) return;
                                    cur.removeAttribute('data-active');
                                  }}
                                  onDrop={e => {
                                    if (!isDrag(e)) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    let payload: PaletteDropPayload | null = null;
                                    try { payload = JSON.parse(e.dataTransfer.getData(DROP_MIME)); } catch { /* ignore */ }
                                    if (payload) {
                                      if (payload.moveId) {
                                        if (payload.duplicate) onDuplicateIntoColumn(payload.moveId, b.id, ci);
                                        else onMoveIntoColumn(payload.moveId, b.id, ci);
                                      } else {
                                        onInsertIntoColumn(b.id, ci, payload);
                                      }
                                    }
                                    endDrag();
                                  }}
                                >
                                  <span className="text-[10px] text-zinc-400 italic">Drag blocks here</span>
                                </div>
                              )}
                            </div>
                          </React.Fragment>
                        );
                      })}
                      <GutterZone colIndex={cols.length} edge="right" widths={colWidths} canvasRef={containerRef} onDrop={dropNewColumn} />
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className={b.type === 'text' ? 'flex flex-col gap-2' : undefined}>
                {b.type === 'text' && (
                  <div className={BLOCK_HEADER_CLS}>
                    {meta.icon}
                    Text
                    {hasCalculatedContent(b) && <TipStar />}
                  </div>
                )}
                <ReportBlockView block={b} ctx={ctx} fieldMap={fieldMap} item={parentItem} parentCategory={parentCategory} parentCollection={parentCollection} hint mode={mode} showUnresolved previewLimit aux={{ index: 0, pageSize }} ancestors={ancestors} onColumnSelect={isTable ? (ci => onSelectCol({ colsId: b.id, colIndex: ci })) : undefined} onColumnContextMenu={isTable ? ((e, ci) => onMenu(e, b.id, ci)) : undefined} onMoveColumn={isTable ? ((from, to) => onMoveTableColumn(b.id, from, to)) : undefined} selectedColumn={selectedTableCol?.colIndex ?? null} onPatchBlock={p => onPatch(b.id, p)} selected={selected} {...cellPropsFor(b)} {...textEditProps} />
              </div>
            )}
          </div>
        </div>,
      );
      if (i === list.length - 1) out.push(<div key={`za-${b.id}`}>{renderZone(b, 'after', depth)}</div>);
    });
    return out;
  };

  // Selected table (columns mode) → resize bar overlay inside its card.
  // Free tables render their own synced strip in `CustomTable`.
  const selBlock = selId ? findBlock(allBlocks, selId)?.block : null;
  const resizeTarget = selBlock && selBlock.type === 'table' && !selBlock.custom && (selBlock.axis ?? 'columns') === 'columns' && (selBlock.columns || []).length > 0 ? selBlock : null;

  const emptyBodyDrop = (
    <div
      className={bare
        ? 'report-zone-body-empty text-center text-zinc-400 text-[10px] italic py-4 cursor-pointer'
        : 'report-zone-body-empty text-center text-zinc-500 text-sm py-20 border border-dashed border-zinc-400 rounded-lg cursor-pointer'}
      data-zone-list="body"
      onClick={() => onInsertIntoZone('body', { kind: 'block', type: 'text' })}
      {...zoneDropHandlers('body', onInsertIntoZone, isDrag, pendingRef, endDrag)}
    >
      {bare ? 'No blocks yet — click or drag from the palette.' : 'No blocks yet — click or drag from the palette to build the report.'}
    </div>
  );
  const bodyBlocks = blocks.length === 0 ? emptyBodyDrop : <div className="flex flex-col">{renderBlocks(blocks, 0, bare ? parentCollection : undefined, bare ? rootItem : undefined)}</div>;

  if (bare) {
    // Embedded list (Call Sheet zone): same cards / DnD / floating chrome, but
    // no Header/Footer zones and no page-width scroller — the parent owns the
    // surface.
    return (
      <div
        ref={containerRef}
        onClick={() => { onSelect(null); onSelectCol(null); }}
        onDragEnter={e => { if (isDrag(e)) setDragging(true); }}
        onDragLeave={e => {
          const cur = e.currentTarget;
          if (e.relatedTarget && cur.contains(e.relatedTarget as Node)) return;
          pendingRef.current = null;
          clearActiveZones();
        }}
      >
        <ReportTextStyleRules project={ctx.project} />
        {bodyBlocks}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid={TEST_IDS.reportCanvas}
      className="flex-1 overflow-auto p-8"
      onClick={() => { onSelect(null); onSelectCol(null); }}
      onDragEnter={e => { if (isDrag(e)) setDragging(true); }}
      onDragLeave={e => {
        const cur = e.currentTarget;
        if (e.relatedTarget && cur.contains(e.relatedTarget as Node)) return;
        pendingRef.current = null;
        clearActiveZones();
      }}
    >
      <ReportTextStyleRules project={ctx.project} />
      <div data-testid={TEST_IDS.reportPage} className="mx-auto" style={{ width: viewWidth ? `${viewWidth}px` : '100%', minHeight: '80vh', background: '#e4e4e7', borderRadius: 10, padding: 28 }}>
        <ReportZone
          label="Header"
          hint="Appears at the top of every page"
          skipFirst={skipFirstHeader}
          onToggleSkipFirst={onToggleHeaderSkipFirst}
          readOnly={readOnly}
          zone="header"
          empty={headerBlocks.length === 0}
          onInsert={onInsertIntoZone}
          isDrag={isDrag}
          pendingRef={pendingRef}
          endDrag={endDrag}
          gap="after"
        >
          {headerBlocks.length === 0 && <ZoneEmptyHint />}
          {renderBlocks(headerBlocks, 0)}
        </ReportZone>
        {bodyBlocks}
        <ReportZone
          label="Footer"
          hint="Appears at the bottom of every page"
          skipFirst={skipFirstFooter}
          onToggleSkipFirst={onToggleFooterSkipFirst}
          readOnly={readOnly}
          zone="footer"
          empty={footerBlocks.length === 0}
          onInsert={onInsertIntoZone}
          isDrag={isDrag}
          pendingRef={pendingRef}
          endDrag={endDrag}
          gap="before"
        >
          {footerBlocks.length === 0 && <ZoneEmptyHint />}
          {renderBlocks(footerBlocks, 0)}
        </ReportZone>
      </div>
    </div>
  );
};

// ---- header/footer zones --------------------------------------------------------

const ZoneEmptyHint: React.FC = () => (
  <div className="text-[10px] text-zinc-400 italic py-1.5 text-center border border-dashed border-zinc-300 rounded">
    Empty — click or drag palette items here
  </div>
);

const ReportZone: React.FC<{
  label: string;
  hint: string;
  skipFirst: boolean;
  onToggleSkipFirst: () => void;
  readOnly: boolean;
  zone: 'header' | 'footer';
  empty: boolean;
  gap?: 'after' | 'before';
  onInsert: (zone: ZoneKind, payload: PaletteDropPayload) => void;
  isDrag: (e: React.DragEvent) => boolean;
  pendingRef: React.MutableRefObject<{ id: string; pos: 'before' | 'after' } | null>;
  endDrag: () => void;
  children: React.ReactNode;
}> = ({ label, hint, skipFirst, onToggleSkipFirst, readOnly, zone, empty, gap = 'after', onInsert, isDrag, pendingRef, endDrag, children }) => (
  <div
    className="report-zone"
    data-zone-list={zone}
    style={{ border: '1.5px dashed #a1a1aa', borderRadius: 8, padding: '8px 10px', ...(gap === 'after' ? { marginBottom: 16 } : { marginTop: 16 }) }}
    {...(empty ? zoneDropHandlers(zone, onInsert, isDrag, pendingRef, endDrag) : {})}
  >
    <div className="flex items-center gap-2 mb-1.5" onClick={e => e.stopPropagation()}>
      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</span>
      <span className="text-[10px] text-zinc-400 italic">{hint}</span>
      <Checkbox variant="plain" theme="light" checked={skipFirst} disabled={readOnly} onChange={onToggleSkipFirst} label="Skip first page" labelClassName="text-[10px] text-zinc-500" className="ml-auto" />
    </div>
    <div onClick={empty ? (e => { e.stopPropagation(); onInsert(zone, { kind: 'block', type: 'text' }); }) : undefined}>{children}</div>
  </div>
);

// ---- floating block editor (full per-type controls above the selected block) --
// The chrome portals to the window body and floats against the block card via
// FloatingChrome; the inline `.chrome-anchor` div covers the (position:relative)
// card so the panel anchors to the whole card rect.

const BlockChrome: React.FC<{
  block: ReportBlock;
  project: Project;
  parentCollection?: ReportCollection;
  parentCategory?: string;
  readOnly: boolean;
  onSaveTextStyles?: (styles: ReportTextStyle[]) => void;
  onPatch: (patch: Partial<ReportBlock>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  /** Switch to the docked inspector — hosted in the chrome header (roadmap 205). */
  onToggleEditorMode?: () => void;
  relativeTarget?: string | null;
  availableLocations?: ReportLocation[];
  /** Inline text editing channel (roadmap 191) — the chrome body binds to the
   *  canvas block's live editor instead of owning one. */
  editorRef?: React.MutableRefObject<RichTextEditorHandle | null>;
  active?: RichTextState;
  chipKey?: string | null;
  /** Designer context — the rows-mode corner label editor's `@` lookups (199). */
  ctx: ReportCtx;
}> = ({ block, project, parentCollection, parentCategory, readOnly, onSaveTextStyles, onPatch, onDuplicate, onRemove, onMove, onToggleEditorMode, relativeTarget, availableLocations, editorRef, active, chipKey, ctx }) => (
  // anchorMode 'visible' (default): the anchor rect is clipped to the viewport
  // so the panel floats above the VISIBLE part of the card — identical feel
  // for a small text card and a tall repeat/ribbon card.
  <FloatingChrome className="block-chrome" anchorMode="visible">
    <BlockEditorContent
      block={block}
      project={project}
      parentCollection={parentCollection}
      parentCategory={parentCategory}
      readOnly={readOnly}
      onSaveTextStyles={onSaveTextStyles}
      onPatch={onPatch}
      onDuplicate={onDuplicate}
      onRemove={onRemove}
      onMove={onMove}
      compact
      trailing={onToggleEditorMode ? (
        <ToolButton onClick={onToggleEditorMode} disabled={false} title="Toolbar editor" className={TB_BTN_ICON}><ArrowRightLeft className="w-3 h-3" /></ToolButton>
      ) : undefined}
      relativeTarget={relativeTarget}
      availableLocations={availableLocations}
      editorRef={editorRef}
      active={active}
      chipKey={chipKey}
      reportCtx={ctx}
    />
  </FloatingChrome>
);

// ---- floating table-column editor (columns-mode tables) ------------------------
// Edits THE SELECTED COLUMN: field, bold/italic, align, skip-empty + structure.

interface TableColumnChromeProps {
  block: ReportBlock;
  colIndex: number;
  project: Project;
  parentCollection?: ReportCollection;
  readOnly: boolean;
  ctx: ReportCtx;
  onPatch: (patch: Partial<ReportBlock>) => void;
  onInsertAt: (colIndex: number) => void;
  onRemove: () => void;
  onMoveCol: (dir: -1 | 1) => void;
  onToggleEditorMode?: () => void;
}

const TableColumnChrome: React.FC<TableColumnChromeProps> = ({ block, colIndex, project, parentCollection, readOnly, ctx, onPatch, onInsertAt, onRemove, onMoveCol, onToggleEditorMode }) => {
  const columns = block.columns || [];
  const col = columns[colIndex];
  // Anchor the panel to the selected column's header cell (`.report-table-cols
  // [data-table-col-ci]`), falling back to the whole card. The query runs in a
  // layout effect so the cell grid is committed before the anchor resolves.
  const anchorRef = useRef<HTMLDivElement>(null);
  const [reference, setReference] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const card = anchorRef.current?.closest('[data-block-id]');
    if (!card) return;
    const cell = card.querySelector<HTMLElement>(`.report-table-cols [data-table-col-ci="${colIndex}"]`);
    setReference(cell instanceof HTMLElement ? cell : (card as HTMLElement));
  }, [colIndex, block.id]);
  if (!col) return null;
  return (
    <>
      <div ref={anchorRef} className="chrome-anchor" aria-hidden />
      <FloatingChrome className="table-column-chrome" reference={reference}>
        <div className="py-1.5">
          <TableColumnEditorContent
            block={block}
            colIndex={colIndex}
            project={project}
            parentCollection={parentCollection}
            readOnly={readOnly}
            ctx={ctx}
            onPatch={onPatch}
            onInsertAt={onInsertAt}
            onMove={onMoveCol}
            onDelete={onRemove}
            axis={block.axis ?? 'columns'}
            headerTrailing={onToggleEditorMode ? (
              <ToolButton onClick={onToggleEditorMode} disabled={false} title="Toolbar editor" className={TB_BTN_ICON}><ArrowRightLeft className="w-3 h-3" /></ToolButton>
            ) : undefined}
          />
        </div>
      </FloatingChrome>
    </>
  );
};

// ---- floating columns-block column editor (Notion-style columns) ----------------

const ColumnBlockChrome: React.FC<{
  colIndex: number;
  colsCount: number;
  readOnly: boolean;
  onInsertAt: (at: number) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onToggleEditorMode?: () => void;
}> = ({ colIndex, colsCount, readOnly, onInsertAt, onMove, onDelete, onToggleEditorMode }) => (
  <FloatingChrome className="column-chrome">
    <div className="py-1.5">
      <ColumnsColumnEditorContent
        colIndex={colIndex}
        colsCount={colsCount}
        readOnly={readOnly}
        onInsertAt={onInsertAt}
        onMove={onMove}
        onDelete={onDelete}
        headerTrailing={onToggleEditorMode ? (
          <ToolButton onClick={onToggleEditorMode} disabled={false} title="Toolbar editor" className={TB_BTN_ICON}><ArrowRightLeft className="w-3 h-3" /></ToolButton>
        ) : undefined}
      />
    </div>
  </FloatingChrome>
);

// ---- edge dropzones (Notion-style wrap into columns) --------------------------

const EdgeZone: React.FC<{
  side: 'left' | 'right';
  b: ReportBlock;
  depth: number;
  onWrap: (targetId: string, payload: PaletteDropPayload, side: 'left' | 'right') => void;
  pendingRef: React.MutableRefObject<{ id: string; pos: 'before' | 'after' } | null>;
}> = ({ side, b, onWrap, pendingRef }) => {
  const isDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DROP_MIME);
  const style: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 10,
    zIndex: 25,
    ...(side === 'left' ? { left: -1 } : { right: -1 }),
  };
  return (
    <div
      className="block-edge-zone"
      data-zone={`${b.id}:${side}`}
      style={style}
      onDragOver={e => {
        if (!isDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setAttribute('data-active', '1');
      }}
      onDragLeave={e => {
        const cur = e.currentTarget;
        if (e.relatedTarget && cur.contains(e.relatedTarget as Node)) return;
        cur.removeAttribute('data-active');
      }}
      onDrop={e => {
        if (!isDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        let payload: PaletteDropPayload | null = null;
        try { payload = JSON.parse(e.dataTransfer.getData(DROP_MIME)); } catch { /* ignore */ }
        if (payload) onWrap(b.id, payload, side);
        pendingRef.current = null;
      }}
    />
  );
};

// ---- columns block: Notion-style gutter zones (drop → new column) ----------

const GutterZone: React.FC<{
  colIndex: number;
  edge?: 'left' | 'right';
  resizable?: boolean;
  widths: number[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  onDrop: (colIndex: number, payload: PaletteDropPayload) => void;
  onCommitWidths?: (widths: number[]) => void;
}> = ({ colIndex, edge, resizable, widths, canvasRef, onDrop, onCommitWidths }) => {
  const isDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DROP_MIME);
  const selfRef = useRef<HTMLDivElement>(null);
  // The resizable gutter at colIndex ci resizes the boundary (ci-1, ci).
  const startResize = useColumnResize(widths, {
    getWidth: () => selfRef.current?.parentElement?.clientWidth || 1,
    touchActionTargets: [canvasRef.current],
    apply: (cw) => {
      const row = selfRef.current?.parentElement;
      if (!row) return;
      row.querySelectorAll('.columns-col').forEach((el, i) => {
        (el as HTMLElement).style.flex = `${cw[i]} 1 0%`;
      });
    },
    commit: (cw) => onCommitWidths?.(normalizeColWidths(cw)),
  });
  return (
    <div
      ref={selfRef}
      className={`column-gutter${resizable ? ' resizable' : ''}`}
      data-zone={`gutter:${colIndex}`}
      style={edge
        ? { position: 'absolute', top: 0, bottom: 0, width: 8, zIndex: 50, ...(edge === 'left' ? { left: -8 } : { right: -8 }) }
        : { flex: '0 0 8px', alignSelf: 'stretch', position: 'relative', zIndex: 50 }}
      onPointerDown={resizable && onCommitWidths ? (e => startResize(colIndex - 1, e)) : undefined}
      onDragOver={e => {
        if (!isDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setAttribute('data-active', '1');
      }}
      onDragLeave={e => {
        const cur = e.currentTarget;
        if (e.relatedTarget && cur.contains(e.relatedTarget as Node)) return;
        cur.removeAttribute('data-active');
      }}
      onDrop={e => {
        if (!isDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        let payload: PaletteDropPayload | null = null;
        try { payload = JSON.parse(e.dataTransfer.getData(DROP_MIME)); } catch { /* ignore */ }
        if (payload) onDrop(colIndex, payload);
      }}
    >
      <div className="gutter-line" style={{ display: 'none', position: 'absolute', top: 0, bottom: 0, left: 3, width: 2, borderRadius: 1 }} />
    </div>
  );
};

// ---- table column resize bar (shared ribbon-style dragger) ----------------

const TableResizeBar: React.FC<{ block: ReportBlock; onResize: (widths: number[]) => void; canvasRef: React.RefObject<HTMLDivElement | null> }> = ({ block, onResize, canvasRef }) => {
  const columns = block.columns || [];
  const widths = columns.map(c => c.width);
  const stripRef = useRef<HTMLDivElement>(null);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  const resolveCard = () => {
    // Resolve fresh on every call — the canvas re-renders/remounts the table
    // when designs switch, and a cached node would go stale.
    return stripRef.current?.closest('[data-block-id]')?.querySelector('.report-table-cols') as HTMLElement | null;
  };

  const startResize = useColumnResize(widths, {
    getWidth: () => resolveCard()?.clientWidth || 1,
    touchActionTargets: [canvasRef.current],
    // Widths apply to EVERY cell by column index (data-table-col-ci) — header
    // and every body row track the drag together.
    apply: (cw) => {
      const card = resolveCard();
      if (!card) return;
      card.querySelectorAll('[data-table-col-ci]').forEach(el => {
        const elm = el as HTMLElement;
        const ci = Number(elm.getAttribute('data-table-col-ci'));
        if (Number.isFinite(ci)) elm.style.width = `${cw[ci]}%`;
      });
      // Keep the handle strip tracking the live columns.
      if (stripRef.current) stripRef.current.style.gridTemplateColumns = cw.map(w => `${w}%`).join(' ');
    },
    commit: (cw) => {
      // NOTE: do NOT clear the live inline widths here. React's style diff
      // compares against the previous RENDER's style objects, so columns whose
      // width is unchanged (e.g. 7% → 7%) would be left without an inline
      // width after the direct-DOM manipulation was cleared — the flex row
      // then re-distributes and the whole table shifts (the item 23 bug). The
      // drag-applied widths equal the committed design, and React overwrites
      // the DOM wherever the design differs.
      onResizeRef.current(normalizeColWidths(cw));
    },
  });

  if (widths.length < 2) return null;

  // Double-click a tab (roadmap 194): the boundary's two columns split evenly.
  const resetBoundary = (ci: number) => {
    const next = splitBoundaryEven(widths, ci);
    if (next) onResizeRef.current(normalizeColWidths(next));
  };

  // The handle strip is IN FLOW: it occupies its own band between the label
  // row and the table, pushing the table down while selected — the tabs
  // (anchored bottom-0) sit in that gap, flush against the table's top edge
  // (-mb-2 cancels the container's gap-2), never overlapping the header
  // cells. No part reaches above the card, so the selected block's floating
  // chrome can never cover the handles.
  return (
    <div className={`${IS_COARSE ? 'h-10' : 'h-5'} -mb-2 select-none`}>
      <ColumnResizeStrip widths={widths} startResize={startResize} containerRef={stripRef} onResetBoundary={resetBoundary} />
    </div>
  );
};

export default ReportDesignerCanvas;
