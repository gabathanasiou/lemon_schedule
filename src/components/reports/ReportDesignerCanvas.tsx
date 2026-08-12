import React, { useEffect, useRef, useState } from 'react';
import { ReportBlock } from '../../types';
import { ReportCtx, resolveCollection, ReportCollectionItem } from '../../lib/reportData';
import { ReportFieldDef } from '../../lib/reportFields';
import { COLLECTION_LABELS, findBlock, parentCollectionOf, insideColumnsBlock } from '../../lib/reportBlocks';
import { normalizeColWidths } from '../../lib/ribbonDefaults';
import { ReportBlockView } from './ReportBlockView';
import { DROP_MIME, PaletteDropPayload } from './ReportPalette';
import { ArrowUp, ArrowDown, Copy, Trash2, Plus, GripVertical, Type, AlignLeft, Repeat, Table2, Columns3, Printer, FilePlus, Ruler } from 'lucide-react';

const TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  text: { label: 'Text', icon: <Type className="w-3 h-3" /> },
  field: { label: 'Attribute', icon: <AlignLeft className="w-3 h-3" /> },
  repeat: { label: 'Repeat', icon: <Repeat className="w-3 h-3" /> },
  table: { label: 'Table', icon: <Table2 className="w-3 h-3" /> },
  columns: { label: 'Columns', icon: <Columns3 className="w-3 h-3" /> },
  ribbon: { label: 'Ribbon', icon: <Printer className="w-3 h-3" /> },
  pageBreak: { label: 'Page Break', icon: <FilePlus className="w-3 h-3" /> },
  spacer: { label: 'Spacer', icon: <Ruler className="w-3 h-3" /> },
};

function firstItemOf(ctx: ReportCtx, b: ReportBlock, parentItem: any, parentCategory?: string): any {
  const items = resolveCollection(ctx, b.collection, b.category, parentItem, parentCategory);
  return items[0];
}

export interface ColSel { colsId: string; colIndex: number; }

interface ReportDesignerCanvasProps {
  blocks: ReportBlock[];
  selId: string | null;
  selCol: ColSel | null;
  ctx: ReportCtx;
  fieldMap: Record<string, ReportFieldDef>;
  readOnly: boolean;
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
}

