import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ReportBlock, ReportCollection, Project, ReportTextStyle, ReportTableColumn } from '../../types';
import { ReportCtx, resolveCollectionItems, ReportCollectionItem } from '../../lib/reportData';
import { FieldAux } from '../../lib/reportFields';
import { ReportFieldDef, fieldsForScope } from '../../lib/reportFields';
import { COLLECTION_LABELS, findBlock, parentCollectionOf, insideColumnsBlock, tableItemCollection, tableFieldScope, scopedCollectionLabel } from '../../lib/reportBlocks';
import { normalizeColWidths } from '../../lib/ribbonDefaults';
import { ReportBlockView } from './ReportBlockView';
import { DROP_MIME, PaletteDropPayload } from './ReportPalette';
import {
  StructureControls, ContentControls, StyleControls, LayoutControls, BLOCK_TYPE_META,
  useReportControlContext, TB_DIVIDER, TB_ROW_LABEL, TB_TOGGLE, TB_TOGGLE_ON, TB_TOGGLE_OFF, TB_BTN_ICON, TB_DANGER, ToolButton, BlockEditorContent,
} from './blockControls';
import { FieldPicker } from './FieldPicker';
import { Tooltip } from '../Tooltip';
import { EyeOff, AlignLeft, AlignCenter, AlignRight, ArrowLeft, ArrowRight, Trash2, Plus, Columns3, GripVertical } from 'lucide-react';

