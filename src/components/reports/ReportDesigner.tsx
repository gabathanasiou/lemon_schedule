import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProject } from '../../store';
import { useCurrentWindow } from '../../lib/popoutTarget';
import { useReportCtx } from '../../lib/useReportCtx';
import { getReportFieldMap } from '../../lib/reportFields';
import { prepareSunWeatherForCtx } from '../../lib/reportWeather';
import { ReportDesign, ReportBlock } from '../../types';
import {
  findBlock, insertAfter, insertBefore, insertInto, removeBlock, duplicateBlock,
  moveBlock, moveBlockTo, duplicateBlockTo, updateBlock, parentCollectionOf, parentCategoryOf, insertScopeFor,
  makeReportBlock, wrapWithColumns, appendToColumn, moveIntoColumn, moveIntoChildren, cloneBlock, listOwnerOf,
  insertColumnAt, removeColumnAt, moveColumnAt, moveIntoNewColumn, duplicateIntoNewColumn, insideColumnsBlock,
  moveTableColumn, insertTableColumnAt, removeTableColumnAt,
} from '../../lib/reportBlocks';
import { getDefaultReportDesigns } from '../../lib/reportTemplates';
import { useViewMode } from '../../lib/persist';
import { ItemManagerDropdown } from '../DropdownMenu';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import ReportPalette, { PaletteDropPayload } from './ReportPalette';
import ReportToolbar from './ReportToolbar';
import ReportDesignerCanvas, { ColSel } from './ReportDesignerCanvas';
import ReportContextMenu, { MenuState } from './ReportContextMenu';
import ReportPreview from './ReportPreview';
import { Printer, Eye, EyeOff, ChevronDown, Check } from 'lucide-react';

function payloadToBlock(p: PaletteDropPayload, scope: string | null): ReportBlock {
  // Palette attributes become text blocks with the {{field}} token embedded —
  // an attribute block is just a text block with one token already in it.
  if (p.field) return makeReportBlock('text', { text: `{{${p.field}}}` });
  return makeReportBlock((p.type || 'text') as ReportBlock['type']);
}

interface ReportDesignerProps {
  headerTarget?: HTMLElement | null;
  onPrint?: (design: ReportDesign) => void;
}