const ReportDesignerCanvas: React.FC<ReportDesignerCanvasProps> = ({ blocks, selId, selCol, ctx, fieldMap, readOnly, onSelect, onSelectCol, onPatch, onInsertAfter, onInsertBefore, onInsertInto, onMoveInto, onDuplicateInto, onMoveTo, onDuplicateTo, onWrap, onInsertIntoColumn, onMoveIntoColumn, onDuplicateIntoColumn, onInsertNewColumn, onMoveToNewColumn, onDuplicateToNewColumn, onRemoveColumn, onDuplicate, onRemove, onMove, onMenu }) => {
  const [dragging, setDragging] = useState(false);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const pendingRef = useRef<{ id: string; pos: 'before' | 'after' } | null>(null);
  const performRef = useRef<(id: string, pos: 'before' | 'after', payload: PaletteDropPayload) => void>(() => {});

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

  const renderBlocks = (list: ReportBlock[], depth: number, parentColl?: string, parentItem?: any, parentCategory?: string): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    list.forEach((b, i) => {
      const selected = selId === b.id;
      const parentCollection = parentColl || parentCollectionOf(blocks, b.id);
      const meta = TYPE_META[b.type];

      out.push(
        <div key={`z-${b.id}`}>{renderZone(b, 'before', depth)}</div>,
        <div key={b.id}>
          <div
            data-block-id={b.id}
            className={`block-card block-type-${b.type}${selected ? ' selected' : ''}`}
            onClick={e => { e.stopPropagation(); onSelect(b.id); }}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onMenu(e, b.id); }}
            draggable={!readOnly}
            onDragStart={e => startBlockDrag(e, b)}
            style={{
              cursor: 'pointer',
              position: 'relative',
              opacity: dragging && dragSourceId === b.id ? 0.35 : 1,
              transition: 'opacity 150ms ease',
            }}
          >
            {resizeTarget && resizeTarget.id === b.id && (
              <TableResizeBar block={resizeTarget} onResize={widths => onPatch(resizeTarget.id, { colWidths: widths })} />
            )}
            {dragging && !insideColumnsBlock(blocks, b.id) && (
              <>
                <EdgeZone side="left" b={b} depth={depth} onWrap={(id, payload, side) => { onWrap(id, payload, side); endDrag(); }} pendingRef={pendingRef} />
                <EdgeZone side="right" b={b} depth={depth} onWrap={(id, payload, side) => { onWrap(id, payload, side); endDrag(); }} pendingRef={pendingRef} />
              </>
            )}
            <div
              className="block-chrome"
              style={{ display: 'none', position: 'absolute', top: -24, left: 8, alignItems: 'center', gap: 2, background: '#27272a', border: '1px solid #3f3f46', borderRadius: 6, padding: '2px 4px', zIndex: 30 }}
            >
              <span className="flex items-center gap-1 text-[10px] font-medium text-zinc-400 pr-1">
                <GripVertical className="w-3 h-3" />
                {meta.icon}
                {meta.label}
                {b.collection ? ` · ${COLLECTION_LABELS[b.collection]}` : ''}
                {b.type === 'table' && b.repeatAxis === 'columns' ? ' · transposed' : ''}
              </span>
              <button title="Insert above" className="chrome-btn" onClick={e => { e.stopPropagation(); onInsertBefore(b.id, { kind: 'block', type: 'text' }); }}><Plus className="w-3 h-3" /></button>
              <button title="Move up" className="chrome-btn" onClick={e => { e.stopPropagation(); onMove(b.id, -1); }}><ArrowUp className="w-3 h-3" /></button>
              <button title="Move down" className="chrome-btn" onClick={e => { e.stopPropagation(); onMove(b.id, 1); }}><ArrowDown className="w-3 h-3" /></button>
              <button title="Duplicate" className="chrome-btn" onClick={e => { e.stopPropagation(); onDuplicate(b.id); }}><Copy className="w-3 h-3" /></button>
              <button title="Delete" className="chrome-btn text-red-400 hover:text-red-300" onClick={e => { e.stopPropagation(); onRemove(b.id); }}><Trash2 className="w-3 h-3" /></button>
            </div>

            {(b.type === 'repeat' || b.type === 'table') ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-sky-700 uppercase tracking-wider px-1">
                  {meta.icon}
                  {b.type === 'table' ? 'Table' : 'Repeat'}: {COLLECTION_LABELS[b.collection || 'scenes']}
                  {b.collection === 'elements' ? ` (${b.category || 'props'})` : ''}
                  {b.type === 'table' && b.repeatAxis === 'columns' ? ` · transposed${b.headerField ? ` · header ${b.headerField}` : ''}` : ''}
                  {b.type === 'table' && (b.repeatAxis ?? 'rows') === 'rows' && b.tableRows?.length ? ` · ${b.tableRows.length} row${b.tableRows.length > 1 ? 's' : ''}` : ''}
                </div>
                {b.type === 'repeat' && b.children && b.children.length > 0 ? (
                  <div className="repeat-children" style={{ display: 'flex', flexDirection: 'column' }}>
                    {renderBlocks(b.children, depth + 1, b.collection, firstItemOf(ctx, b, parentItem, parentCategory), b.category)}
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
                  <ReportBlockView block={b} ctx={ctx} fieldMap={fieldMap} item={parentItem} parentCategory={parentCategory} parentCollection={parentCollection} />
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
                              className={`columns-col${colSelected ? ' selected' : ''}`}
                              data-col-width={col.width}
                              style={{
                                flex: `${total > 0 ? col.width / total : 1 / cols.length} 1 0%`,
                                minWidth: 0,
                              }}
                              onClick={e => { e.stopPropagation(); onSelectCol({ colsId: b.id, colIndex: ci }); }}
                              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onMenu(e, b.id, ci); }}
                            >
                              {colSelected && (
                                <div className="column-chrome">
                                  <span className="flex items-center gap-1 text-[10px] font-medium text-zinc-400 pr-1">
                                    <GripVertical className="w-3 h-3" />
                                    Column {ci + 1}
                                  </span>
                                  <button title="Add text block" className="chrome-btn" onClick={e => { e.stopPropagation(); onInsertIntoColumn(b.id, ci, { kind: 'block', type: 'text' }); }}><Plus className="w-3 h-3" /></button>
                                  <button title="Delete column" className="chrome-btn text-red-400 hover:text-red-300" onClick={e => { e.stopPropagation(); onRemoveColumn(b.id, ci); }}><Trash2 className="w-3 h-3" /></button>
                                </div>
                              )}
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {renderBlocks(col.blocks || [], depth, parentCollection, parentItem, parentCategory)}
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
              <ReportBlockView block={b} ctx={ctx} fieldMap={fieldMap} item={parentItem} parentCategory={parentCategory} parentCollection={parentCollection} />
            )}
          </div>
        </div>,
      );
      if (i === list.length - 1) out.push(<div key={`za-${b.id}`}>{renderZone(b, 'after', depth)}</div>);
    });
    return out;
  };

  // selected table (rows-mode) → resize bar overlay inside its card
  const selBlock = selId ? findBlock(blocks, selId)?.block : null;
  const resizeTarget = selBlock && selBlock.type === 'table' && (selBlock.repeatAxis ?? 'rows') === 'rows' ? selBlock : null;

  return (
    <div
      className="flex-1 overflow-y-auto p-8"
      onClick={() => { onSelect(null); onSelectCol(null); }}
      onDragEnter={e => { if (isDrag(e)) setDragging(true); }}
      onDragLeave={e => {
        const cur = e.currentTarget;
        if (e.relatedTarget && cur.contains(e.relatedTarget as Node)) return;
        pendingRef.current = null;
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 800, minHeight: '80vh', background: '#e4e4e7', borderRadius: 10, padding: 28 }}>
        {blocks.length === 0 && (
          <div className="text-center text-zinc-500 text-sm py-20 border border-dashed border-zinc-400 rounded-lg">
            No blocks yet — click or drag from the palette to build the report.
          </div>
        )}
        <div className="flex flex-col">{renderBlocks(blocks, 0)}</div>
      </div>
    </div>
  );
};

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
  const widths = block.colWidths && block.colWidths.length > 0 ? block.colWidths : [100];

  const startResize = (e: React.PointerEvent, ci: number) => {
    e.preventDefault();
    e.stopPropagation();
    const container = (e.currentTarget.closest('[data-block-id]') as HTMLElement)?.querySelector('.report-table-grid') as HTMLElement | null;
    const startX = e.clientX;
    const startWidths = [...widths];
    let lastNorm: number[] = startWidths;
    const onMove = (ev: PointerEvent) => {
      const deltaPct = ((ev.clientX - startX) / (container?.clientWidth || 1)) * 100;
      const next = [...startWidths];
      next[ci] = Math.max(5, startWidths[ci] + deltaPct);
      next[ci + 1] = Math.max(5, startWidths[ci + 1] - deltaPct);
      const total = next.reduce((a, b) => a + b, 0);
      lastNorm = next.map(w => (w / total) * 100);
      if (container) container.style.gridTemplateColumns = lastNorm.map(w => `${w}%`).join(' ');
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (container) container.style.gridTemplateColumns = '';
      onResize(normalizeColWidths(lastNorm));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  let acc = 0;
  const boundaries = widths.slice(0, -1).map(w => { acc += w; return acc; });
  if (boundaries.length === 0) return null;

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
