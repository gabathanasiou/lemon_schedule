import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProject } from '../../store';
import { useCurrentWindow } from '../../lib/popoutTarget';
import { useReportCtx } from '../../lib/useReportCtx';
import { getReportFieldMap } from '../../lib/reportFields';
import { ReportDesign, ReportBlock } from '../../types';
import {
  findBlock, insertAfter, insertBefore, insertInto, removeBlock, duplicateBlock,
  moveBlock, moveBlockTo, duplicateBlockTo, updateBlock, parentCollectionOf, insertScopeFor,
  makeReportBlock, wrapWithColumns, appendToColumn, moveIntoColumn, moveIntoChildren, cloneBlock,
  insertColumnAt, removeColumnAt, moveIntoNewColumn, duplicateIntoNewColumn,
} from '../../lib/reportBlocks';
import { getDefaultReportDesigns } from '../../lib/reportTemplates';
import { ItemManagerDropdown } from '../DropdownMenu';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import ReportPalette, { PaletteDropPayload } from './ReportPalette';
import ReportToolbar from './ReportToolbar';
import ReportDesignerCanvas, { ColSel } from './ReportDesignerCanvas';
import ReportContextMenu, { MenuState } from './ReportContextMenu';
import ReportPreview from './ReportPreview';
import { Printer, Eye, EyeOff, ChevronDown } from 'lucide-react';

function payloadToBlock(p: PaletteDropPayload, scope: string | null): ReportBlock {
  if (p.kind === 'field') return makeReportBlock('field', { field: p.field });
  if (p.type === 'field') return makeReportBlock('field', { field: undefined });
  return makeReportBlock((p.type || 'text') as ReportBlock['type']);
}

interface ReportDesignerProps {
  headerTarget?: HTMLElement | null;
  onPrint?: () => void;
}

