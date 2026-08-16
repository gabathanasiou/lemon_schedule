import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { TB_PICKER, TB_DIVIDER, TB_TOGGLE, TB_TOGGLE_ON, TB_TOGGLE_OFF, TB_BTN_ICON, TB_DANGER, ToolButton, ChromeHeader, SectionHeader } from '@gabriel/ui-kit';
import { ReportBlock, ReportCollection, Project, ReportTextStyle, ReportTableColumn } from '../../types';
import { ReportCtx, resolveCollectionItems, resolveRelativeItems, reportItemLabel, locationsOfItem, filterItemsByScope, ReportCollectionItem } from '../../lib/reportData';
import { FieldAux } from '../../lib/reportFields';
import { ReportFieldDef, fieldsForScope, reportFieldValueByKey, ITEM_SCOPES, TOKEN_RE, parseToken } from '../../lib/reportFields';
import { COLLECTION_LABELS, findBlock, parentCollectionOf, insideColumnsBlock, listOwnerOf, tableItemCollection, tableFieldScope, scopedCollectionLabel } from '../../lib/reportBlocks';
import { normalizeColWidths } from '../../lib/ribbonDefaults';
import { useColumnResize, ColumnResizeStrip } from '../columnResize';
import { ReportBlockView } from './ReportBlockView';
import { DROP_MIME, PaletteDropPayload } from './ReportPalette';
import {
  BLOCK_TYPE_META, useReportControlContext,
  BlockEditorContent,
} from './blockControls';
import { FieldPicker } from './FieldPicker';
import { FloatingChrome } from '../FloatingChrome';
import { Tooltip } from '../Tooltip';
import Checkbox from '../Checkbox';
import type { ReportLocation } from '../../lib/reportWeather';
import { EyeOff, AlignLeft, AlignCenter, AlignRight, ArrowLeft, ArrowRight, Trash2, Plus, Columns3, GripVertical } from 'lucide-react';

function firstItemOf(ctx: ReportCtx, b: ReportBlock, fieldMap: Record<string, ReportFieldDef>, parentItem: any, parentCategory?: string, ancestors?: any): any {
  const items = resolveCollectionItems(ctx, b.collection, b.category, parentItem, parentCategory, b, ancestors);
  if (items.length === 0) return undefined;
  // The canvas samples ONE item for the repeat's template preview. Pick the
  // first item that resolves the most ITEM data — sampling a data-less scene
  // (no cast/breakdown attached) would show raw {{tokens}} on the canvas
  // while print/preview render the real items from later scenes. Document
  // fields ({{pageCount}}, {{title}}…) resolve from ctx/aux, never from item
  // data, so they're excluded from the comparison.
  const itemTokens = new Set<string>();
  for (const cb of (b.children || [])) {
    if (cb.type === 'text' && cb.text) {
      for (const m of cb.text.matchAll(TOKEN_RE)) {
        const base = parseToken(m[1]).field.split('.')[0];
        const def = fieldMap[base];
        if (def && ITEM_SCOPES.has(def.scope)) itemTokens.add(m[1]);
      }
    } else if (cb.type === 'field' && cb.field) {
      const def = fieldMap[cb.field];
      if (def && ITEM_SCOPES.has(def.scope)) itemTokens.add(cb.field);
    }
  }
  if (itemTokens.size === 0) return items[0];
  let best = items[0];
  let bestMissing = Infinity;
  for (const it of items) {
    let missing = 0;
    for (const raw of itemTokens) {
      const base = parseToken(raw).field.split('.')[0];
      if (!reportFieldValueByKey(ctx, fieldMap, base, it, undefined)) missing++;
    }
    if (missing === 0) return it;
    if (missing < bestMissing) { bestMissing = missing; best = it; }
  }
  return best;
}

