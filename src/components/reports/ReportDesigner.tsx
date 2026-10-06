import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProject } from '../../store';
import { useCurrentWindow } from '../../lib/popoutTarget';
import { useReportCtx } from '../../lib/useReportCtx';
import { getReportFieldMap } from '../../lib/reportFields';
import { prepareSunWeatherForCtx } from '../../lib/reportWeather';
import { ReportDesign, ReportBlock, ReportCollection, ReportTextStyle, ReportViewMode } from '../../types';
import {
  findBlock, insertAfter, insertBefore, insertInto, removeBlock, duplicateBlockWithId,
  moveBlock, moveBlockTo, duplicateBlockTo, updateBlock, parentCollectionOf, parentCategoryOf, insertScopeFor,
  makeReportBlock, wrapWithColumns, appendToColumn, moveIntoColumn, moveIntoChildren, cloneBlock, listOwnerOf,
  insertColumnAt, removeColumnAt, moveColumnAt, moveIntoNewColumn, duplicateIntoNewColumn, insideColumnsBlock,
  moveTableColumn, insertTableColumnAt, removeTableColumnAt, blockAllowedIn, blockPlacementHint,
} from '../../lib/reportBlocks';
import { getDefaultReportDesigns } from '../../lib/reportTemplates';
import { useViewMode, usePersistState } from '../../lib/persist';
import { usePaneResize } from '../../lib/usePaneResize';
import { ItemManagerDropdown } from '../DropdownMenu';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import ReportPalette, { PaletteDropPayload } from './ReportPalette';
import ReportToolbar from './ReportToolbar';
import ReportDesignerCanvas, { ColSel } from './ReportDesignerCanvas';
import ReportContextMenu, { MenuState } from './ReportContextMenu';
import ReportPreview from './ReportPreview';
import CustomCellControls, { cellStructureOps } from './CustomCellControls';
import { CustomCellSelection, useCustomTableCells } from './useCustomTableCells';
import { RichTextEditorHandle, RICH_TEXT_STATE_IDLE, RichTextState } from './RichTextEditor';
import { Printer, Eye, EyeOff, ChevronDown, Check, ArrowRightLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Button from '../Button';
import { Seg, ToolButton, TB_BTN_ICON } from '@gabriel/ui-kit';
import { useDialog } from '../Dialog';

function payloadToBlock(p: PaletteDropPayload, scope: string | null): ReportBlock {
  // Palette attributes become text blocks with the {{field}} token embedded —
  // an attribute block is just a text block with one token already in it.
  if (p.field) return makeReportBlock('text', { text: `{{${p.field}}}` });
  return makeReportBlock((p.type || 'text') as ReportBlock['type']);
}

/** Zone mode (item 10): edit ONE `callSheetEdit` zone's blocks for a single
 *  production day. The component edits only `zone.blocks` (never the design)
 *  and skips the design header/footer chrome. */
export interface ReportDesignerZone {
  designId: string;
  blocks: ReportBlock[];
  onChange: (blocks: ReportBlock[]) => void;
  /** Palette field scope when nothing is selected (the zone lives in a `days`
   *  repeat, so its content is day-scoped). */
  scope?: ReportCollection;
}

interface ReportDesignerProps {
  headerTarget?: HTMLElement | null;
  onPrint?: (design: ReportDesign) => void;
  zone?: ReportDesignerZone;
}

export default function ReportDesigner({ headerTarget, onPrint, zone }: ReportDesignerProps) {
  const { state, dispatch, readOnly } = useProject();
  const dialog = useDialog();
  const project = state.present;
  const ctx = useReportCtx();
  const fieldMap = useMemo(() => getReportFieldMap(project), [project]);
  const currentWin = useCurrentWindow();
  const [viewMode, setViewMode, viewWidth] = useViewMode();
  const zoneMode = !!zone;

  const activeDesign: ReportDesign | undefined = project.reportDesigns?.find(d => d.id === (zone?.designId || project.activeReportId)) || project.reportDesigns?.[0];

  const [blocks, setBlocks] = useState<ReportBlock[]>(() => (zone?.blocks ? JSON.parse(JSON.stringify(zone.blocks)) : activeDesign?.blocks || []));
  const [headerBlocks, setHeaderBlocks] = useState<ReportBlock[]>(() => activeDesign?.header || []);
  const [footerBlocks, setFooterBlocks] = useState<ReportBlock[]>(() => activeDesign?.footer || []);
  const [skipFirstHeader, setSkipFirstHeader] = useState(() => !!activeDesign?.headerSkipFirst);
  const [skipFirstFooter, setSkipFirstFooter] = useState(() => !!activeDesign?.footerSkipFirst);
  // Docked inspector is the DEFAULT (roadmap 205) — floating is opt-in and
  // persists per session.
  const [editorMode, setEditorMode] = useState<'floating' | 'toolbar'>(() => {
    try { return localStorage.getItem('lemon_schedule_report_editor_mode') === 'floating' ? 'floating' : 'toolbar'; } catch { return 'toolbar'; }
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
  // Free-table cell selection (roadmap 189) — lifted here so the docked
  // inspector mirrors the canvas selection and shares its editor target.
  const [selCell, setSelCell] = useState<(CustomCellSelection & { blockId: string }) | null>(null);
  const cellEditorRef = useRef<RichTextEditorHandle | null>(null);
  const [cellRtState, setCellRtState] = useState<RichTextState>(RICH_TEXT_STATE_IDLE);
  // Inline text editing channel (roadmap 191) — ONE handle + formatting state
  // shared by the canvas text block's live editor and the chrome/dock's
  // Format + Style body (the block's own chip key rides along).
  const textEditorRef = useRef<RichTextEditorHandle | null>(null);
  const [textRtState, setTextRtState] = useState<RichTextState>(RICH_TEXT_STATE_IDLE);
  const [textChipKey, setTextChipKey] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  // Docked rail (inspector + palette): collapse state and drag width persist
  // like the manager/script side panes.
  const [rail, setRail] = usePersistState('lemon_schedule_report_rail', { open: true, width: 360 });
  const onRailResize = usePaneResize({
    width: rail.width,
    min: 240,
    max: 560,
    edge: 'right',
    onChange: w => setRail(p => ({ ...p, width: w })),
  });
  // One global display/edit mode (roadmap 203): Fields = chips/keys with
  // single-click editing, Values = the final look with double-click/tap-again
  // entry. Default Values; the retired `lemon_schedule_report_view_keys` key is
  // ignored (no migration).
  const [reportMode, setReportMode] = useState<ReportViewMode>(() => {
    try { return localStorage.getItem('lemon_schedule_report_view_mode') === 'fields' ? 'fields' : 'values'; } catch { return 'values'; }
  });
  const setReportModePersisted = (mode: ReportViewMode) => {
    setReportMode(mode);
    setSelCell(null);
    try { localStorage.setItem('lemon_schedule_report_view_mode', mode); } catch { /* ignore */ }
  };
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  // Sun & Weather values: warm the cache on load so canvas + preview render
  // real values instead of "—" (prefetch skips cached dates — cheap no-op).
  // Location-aware: also warms every pinned location the ACTIVE design
  // iterates (a locations repeat/table in the tree).
  const [, setWeatherTick] = useState(0);
  const activeDesignRef = useRef(activeDesign);
  activeDesignRef.current = activeDesign;
  const designId = activeDesign?.id;

  useEffect(() => {
    if (!ctx || ctx.dayInfos.length === 0) return;
    let cancelled = false;
    prepareSunWeatherForCtx(ctx, activeDesignRef.current).then(() => { if (!cancelled) setWeatherTick(t => t + 1); });
    return () => { cancelled = true; };
  }, [ctx, designId]);

  useEffect(() => {
    if (zoneMode) return;
    setBlocks(activeDesign?.blocks ? JSON.parse(JSON.stringify(activeDesign.blocks)) : []);
    setHeaderBlocks(activeDesign?.header ? JSON.parse(JSON.stringify(activeDesign.header)) : []);
    setFooterBlocks(activeDesign?.footer ? JSON.parse(JSON.stringify(activeDesign.footer)) : []);
    setSkipFirstHeader(!!activeDesign?.headerSkipFirst);
    setSkipFirstFooter(!!activeDesign?.footerSkipFirst);
    setSelId(null);
    setSelCol(null);
    setSelCell(null);
    setMenu(null);
    setTextRtState(RICH_TEXT_STATE_IDLE);
    setTextChipKey(null);
  }, [activeDesign?.id]);

  useEffect(() => {
    if (zoneMode || !activeDesign) return;
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

  const selectBlock = (id: string | null) => {
    setSelId(id);
    if (id) setSelCol(null);
    setSelCell(prev => (prev && prev.blockId === id ? prev : null));
  };
  const selectCol = (sel: ColSel | null) => { setSelCol(sel); if (sel) { setSelId(null); setSelCell(null); } };

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
    if (zoneMode) { zone!.onChange(blocksRef.current); return; }
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

  const patch = (id: string, p: Partial<ReportBlock>) => {
    // Switching a table to Free table drops you straight into editing (the
    // canvas focuses the first cell).
    if (p.custom === true && !findBlock(allBlocks, id)?.block.custom) setAutoEditId(id);
    commitZone(id, list => updateBlock(list, id, p));
  };

  const allBlocks = useMemo(() => [...headerBlocks, ...blocks, ...footerBlocks], [headerBlocks, blocks, footerBlocks]);

  const selBlock = selId ? findBlock(allBlocks, selId)?.block ?? null : null;
  const selParentCollection = selId ? parentCollectionOf(allBlocks, selId) : undefined;
  const selParentCategory = selId ? parentCategoryOf(allBlocks, selId) : undefined;
  const insertScope = useMemo(
    () => (selBlock && (selBlock.type === 'repeat' || selBlock.type === 'table')
      ? selBlock.collection || null
      : selParentCollection || (zoneMode ? zone!.scope || null : null)),
    [selBlock, selParentCollection, zoneMode, zone?.scope],
  );
  const insertCategory = useMemo(
    () => (selBlock && (selBlock.type === 'repeat' || selBlock.type === 'table')
      ? ((selBlock.collection === 'elements' || selBlock.collection === 'cast') ? selBlock.category : undefined)
      : selParentCategory),
    [selBlock, selParentCategory],
  );

  // Free-table cell ops (roadmap 189): the docked inspector renders the same
  // controls as the floating cell chrome, sharing the selection + editor ref.
  const customSelBlock = selBlock && selBlock.type === 'table' && selBlock.custom ? selBlock : undefined;
  const cellSelForBlock = selCell && customSelBlock && selCell.blockId === customSelBlock.id ? selCell : null;
  const cellOps = useCustomTableCells({
    block: customSelBlock,
    patch: p => { if (selId) patch(selId, p); },
    selection: cellSelForBlock,
    onSelectionChange: sel => setSelCell(sel && customSelBlock ? { blockId: customSelBlock.id, ...sel } : null),
  });
  const cellControls = customSelBlock && cellSelForBlock ? (
    <CustomCellControls
      label={cellOps.label}
      canMerge={cellOps.canMerge}
      canUnmerge={cellOps.canUnmerge}
      project={project}
      styleValue={cellOps.focusStyle}
      objectMixed={cellOps.rangeMixed}
      editorRef={cellEditorRef}
      active={cellRtState}
      readOnly={readOnly}
      panel
      onMerge={cellOps.merge}
      onUnmerge={cellOps.unmerge}
      onStyle={cellOps.patchStyle}
      onReset={cellOps.resetCells}
      onSaveTextStyles={styles => dispatch({ type: 'SET_REPORT_TEXT_STYLES', payload: styles })}
      structure={cellStructureOps(cellOps)}
    />
  ) : null;

  // Palette blocks are always enabled; a disallowed placement explains where
  // the block CAN go instead of silently disabling the palette item.
  const guardAllowed = (payload: PaletteDropPayload, scope: ReportCollection | null | undefined, insideColumns: boolean): boolean => {
    const type: ReportBlock['type'] = payload.field ? 'text' : ((payload.type || 'text') as ReportBlock['type']);
    if (blockAllowedIn(type, scope, insideColumns)) return true;
    dialog.alert({ title: 'Can’t drop that here', message: blockPlacementHint(type) });
    return false;
  };
  const guardInsert = (payload: PaletteDropPayload, scope: ReportCollection | null | undefined, insideColumns: boolean, apply: () => void) => {
    if (guardAllowed(payload, scope, insideColumns)) apply();
  };

  // Freshly added text / free-table blocks enter editing with the caret inside
  // — the canvas focuses once the block has rendered.
  const [autoEditId, setAutoEditId] = useState<string | null>(null);
  const markAutoEdit = (b: ReportBlock, attribute = false) => {
    if (attribute) return;
    if (b.type === 'text' || (b.type === 'table' && b.custom)) setAutoEditId(b.id);
  };

  // Explicit duplicate (toolbar / block chrome / context menu / Cmd+C): the
  // COPY becomes the selection so it can be edited/moved immediately — but it
  // never auto-enters editing (roadmap 204; only palette inserts do that).
  // Drag duplicates (Alt+drag) keep the SOURCE selected: the drop is the
  // placement gesture and re-dragging should keep placing copies of the
  // original.
  const duplicateBlockSelect = (id: string) => {
    const zone = zoneOf(id);
    const { blocks: next, newId } = duplicateBlockWithId(listOfZone(zone), id);
    if (!newId) return;
    commit(next, zone);
    setSelId(newId);
  };

  const insertPayload = (payload: PaletteDropPayload, id: string | null = selId) => {
    guardInsert(payload, insertScope, id ? insideColumnsBlock(allBlocks, id) : false, () => {
      const zone = zoneOf(id);
      const list = listOfZone(zone);
      const b = payloadToBlock(payload, insertScopeFor(list, id));
      const next = id ? insertAfter(list, id, b) : [...list, b];
      commit(next, zone);
      setSelId(b.id);
      markAutoEdit(b, !!payload.field);
    });
  };

  const insertIntoSelected = () => {
    if (!selId) return;
    const b = makeReportBlock('text');
    commitZone(selId, list => insertInto(list, selId, b));
    setSelId(b.id);
    markAutoEdit(b);
  };

  // New-column ops (gutter drops AND edge drops inside a column): a brand-new
  // column of the existing columns block receives the dropped block.
  const insertNewColumn = (columnsId: string, colIndex: number, payload: PaletteDropPayload) => {
    const zone = zoneOf(columnsId);
    const list = listOfZone(zone);
    guardInsert(payload, insertScopeFor(list, columnsId), true, () => {
      const b = payloadToBlock(payload, insertScopeFor(list, columnsId));
      commit(insertColumnAt(list, columnsId, colIndex, b), zone);
      setSelId(b.id);
      markAutoEdit(b, !!payload.field);
    });
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
      // Escape inside an open dialog (styles modal, print dialog…) belongs to
      // the dialog — never hijack it to deselect the block (the chrome and
      // everything mounted inside it, like the modal, would unmount).
      if (e.key === 'Escape') {
        if (currentWin.document.querySelector('[role="dialog"]')) return;
        setMenu(null); setPreview(false); setSelId(null); setSelCol(null); setSelCell(null); return;
      }
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); duplicateBlockSelect(id); }
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
      <Seg
        dense
        value={reportMode}
        options={[
          { v: 'fields', l: 'Fields', title: 'Fields — chips everywhere; text and tables edit in place' },
          { v: 'values', l: 'Values', title: 'Values — the final look; double-click or tap again to edit' },
        ]}
        onChange={v => setReportModePersisted(v as ReportViewMode)}
      />
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

  const docked = editorMode === 'toolbar';
  const selColBlock = selCol ? findBlock(allBlocks, selCol.colsId)?.block ?? null : null;

  // Column ops shared by the canvas column chromes and the docked inspector.
  const insertTableColumn = (tableId: string, at: number) => {
    const zone = zoneOf(tableId);
    commit(insertTableColumnAt(listOfZone(zone), tableId, at), zone);
  };
  const removeTableColumn = (tableId: string, colIndex: number) => {
    const zone = zoneOf(tableId);
    commit(removeTableColumnAt(listOfZone(zone), tableId, colIndex), zone);
    setSelCol(null);
  };
  const moveTableColumnBy = (tableId: string, from: number, to: number) => {
    const zone = zoneOf(tableId);
    commit(moveTableColumn(listOfZone(zone), tableId, from, to), zone);
    setSelCol(prev => (prev && prev.colsId === tableId ? { ...prev, colIndex: to } : prev));
  };
  const removeColumnsColumn = (columnsId: string, colIndex: number) => {
    const zone = zoneOf(columnsId);
    commit(removeColumnAt(listOfZone(zone), columnsId, colIndex), zone);
    setSelCol(null);
  };
  const moveColumnsColumnBy = (columnsId: string, from: number, to: number) => {
    const zone = zoneOf(columnsId);
    commit(moveColumnAt(listOfZone(zone), columnsId, from, to), zone);
    setSelCol(prev => (prev && prev.colsId === columnsId ? { ...prev, colIndex: to } : prev));
  };

  const columnProps = selCol && selColBlock ? {
    colSel: selCol,
    colBlock: selColBlock,
    onColPatch: (p: Partial<ReportBlock>) => patch(selColBlock.id, p),
    onColInsertAt: (at: number) => selColBlock.type === 'table'
      ? insertTableColumn(selColBlock.id, at)
      : insertNewColumn(selColBlock.id, at, { kind: 'block', type: 'text' }),
    onColMove: (d: -1 | 1) => selColBlock.type === 'table'
      ? moveTableColumnBy(selColBlock.id, selCol.colIndex, selCol.colIndex + d)
      : moveColumnsColumnBy(selColBlock.id, selCol.colIndex, selCol.colIndex + d),
    onColDelete: () => selColBlock.type === 'table'
      ? removeTableColumn(selColBlock.id, selCol.colIndex)
      : removeColumnsColumn(selColBlock.id, selCol.colIndex),
  } : {};

  const toolbarProps = {
    block: selBlock,
    parentCollection: selParentCollection,
    parentCategory: selParentCategory,
    project,
    readOnly,
    onPatch: (p: Partial<ReportBlock>) => selId && patch(selId, p),
    onSaveTextStyles: (styles: ReportTextStyle[]) => dispatch({ type: 'SET_REPORT_TEXT_STYLES', payload: styles }),
    onDuplicate: () => selId && duplicateBlockSelect(selId),
    onRemove: () => { if (selId) { commitZone(selId, list => removeBlock(list, selId)); setSelId(null); } },
    onMove: (d: -1 | 1) => selId && commitZone(selId, list => moveBlock(list, selId, d)),
    ...columnProps,
    cellControls,
    editorRef: textEditorRef,
    active: textRtState,
    chipKey: textChipKey,
  };

  // Rail actions, rendered IN the chrome header's trailing slot (block) or as
  // its headerTrailing (column) — no separate rail header bar (roadmap 205).
  const railActions = (
    <>
      <ToolButton onClick={toggleEditorMode} title="Floating editor" className={TB_BTN_ICON}><ArrowRightLeft className="w-3 h-3" /></ToolButton>
      <ToolButton onClick={() => setRail(p => ({ ...p, open: false }))} title="Collapse panel" className={TB_BTN_ICON}><PanelLeftClose className="w-3 h-3" /></ToolButton>
    </>
  );

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-300 select-none min-h-0 min-w-0">
      {!zoneMode && (headerTarget ? createPortal(headerContent, headerTarget) : <header className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900">{headerContent}</header>)}

      {preview ? (
        <ReportPreview design={activeDesign} ctx={ctx} fieldMap={fieldMap} onExit={() => setPreview(false)} />
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
          {/* One left rail for the whole editor: the palette normally, the
              inspector for the selected block/column. Collapsible + drag-
              resizable like the manager side panels. */}
          {docked ? (
            rail.open ? (
              <div className="relative flex shrink-0" style={{ width: rail.width, maxWidth: '70%' }}>
                <aside className="min-w-0 flex-1 bg-zinc-900 border-r border-zinc-800 flex flex-col min-h-0">
                  {selBlock || selColBlock ? (
                    <ReportToolbar {...toolbarProps} headerActions={railActions} />
                  ) : (
                    <>
                      <div className="shrink-0 flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-zinc-800 px-3 py-2">
                        <div className="ml-auto flex items-center gap-1">{railActions}</div>
                      </div>
                      <div className="shrink-0 border-b border-zinc-800 px-3 py-2">
                        <span className="text-[10px] text-zinc-600">Select a block to edit it. Click an item in the palette to add it.</span>
                      </div>
                      <ReportPalette project={project} insertScope={insertScope} insertCategory={insertCategory} onInsert={insertPayload} readOnly={readOnly} fill />
                    </>
                  )}
                </aside>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize panel"
                  onPointerDown={onRailResize}
                  className="absolute inset-y-0 right-0 z-10 w-1.5 translate-x-1/2 cursor-col-resize touch-none hover:bg-blue-400/40"
                />
              </div>
            ) : (
              <div className="w-8 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center pt-3">
                <button
                  onClick={() => setRail(p => ({ ...p, open: true }))}
                  className="text-zinc-500 hover:text-zinc-200 transition-colors"
                  title="Expand panel"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              </div>
            )
          ) : (
            <ReportPalette project={project} insertScope={insertScope} insertCategory={insertCategory} onInsert={insertPayload} readOnly={readOnly} />
          )}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
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
              mode={reportMode}
              autoEditId={autoEditId}
              onAutoEditHandled={() => setAutoEditId(null)}
              project={project}
              parentCollection={zoneMode ? zone!.scope : selParentCollection}
              parentCategory={selParentCategory}
      onSaveTextStyles={styles => dispatch({ type: 'SET_REPORT_TEXT_STYLES', payload: styles })}
      onToggleEditorMode={toggleEditorMode}
      viewWidth={viewWidth}
              pageSize={activeDesign?.page}
              onSelect={selectBlock}
              onSelectCol={selectCol}
              onPatch={patch}
              onInsertTableColumnAt={insertTableColumn}
              onRemoveTableColumn={removeTableColumn}
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
                guardInsert(payload, null, false, () => {
                  const b = payloadToBlock(payload, null);
                  commit([...listOfZone(zone), b], zone);
                  setSelId(b.id);
                  markAutoEdit(b, !!payload.field);
                });
              }}
              editorMode={editorMode}
              onMoveTableColumn={moveTableColumnBy}
              onInsertAfter={(id, payload) => { const zone = zoneOf(id); const list = listOfZone(zone); guardInsert(payload, insertScopeFor(list, id), id ? insideColumnsBlock(allBlocks, id) : false, () => { const b = payloadToBlock(payload, insertScopeFor(list, id)); commit(id ? insertAfter(list, id, b) : [...list, b], zone); setSelId(b.id); markAutoEdit(b, !!payload.field); }); }}
              onInsertBefore={(id, payload) => { const zone = zoneOf(id); const list = listOfZone(zone); guardInsert(payload, insertScopeFor(list, id), id ? insideColumnsBlock(allBlocks, id) : false, () => { const b = payloadToBlock(payload, insertScopeFor(list, id)); commit(id ? insertBefore(list, id, b) : [b, ...list], zone); setSelId(b.id); markAutoEdit(b, !!payload.field); }); }}
              onInsertInto={(id, payload) => { const zone = zoneOf(id); const list = listOfZone(zone); guardInsert(payload, insertScopeFor(list, id), id ? insideColumnsBlock(allBlocks, id) : false, () => { const b = payloadToBlock(payload, insertScopeFor(list, id)); commit(insertInto(list, id, b), zone); setSelId(b.id); markAutoEdit(b, !!payload.field); }); }}
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
                if (!payload.moveId && !guardAllowed(payload, insertScopeFor(list, targetId), true)) return;
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
                const list = listOfZone(zone);
                guardInsert(payload, insertScopeFor(list, columnsId), true, () => {
                  const b = payloadToBlock(payload, insertScopeFor(list, columnsId));
                  commit(appendToColumn(list, columnsId, colIndex, b), zone);
                  setSelId(b.id);
                  markAutoEdit(b, !!payload.field);
                });
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
              onRemoveColumn={removeColumnsColumn}
              onMoveColumn={moveColumnsColumnBy}
              onDuplicate={id => duplicateBlockSelect(id)}
              onRemove={id => { commitZone(id, list => removeBlock(list, id)); if (selId === id) setSelId(null); if (selCol?.colsId === id) setSelCol(null); }}
              onMove={(id, d) => commitZone(id, list => moveBlock(list, id, d))}
              onMenu={(e, id, colIndex) => {
                setSelId(id);
                setSelCol(colIndex !== undefined ? { colsId: id, colIndex } : null);
                setSelCell(null);
                setMenu({ x: e.clientX, y: e.clientY, id, colIndex });
              }}
              cellSel={selCell}
              onCellSel={(blockId, sel) => setSelCell(sel ? { blockId, ...sel } : null)}
              cellEditorRef={cellEditorRef}
              onCellRtStateChange={setCellRtState}
              textEditorRef={textEditorRef}
              textRtState={textRtState}
              onTextRtStateChange={setTextRtState}
              textChipKey={textChipKey}
              onTextSelectionChange={sel => setTextChipKey(sel?.key ?? null)}
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
          onInsertAbove={() => { const b = makeReportBlock('text'); commitZone(menu.id, list => insertBefore(list, menu.id, b)); setSelId(b.id); markAutoEdit(b); }}
          onInsertBelow={() => { const b = makeReportBlock('text'); commitZone(menu.id, list => insertAfter(list, menu.id, b)); setSelId(b.id); markAutoEdit(b); }}
          onAddChild={insertIntoSelected}
          onDuplicate={() => duplicateBlockSelect(menu.id)}
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
            markAutoEdit(b);
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
        <Button theme="dark" className={readOnly ? 'opacity-40 cursor-not-allowed' : ''}>
          <span className="text-xs font-semibold text-zinc-500">Editing: <span className="text-zinc-200">{designs.find(d => d.id === activeId)?.name || '—'}</span></span>
          <ChevronDown className="w-3 h-3 text-zinc-500" />
        </Button>
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