export default function ReportDesigner({ headerTarget, onPrint }: ReportDesignerProps) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const ctx = useReportCtx();
  const fieldMap = useMemo(() => getReportFieldMap(project), [project]);
  const currentWin = useCurrentWindow();
  const [viewMode, setViewMode, viewWidth] = useViewMode();

  const activeDesign: ReportDesign | undefined = project.reportDesigns?.find(d => d.id === project.activeReportId) || project.reportDesigns?.[0];

  const [blocks, setBlocks] = useState<ReportBlock[]>(() => activeDesign?.blocks || []);
  const [headerBlocks, setHeaderBlocks] = useState<ReportBlock[]>(() => activeDesign?.header || []);
  const [footerBlocks, setFooterBlocks] = useState<ReportBlock[]>(() => activeDesign?.footer || []);
  const [skipFirstHeader, setSkipFirstHeader] = useState(() => !!activeDesign?.headerSkipFirst);
  const [skipFirstFooter, setSkipFirstFooter] = useState(() => !!activeDesign?.footerSkipFirst);
  const [editorMode, setEditorMode] = useState<'floating' | 'toolbar'>(() => {
    try { return localStorage.getItem('lemon_schedule_report_editor_mode') === 'toolbar' ? 'toolbar' : 'floating'; } catch { return 'floating'; }
  });
  const toggleEditorMode = () => {
    setEditorMode(prev => {
      const next = prev === 'floating' ? 'toolbar' : 'floating';
      try { localStorage.setItem('lemon_schedule_report_editor_mode', next); } catch { /* ignore */ }
      return next;
    });
  };
  const [selId, setSelId] = useState<string | null>(null);
  const [selCol, setSelCol] = useState<ColSel | null>(null);
  const [preview, setPreview] = useState(false);
  const [viewKeys, setViewKeys] = useState<boolean>(() => {
    // Show field values is the default; the choice persists across sessions.
    try { return localStorage.getItem('lemon_schedule_report_view_keys') === '1'; } catch { return false; }
  });
  const setViewKeysPersisted = (keys: boolean) => {
    setViewKeys(keys);
    try { localStorage.setItem('lemon_schedule_report_view_keys', keys ? '1' : '0'); } catch { /* ignore */ }
  };
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  // Sun & Weather values: warm the cache on load so canvas + preview render
  // real values instead of "—" (prefetch skips cached dates — cheap no-op).
  const [, setWeatherTick] = useState(0);

  useEffect(() => {
    if (!ctx || ctx.dayInfos.length === 0) return;
    let cancelled = false;
    prepareSunWeatherForCtx(ctx).then(() => { if (!cancelled) setWeatherTick(t => t + 1); });
    return () => { cancelled = true; };
  }, [ctx]);

  useEffect(() => {
    setBlocks(activeDesign?.blocks ? JSON.parse(JSON.stringify(activeDesign.blocks)) : []);
    setHeaderBlocks(activeDesign?.header ? JSON.parse(JSON.stringify(activeDesign.header)) : []);
    setFooterBlocks(activeDesign?.footer ? JSON.parse(JSON.stringify(activeDesign.footer)) : []);
    setSkipFirstHeader(!!activeDesign?.headerSkipFirst);
    setSkipFirstFooter(!!activeDesign?.footerSkipFirst);
    setSelId(null);
    setSelCol(null);
    setMenu(null);
  }, [activeDesign?.id]);

  useEffect(() => {
    if (!activeDesign) return;
    const fresh = activeDesign.blocks || [];
    const freshHeader = activeDesign.header || [];
    const freshFooter = activeDesign.footer || [];
    setBlocks(JSON.parse(JSON.stringify(fresh)));
    setHeaderBlocks(JSON.parse(JSON.stringify(freshHeader)));
    setFooterBlocks(JSON.parse(JSON.stringify(freshFooter)));
    setSkipFirstHeader(!!activeDesign.headerSkipFirst);
    setSkipFirstFooter(!!activeDesign.footerSkipFirst);
    const all = [...freshHeader, ...fresh, ...freshFooter];
    setSelId(prev => (prev && findBlock(all, prev) ? prev : null));
    setSelCol(prev => (prev && prev.colsId && findBlock(all, prev.colsId) ? prev : null));
  }, [project.reportDesigns]);

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const headerRef = useRef(headerBlocks);
  headerRef.current = headerBlocks;
  const footerRef = useRef(footerBlocks);
  footerRef.current = footerBlocks;
  const skipFirstHeaderRef = useRef(skipFirstHeader);
  skipFirstHeaderRef.current = skipFirstHeader;
  const skipFirstFooterRef = useRef(skipFirstFooter);
  skipFirstFooterRef.current = skipFirstFooter;
  const selIdRef = useRef(selId);
  selIdRef.current = selId;
  const selColRef = useRef(selCol);
  selColRef.current = selCol;

  const selectBlock = (id: string | null) => { setSelId(id); if (id) setSelCol(null); };
  const selectCol = (sel: ColSel | null) => { setSelCol(sel); if (sel) setSelId(null); };

  /** The zone (list) containing `id`. */
  const zoneOf = (id: string | null): 'header' | 'body' | 'footer' => {
    if (!id) return 'body';
    if (findBlock(headerRef.current, id)) return 'header';
    if (findBlock(footerRef.current, id)) return 'footer';
    return 'body';
  };
  const listOfZone = (zone: 'header' | 'body' | 'footer') =>
    zone === 'header' ? headerRef.current : zone === 'footer' ? footerRef.current : blocksRef.current;

  const commitAll = () => {
    if (!activeDesign) return;
    dispatch({
      type: 'UPDATE_REPORT_DESIGN',
      payload: {
        id: activeDesign.id,
        blocks: blocksRef.current,
        header: headerRef.current,
        footer: footerRef.current,
        headerSkipFirst: skipFirstHeaderRef.current,
        footerSkipFirst: skipFirstFooterRef.current,
      },
    });
  };

  const commit = (next: ReportBlock[], zone: 'header' | 'body' | 'footer' = 'body') => {
    if (zone === 'header') { setHeaderBlocks(next); headerRef.current = next; }
    else if (zone === 'footer') { setFooterBlocks(next); footerRef.current = next; }
    else { setBlocks(next); blocksRef.current = next; }
    commitAll();
  };

  const commitZone = (id: string | null, next: (list: ReportBlock[]) => ReportBlock[]) => {
    const zone = zoneOf(id);
    commit(next(listOfZone(zone)), zone);
  };

  /** Multiple dispatches that must land as ONE undo entry (cross-zone moves). */
  const batch = (fn: () => void) => {
    dispatch({ type: 'BATCH_START' });
    fn();
    dispatch({ type: 'BATCH_COMMIT' });
  };

  const patch = (id: string, p: Partial<ReportBlock>) => commitZone(id, list => updateBlock(list, id, p));

  const allBlocks = useMemo(() => [...headerBlocks, ...blocks, ...footerBlocks], [headerBlocks, blocks, footerBlocks]);

  const selBlock = selId ? findBlock(allBlocks, selId)?.block ?? null : null;
  const selParentCollection = selId ? parentCollectionOf(allBlocks, selId) : undefined;
  const selParentCategory = selId ? parentCategoryOf(allBlocks, selId) : undefined;
  const insertScope = useMemo(
    () => (selBlock && (selBlock.type === 'repeat' || selBlock.type === 'table') ? selBlock.collection || null : selParentCollection || null),
    [selBlock, selParentCollection],
  );
  const insertCategory = useMemo(
    () => (selBlock && (selBlock.type === 'repeat' || selBlock.type === 'table')
      ? ((selBlock.collection === 'elements' || selBlock.collection === 'cast') ? selBlock.category : undefined)
      : selParentCategory),
    [selBlock, selParentCategory],
  );

  const insertPayload = (payload: PaletteDropPayload, id: string | null = selId) => {
    const zone = zoneOf(id);
    const list = listOfZone(zone);
    const b = payloadToBlock(payload, insertScopeFor(list, id));
    const next = id ? insertAfter(list, id, b) : [...list, b];
    commit(next, zone);
    setSelId(b.id);
  };

  const insertIntoSelected = () => {
    if (!selId) return;
    const b = makeReportBlock('text');
    commitZone(selId, list => insertInto(list, selId, b));
  };

  // New-column ops (gutter drops AND edge drops inside a column): a brand-new
  // column of the existing columns block receives the dropped block.
  const insertNewColumn = (columnsId: string, colIndex: number, payload: PaletteDropPayload) => {
    const zone = zoneOf(columnsId);
    const b = payloadToBlock(payload, insertScopeFor(listOfZone(zone), columnsId));
    commit(insertColumnAt(listOfZone(zone), columnsId, colIndex, b), zone);
    setSelId(b.id);
  };
  const moveToNewColumn = (moveId: string, columnsId: string, colIndex: number) => {
    const zone = zoneOf(columnsId);
    const srcZone = zoneOf(moveId);
    if (srcZone !== zone) {
      batch(() => {
        const fm = findBlock(listOfZone(srcZone), moveId);
        if (!fm) return;
        commit(removeBlock(listOfZone(srcZone), moveId), srcZone);
        commit(insertColumnAt(listOfZone(zone), columnsId, colIndex, fm.block), zone);
      });
    } else {
      commit(moveIntoNewColumn(listOfZone(zone), moveId, columnsId, colIndex), zone);
    }
    setSelId(moveId);
  };
  const duplicateToNewColumn = (moveId: string, columnsId: string, colIndex: number) => {
    const zone = zoneOf(columnsId);
    commit(duplicateIntoNewColumn(listOfZone(zone), moveId, columnsId, colIndex), zone);
    setSelId(moveId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenu(null); setPreview(false); setSelId(null); setSelCol(null); return; }
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const col = selColRef.current;
      if (col) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          const zone = zoneOf(col.colsId);
          const owner = findBlock(listOfZone(zone), col.colsId)?.block;
          if (owner?.type === 'table') commit(removeTableColumnAt(listOfZone(zone), col.colsId, col.colIndex), zone);
          else commit(removeColumnAt(listOfZone(zone), col.colsId, col.colIndex), zone);
          setSelCol(null);
        }
        return;
      }
      const id = selIdRef.current;
      if (!id) return;
      const zone = zoneOf(id);
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); commit(removeBlock(listOfZone(zone), id), zone); setSelId(null); }
      if (e.key === 'ArrowUp') { e.preventDefault(); commit(moveBlock(listOfZone(zone), id, -1), zone); }
      if (e.key === 'ArrowDown') { e.preventDefault(); commit(moveBlock(listOfZone(zone), id, 1), zone); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); commit(duplicateBlock(listOfZone(zone), id), zone); }
    };
    currentWin.addEventListener('keydown', onKey);
    return () => currentWin.removeEventListener('keydown', onKey);
  }, [currentWin, activeDesign?.id]);

  const importFileRef = useRef<HTMLInputElement>(null);
  const exportDesign = () => {
    if (!activeDesign) return;
    const blob = new Blob([JSON.stringify({
      name: activeDesign.name,
      page: activeDesign.page,
      blocks: activeDesign.blocks,
      header: activeDesign.header || [],
      footer: activeDesign.footer || [],
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeDesign.name || 'report').replace(/[^a-z0-9-_ ]/gi, '')}.report`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importDesign = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed.blocks)) throw new Error('bad format');
        dispatch({
          type: 'ADD_REPORT_DESIGN',
          payload: {
            name: parsed.name || 'Imported Report',
            blocks: parsed.blocks,
            header: parsed.header || [],
            footer: parsed.footer || [],
            page: parsed.page === 'landscape' ? 'landscape' : 'portrait',
          },
        });
      } catch {
        // ignore invalid files
      }
    };
    reader.readAsText(file);
  };

  const headerContent = (
    <>
      <DesignsMenu
        designs={project.reportDesigns || []}
        activeId={activeDesign?.id || ''}
        readOnly={readOnly}
        onSelect={id => dispatch({ type: 'SET_ACTIVE_REPORT', payload: id })}
        onRename={(id, name) => dispatch({ type: 'RENAME_REPORT_DESIGN', payload: { id, name } })}
        onDuplicate={id => {
          const d = project.reportDesigns?.find(x => x.id === id);
          dispatch({ type: 'ADD_REPORT_DESIGN', payload: { name: `${d?.name || 'Report'} Copy`, cloneFromId: id } });
        }}
        onDelete={id => dispatch({ type: 'DELETE_REPORT_DESIGN', payload: id })}
        onCreate={() => dispatch({ type: 'ADD_REPORT_DESIGN', payload: { name: `Report ${(project.reportDesigns?.length || 0) + 1}` } })}
        onImport={() => importFileRef.current?.click()}
        onExport={exportDesign}
        onReset={() => {
          const fresh = getDefaultReportDesigns()[0];
          if (activeDesign) commit(JSON.parse(JSON.stringify(fresh.blocks)));
        }}
      />
      <div className="flex-1" />
      <div className="flex-1" />
      <DropdownMenu
        open={viewMenuOpen}
        onOpenChange={setViewMenuOpen}
        width="w-36"
        trigger={
          <button className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <span className="font-semibold text-zinc-500">View:</span>
            <span className="text-zinc-200">{viewMode === 'portrait' ? 'A4 Portrait' : viewMode === 'landscape' ? 'A4 Landscape' : 'Full Width'}</span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>
        }
      >
        {(['portrait', 'landscape', 'full'] as const).map(m => (
          <DropdownItem
            key={m}
            onClick={() => {
              setViewMode(m);
              setViewMenuOpen(false);
              if (m !== 'full' && activeDesign && activeDesign.page !== m && !readOnly) {
                dispatch({ type: 'UPDATE_REPORT_PAGE', payload: { id: activeDesign.id, page: m } });
              }
            }}
            icon={viewMode === m ? <Check className="w-3.5 h-3.5" /> : undefined}
          >
            {m === 'portrait' ? 'A4 Portrait' : m === 'landscape' ? 'A4 Landscape' : 'Full Width'}
          </DropdownItem>
        ))}
        <div className="border-t border-zinc-800 my-1" />
        <DropdownItem
          onClick={() => { setViewKeysPersisted(true); setViewMenuOpen(false); }}
          icon={viewKeys ? <Check className="w-3.5 h-3.5" /> : undefined}
        >
          Show field keys
        </DropdownItem>
        <DropdownItem
          onClick={() => { setViewKeysPersisted(false); setViewMenuOpen(false); }}
          icon={!viewKeys ? <Check className="w-3.5 h-3.5" /> : undefined}
        >
          Show field values
        </DropdownItem>
      </DropdownMenu>
      <button
        onClick={() => setPreview(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
      >
        {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        {preview ? 'Edit' : 'Preview'}
      </button>
      <button
        onClick={() => activeDesign && onPrint?.(activeDesign)}
        disabled={!onPrint}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-zinc-100 text-zinc-900 font-medium hover:bg-white disabled:opacity-30"
      >
        <Printer className="w-3.5 h-3.5" /> Print
      </button>
      <input
        ref={importFileRef}
        type="file"
        accept=".report,.json"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) importDesign(f); e.target.value = ''; }}
      />
    </>
  );

  if (!activeDesign || !ctx) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950 text-zinc-500 text-sm">
        No report designs yet — create one from the header menu.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-300 select-none min-h-0 min-w-0">
      {headerTarget ? createPortal(headerContent, headerTarget) : <header className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900">{headerContent}</header>}

      {preview ? (
        <ReportPreview design={activeDesign} ctx={ctx} fieldMap={fieldMap} onExit={() => setPreview(false)} />
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
          <ReportPalette project={project} insertScope={insertScope} insertCategory={insertCategory} insideColumns={!!selId && insideColumnsBlock(allBlocks, selId)} onInsert={insertPayload} readOnly={readOnly} />
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <ReportToolbar
              block={selBlock}
              parentCollection={selParentCollection}
              parentCategory={selParentCategory}
              project={project}
              readOnly={readOnly}
              editorMode={editorMode}
              onToggleEditorMode={toggleEditorMode}
              onDeselect={() => { setSelId(null); setSelCol(null); }}
              onPatch={p => selId && patch(selId, p)}
              onSaveTextStyles={styles => dispatch({ type: 'SET_REPORT_TEXT_STYLES', payload: styles })}
              onDuplicate={() => selId && commitZone(selId, list => duplicateBlock(list, selId))}
              onRemove={() => { if (selId) { commitZone(selId, list => removeBlock(list, selId)); setSelId(null); } }}
              onMove={d => selId && commitZone(selId, list => moveBlock(list, selId, d))}
            />
            <ReportDesignerCanvas
              blocks={blocks}
              headerBlocks={headerBlocks}
              footerBlocks={footerBlocks}
              skipFirstHeader={skipFirstHeader}
              skipFirstFooter={skipFirstFooter}
              onToggleHeaderSkipFirst={() => { const next = !skipFirstHeaderRef.current; skipFirstHeaderRef.current = next; setSkipFirstHeader(next); commitAll(); }}
              onToggleFooterSkipFirst={() => { const next = !skipFirstFooterRef.current; skipFirstFooterRef.current = next; setSkipFirstFooter(next); commitAll(); }}
              selId={selId}
              selCol={selCol}
              ctx={ctx}
              fieldMap={fieldMap}
              readOnly={readOnly}
              showKeys={viewKeys}
              project={project}
              parentCollection={selParentCollection}
              parentCategory={selParentCategory}
              onSaveTextStyles={styles => dispatch({ type: 'SET_REPORT_TEXT_STYLES', payload: styles })}
              viewWidth={viewWidth}
              pageSize={activeDesign?.page}
              onSelect={selectBlock}
              onSelectCol={selectCol}
              onPatch={patch}
              onInsertTableColumnAt={(tableId, colIndex) => { const zone = zoneOf(tableId); commit(insertTableColumnAt(listOfZone(zone), tableId, colIndex), zone); }}
              onRemoveTableColumn={(tableId, colIndex) => { const zone = zoneOf(tableId); commit(removeTableColumnAt(listOfZone(zone), tableId, colIndex), zone); setSelCol(null); }}
              onInsertIntoZone={(zone, payload) => {
                // dragging an existing block moves it (Alt = duplicate)
                if (payload.moveId) {
                  const srcZone = zoneOf(payload.moveId);
                  const srcList = listOfZone(srcZone);
                  const fm = findBlock(srcList, payload.moveId);
                  if (!fm) return;
                  const tgtList = listOfZone(zone);
                  const moving = srcZone !== zone;
                  const next = payload.duplicate
                    ? [...tgtList, cloneBlock(fm.block)]
                    : moving ? [...tgtList, fm.block] : tgtList;
                  if (moving || payload.duplicate) {
                    batch(() => {
                      if (moving) commit(removeBlock(srcList, payload.moveId), srcZone);
                      commit(next, zone);
                    });
                  } else {
                    commit(next, zone);
                  }
                  setSelId(payload.moveId);
                  return;
                }
                const b = payloadToBlock(payload, null);
                commit([...listOfZone(zone), b], zone);
                setSelId(b.id);
              }}
              editorMode={editorMode}
              onMoveTableColumn={(tableId, from, to) => {
                const zone = zoneOf(tableId);
                commit(moveTableColumn(listOfZone(zone), tableId, from, to), zone);
                setSelCol(prev => (prev && prev.colsId === tableId ? { colsId: tableId, colIndex: to } : prev));
              }}
              onInsertAfter={(id, payload) => { const zone = zoneOf(id); const b = payloadToBlock(payload, insertScopeFor(listOfZone(zone), id)); commit(id ? insertAfter(listOfZone(zone), id, b) : [...listOfZone(zone), b], zone); setSelId(b.id); }}
              onInsertBefore={(id, payload) => { const zone = zoneOf(id); const b = payloadToBlock(payload, insertScopeFor(listOfZone(zone), id)); commit(id ? insertBefore(listOfZone(zone), id, b) : [b, ...listOfZone(zone)], zone); setSelId(b.id); }}
              onInsertInto={(id, payload) => { const zone = zoneOf(id); const b = payloadToBlock(payload, insertScopeFor(listOfZone(zone), id)); commit(insertInto(listOfZone(zone), id, b), zone); setSelId(b.id); }}
              onMoveInto={(containerId, moveId) => {
                const zone = zoneOf(containerId);
                const srcZone = zoneOf(moveId);
                if (srcZone !== zone) {
                  batch(() => {
                    const fm = findBlock(listOfZone(srcZone), moveId);
                    if (!fm) return;
                    commit(removeBlock(listOfZone(srcZone), moveId), srcZone);
                    commit(insertInto(listOfZone(zone), containerId, fm.block), zone);
                  });
                } else {
                  commit(moveIntoChildren(listOfZone(zone), moveId, containerId), zone);
                }
                setSelId(moveId);
              }}
              onDuplicateInto={(containerId, moveId) => {
                const zone = zoneOf(containerId);
                const src = findBlock(listOfZone(zoneOf(moveId)), moveId);
                if (!src) return;
                commit(insertInto(listOfZone(zone), containerId, cloneBlock(src.block)), zone);
              }}
              onMoveTo={(moveId, targetId, pos) => {
                const srcZone = zoneOf(moveId);
                const tgtZone = zoneOf(targetId);
                if (srcZone === tgtZone) {
                  commit(moveBlockTo(listOfZone(srcZone), moveId, targetId, pos), srcZone);
                } else {
                  batch(() => {
                    const fm = findBlock(listOfZone(srcZone), moveId);
                    if (!fm) return;
                    commit(removeBlock(listOfZone(srcZone), moveId), srcZone);
                    commit(pos === 'before' ? insertBefore(listOfZone(tgtZone), targetId, fm.block) : insertAfter(listOfZone(tgtZone), targetId, fm.block), tgtZone);
                  });
                }
                setSelId(moveId);
              }}
              onDuplicateTo={(moveId, targetId, pos) => {
                const zone = zoneOf(targetId);
                const copy = duplicateBlockTo(listOfZone(zone), moveId, targetId, pos);
                commit(copy, zone);
                setSelId(moveId);
              }}
              onWrap={(targetId, payload, side) => {
                const zone = zoneOf(targetId);
                const list = listOfZone(zone);
                const owner = listOwnerOf(list, targetId);
                if (owner?.colIndex !== undefined) {
                  // Target lives inside a column → add a NEW column to that
                  // columns block (left edge = before its column, right edge =
                  // after), reusing the gutter's new-column ops — no nested
                  // columns block.
                  const colIndex = side === 'left' ? owner.colIndex : owner.colIndex + 1;
                  if (payload.moveId) {
                    if (payload.duplicate) duplicateToNewColumn(payload.moveId, owner.blockId, colIndex);
                    else moveToNewColumn(payload.moveId, owner.blockId, colIndex);
                  } else {
                    insertNewColumn(owner.blockId, colIndex, payload);
                  }
                  return;
                }
                const dropped = payload.moveId
                  ? findBlock(listOfZone(zoneOf(payload.moveId)), payload.moveId)?.block ?? null
                  : payloadToBlock(payload, insertScopeFor(list, targetId));
                if (!dropped) return;
                if (payload.moveId && payload.duplicate) {
                  commit(wrapWithColumns(list, targetId, cloneBlock(dropped), side), zone);
                } else {
                  commit(wrapWithColumns(list, targetId, dropped, side, payload.moveId), zone);
                }
              }}
              onInsertIntoColumn={(columnsId, colIndex, payload) => {
                const zone = zoneOf(columnsId);
                const b = payloadToBlock(payload, insertScopeFor(listOfZone(zone), columnsId));
                commit(appendToColumn(listOfZone(zone), columnsId, colIndex, b), zone);
                setSelId(b.id);
              }}
              onMoveIntoColumn={(moveId, columnsId, colIndex) => {
                const zone = zoneOf(columnsId);
                const srcZone = zoneOf(moveId);
                if (srcZone !== zone) {
                  batch(() => {
                    const fm = findBlock(listOfZone(srcZone), moveId);
                    if (!fm) return;
                    commit(removeBlock(listOfZone(srcZone), moveId), srcZone);
                    commit(appendToColumn(listOfZone(zone), columnsId, colIndex, fm.block), zone);
                  });
                } else {
                  commit(moveIntoColumn(listOfZone(zone), moveId, columnsId, colIndex), zone);
                }
                setSelId(moveId);
              }}
              onDuplicateIntoColumn={(moveId, columnsId, colIndex) => {
                const zone = zoneOf(columnsId);
                const fm = findBlock(listOfZone(zoneOf(moveId)), moveId);
                if (!fm) return;
                commit(appendToColumn(listOfZone(zone), columnsId, colIndex, cloneBlock(fm.block)), zone);
              }}
              onInsertNewColumn={insertNewColumn}
              onMoveToNewColumn={moveToNewColumn}
              onDuplicateToNewColumn={duplicateToNewColumn}
              onRemoveColumn={(columnsId, colIndex) => {
                const zone = zoneOf(columnsId);
                commit(removeColumnAt(listOfZone(zone), columnsId, colIndex), zone);
                setSelCol(null);
              }}
              onMoveColumn={(columnsId, from, to) => {
                const zone = zoneOf(columnsId);
                commit(moveColumnAt(listOfZone(zone), columnsId, from, to), zone);
                setSelCol(prev => (prev && prev.colsId === columnsId ? { colsId: columnsId, colIndex: to } : prev));
              }}
              onDuplicate={id => commitZone(id, list => duplicateBlock(list, id))}
              onRemove={id => { commitZone(id, list => removeBlock(list, id)); if (selId === id) setSelId(null); if (selCol?.colsId === id) setSelCol(null); }}
              onMove={(id, d) => commitZone(id, list => moveBlock(list, id, d))}
              onMenu={(e, id, colIndex) => {
                setSelId(id);
                setSelCol(colIndex !== undefined ? { colsId: id, colIndex } : null);
                setMenu({ x: e.clientX, y: e.clientY, id, colIndex });
              }}
            />
          </div>
        </div>
      )}

      {menu && selBlock && (
        <ReportContextMenu
          menu={menu}
          block={selBlock}
          project={project}
          insertScope={insertScope}
          insertCategory={insertCategory}
          onClose={() => setMenu(null)}
          onChangeField={f => {
            if (menu.colIndex !== undefined && selBlock?.type === 'table') {
              const cols = selBlock.columns || [];
              patch(menu.id, { columns: cols.map((c, i) => i === menu.colIndex ? { ...c, field: f } : c) });
              return;
            }
            patch(menu.id, { field: f });
          }}
          onInsertAbove={() => commitZone(menu.id, list => insertBefore(list, menu.id, makeReportBlock('text')))}
          onInsertBelow={() => commitZone(menu.id, list => insertAfter(list, menu.id, makeReportBlock('text')))}
          onAddChild={insertIntoSelected}
          onDuplicate={() => commitZone(menu.id, list => duplicateBlock(list, menu.id))}
          onRemove={() => { commitZone(menu.id, list => removeBlock(list, menu.id)); setSelId(null); setMenu(null); }}
          onColumnInsertAt={i => {
            if (menu.colIndex === undefined) return;
            const zone = zoneOf(menu.id);
            if (selBlock?.type === 'table') {
              commit(insertTableColumnAt(listOfZone(zone), menu.id, i), zone);
              setMenu(null);
              return;
            }
            const b = makeReportBlock('text');
            commit(insertColumnAt(listOfZone(zone), menu.id, i, b), zone);
            setSelId(b.id);
            setMenu(null);
          }}
          onColumnMove={dir => {
            if (menu.colIndex === undefined) return;
            const zone = zoneOf(menu.id);
            commit(moveTableColumn(listOfZone(zone), menu.id, menu.colIndex, menu.colIndex + dir), zone);
            setSelCol({ colsId: menu.id, colIndex: menu.colIndex + dir });
            setMenu(null);
          }}
          onColumnRemove={() => {
            if (menu.colIndex === undefined) return;
            const zone = zoneOf(menu.id);
            if (selBlock?.type === 'table') commit(removeTableColumnAt(listOfZone(zone), menu.id, menu.colIndex), zone);
            else commit(removeColumnAt(listOfZone(zone), menu.id, menu.colIndex), zone);
            setSelCol(null);
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

const DesignsMenu: React.FC<{
  designs: ReportDesign[];
  activeId: string;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
  onExport: () => void;
  onReset: () => void;
}> = ({ designs, activeId, readOnly, onSelect, onRename, onDuplicate, onDelete, onCreate, onImport, onExport, onReset }) => {
  const [open, setOpen] = useState(false);
  return (
    <ItemManagerDropdown
      open={open}
      onClose={setOpen}
      items={designs.map(d => ({ id: d.id, name: d.name }))}
      activeId={activeId}
      label="Editing"
      header="REPORT DESIGNS"
      readOnly={readOnly}
      trigger={
        <span className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 px-1 py-0.5 rounded hover:bg-zinc-800">
          Editing: {designs.find(d => d.id === activeId)?.name || '—'}
          <ChevronDown className="w-3 h-3" />
        </span>
      }
      onSelect={id => { onSelect(id); setOpen(false); }}
      onRename={(id, name) => { onRename(id, name); }}
      onDuplicate={id => { onDuplicate(id); setOpen(false); }}
      onDelete={id => { onDelete(id); setOpen(false); }}
      onCreate={() => { onCreate(); setOpen(false); }}
      onImport={() => { onImport(); setOpen(false); }}
      onExport={() => { onExport(); setOpen(false); }}
      onReset={() => { onReset(); setOpen(false); }}
    />
  );
};