export interface ColSel { colsId: string; colIndex: number; }

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
  showKeys: boolean;
  project: Project;
  parentCollection?: ReportCollection;
  parentCategory?: string;
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
  onInsertTableColumnAt: (tableId: string, colIndex: number) => void;
  onRemoveTableColumn: (tableId: string, colIndex: number) => void;
  onMoveTableColumn: (tableId: string, from: number, to: number) => void;
  onInsertIntoZone: (zone: 'header' | 'body' | 'footer', payload: PaletteDropPayload) => void;
  editorMode: 'floating' | 'toolbar';
  viewWidth?: number | null;
  pageSize?: 'portrait' | 'landscape';
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

const ReportDesignerCanvas: React.FC<ReportDesignerCanvasProps> = ({ blocks, headerBlocks, footerBlocks, skipFirstHeader, skipFirstFooter, onToggleHeaderSkipFirst, onToggleFooterSkipFirst, selId, selCol, ctx, fieldMap, readOnly, showKeys, project, parentCollection, parentCategory, onSaveTextStyles, viewWidth, pageSize, onSelect, onSelectCol, onPatch, onInsertAfter, onInsertBefore, onInsertInto, onMoveInto, onDuplicateInto, onMoveTo, onDuplicateTo, onWrap, onInsertIntoColumn, onMoveIntoColumn, onDuplicateIntoColumn, onInsertNewColumn, onMoveToNewColumn, onDuplicateToNewColumn, onRemoveColumn, onMoveColumn, onDuplicate, onRemove, onMove, onMenu, onInsertTableColumnAt, onRemoveTableColumn, onMoveTableColumn, onInsertIntoZone, editorMode }) => {
  const allBlocks = React.useMemo(() => [...headerBlocks, ...blocks, ...footerBlocks], [headerBlocks, blocks, footerBlocks]);
  const [dragging, setDragging] = useState(false);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
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

  const renderBlocks = (list: ReportBlock[], depth: number, parentColl?: ReportCollection, parentItem?: any, parentCategory?: string, onceIds?: Set<string>, ancestors?: any, parentItems?: ReportCollectionItem[], parentItemIndex?: number): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    list.forEach((b, i) => {
      const selected = selId === b.id;
      const parentCollection = parentColl || parentCollectionOf(allBlocks, b.id);
      const meta = BLOCK_TYPE_META[b.type] || { label: b.type, icon: null };
      const isTable = b.type === 'table' && (b.axis ?? 'columns') === 'columns';
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
      const itemLocations = (b.type === 'text' || b.type === 'field') && parentItem ? locationsOfItem(ctx, parentItem) : [];

      out.push(
        <div key={`z-${b.id}`}>{renderZone(b, 'before', depth)}</div>,
        <div key={b.id}>
          <div
            data-block-id={b.id}
            className={`block-card block-type-${b.type}${selected ? ' selected' : ''}`}
            onClick={e => {
              e.stopPropagation();
              // table cells own their clicks (column select/reorder); a click
              // that lands on one must not select the card and clear the column
              if ((e.target as HTMLElement).closest?.('[data-table-col-ci]')) return;
              onSelect(b.id);
            }}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onMenu(e, b.id); }}
            draggable={!readOnly}
            onDragStart={e => {
              startBlockDrag(e, b);
            }}
            style={{
              cursor: 'pointer',
              position: 'relative',
              opacity: dragging && dragSourceId === b.id ? 0.35 : 1,
              transition: 'opacity 150ms ease',
            }}
          >
            {resizeTarget && resizeTarget.id === b.id && (
              <TableResizeBar
                block={resizeTarget}
                canvasRef={containerRef}
                onResize={widths => onPatch(resizeTarget.id, { columns: (resizeTarget.columns || []).map((c, i) => ({ ...c, width: widths[i] ?? c.width })) })}
              />
            )}
            {dragging && (!insideColumnsBlock(allBlocks, b.id) || listOwnerOf(allBlocks, b.id)?.colIndex !== undefined) && (
              <>
                <EdgeZone side="left" b={b} depth={depth} onWrap={(id, payload, side) => { onWrap(id, payload, side); endDrag(); }} pendingRef={pendingRef} />
                <EdgeZone side="right" b={b} depth={depth} onWrap={(id, payload, side) => { onWrap(id, payload, side); endDrag(); }} pendingRef={pendingRef} />
              </>
            )}
            {selected && editorMode === 'floating' && !externalDrag && (
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
                onDeselect={() => onSelect(null)}
                relativeTarget={relTarget}
                availableLocations={itemLocations}
              />
            )}
            {selectedTableCol && !externalDrag && (
              <TableColumnChrome
                block={b}
                colIndex={selectedTableCol.colIndex}
                project={project}
                parentCollection={parentCollection}
                readOnly={readOnly}
                onPatch={p => onPatch(b.id, p)}
                onInsertAt={i => onInsertTableColumnAt(b.id, i)}
                onRemove={() => onRemoveTableColumn(b.id, selectedTableCol.colIndex)}
                onMoveCol={d => onMoveTableColumn(b.id, selectedTableCol.colIndex, selectedTableCol.colIndex + d)}
                onDeselect={() => onSelectCol(null)}
              />
            )}

            {(b.type === 'repeat' || b.type === 'table' || b.type === 'relative') ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-sky-700 uppercase tracking-wider px-1">
                  {meta.icon}
                  {b.type === 'relative'
                    ? `Relative · ${b.relativeOffset ?? 1} ${(b.relativeOffset ?? 1) < 0 ? 'back' : 'ahead'} × ${Math.max(1, b.relativeCount ?? 1)}${relTarget ? ` — ${relTarget}` : ''}`
                    : b.type === 'table'
                      ? `Table: ${scopedCollectionLabel(tableItemCollection(b, parentCollection as ReportCollection | undefined), parentCollection as ReportCollection | undefined, b.scopedToParent !== false)}`
                      : `Repeat: ${scopedCollectionLabel(b.collection || 'scenes', parentCollection as ReportCollection | undefined, b.scopedToParent !== false)}`}
                  {b.collection === 'elements' ? ` (${b.category || 'props'})` : ''}
                  {b.collection === 'locations' && b.category ? ` (${(project.locationTypes || []).find(t => t.key === b.category)?.label || b.category})` : ''}
                  {b.type === 'table' && (b.axis ?? 'columns') === 'rows' ? ' · rows mode' : ''}
                </div>
                {b.type === 'repeat' && b.children && b.children.length > 0 ? (
                  <div className="repeat-children" style={{ display: 'flex', flexDirection: 'column' }}>
                    {(() => {
                      const coll = b.collection as ReportCollection | undefined;
                      const onceTables = (b.children || []).filter(cb => cb.type === 'table' && coll === 'elementsOfCategory' && tableItemCollection(cb, coll) === coll);
                      const onceIds = new Set(onceTables.map(cb => cb.id));
                      const regular = (b.children || []).filter(cb => !onceIds.has(cb.id));
                      const childItem = firstItemOf(ctx, b, fieldMap, parentItem, parentCategory, ancestors);
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
                  <div
                    className="repeat-drop-empty"
                    style={{ minHeight: 56, border: '2px dashed #c4c4cc', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onClick={e => { e.stopPropagation(); onInsertInto(b.id, { kind: 'block', type: 'text' }); }}
                    onDragOver={e => {
                      if (!isDrag(e)) return;
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.setAttribute('data-active', '1');
                      pendingRef.current = { id: b.id, pos: 'after' };
                    }}
                    onDragLeave={e => {
                      const cur = e.currentTarget;
                      if (e.relatedTarget && cur.contains(e.relatedTarget as Node)) return;
                      cur.removeAttribute('data-active');
                      pendingRef.current = null;
                    }}
                    onDrop={e => {
                      if (!isDrag(e)) return;
                      e.preventDefault();
                      e.stopPropagation();
                      let payload: PaletteDropPayload | null = null;
                      try { payload = JSON.parse(e.dataTransfer.getData(DROP_MIME)); } catch { /* ignore */ }
                      if (payload) {
                        if (payload.moveId) {
                          if (payload.duplicate) onDuplicateInto(b.id, payload.moveId);
                          else onMoveInto(b.id, payload.moveId);
                        } else {
                          onInsertInto(b.id, payload);
                        }
                      }
                      endDrag();
                    }}
                  >
                    <Plus className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-[10px] text-zinc-400 italic">Drop inside {b.type === 'relative' ? 'relative' : 'repeat'} (or click to add text)</span>
                  </div>
                ) : (
                  <ReportBlockView block={b} ctx={ctx} fieldMap={fieldMap} item={parentItem} parentCategory={parentCategory} parentCollection={parentCollection} hint showKeys={showKeys} showUnresolved aux={{ index: 0, pageSize }} onceTable={onceIds?.has(b.id)} ancestors={ancestors} editorTableLimit onColumnSelect={isTable ? (ci => onSelectCol({ colsId: b.id, colIndex: ci })) : undefined} onColumnContextMenu={isTable ? ((e, ci) => onMenu(e, b.id, ci)) : undefined} onMoveColumn={isTable ? ((from, to) => onMoveTableColumn(b.id, from, to)) : undefined} selectedColumn={selectedTableCol?.colIndex ?? null} />
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
                              {colSelected && !externalDrag && (
                                <ColumnBlockChrome
                                  colIndex={ci}
                                  colsCount={cols.length}
                                  readOnly={readOnly}
                                  onInsertBefore={() => onInsertNewColumn(b.id, ci, { kind: 'block', type: 'text' })}
                                  onInsertAfter={() => onInsertNewColumn(b.id, ci + 1, { kind: 'block', type: 'text' })}
                                  onMoveLeft={() => onMoveColumn(b.id, ci, ci - 1)}
                                  onMoveRight={() => onMoveColumn(b.id, ci, ci + 1)}
                                  onDelete={() => onRemoveColumn(b.id, ci)}
                                  onDeselect={() => onSelectCol(null)}
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
              <ReportBlockView block={b} ctx={ctx} fieldMap={fieldMap} item={parentItem} parentCategory={parentCategory} parentCollection={parentCollection} hint showKeys={showKeys} showUnresolved previewLimit aux={{ index: 0, pageSize }} ancestors={ancestors} onColumnSelect={isTable ? (ci => onSelectCol({ colsId: b.id, colIndex: ci })) : undefined} onColumnContextMenu={isTable ? ((e, ci) => onMenu(e, b.id, ci)) : undefined} onMoveColumn={isTable ? ((from, to) => onMoveTableColumn(b.id, from, to)) : undefined} selectedColumn={selectedTableCol?.colIndex ?? null} />
            )}
          </div>
        </div>,
      );
      if (i === list.length - 1) out.push(<div key={`za-${b.id}`}>{renderZone(b, 'after', depth)}</div>);
    });
    return out;
  };

  // selected table (columns mode) → resize bar overlay inside its card
  const selBlock = selId ? findBlock(allBlocks, selId)?.block : null;
  const resizeTarget = selBlock && selBlock.type === 'table' && (selBlock.axis ?? 'columns') === 'columns' && (selBlock.columns || []).length > 0 ? selBlock : null;

  return (
    <div
      ref={containerRef}
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
      <div className="mx-auto" style={{ width: viewWidth ? `${viewWidth}px` : '100%', minHeight: '80vh', background: '#e4e4e7', borderRadius: 10, padding: 28 }}>
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
        {blocks.length === 0 ? (
          <div
            className="report-zone-body-empty text-center text-zinc-500 text-sm py-20 border border-dashed border-zinc-400 rounded-lg cursor-pointer"
            data-zone-list="body"
            onClick={() => onInsertIntoZone('body', { kind: 'block', type: 'text' })}
            {...zoneDropHandlers('body', onInsertIntoZone, isDrag, pendingRef, endDrag)}
          >
            No blocks yet — click or drag from the palette to build the report.
          </div>
        ) : (
          <div className="flex flex-col">{renderBlocks(blocks, 0)}</div>
        )}
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
  onDeselect: () => void;
  relativeTarget?: string | null;
  availableLocations?: ReportLocation[];
}> = ({ block, project, parentCollection, parentCategory, readOnly, onSaveTextStyles, onPatch, onDuplicate, onRemove, onMove, onDeselect, relativeTarget, availableLocations }) => (
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
      trailing={
        <ToolButton onClick={onDeselect} disabled={false} title="Deselect block" className={TB_BTN_ICON}><span className="text-[10px]">✕</span></ToolButton>
      }
      relativeTarget={relativeTarget}
      availableLocations={availableLocations}
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
  onPatch: (patch: Partial<ReportBlock>) => void;
  onInsertAt: (colIndex: number) => void;
  onRemove: () => void;
  onMoveCol: (dir: -1 | 1) => void;
  onDeselect: () => void;
}

const TableColumnChrome: React.FC<TableColumnChromeProps> = ({ block, colIndex, project, parentCollection, readOnly, onPatch, onInsertAt, onRemove, onMoveCol, onDeselect }) => {
  const { allFields } = useReportControlContext(project, parentCollection);
  const scope = tableFieldScope(block, parentCollection);
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
  const disabled = readOnly;
  const patchCol = (p: Partial<ReportTableColumn>) => onPatch({ columns: columns.map((c, i) => i === colIndex ? { ...c, ...p } : c) });
  return (
    <>
      <div ref={anchorRef} className="chrome-anchor" aria-hidden />
      <FloatingChrome className="table-column-chrome" reference={reference}>
        {/* Header bar: column name + field */}
        <ChromeHeader
          leading={<span className="text-[10px] font-semibold text-zinc-300 pr-1">Column {colIndex + 1} of {columns.length}</span>}
          trailing={
            <>
              <FieldPicker
                value={col.field}
                fields={fieldsForScope(allFields, scope, block.category)}
                onChange={f => patchCol({ field: f })}
                disabled={disabled}
                scope={scope}
                className={`w-32 ${TB_PICKER}`}
              />
              <ToolButton onClick={onDeselect} disabled={false} title="Deselect column" className={TB_BTN_ICON}><span className="text-[10px]">✕</span></ToolButton>
            </>
          }
        />
        {/* Column style */}
        <div className="flex flex-col gap-1 px-2.5 py-1.5 min-w-max">
          <SectionHeader>Column</SectionHeader>
          <div className="flex items-center gap-1 flex-nowrap min-w-max">
            <Tooltip content="Bold">
              <button disabled={disabled} onClick={() => patchCol({ bold: !col.bold })} className={`${TB_TOGGLE} ${col.bold ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}>
                <span className="text-[10px] font-bold">B</span>
              </button>
            </Tooltip>
            <Tooltip content="Italic">
              <button disabled={disabled} onClick={() => patchCol({ italic: !col.italic })} className={`${TB_TOGGLE} ${col.italic ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}>
                <span className="text-[10px] italic">I</span>
              </button>
            </Tooltip>
            <Tooltip content="Hide rows where this column is empty">
              <button disabled={disabled} onClick={() => patchCol({ skipEmpty: !col.skipEmpty })} className={`${TB_TOGGLE} ${col.skipEmpty ? 'bg-amber-900/50 border-amber-700 text-amber-300' : TB_TOGGLE_OFF}`}>
                <EyeOff className="w-3 h-3" />
              </button>
            </Tooltip>
            <div className={TB_DIVIDER} />
            {(['left', 'center', 'right'] as const).map(a => {
              const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
              const on = (col.align ?? 'left') === a;
              return (
                <Tooltip key={a} content={`Align ${a}`}>
                  <button disabled={disabled} onClick={() => patchCol({ align: a })} className={`${TB_TOGGLE} ${on ? TB_TOGGLE_ON : TB_TOGGLE_OFF}`}>
                    <Icon className="w-3 h-3" />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
        {/* Structure */}
        <div className="flex flex-col gap-1 px-2.5 py-1.5 min-w-max border-t border-zinc-700/60">
          <SectionHeader>Structure</SectionHeader>
          <div className="flex items-center gap-1 flex-nowrap min-w-max">
            <ToolButton onClick={() => onInsertAt(colIndex)} disabled={disabled} title="Insert column before" className={TB_BTN_ICON}><Plus className="w-3 h-3" /> Before</ToolButton>
            <ToolButton onClick={() => onInsertAt(colIndex + 1)} disabled={disabled} title="Insert column after" className={TB_BTN_ICON}><Plus className="w-3 h-3" /> After</ToolButton>
            <div className={TB_DIVIDER} />
            <ToolButton onClick={() => onMoveCol(-1)} disabled={disabled || colIndex <= 0} title="Move column left" className={TB_BTN_ICON}><ArrowLeft className="w-2.5 h-2.5" /> Left</ToolButton>
            <ToolButton onClick={() => onMoveCol(1)} disabled={disabled || colIndex >= columns.length - 1} title="Move column right" className={TB_BTN_ICON}><ArrowRight className="w-2.5 h-2.5" /> Right</ToolButton>
            <div className={TB_DIVIDER} />
            <ToolButton onClick={onRemove} disabled={disabled || columns.length <= 1} title="Delete column" className={`${TB_BTN_ICON} ${TB_DANGER}`}><Trash2 className="w-2.5 h-2.5" /> Delete</ToolButton>
          </div>
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
  onInsertBefore: () => void;
  onInsertAfter: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDelete: () => void;
  onDeselect: () => void;
}> = ({ colIndex, colsCount, readOnly, onInsertBefore, onInsertAfter, onMoveLeft, onMoveRight, onDelete, onDeselect }) => (
  <FloatingChrome className="column-chrome">
    {/* Header bar: column name + deselect */}
    <ChromeHeader
      leading={<span className="text-[10px] font-semibold text-zinc-300 pr-1">Column {colIndex + 1} of {colsCount}</span>}
      trailing={
        <ToolButton onClick={onDeselect} disabled={false} title="Deselect column" className={TB_BTN_ICON}><span className="text-[10px]">✕</span></ToolButton>
      }
    />
    {/* Structure */}
    <div className="flex flex-col gap-1 px-2.5 py-1.5 min-w-max">
      <SectionHeader>Structure</SectionHeader>
      <div className="flex items-center gap-1 flex-nowrap min-w-max">
        <ToolButton onClick={onInsertBefore} disabled={readOnly} title="Insert column before" className={TB_BTN_ICON}><Plus className="w-3 h-3" /> Before</ToolButton>
        <ToolButton onClick={onInsertAfter} disabled={readOnly} title="Insert column after" className={TB_BTN_ICON}><Plus className="w-3 h-3" /> After</ToolButton>
        <div className={TB_DIVIDER} />
        <ToolButton onClick={onMoveLeft} disabled={readOnly || colIndex <= 0} title="Move column left" className={TB_BTN_ICON}><ArrowLeft className="w-2.5 h-2.5" /> Left</ToolButton>
        <ToolButton onClick={onMoveRight} disabled={readOnly || colIndex >= colsCount - 1} title="Move column right" className={TB_BTN_ICON}><ArrowRight className="w-2.5 h-2.5" /> Right</ToolButton>
        <div className={TB_DIVIDER} />
        <ToolButton onClick={onDelete} disabled={readOnly || colsCount <= 1} title="Delete column" className={`${TB_BTN_ICON} ${TB_DANGER}`}><Trash2 className="w-2.5 h-2.5" /> Delete</ToolButton>
      </div>
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

  return (
    <div className="absolute -top-2.5 left-0 right-0 h-5 pointer-events-none" style={{ zIndex: 40 }}>
      <ColumnResizeStrip variant="bar" widths={widths} startResize={startResize} containerRef={stripRef} />
    </div>
  );
};

export default ReportDesignerCanvas;