function firstItemOf(ctx: ReportCtx, b: ReportBlock, parentItem: any, parentCategory?: string, ancestors?: any): any {
  const items = resolveCollectionItems(ctx, b.collection, b.category, parentItem, parentCategory, b, ancestors);
  return items[0];
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

const ReportDesignerCanvas: React.FC<ReportDesignerCanvasProps> = ({ blocks, headerBlocks, footerBlocks, skipFirstHeader, skipFirstFooter, onToggleHeaderSkipFirst, onToggleFooterSkipFirst, selId, selCol, ctx, fieldMap, readOnly, showKeys, project, parentCollection, parentCategory, onSaveTextStyles, viewWidth, pageSize, onSelect, onSelectCol, onPatch, onInsertAfter, onInsertBefore, onInsertInto, onMoveInto, onDuplicateInto, onMoveTo, onDuplicateTo, onWrap, onInsertIntoColumn, onMoveIntoColumn, onDuplicateIntoColumn, onInsertNewColumn, onMoveToNewColumn, onDuplicateToNewColumn, onRemoveColumn, onDuplicate, onRemove, onMove, onMenu, onInsertTableColumnAt, onRemoveTableColumn, onMoveTableColumn, onInsertIntoZone, editorMode }) => {
  const allBlocks = React.useMemo(() => [...headerBlocks, ...blocks, ...footerBlocks], [headerBlocks, blocks, footerBlocks]);
  const [dragging, setDragging] = useState(false);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const pendingRef = useRef<{ id: string; pos: 'before' | 'after' } | null>(null);
  const performRef = useRef<(id: string, pos: 'before' | 'after', payload: PaletteDropPayload) => void>(() => {});
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedCardRef = useRef<HTMLDivElement>(null);

  // Keeps the floating editors inside the visible canvas: flips the block
  // chrome below its card when there's no room above, and clamps the left
  // edge so neither chrome overflows horizontally. Repositions on scroll too.
  const repositionChrome = useCallback(() => {
    const card = selectedCardRef.current;
    const container = containerRef.current;
    if (!card || !container) return;
    const chromeEl = card.querySelector<HTMLElement>('.block-chrome');
    const crect = container.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    const clampLeft = (width: number) =>
      Math.max(8, Math.min(rect.left - crect.left + 8, Math.max(8, crect.width - width - 8)));
    if (chromeEl) {
      const chromeH = chromeEl.offsetHeight;
      const spaceAbove = rect.top - crect.top;
      const spaceBelow = crect.bottom - rect.bottom;
      const above = spaceAbove >= chromeH + 8 || spaceBelow < chromeH + 8;
      card.dataset.chromeBelow = above ? '0' : '1';
      card.style.setProperty('--chrome-left', `${clampLeft(chromeEl.offsetWidth)}px`);
    }
    const colChrome = card.querySelector<HTMLElement>('.table-column-chrome');
    if (colChrome) colChrome.style.left = `${clampLeft(colChrome.offsetWidth)}px`;
  }, []);

  useEffect(() => {
    repositionChrome();
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('scroll', repositionChrome, { passive: true });
    window.addEventListener('resize', repositionChrome);
    return () => {
      container.removeEventListener('scroll', repositionChrome);
      window.removeEventListener('resize', repositionChrome);
    };
  }, [repositionChrome, selId, blocks, headerBlocks, footerBlocks, editorMode]);

  performRef.current = (id, pos, payload) => {
    if (payload.moveId) {
      if (payload.duplicate) onDuplicateTo(payload.moveId, id, pos);
      else onMoveTo(payload.moveId, id, pos);
    } else if (pos === 'before') onInsertBefore(id, payload);
    else onInsertAfter(id, payload);
  };

  const endDrag = () => {
    pendingRef.current = null;
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

  const isDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DROP_MIME);

  const startBlockDrag = (e: React.DragEvent, b: ReportBlock) => {
    e.stopPropagation();
    e.dataTransfer.setData(DROP_MIME, JSON.stringify({ kind: 'block', type: 'text', moveId: b.id, duplicate: e.altKey }));
    e.dataTransfer.effectAllowed = e.altKey ? 'copy' : 'move';
    setDragging(true);
    setDragSourceId(b.id);
    const card = e.currentTarget as HTMLElement;
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.querySelector('.block-chrome')?.remove();
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

  const renderBlocks = (list: ReportBlock[], depth: number, parentColl?: string, parentItem?: any, parentCategory?: string, onceIds?: Set<string>, ancestors?: any): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    list.forEach((b, i) => {
      const selected = selId === b.id;
      const parentCollection = parentColl || parentCollectionOf(allBlocks, b.id);
      const meta = BLOCK_TYPE_META[b.type] || { label: b.type, icon: null };
      const isTable = b.type === 'table' && (b.axis ?? 'columns') === 'columns';
      const selectedTableCol = isTable && selCol && selCol.colsId === b.id ? selCol : null;

      out.push(
        <div key={`z-${b.id}`}>{renderZone(b, 'before', depth)}</div>,
        <div key={b.id}>
          <div
            data-block-id={b.id}
            className={`block-card block-type-${b.type}${selected ? ' selected' : ''}`}
            ref={selected ? selectedCardRef : undefined}
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
              // dragging the floating editors must not drag the block
              if ((e.target as HTMLElement).closest?.('.block-chrome, .table-column-chrome')) { e.preventDefault(); return; }
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
                onResize={widths => onPatch(resizeTarget.id, { columns: (resizeTarget.columns || []).map((c, i) => ({ ...c, width: widths[i] ?? c.width })) })}
              />
            )}
            {dragging && !insideColumnsBlock(allBlocks, b.id) && (
              <>
                <EdgeZone side="left" b={b} depth={depth} onWrap={(id, payload, side) => { onWrap(id, payload, side); endDrag(); }} pendingRef={pendingRef} />
                <EdgeZone side="right" b={b} depth={depth} onWrap={(id, payload, side) => { onWrap(id, payload, side); endDrag(); }} pendingRef={pendingRef} />
              </>
            )}
            {selected && editorMode === 'floating' && (
              <BlockChrome
                block={b}
                project={project}
                parentCollection={parentCollection}
                parentCategory={parentCategory}
                readOnly={readOnly}
                onSaveTextStyles={onSaveTextStyles}
                onPatch={p => onPatch(b.id, p)}
                onInsertAbove={() => onInsertBefore(b.id, { kind: 'block', type: 'text' })}
                onInsertBelow={() => onInsertAfter(b.id, { kind: 'block', type: 'text' })}
                onDuplicate={() => onDuplicate(b.id)}
                onRemove={() => onRemove(b.id)}
                onMove={d => onMove(b.id, d)}
              />
            )}
            {selectedTableCol && (
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

            {(b.type === 'repeat' || b.type === 'table') ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-sky-700 uppercase tracking-wider px-1">
                  {meta.icon}
                  {b.type === 'table'
                    ? `Table: ${scopedCollectionLabel(tableItemCollection(b, parentCollection as ReportCollection | undefined), parentCollection as ReportCollection | undefined, b.scopedToParent !== false)}`
                    : `Repeat: ${scopedCollectionLabel(b.collection || 'scenes', parentCollection as ReportCollection | undefined, b.scopedToParent !== false)}`}
                  {b.collection === 'elements' ? ` (${b.category || 'props'})` : ''}
                  {b.type === 'table' && (b.axis ?? 'columns') === 'rows' ? ' · rows mode' : ''}
                </div>
                {b.type === 'repeat' && b.children && b.children.length > 0 ? (
                  <div className="repeat-children" style={{ display: 'flex', flexDirection: 'column' }}>
                    {(() => {
                      const coll = b.collection as ReportCollection | undefined;
                      const onceTables = (b.children || []).filter(cb => cb.type === 'table' && coll === 'elementsOfCategory' && tableItemCollection(cb, coll) === coll);
                      const onceIds = new Set(onceTables.map(cb => cb.id));
                      const regular = (b.children || []).filter(cb => !onceIds.has(cb.id));
                      const childItem = firstItemOf(ctx, b, parentItem, parentCategory, ancestors);
                      return (
                        <>
                          {renderBlocks(regular, depth + 1, b.collection, childItem, b.category, undefined, childItem ? [childItem, ...(ancestors || [])] : undefined)}
                          {onceTables.length > 0 && renderBlocks(onceTables, depth + 1, b.collection, parentItem, parentCategory, onceIds, parentItem ? [parentItem, ...(ancestors || [])] : undefined)}
                        </>
                      );
                    })()}
                  </div>
                ) : b.type === 'repeat' ? (
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
                    <span className="text-[10px] text-zinc-400 italic">Drop inside repeat (or click to add text)</span>
                  </div>
                ) : (
                  <ReportBlockView block={b} ctx={ctx} fieldMap={fieldMap} item={parentItem} parentCategory={parentCategory} parentCollection={parentCollection} hint showKeys={showKeys} aux={{ index: 0, pageSize }} onceTable={onceIds?.has(b.id)} ancestors={ancestors} onColumnSelect={isTable ? (ci => onSelectCol({ colsId: b.id, colIndex: ci })) : undefined} onColumnContextMenu={isTable ? ((e, ci) => onMenu(e, b.id, ci)) : undefined} onMoveColumn={isTable ? ((from, to) => onMoveTableColumn(b.id, from, to)) : undefined} selectedColumn={selectedTableCol?.colIndex ?? null} />
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
                const startResize = (e: React.PointerEvent, ci: number) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const row = (e.currentTarget as HTMLElement).parentElement;
                  const startX = e.clientX;
                  const startWidths = cols.map(c => c.width);
                  let lastNorm = startWidths;
                  const onMove = (ev: PointerEvent) => {
                    ev.preventDefault();
                    const deltaPct = ((ev.clientX - startX) / (row?.clientWidth || 1)) * 100;
                    const next = [...startWidths];
                    next[ci] = Math.max(5, startWidths[ci] + deltaPct);
                    next[ci + 1] = Math.max(5, startWidths[ci + 1] - deltaPct);
                    const t = next.reduce((a, b) => a + b, 0);
                    lastNorm = next.map(w => (w / t) * 100);
                    if (row) row.querySelectorAll('.columns-col').forEach((el, i) => {
                      (el as HTMLElement).style.flex = `${lastNorm[i]} 1 0%`;
                    });
                  };
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    if (row) row.querySelectorAll('.columns-col').forEach(el => { (el as HTMLElement).style.flex = ''; });
                    onPatch(b.id, { cols: cols.map((c, i) => ({ ...c, width: lastNorm[i] })) });
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                };
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
                              onDrop={dropNewColumn}
                              onResize={resizable ? e => startResize(e, ci - 1) : undefined}
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
                              {colSelected && (
                                <ColumnBlockChrome
                                  colIndex={ci}
                                  colsCount={cols.length}
                                  readOnly={readOnly}
                                  onInsertBefore={() => onInsertNewColumn(b.id, ci, { kind: 'block', type: 'text' })}
                                  onInsertAfter={() => onInsertNewColumn(b.id, ci + 1, { kind: 'block', type: 'text' })}
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
                      <GutterZone colIndex={cols.length} edge="right" onDrop={dropNewColumn} />
                    </div>
                  </div>
                );
              })()
            ) : (
              <ReportBlockView block={b} ctx={ctx} fieldMap={fieldMap} item={parentItem} parentCategory={parentCategory} parentCollection={parentCollection} hint showKeys={showKeys} aux={{ index: 0, pageSize }} ancestors={ancestors} onColumnSelect={isTable ? (ci => onSelectCol({ colsId: b.id, colIndex: ci })) : undefined} onColumnContextMenu={isTable ? ((e, ci) => onMenu(e, b.id, ci)) : undefined} onMoveColumn={isTable ? ((from, to) => onMoveTableColumn(b.id, from, to)) : undefined} selectedColumn={selectedTableCol?.colIndex ?? null} />
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
        >
          {headerBlocks.length === 0 && <ZoneEmptyHint />}
          {renderBlocks(headerBlocks, 0)}
        </ReportZone>
        {blocks.length === 0 && (
          <div className="text-center text-zinc-500 text-sm py-20 border border-dashed border-zinc-400 rounded-lg">
            No blocks yet — click or drag from the palette to build the report.
          </div>
        )}
        <div className="flex flex-col">{renderBlocks(blocks, 0)}</div>
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
  onInsert: (zone: 'header' | 'footer', payload: PaletteDropPayload) => void;
  isDrag: (e: React.DragEvent) => boolean;
  pendingRef: React.MutableRefObject<{ id: string; pos: 'before' | 'after' } | null>;
  endDrag: () => void;
  children: React.ReactNode;
}> = ({ label, hint, skipFirst, onToggleSkipFirst, readOnly, zone, empty, onInsert, isDrag, pendingRef, endDrag, children }) => (
  <div
    className="report-zone"
    data-zone-list={zone}
    style={{ border: '1.5px dashed #a1a1aa', borderRadius: 8, padding: '8px 10px', marginBottom: 16 }}
    onDragOver={e => {
      if (!isDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setAttribute('data-active', '1');
      pendingRef.current = { id: '', pos: 'after' };
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
      if (payload) onInsert(zone, payload);
      endDrag();
    }}
  >
    <div className="flex items-center gap-2 mb-1.5" onClick={e => e.stopPropagation()}>
      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</span>
      <span className="text-[10px] text-zinc-400 italic">{hint}</span>
      <label className="flex items-center gap-1 ml-auto text-[10px] text-zinc-500 select-none">
        <input type="checkbox" checked={skipFirst} disabled={readOnly} onChange={onToggleSkipFirst} />
        Skip first page
      </label>
    </div>
    <div onClick={empty ? (e => { e.stopPropagation(); onInsert(zone, { kind: 'block', type: 'text' }); }) : undefined}>{children}</div>
  </div>
);

// ---- floating block editor (full per-type controls above the selected block) --

const BlockChrome: React.FC<{
  block: ReportBlock;
  project: Project;
  parentCollection?: ReportCollection;
  parentCategory?: string;
  readOnly: boolean;
  onSaveTextStyles?: (styles: ReportTextStyle[]) => void;
  onPatch: (patch: Partial<ReportBlock>) => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}> = ({ block, project, parentCollection, parentCategory, readOnly, onSaveTextStyles, onPatch, onInsertAbove, onInsertBelow, onDuplicate, onRemove, onMove }) => (
  <div className="block-chrome" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDragStart={e => e.preventDefault()}>
    <BlockEditorContent
      block={block}
      project={project}
      parentCollection={parentCollection}
      parentCategory={parentCategory}
      readOnly={readOnly}
      onSaveTextStyles={onSaveTextStyles}
      onPatch={onPatch}
      onInsertAbove={onInsertAbove}
      onInsertBelow={onInsertBelow}
      onDuplicate={onDuplicate}
      onRemove={onRemove}
      onMove={onMove}
      compact
    />
  </div>
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
  if (!col) return null;
  const disabled = readOnly;
  const patchCol = (p: Partial<ReportTableColumn>) => onPatch({ columns: columns.map((c, i) => i === colIndex ? { ...c, ...p } : c) });
  return (
    <div className="table-column-chrome" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDragStart={e => e.preventDefault()}>
      <div className="flex items-center gap-1.5 flex-nowrap min-w-max">
        <span className="text-[10px] font-medium text-zinc-400 shrink-0">Column {colIndex + 1} of {columns.length}</span>
        <FieldPicker
          value={col.field}
          fields={fieldsForScope(allFields, scope, block.category)}
          onChange={f => patchCol({ field: f })}
          disabled={disabled}
          scope={scope}
          className="w-32 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 disabled:opacity-30"
        />
        <div className={TB_DIVIDER} />
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
        <div className={TB_DIVIDER} />
        <ToolButton onClick={onDeselect} disabled={false} title="Deselect column" className={TB_BTN_ICON}><span className="text-[10px]">✕</span></ToolButton>
      </div>
      <div className="flex items-center gap-1 flex-nowrap min-w-max pt-1 mt-1 border-t border-zinc-700/60">
        <ToolButton onClick={() => onInsertAt(colIndex)} disabled={disabled} title="Insert column before" className={TB_BTN_ICON}><Plus className="w-3 h-3" /> Before</ToolButton>
        <ToolButton onClick={() => onInsertAt(colIndex + 1)} disabled={disabled} title="Insert column after" className={TB_BTN_ICON}><Plus className="w-3 h-3" /> After</ToolButton>
        <div className={TB_DIVIDER} />
        <ToolButton onClick={() => onMoveCol(-1)} disabled={disabled || colIndex <= 0} title="Move column left" className={TB_BTN_ICON}><ArrowLeft className="w-2.5 h-2.5" /> Left</ToolButton>
        <ToolButton onClick={() => onMoveCol(1)} disabled={disabled || colIndex >= columns.length - 1} title="Move column right" className={TB_BTN_ICON}><ArrowRight className="w-2.5 h-2.5" /> Right</ToolButton>
        <div className={TB_DIVIDER} />
        <ToolButton onClick={onRemove} disabled={disabled || columns.length <= 1} title="Delete column" className={`${TB_BTN_ICON} ${TB_DANGER}`}><Trash2 className="w-2.5 h-2.5" /> Delete</ToolButton>
      </div>
    </div>
  );
};

// ---- floating columns-block column editor (Notion-style columns) ----------------

const ColumnBlockChrome: React.FC<{
  colIndex: number;
  colsCount: number;
  readOnly: boolean;
  onInsertBefore: () => void;
  onInsertAfter: () => void;
  onDelete: () => void;
  onDeselect: () => void;
}> = ({ colIndex, colsCount, readOnly, onInsertBefore, onInsertAfter, onDelete, onDeselect }) => (
  <div className="column-chrome" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDragStart={e => e.preventDefault()}>
    <span className="text-[10px] font-medium text-zinc-400 shrink-0">Column {colIndex + 1} of {colsCount}</span>
    <div className={TB_DIVIDER} />
    <ToolButton onClick={onInsertBefore} disabled={readOnly} title="Insert column before" className={TB_BTN_ICON}><Plus className="w-3 h-3" /></ToolButton>
    <ToolButton onClick={onInsertAfter} disabled={readOnly} title="Insert column after" className={TB_BTN_ICON}><Plus className="w-3 h-3" /></ToolButton>
    <div className={TB_DIVIDER} />
    <ToolButton onClick={onDelete} disabled={readOnly || colsCount <= 1} title="Delete column" className={`${TB_BTN_ICON} ${TB_DANGER}`}><Trash2 className="w-2.5 h-2.5" /></ToolButton>
    <ToolButton onClick={onDeselect} disabled={false} title="Deselect column" className={TB_BTN_ICON}><span className="text-[10px]">✕</span></ToolButton>
  </div>
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

// ---- columns block: Notion-style gutter zones (drop → new column) ------------

const GutterZone: React.FC<{
  colIndex: number;
  edge?: 'left' | 'right';
  resizable?: boolean;
  onDrop: (colIndex: number, payload: PaletteDropPayload) => void;
  onResize?: (e: React.PointerEvent) => void;
}> = ({ colIndex, edge, resizable, onDrop, onResize }) => {
  const isDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DROP_MIME);
  return (
    <div
      className={`column-gutter${resizable ? ' resizable' : ''}`}
      data-zone={`gutter:${colIndex}`}
      style={edge
        ? { position: 'absolute', top: 0, bottom: 0, width: 8, zIndex: 50, ...(edge === 'left' ? { left: -8 } : { right: -8 }) }
        : { flex: '0 0 8px', alignSelf: 'stretch', position: 'relative', zIndex: 50 }}
      onPointerDown={resizable && onResize ? onResize : undefined}
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

// ---- table column resize bar (pointer drag, ribbon-style) ---------------------

const TableResizeBar: React.FC<{ block: ReportBlock; onResize: (widths: number[]) => void }> = ({ block, onResize }) => {
  const columns = block.columns || [];
  const widths = columns.map(c => c.width);
  if (widths.length < 2) return null;

  const startResize = (e: React.PointerEvent, ci: number) => {
    e.preventDefault();
    e.stopPropagation();
    const card = (e.currentTarget.closest('[data-block-id]') as HTMLElement | null)?.querySelector('.report-table-cols') as HTMLElement | null;
    const startX = e.clientX;
    const startWidths = [...widths];
    let lastNorm: number[] = startWidths;
    const applyWidths = () => {
      if (!card) return;
      const cols = lastNorm;
      card.querySelectorAll('[data-col-ci]').forEach(el => {
        const elm = el as HTMLElement;
        const w = cols[columns.findIndex(c => c.id === elm.getAttribute('data-col-ci'))];
        if (w) elm.style.width = `${w}%`;
      });
    };
    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const deltaPct = ((ev.clientX - startX) / (card?.clientWidth || 1)) * 100;
      const next = [...startWidths];
      next[ci] = Math.max(5, startWidths[ci] + deltaPct);
      next[ci + 1] = Math.max(5, startWidths[ci + 1] - deltaPct);
      const total = next.reduce((a, b) => a + b, 0);
      lastNorm = next.map(w => (w / total) * 100);
      applyWidths();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (card) card.querySelectorAll('[data-col-ci]').forEach(el => { (el as HTMLElement).style.width = ''; });
      onResize(normalizeColWidths(lastNorm));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  let acc = 0;
  const boundaries = widths.slice(0, -1).map(w => { acc += w; return acc; });

  return (
    <div className="absolute -top-2.5 left-0 right-0 h-5 pointer-events-none" style={{ zIndex: 40 }}>
      {boundaries.map((pct, ci) => (
        <div
          key={ci}
          className="pointer-events-auto absolute top-0 bottom-0 cursor-col-resize touch-none"
          style={{ left: `calc(${pct}% - 3px)`, width: 6, background: 'rgba(59,130,246,0.6)', borderRadius: 3 }}
          onPointerDown={e => startResize(e, ci)}
          title={`Resize column ${ci + 1}/${ci + 2}`}
        />
      ))}
    </div>
  );
};

export default ReportDesignerCanvas;