export default function ReportDesigner({ headerTarget, onPrint }: ReportDesignerProps) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const ctx = useReportCtx();
  const fieldMap = useMemo(() => getReportFieldMap(project), [project]);
  const currentWin = useCurrentWindow();

  const activeDesign: ReportDesign | undefined = project.reportDesigns?.find(d => d.id === project.activeReportId) || project.reportDesigns?.[0];

  const [blocks, setBlocks] = useState<ReportBlock[]>(() => activeDesign?.blocks || []);
  const [selId, setSelId] = useState<string | null>(null);
  const [selCol, setSelCol] = useState<ColSel | null>(null);
  const [preview, setPreview] = useState(false);
  const [viewKeys, setViewKeys] = useState(true);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    setBlocks(activeDesign?.blocks ? JSON.parse(JSON.stringify(activeDesign.blocks)) : []);
    setSelId(null);
    setSelCol(null);
    setMenu(null);
  }, [activeDesign?.id]);

  useEffect(() => {
    if (!activeDesign) return;
    const fresh = activeDesign.blocks || [];
    setBlocks(JSON.parse(JSON.stringify(fresh)));
    setSelId(prev => (prev && findBlock(fresh, prev) ? prev : null));
    setSelCol(prev => (prev && prev.colsId && findBlock(fresh, prev.colsId) ? prev : null));
  }, [project.reportDesigns]);

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const selIdRef = useRef(selId);
  selIdRef.current = selId;
  const selColRef = useRef(selCol);
  selColRef.current = selCol;

  const selectBlock = (id: string | null) => { setSelId(id); if (id) setSelCol(null); };
  const selectCol = (sel: ColSel | null) => { setSelCol(sel); if (sel) setSelId(null); };

  const commit = (next: ReportBlock[]) => {
    setBlocks(next);
    if (activeDesign) dispatch({ type: 'UPDATE_REPORT_DESIGN', payload: { id: activeDesign.id, blocks: next } });
  };

  const patch = (id: string, p: Partial<ReportBlock>) => commit(updateBlock(blocksRef.current, id, p));

  const selBlock = selId ? findBlock(blocks, selId)?.block ?? null : null;
  const selParentCollection = selId ? parentCollectionOf(blocks, selId) : undefined;
  const insertScope = useMemo(
    () => (selBlock && (selBlock.type === 'repeat' || selBlock.type === 'table') ? selBlock.collection || null : selParentCollection || null),
    [selBlock, selParentCollection],
  );

  const insertPayload = (payload: PaletteDropPayload, id: string | null = selId) => {
    const b = payloadToBlock(payload, insertScopeFor(blocks, id));
    const next = id ? insertAfter(blocksRef.current, id, b) : [...blocksRef.current, b];
    commit(next);
    setSelId(b.id);
  };

  const insertIntoSelected = () => {
    if (!selId) return;
    const b = makeReportBlock('text', { text: 'Line {{title}}' });
    commit(insertInto(blocksRef.current, selId, b));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenu(null); setPreview(false); setSelCol(null); return; }
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const col = selColRef.current;
      if (col) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          commit(removeColumnAt(blocksRef.current, col.colsId, col.colIndex));
          setSelCol(null);
        }
        return;
      }
      const id = selIdRef.current;
      if (!id) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); commit(removeBlock(blocksRef.current, id)); setSelId(null); }
      if (e.key === 'ArrowUp') { e.preventDefault(); commit(moveBlock(blocksRef.current, id, -1)); }
      if (e.key === 'ArrowDown') { e.preventDefault(); commit(moveBlock(blocksRef.current, id, 1)); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); commit(duplicateBlock(blocksRef.current, id)); }
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
      <div className="flex border border-zinc-700 rounded p-0.5">
        <button
          onClick={() => setViewKeys(true)}
          className={`px-2 py-0.5 rounded text-xs transition-colors ${viewKeys ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
        >
          Keys
        </button>
        <button
          onClick={() => setViewKeys(false)}
          className={`px-2 py-0.5 rounded text-xs transition-colors ${!viewKeys ? 'bg-zinc-100 text-zinc-900 font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
        >
          Values
        </button>
      </div>
      <PageSizeMenu page={activeDesign?.page || 'portrait'} readOnly={readOnly} onPage={p => activeDesign && dispatch({ type: 'UPDATE_REPORT_PAGE', payload: { id: activeDesign.id, page: p } })} />
      <button
        onClick={() => setPreview(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
      >
        {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        {preview ? 'Edit' : 'Preview'}
      </button>
      <button
        onClick={onPrint}
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
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-300 select-none min-h-0">
      {headerTarget ? createPortal(headerContent, headerTarget) : <header className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900">{headerContent}</header>}

      {preview ? (
        <ReportPreview design={activeDesign} ctx={ctx} fieldMap={fieldMap} onExit={() => setPreview(false)} />
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0">
          <ReportPalette project={project} insertScope={insertScope} onInsert={insertPayload} readOnly={readOnly} />
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <ReportToolbar
              block={selBlock}
              parentCollection={selParentCollection}
              project={project}
              readOnly={readOnly}
              selCol={selCol && selBlock && selBlock.id === selCol.colsId && selBlock.type === 'columns'
                ? { colIndex: selCol.colIndex, colsCount: (selBlock.cols || []).length }
                : null}
              onPatch={p => selId && patch(selId, p)}
              onInsertAbove={() => selId && commit(insertBefore(blocksRef.current, selId, makeReportBlock('text')))}
              onInsertBelow={() => selId && commit(insertAfter(blocksRef.current, selId, makeReportBlock('text')))}
              onDuplicate={() => selId && commit(duplicateBlock(blocksRef.current, selId))}
              onRemove={() => {
                const col = selColRef.current;
                if (col) { commit(removeColumnAt(blocksRef.current, col.colsId, col.colIndex)); setSelCol(null); return; }
                if (selId) { commit(removeBlock(blocksRef.current, selId)); setSelId(null); }
              }}
              onMove={d => selId && commit(moveBlock(blocksRef.current, selId, d))}
              onInsertColumnAt={i => {
                const col = selColRef.current;
                if (!col) return;
                const b = makeReportBlock('text');
                commit(insertColumnAt(blocksRef.current, col.colsId, i, b));
                setSelId(b.id);
              }}
              onAddTextToColumn={() => {
                const col = selColRef.current;
                if (!col) return;
                const b = makeReportBlock('text');
                commit(appendToColumn(blocksRef.current, col.colsId, col.colIndex, b));
                setSelId(b.id);
              }}
            />
            <ReportDesignerCanvas
              blocks={blocks}
              selId={selId}
              selCol={selCol}
              ctx={ctx}
              fieldMap={fieldMap}
              readOnly={readOnly}
              showKeys={viewKeys}
              onSelect={selectBlock}
              onSelectCol={selectCol}
              onPatch={patch}
              onInsertAfter={(id, payload) => { const b = payloadToBlock(payload, insertScopeFor(blocks, id)); commit(id ? insertAfter(blocksRef.current, id, b) : [...blocksRef.current, b]); setSelId(b.id); }}
              onInsertBefore={(id, payload) => { const b = payloadToBlock(payload, insertScopeFor(blocks, id)); commit(id ? insertBefore(blocksRef.current, id, b) : [b, ...blocksRef.current]); setSelId(b.id); }}
              onInsertInto={(id, payload) => { const b = payloadToBlock(payload, insertScopeFor(blocks, id)); commit(insertInto(blocksRef.current, id, b)); setSelId(b.id); }}
              onMoveInto={(containerId, moveId) => { commit(moveIntoChildren(blocksRef.current, moveId, containerId)); setSelId(moveId); }}
              onDuplicateInto={(containerId, moveId) => {
                const src = findBlock(blocksRef.current, moveId);
                if (!src) return;
                commit(insertInto(blocksRef.current, containerId, cloneBlock(src.block)));
              }}
              onMoveTo={(moveId, targetId, pos) => { commit(moveBlockTo(blocksRef.current, moveId, targetId, pos)); setSelId(moveId); }}
              onDuplicateTo={(moveId, targetId, pos) => { const copy = duplicateBlockTo(blocksRef.current, moveId, targetId, pos); commit(copy); setSelId(moveId); }}
              onWrap={(targetId, payload, side) => {
                const dropped = payload.moveId
                  ? findBlock(blocksRef.current, payload.moveId)?.block ?? null
                  : payloadToBlock(payload, insertScopeFor(blocksRef.current, targetId));
                if (!dropped) return;
                if (payload.moveId && payload.duplicate) {
                  commit(wrapWithColumns(blocksRef.current, targetId, cloneBlock(dropped), side));
                } else {
                  commit(wrapWithColumns(blocksRef.current, targetId, dropped, side, payload.moveId));
                }
              }}
              onInsertIntoColumn={(columnsId, colIndex, payload) => {
                const b = payloadToBlock(payload, insertScopeFor(blocksRef.current, columnsId));
                commit(appendToColumn(blocksRef.current, columnsId, colIndex, b));
                setSelId(b.id);
              }}
              onMoveIntoColumn={(moveId, columnsId, colIndex) => {
                commit(moveIntoColumn(blocksRef.current, moveId, columnsId, colIndex));
                setSelId(moveId);
              }}
              onDuplicateIntoColumn={(moveId, columnsId, colIndex) => {
                const fm = findBlock(blocksRef.current, moveId);
                if (!fm) return;
                commit(appendToColumn(blocksRef.current, columnsId, colIndex, cloneBlock(fm.block)));
              }}
              onInsertNewColumn={(columnsId, colIndex, payload) => {
                const b = payloadToBlock(payload, insertScopeFor(blocksRef.current, columnsId));
                commit(insertColumnAt(blocksRef.current, columnsId, colIndex, b));
                setSelId(b.id);
              }}
              onMoveToNewColumn={(moveId, columnsId, colIndex) => {
                commit(moveIntoNewColumn(blocksRef.current, moveId, columnsId, colIndex));
                setSelId(moveId);
              }}
              onDuplicateToNewColumn={(moveId, columnsId, colIndex) => {
                commit(duplicateIntoNewColumn(blocksRef.current, moveId, columnsId, colIndex));
                setSelId(moveId);
              }}
              onRemoveColumn={(columnsId, colIndex) => {
                commit(removeColumnAt(blocksRef.current, columnsId, colIndex));
                setSelCol(null);
              }}
              onDuplicate={id => commit(duplicateBlock(blocksRef.current, id))}
              onRemove={id => { commit(removeBlock(blocksRef.current, id)); if (selId === id) setSelId(null); if (selCol?.colsId === id) setSelCol(null); }}
              onMove={(id, d) => commit(moveBlock(blocksRef.current, id, d))}
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
          onClose={() => setMenu(null)}
          onChangeField={f => patch(menu.id, { field: f })}
          onInsertAbove={() => commit(insertBefore(blocksRef.current, menu.id, makeReportBlock('text')))}
          onInsertBelow={() => commit(insertAfter(blocksRef.current, menu.id, makeReportBlock('text')))}
          onAddChild={insertIntoSelected}
          onDuplicate={() => commit(duplicateBlock(blocksRef.current, menu.id))}
          onRemove={() => { commit(removeBlock(blocksRef.current, menu.id)); setSelId(null); setMenu(null); }}
          onColumnAddText={() => {
            if (menu.colIndex === undefined) return;
            const b = makeReportBlock('text');
            commit(appendToColumn(blocksRef.current, menu.id, menu.colIndex, b));
            setSelId(b.id);
            setMenu(null);
          }}
          onColumnInsertAt={i => {
            if (menu.colIndex === undefined) return;
            const b = makeReportBlock('text');
            commit(insertColumnAt(blocksRef.current, menu.id, i, b));
            setSelId(b.id);
            setMenu(null);
          }}
          onColumnRemove={() => {
            if (menu.colIndex === undefined) return;
            commit(removeColumnAt(blocksRef.current, menu.id, menu.colIndex));
            setSelCol(null);
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

const PageSizeMenu: React.FC<{ page: 'portrait' | 'landscape'; readOnly: boolean; onPage: (p: 'portrait' | 'landscape') => void }> = ({ page, readOnly, onPage }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <DropdownMenu
      open={open}
      onClose={() => setOpen(false)}
      onOpenChange={setOpen}
      theme="dark"
      trigger={
        <button className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30" disabled={readOnly}>
          {page === 'portrait' ? 'Portrait' : 'Landscape'}
          <ChevronDown className="w-3 h-3" />
        </button>
      }
    >
      <DropdownItem onClick={() => { onPage('portrait'); setOpen(false); }}>Portrait</DropdownItem>
      <DropdownItem onClick={() => { onPage('landscape'); setOpen(false); }}>Landscape</DropdownItem>
    </DropdownMenu>
  );
};

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
