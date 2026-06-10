import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useProject } from '../store';
import { RibbonCell, RibbonRow, RibbonDesign } from '../types';
import {
  ALL_FIELDS, FIELD_MAP, CATEGORIES, SAMPLE,
  normalizeCells, getFieldValueFromSample, getDefaultRibbonRows, cid, MIN_PCT,
} from '../lib/ribbonUtils';
import {
  Hash, Clock, Timer, MapPin, Building2, Sun, Users, FileText, AlignLeft,
  Calendar, StickyNote, UserPlus, Sparkles, Car, Package, Shirt, Scissors,
  Volume1, Video, Volume2, Music, PawPrint, Sword, Leaf, PaintBucket,
  Plus, Trash2, GripHorizontal,
  Eye, ArrowRightLeft, RotateCcw, ArrowUp, ArrowDown,
  Undo2, Redo2, LayoutGrid, ChevronDown, ArrowLeft, ArrowRight,
  AlignCenter, AlignRight, WrapText, Grid3X3, Type,
} from 'lucide-react';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import { generateUUID } from '../lib/utils';

const FIELD_ICONS: Record<string, React.ElementType> = {
  sceneNumber: Hash, callTime: Clock, duration: Timer, intExt: MapPin,
  set: Building2, dayNight: Sun, cast: Users, pageCount: FileText,
  description: AlignLeft, scriptDay: Calendar, notes: StickyNote,
  extras: UserPlus, stunts: Sparkles, vehicles: Car, props: Package,
  wardrobe: Shirt, makeup: Scissors, sfx: Volume1, vfx: Video,
  sound: Volume2, music: Music, animals: PawPrint, weapons: Sword,
  greenery: Leaf, artDept: PaintBucket, text: Type,
};

const PREVIEW_STYLE = { bg: '#ffffff', fg: '#464646' };

function cloneRows(rs: RibbonRow[]): RibbonRow[] {
  return JSON.parse(JSON.stringify(rs));
}

function getLabel(field: string) {
  if (!field) return 'Empty';
  const f = FIELD_MAP[field];
  return f ? f.label : field;
}

function getAlign(cell?: RibbonCell) {
  if (cell?.align) return cell.align;
  return FIELD_MAP[cell?.field || '']?.align || 'left';
}

export default function RibbonTab() {
  const { state, dispatch } = useProject();
  const project = state.present;
  const activeDesign = project.ribbonDesigns.find(d => d.id === project.activeRibbonId);

  const [selId, setSelId] = useState<string | null>(null);
  const [resizing, setResizing] = useState<{ rowId: string; ci: number; sx: number; a: number; b: number; leftSum: number; rightSum: number; n: number } | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [dropHover, setDropHover] = useState<string | null>(null);
  const [cellDrag, setCellDrag] = useState<{ rowId: string; cellId: string } | null>(null);
  const [cellDropTarget, setCellDropTarget] = useState<string | null>(null);
  const [betweenDrop, setBetweenDrop] = useState<string | null>(null);
  const [showDesigns, setShowDesigns] = useState(false);
  const [affixEdit, setAffixEdit] = useState<{ type: 'prefix' | 'suffix'; value: string } | null>(null);
  const [textEdit, setTextEdit] = useState<string | null>(null);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastSpacerSync = useRef(0);

  const initialRows = cloneRows(activeDesign?.rows || []);
  const [tick, setTick] = useState(0);
  const undos = useRef<RibbonRow[][]>([cloneRows(initialRows)]);
  const redos = useRef<RibbonRow[][]>([]);
  const rows = undos.current[undos.current.length - 1];

  const resetRows = useCallback((newRows: RibbonRow[]) => {
    undos.current = [cloneRows(newRows)];
    redos.current = [];
    setTick(t => t + 1);
  }, []);

  useEffect(() => {
    if (activeDesign) {
      resetRows(activeDesign.rows);
    }
  }, [project.activeRibbonId]);

  const saveToStore = useCallback((rows: RibbonRow[]) => {
    if (!activeDesign) return;
    dispatch({ type: 'UPDATE_RIBBON_DESIGN', payload: { id: activeDesign.id, rows: cloneRows(rows) } });
  }, [activeDesign, dispatch]);

  const commit = useCallback((next: RibbonRow[]) => {
    undos.current.push(cloneRows(next));
    if (undos.current.length > 100) undos.current.shift();
    redos.current = [];
    setTick(t => t + 1);
    saveToStore(next);
  }, [saveToStore]);

  const liveMutate = useCallback((mutator: (r: RibbonRow[]) => void) => {
    const all = cloneRows(undos.current[undos.current.length - 1]);
    mutator(all);
    undos.current[undos.current.length - 1] = all;
    setTick(t => t + 1);
  }, []);

  const undo = useCallback(() => {
    if (undos.current.length < 2) return;
    redos.current.push(undos.current.pop()!);
    const curr = undos.current[undos.current.length - 1];
    setTick(t => t + 1);
    saveToStore(curr);
  }, [saveToStore]);

  const redo = useCallback(() => {
    if (redos.current.length === 0) return;
    undos.current.push(redos.current.pop()!);
    const curr = undos.current[undos.current.length - 1];
    setTick(t => t + 1);
    saveToStore(curr);
  }, [saveToStore]);

  const canUndo = undos.current.length > 1;
  const canRedo = redos.current.length > 0;

  /* auto-sync Row 2 spacer with Row 1 first 3 cells */
  useEffect(() => {
    const r1 = rows[0];
    const r2 = rows[1];
    if (!r1 || !r2 || r2.cells.length < 2) return;
    const sw = r1.cells.slice(0, 3).reduce((s, c) => s + c.width, 0);
    if (Math.abs(r2.cells[0].width - sw) < 0.01) return;
    if (Math.abs(lastSpacerSync.current - sw) < 0.01) return;
    lastSpacerSync.current = sw;
    liveMutate(all => {
      const a = all[0]?.cells;
      const b = all[1]?.cells;
      if (a && b && b.length >= 2) {
        const w = Math.round(a.slice(0, 3).reduce((s, c) => s + c.width, 0) * 100) / 100;
        b[0].width = w;
        b[1].width = Math.max(MIN_PCT, Math.round((100 - w) * 100) / 100);
      }
    });
  }, [rows, liveMutate]);

  const findCell = useCallback((cid: string) => {
    for (const r of rows) {
      const ci = r.cells.findIndex(c => c.id === cid);
      if (ci >= 0) return { row: r, ci, cell: r.cells[ci] };
    }
    return null;
  }, [rows]);

  const selCell = selId ? findCell(selId) : null;

  const openMenu = useCallback((e?: React.MouseEvent) => {
    if (e && e.type === 'contextmenu') {
      setDropdownPos({ x: e.clientX, y: e.clientY });
    } else if (selId) {
      const el = cellRefs.current.get(selId);
      if (el) {
        const r = el.getBoundingClientRect();
        setDropdownPos({ x: r.left, y: r.bottom + 2 });
      }
    }
    setChangeOpen(true);
  }, [selId]);

  /* actions */
  const assign = useCallback((cellId: string, key: string) => {
    const f = FIELD_MAP[key];
    const dw = f?.defaultWidth;
    const ds = f?.defaultSuffix;
    commit(rows.map(r => ({
      ...r, cells: normalizeCells(r.cells.map(c => c.id === cellId ? {
        ...c, field: key, ...(dw && dw !== c.width ? { width: dw } : {}),
        suffix: ds, align: f?.align,
        ...(key !== 'text' ? { textContent: undefined } : {}),
      } : c)),
    })));
  }, [rows, commit]);

  const clearCell = useCallback((cellId: string) => {
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => c.id === cellId ? { ...c, field: '' } : c),
    })));
  }, [rows, commit]);

  const removeCell = useCallback((rowId: string, ci: number) => {
    commit(rows.map(r => r.id === rowId ? { ...r, cells: normalizeCells(r.cells.filter((_, i) => i !== ci)) } : r));
    setSelId(null);
  }, [rows, commit]);

  const addCell = useCallback((rowId: string, after: number): string => {
    const newId = cid();
    commit(rows.map(r => {
      if (r.id !== rowId) return r;
      const nc = [...r.cells];
      nc.splice(after + 1, 0, { id: newId, field: '', width: 10 });
      return { ...r, cells: normalizeCells(nc) };
    }));
    return newId;
  }, [rows, commit]);

  const insertCellAt = useCallback((rowId: string, ci: number, fieldKey?: string): string => {
    const newId = cid();
    const f = fieldKey ? FIELD_MAP[fieldKey] : null;
    commit(rows.map(r => {
      if (r.id !== rowId) return r;
      const nc = [...r.cells];
      nc.splice(ci, 0, { id: newId, field: fieldKey || '', width: f?.defaultWidth || 10, suffix: f?.defaultSuffix, align: f?.align });
      return { ...r, cells: normalizeCells(nc) };
    }));
    return newId;
  }, [rows, commit]);

  const setAlign = useCallback((cellId: string, align: 'left' | 'center' | 'right' | undefined) => {
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => c.id === cellId ? { ...c, align } : c),
    })));
  }, [rows, commit]);

  const setWrapCell = useCallback((cellId: string, wrap: boolean) => {
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => c.id === cellId ? { ...c, wrap: wrap || undefined } : c),
    })));
  }, [rows, commit]);

  const setAffix = useCallback((cellId: string, key: 'prefix' | 'suffix', value: string) => {
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => c.id === cellId ? { ...c, [key]: value || undefined } : c),
    })));
  }, [rows, commit]);

  const setTextContent = useCallback((cellId: string, text: string) => {
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => c.id === cellId ? { ...c, textContent: text || undefined } : c),
    })));
  }, [rows, commit]);

  const moveCellToRow = useCallback((srcRowId: string, srcCi: number, tgtRowId: string, tgtCi: number) => {
    if (srcRowId === tgtRowId && srcCi === tgtCi) return;
    const srcRow = rows.find(r => r.id === srcRowId);
    if (!srcRow) return;
    const cell = { ...srcRow.cells[srcCi] };
    commit(rows.map(r => {
      if (r.id === srcRowId && r.id === tgtRowId) {
        const nc = r.cells.filter((_, i) => i !== srcCi);
        const insertAt = tgtCi > srcCi ? tgtCi - 1 : tgtCi;
        nc.splice(insertAt, 0, cell);
        return { ...r, cells: normalizeCells(nc) };
      }
      if (r.id === srcRowId) {
        return { ...r, cells: normalizeCells(r.cells.filter((_, i) => i !== srcCi)) };
      }
      if (r.id === tgtRowId) {
        const nc = [...r.cells];
        nc.splice(tgtCi, 0, cell);
        return { ...r, cells: normalizeCells(nc) };
      }
      return r;
    }));
  }, [rows, commit]);

  const moveCell = useCallback((rowId: string, ci: number, dir: -1 | 1) => {
    const j = ci + dir;
    if (j < 0) return;
    const row = rows.find(r => r.id === rowId);
    if (!row || j >= row.cells.length) return;
    commit(rows.map(r => {
      if (r.id !== rowId) return r;
      const nc = [...r.cells];
      [nc[ci], nc[j]] = [nc[j], nc[ci]];
      return { ...r, cells: normalizeCells(nc) };
    }));
  }, [rows, commit]);

  const addRow = useCallback(() => {
    commit([...rows, { id: `row-${cid()}`, name: `Row ${rows.length + 1}`, cells: [{ id: cid(), field: '', width: 100 }] }]);
  }, [rows, commit]);

  const removeRow = useCallback((rid: string) => {
    if (rows.length <= 1) return;
    commit(rows.filter(r => r.id !== rid));
    setSelId(null);
  }, [rows, commit]);

  const moveRow = useCallback((rid: string, dir: -1 | 1) => {
    const i = rows.findIndex(r => r.id === rid);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  }, [rows, commit]);

  /* resize effect */
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const rowEl = document.querySelector(`[data-row="${resizing.rowId}"]`) as HTMLElement | null;
      if (!rowEl) return;
      const pxW = rowEl.offsetWidth || 1;
      const deltaPct = ((e.clientX - resizing.sx) / pxW) * 100;

      liveMutate(all => {
        for (const r of all) {
          if (r.id !== resizing.rowId || resizing.ci >= r.cells.length - 1) continue;

          if (e.shiftKey) {
            const newA = Math.max(MIN_PCT, Math.min(
              resizing.a + resizing.rightSum - MIN_PCT * resizing.n,
              resizing.a + deltaPct
            ));
            const remaining = resizing.rightSum + resizing.a - newA;
            const scale = remaining / resizing.rightSum;
            r.cells[resizing.ci].width = Math.round(newA * 100) / 100;
            for (let i = resizing.ci + 1; i < r.cells.length; i++) {
              r.cells[i].width = Math.max(MIN_PCT, Math.round(r.cells[i].width * scale * 100) / 100);
            }
          } else {
            const newA = Math.max(MIN_PCT, Math.min(resizing.a + resizing.b - MIN_PCT, resizing.a + deltaPct));
            const newB = resizing.a + resizing.b - newA;
            r.cells[resizing.ci].width = Math.round(newA * 100) / 100;
            r.cells[resizing.ci + 1].width = Math.round(newB * 100) / 100;
          }
        }
      });
    };
    const onUp = () => {
      setResizing(null);
      saveToStore(undos.current[undos.current.length - 1]);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [resizing, liveMutate, saveToStore]);

  /* keyboard */
  const selIdRef = useRef(selId);
  selIdRef.current = selId;
  const changeOpenRef = useRef(changeOpen);
  changeOpenRef.current = changeOpen;
  const actRef = useRef({ clearCell, undo, redo });
  actRef.current = { clearCell, undo, redo };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { clearCell: clear, undo: un, redo: rd } = actRef.current;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selIdRef.current && !changeOpenRef.current) { e.preventDefault(); clear(selIdRef.current); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!selIdRef.current) return;
        e.preventDefault();
        for (const r of rows) {
          const ci = r.cells.findIndex(c => c.id === selIdRef.current);
          if (ci >= 0) {
            const nc = ci + (e.key === 'ArrowRight' ? 1 : -1);
            if (nc >= 0 && nc < r.cells.length) setSelId(r.cells[nc].id);
            break;
          }
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); if (e.shiftKey) rd(); else un(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y')) { e.preventDefault(); rd(); return; }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const used = new Set(rows.flatMap(r => r.cells.map(c => c.field)).filter(f => f && f !== 'text'));
  const placed = used.size;
  const total = ALL_FIELDS.length;

  if (!activeDesign) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950 text-zinc-500 text-sm">
        No ribbon design selected.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-300 overflow-hidden" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>
      {/* ══ Top bar ══ */}
      <header className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0 select-none">
        <LayoutGrid className="w-4 h-4 text-blue-500 shrink-0" />
        <div className="relative">
          <button onClick={() => setShowDesigns(o => !o)} className="flex items-center gap-1.5 hover:bg-zinc-800 rounded px-2 py-1 transition-colors">
            <span className="text-xs font-semibold text-zinc-200">{activeDesign.name}</span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>
          {showDesigns && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDesigns(false)} />
              <div className="absolute z-50 left-0 top-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl py-1 min-w-[220px] max-h-[300px] overflow-y-auto">
                {project.ribbonDesigns.map(d => (
                  <button key={d.id} onClick={() => { dispatch({ type: 'SET_ACTIVE_RIBBON', payload: d.id }); setShowDesigns(false); }}
                    className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-800 flex items-center gap-2 ${d.id === project.activeRibbonId ? 'bg-zinc-800 text-blue-400 font-medium' : 'text-zinc-400'}`}>
                    <span className="truncate flex-1">{d.name}</span>
                    <span className="text-[9px] text-zinc-600 shrink-0">{d.rows.length}r · {d.rows.reduce((s, r) => s + r.cells.length, 0)}c</span>
                  </button>
                ))}
                {project.ribbonDesigns.length === 0 && (
                  <div className="px-3 py-2 text-[10px] text-zinc-500 text-center">No designs</div>
                )}
                <div className="border-t border-zinc-800 mt-1 pt-1">
                  <button onClick={() => { const n = prompt('Design name'); if (n) { dispatch({ type: 'ADD_RIBBON_DESIGN', payload: { name: n.trim() } }); setShowDesigns(false); } }}
                    className="w-full text-left px-3 py-1.5 text-[10px] text-blue-400 hover:bg-zinc-800 flex items-center gap-2">
                    <Plus className="w-3 h-3" /> New design
                  </button>
                  {activeDesign && (
                    <>
                      <button onClick={() => { const n = prompt('Rename', activeDesign.name); if (n) { dispatch({ type: 'RENAME_RIBBON_DESIGN', payload: { id: activeDesign.id, name: n.trim() } }); setShowDesigns(false); } }}
                        className="w-full text-left px-3 py-1.5 text-[10px] text-zinc-400 hover:bg-zinc-800 flex items-center gap-2">
                        ... Rename
                      </button>
                      <button onClick={() => { if (confirm(`Delete "${activeDesign.name}"?`)) { dispatch({ type: 'DELETE_RIBBON_DESIGN', payload: activeDesign.id }); setShowDesigns(false); } }}
                        className="w-full text-left px-3 py-1.5 text-[10px] text-red-400 hover:bg-red-950/50 flex items-center gap-2">
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <span className="text-[11px] text-zinc-500">{placed}/{total} fields used</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={!canUndo}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-zinc-800 disabled:opacity-25 transition-colors"
            title="Undo (⌘Z)">
            <Undo2 className="w-3.5 h-3.5 text-zinc-400" />
          </button>
          <button onClick={redo} disabled={!canRedo}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-zinc-800 disabled:opacity-25 transition-colors"
            title="Redo (⌘⇧Z)">
            <Redo2 className="w-3.5 h-3.5 text-zinc-400" />
          </button>
          <div className="w-px h-4 bg-zinc-800 mx-1" />
          <button onClick={() => commit(getDefaultRibbonRows())}
            className="h-7 px-2.5 text-[10px] rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 flex items-center gap-1.5 transition-colors">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      </header>

      {/* ══ Body ══ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left: Palette ── */}
        <aside className="w-[188px] shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto">
          <div className="p-3">
            <div className="flex items-center gap-1.5 mb-3">
              <Eye className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Fields</span>
              <span className="ml-auto text-[10px] tabular-nums text-zinc-600">{placed}/{total}</span>
            </div>

            {CATEGORIES.map(cat => {
              const items = ALL_FIELDS.filter(f => f.category === cat);
              const catUsed = items.filter(f => used.has(f.key)).length;
              const catColors: Record<string, string> = {
                'Scene Info': 'text-blue-400', 'Shooting': 'text-emerald-400',
                'Cast & Talent': 'text-amber-400', 'Production': 'text-violet-400',
                'Breakdown': 'text-rose-400', 'VFX & Audio': 'text-cyan-400',
                'Misc': 'text-zinc-400', 'Special': 'text-pink-400',
              };
              const cc = catColors[cat] || 'text-zinc-400';
              return (
                <div key={cat} className="mb-3">
                  <div className="flex items-center gap-1 mb-1 text-left">
                    <span className={`text-[9px] font-bold uppercase tracking-wide truncate ${cc}`}>{cat}</span>
                    <span className="ml-auto text-[9px] text-zinc-600">{catUsed}/{items.length}</span>
                  </div>
                  <div className="space-y-0.5">
                    {items.map(f => {
                      const inUse = used.has(f.key);
                      const Icon = FIELD_ICONS[f.key];
                      return (
                        <button
                          key={f.key}
                          onClick={() => { if (selId) assign(selId, f.key); }}
                          draggable
                          onDragStart={e => e.dataTransfer.setData('text/field', f.key)}
                          className={`w-full text-left px-2 py-1 rounded transition-colors flex items-center gap-1.5 group ${
                            inUse
                              ? 'bg-zinc-800 ring-1 ring-inset ring-zinc-700 text-zinc-200 hover:bg-zinc-700'
                              : 'bg-zinc-800/50 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                          }`}
                        >
                          {Icon && <Icon className={`w-3 h-3 shrink-0 ${inUse ? 'text-blue-400' : 'text-zinc-600'}`} />}
                          <span className="text-[10px] truncate">{f.label}</span>
                          {inUse ? (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                          ) : (
                            <GripHorizontal className="w-2.5 h-2.5 text-zinc-700 ml-auto opacity-0 group-hover:opacity-100 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── Canvas ── */}
        <div className="flex-1 overflow-auto bg-zinc-950 p-6 pr-12">
          <div className="max-w-[960px] mx-auto space-y-6">

            {/* ══ Designer ══ */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Designer</span>
              </div>

              {/* Action bar */}
              <div className="flex items-center gap-1.5 mb-2 flex-wrap min-h-[28px]">
                {selCell ? (
                  <span className="text-[10px] text-zinc-500 font-mono mr-1">{selCell.row.name} · col {selCell.ci + 1} · {selCell.cell.width.toFixed(1)}%</span>
                ) : (
                  <span className="text-[10px] text-zinc-600 mr-1">Select a cell to edit</span>
                )}
                <div className="relative">
                  <button onClick={(e) => { if (selCell) { openMenu(e); } }} disabled={!selCell}
                    className="h-7 px-2.5 text-[10px] font-medium rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 flex items-center gap-1 transition-colors">
                    <ArrowRightLeft className="w-3 h-3" /> Change
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                  </button>
                  {changeOpen && selCell && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setChangeOpen(false)} />
                      <div className="fixed z-50" style={{ left: dropdownPos.x, top: dropdownPos.y }}>
                        <div className="bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl py-1 max-h-[260px] overflow-y-auto min-w-[160px]">
                          {ALL_FIELDS.map(f => (
                            <button key={f.key}
                              onClick={() => { assign(selCell.cell.id, f.key); setChangeOpen(false); }}
                              className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-800 flex items-center gap-2 ${used.has(f.key) ? 'text-blue-400' : 'text-zinc-400'}`}
                            >
                              {FIELD_ICONS[f.key] && React.createElement(FIELD_ICONS[f.key], { className: 'w-3 h-3 shrink-0' })}
                              <span className="truncate">{f.label}</span>
                            </button>
                          ))}
                          <DropdownDivider />
                          <button onClick={() => { clearCell(selCell.cell.id); setChangeOpen(false); }}
                            className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-zinc-800 text-zinc-500">
                            Clear field
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <button onClick={() => selCell && removeCell(selCell.row.id, selCell.ci)} disabled={!selCell || (selCell ? selCell.row.cells.length <= 1 : true)}
                  className="h-7 px-2.5 text-[10px] rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 flex items-center gap-1.5 transition-colors">
                  <Trash2 className="w-3 h-3" /> Delete Cell
                </button>
                <button onClick={() => selCell && setSelId(addCell(selCell.row.id, selCell.ci))} disabled={!selCell}
                  className="h-7 px-2.5 text-[10px] rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 flex items-center gap-1.5 transition-colors">
                  <Plus className="w-3 h-3" /> Insert After
                </button>
                <div className="w-px h-4 bg-zinc-800 mx-1" />
                <button onClick={() => selCell && moveCell(selCell.row.id, selCell.ci, -1)} disabled={!selCell || (selCell?.ci === 0)}
                  className="h-7 w-7 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center justify-center transition-colors">
                  <ArrowLeft className="w-3 h-3" />
                </button>
                <button onClick={() => selCell && moveCell(selCell.row.id, selCell.ci, 1)} disabled={!selCell || (selCell && selCell.ci >= selCell.row.cells.length - 1)}
                  className="h-7 w-7 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center justify-center transition-colors">
                  <ArrowRight className="w-3 h-3" />
                </button>
                <div className="w-px h-4 bg-zinc-800 mx-1" />
                {(['left', 'center', 'right'] as const).map(a => {
                  const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
                  const active = selCell?.cell.align === a || (!selCell?.cell.align && getAlign(selCell?.cell) === a);
                  return (
                    <button key={a}
                      onClick={() => selCell && setAlign(selId!, active ? undefined : a)}
                      disabled={!selCell}
                      className={`h-7 w-7 rounded-md border flex items-center justify-center disabled:opacity-25 transition-colors ${
                        active ? 'bg-blue-900/50 border-blue-700 text-blue-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700'
                      }`}>
                      <Icon className="w-3 h-3" />
                    </button>
                  );
                })}
                <div className="w-px h-4 bg-zinc-800 mx-1" />
                <button onClick={() => selCell && setWrapCell(selId!, !selCell.cell.wrap)}
                  disabled={!selCell}
                  className={`h-7 w-7 rounded-md border flex items-center justify-center disabled:opacity-25 transition-colors ${
                    selCell?.cell.wrap ? 'bg-blue-900/50 border-blue-700 text-blue-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700'
                  }`}>
                  <WrapText className="w-3 h-3" />
                </button>
                <button onClick={() => setShowGrid(g => !g)}
                  className={`h-7 w-7 rounded-md border flex items-center justify-center transition-colors ${
                    showGrid ? 'bg-blue-900/50 border-blue-700 text-blue-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700'
                  }`}>
                  <Grid3X3 className="w-3 h-3" />
                </button>
                {/* Affix / Text editing */}
                {selCell && selCell.cell.field === 'text' && (
                  <>
                    <div className="w-px h-4 bg-zinc-800 mx-1" />
                    <input
                      value={selCell.cell.textContent || ''}
                      onChange={e => setTextContent(selCell.cell.id, e.target.value)}
                      placeholder="Text content..."
                      className="h-7 px-2 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500 w-32"
                    />
                  </>
                )}
                {selCell && selCell.cell.field && selCell.cell.field !== 'text' && (
                  <>
                    <div className="w-px h-4 bg-zinc-800 mx-1" />
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-zinc-600">Pfx</span>
                      <input
                        value={selCell.cell.prefix || ''}
                        onChange={e => setAffix(selCell.cell.id, 'prefix', e.target.value)}
                        placeholder=""
                        className="h-7 w-14 px-1.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                      />
                      <span className="text-[9px] text-zinc-600">Sfx</span>
                      <input
                        value={selCell.cell.suffix || ''}
                        onChange={e => setAffix(selCell.cell.id, 'suffix', e.target.value)}
                        placeholder=""
                        className="h-7 w-14 px-1.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Ribbon rows */}
              <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
                <div className="space-y-5">
                {rows.map((row, ri) => (
                  <div key={row.id} className="group/row">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold text-zinc-500 select-none">{row.name}</span>
                      <span className="text-[9px] text-zinc-600 select-none">{row.cells.length}c · {row.cells.reduce((s, c) => s + c.width, 0).toFixed(1)}%</span>
                      <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <button onClick={() => moveRow(row.id, -1)} disabled={ri === 0}
                          className="p-1 rounded hover:bg-zinc-800 disabled:opacity-20"><ArrowUp className="w-3 h-3 text-zinc-500" /></button>
                        <button onClick={() => moveRow(row.id, 1)} disabled={ri === rows.length - 1}
                          className="p-1 rounded hover:bg-zinc-800 disabled:opacity-20"><ArrowDown className="w-3 h-3 text-zinc-500" /></button>
                        {rows.length > 1 && (
                          <button onClick={() => removeRow(row.id)}
                            className="p-1 rounded hover:bg-red-950/50"><Trash2 className="w-3 h-3 text-zinc-500 hover:text-red-400" /></button>
                        )}
                      </div>
                    </div>

                    <div style={{
                      fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '8pt', lineHeight: '1.1',
                      border: '1px solid #000', background: PREVIEW_STYLE.bg, color: PREVIEW_STYLE.fg,
                      display: 'flex', width: '100%', alignItems: 'stretch',
                    }} data-row={row.id}>
                      {row.cells.length === 0 ? (
                        <div className="py-3 text-center text-[10px] text-zinc-500 w-full">
                          Empty — use Insert After to add cells
                        </div>
                      ) : (
                        row.cells.map((c, ci) => {
                          const assigned = Boolean(c.field);
                          const isSel = selId === c.id;
                          const align = getAlign(c);
                          const label = c.field === 'text' ? (c.textContent || 'Text') : getLabel(c.field);

                          return (
                            <React.Fragment key={c.id}>
                              {/* Insertion zone before */}
                              <div
                                onDragOver={e => { e.preventDefault(); e.stopPropagation(); setBetweenDrop(`${row.id}-${ci}`); }}
                                onDragLeave={() => setBetweenDrop(null)}
                                onDrop={e => {
                                  e.stopPropagation(); setBetweenDrop(null);
                                  if (cellDrag) {
                                    const src = rows.find(r => r.id === cellDrag.rowId);
                                    const sci = src?.cells.findIndex(cc => cc.id === cellDrag.cellId);
                                    if (sci != null && sci >= 0) moveCellToRow(cellDrag.rowId, sci, row.id, ci);
                                    setCellDrag(null);
                                    return;
                                  }
                                  const k = e.dataTransfer.getData('text/field');
                                  if (k) setSelId(insertCellAt(row.id, ci, k));
                                }}
                                className={betweenDrop === `${row.id}-${ci}` ? 'w-[4pt] bg-blue-500 min-w-[4pt]' : 'w-0 min-w-0'}
                                style={{ height: 16, flexShrink: 0 }}
                              />
                              <div className="relative group/cell" style={{ flex: `0 0 ${c.width}%`, minWidth: 0 }}
                                ref={el => { if (el) cellRefs.current.set(c.id, el); else cellRefs.current.delete(c.id); }}>
                                <div
                                  onClick={() => setSelId(c.id)}
                                  onDoubleClick={(e) => { setSelId(c.id); openMenu(e); }}
                                  onContextMenu={e => { e.preventDefault(); setSelId(c.id); openMenu(e); }}
                                  draggable
                                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); setCellDrag({ rowId: row.id, cellId: c.id }); }}
                                  onDragEnd={() => { setCellDrag(null); setCellDropTarget(null); }}
                                  onDragOver={e => {
                                    if (cellDrag && cellDrag.cellId !== c.id) { e.preventDefault(); setCellDropTarget(c.id); e.dataTransfer.dropEffect = 'move'; }
                                    else if (!cellDrag) { e.preventDefault(); setDropHover(c.id); }
                                  }}
                                  onDragLeave={() => { setCellDropTarget(null); setDropHover(null); }}
                                  onDrop={e => {
                                    e.preventDefault();
                                    if (cellDrag) {
                                      const src = rows.find(r => r.id === cellDrag.rowId);
                                      const sci = src?.cells.findIndex(cc => cc.id === cellDrag.cellId);
                                      if (sci != null && sci >= 0) moveCellToRow(cellDrag.rowId, sci, row.id, ci);
                                      setCellDrag(null); setCellDropTarget(null);
                                    } else {
                                      const k = e.dataTransfer.getData('text/field');
                                      if (k) assign(c.id, k);
                                      setDropHover(null);
                                    }
                                  }}
                                  className="relative cursor-pointer select-none transition-colors"
                                  style={{
                                    padding: ri === 0 ? '3pt 4pt' : '0 4pt 3pt 4pt',
                                    verticalAlign: 'middle',
                                    borderRight: showGrid && ci < row.cells.length - 1 ? '1px solid #000' : 'none',
                                    borderBottom: '1px solid #000',
                                    borderLeft: cellDropTarget === c.id ? '3px solid #3b82f6' : 'none',
                                    outline: isSel ? '2px solid #3b82f6' : dropHover === c.id && !cellDrag ? '2px dashed #3b82f6' : 'none',
                                    outlineOffset: -1,
                                    background: cellDropTarget === c.id ? 'rgba(59,130,246,0.15)' : dropHover === c.id && !cellDrag ? 'rgba(59,130,246,0.1)' : isSel ? 'rgba(59,130,246,0.08)' : 'transparent',
                                    minHeight: 16,
                                  }}
                                >
                                  <div style={{
                                    display: 'flex',
                                    fontSize: '8pt', lineHeight: 1.1,
                                    fontWeight: c.field === 'sceneNumber' ? 700 : 500,
                                    textTransform: c.field === 'set' ? 'uppercase' : 'none',
                                    color: assigned ? undefined : '#71717a',
                                    overflow: c.wrap ? 'visible' : 'hidden',
                                  }}>
                                    {(align === 'center' || align === 'right') && <span style={{ flex: '1 1 0' }} />}
                                    {c.prefix && <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{c.prefix}{'\u00A0'}</span>}
                                    <span style={{
                                      flexShrink: 1, minWidth: 0,
                                      overflow: c.wrap ? 'visible' : (ci < row.cells.length - 1 ? 'hidden' : 'visible'),
                                      textOverflow: c.wrap ? 'clip' : (ci < row.cells.length - 1 ? 'ellipsis' : 'clip'),
                                      whiteSpace: c.wrap ? 'normal' : 'nowrap',
                                      wordBreak: c.wrap ? 'break-word' : undefined,
                                    }}>{assigned ? label : 'Empty'}{c.suffix ? '\u00A0' + c.suffix : ''}</span>
                                    {(align === 'left' || align === 'center') && ci < row.cells.length - 1 && <span style={{ flex: '1 1 0' }} />}
                                  </div>
                                </div>

                                {/* Resize handle */}
                                <div
                                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); if (ci < row.cells.length - 1) { const leftSum = row.cells.slice(0, ci).reduce((s, c2) => s + c2.width, 0); const rightCells = row.cells.slice(ci + 1); const rightSum = rightCells.reduce((s, c2) => s + c2.width, 0); setResizing({ rowId: row.id, ci, sx: e.clientX, a: c.width, b: row.cells[ci+1].width, leftSum, rightSum, n: rightCells.length }); } }}
                                  className="absolute right-0 top-0 bottom-0 w-[6px] cursor-col-resize z-10 group/h"
                                >
                                  <div className="absolute right-0 top-1 bottom-1 w-[2px] bg-zinc-600 group-hover/h:bg-blue-400 transition-colors rounded-full" />
                                </div>
                              </div>
                            </React.Fragment>
                          );
                        })
                      )}
                      {/* + cell at end */}
                      <button
                        onClick={() => setSelId(addCell(row.id, row.cells.length - 1))}
                        onDragOver={e => { e.preventDefault(); if (cellDrag) setCellDropTarget('end-' + row.id); else setDropHover(row.id); }}
                        onDragLeave={() => { setCellDropTarget(null); setDropHover(null); }}
                        onDrop={e => {
                          e.preventDefault();
                          setDropHover(null); setCellDropTarget(null);
                          if (cellDrag) {
                            const src = rows.find(r => r.id === cellDrag.rowId);
                            const sci = src?.cells.findIndex(cc => cc.id === cellDrag.cellId);
                            if (sci != null && sci >= 0) {
                              const srcRow = rows.find(r => r.id === cellDrag.rowId);
                              if (srcRow) moveCellToRow(cellDrag.rowId, sci, row.id, srcRow.id === row.id ? row.cells.length : row.cells.length);
                            }
                            setCellDrag(null);
                            return;
                          }
                          const k = e.dataTransfer.getData('text/field');
                          const f = FIELD_MAP[k];
                          if (k) setSelId(insertCellAt(row.id, row.cells.length, k));
                          else setSelId(addCell(row.id, row.cells.length - 1));
                        }}
                        className={`flex items-center justify-center cursor-pointer transition-colors ${dropHover === row.id ? 'bg-blue-900/50 ring-2 ring-blue-500 ring-inset' : cellDropTarget === 'end-' + row.id ? 'bg-blue-900/50 ring-2 ring-blue-500 ring-inset' : 'hover:bg-zinc-800'}`}
                        style={{
                          flexShrink: 0, width: '48px',
                          borderBottom: '1px solid #000',
                          borderLeft: '1px solid rgba(255,255,255,0.08)',
                        }}
                      ><Plus className={`w-3 h-3 ${dropHover === row.id || cellDropTarget === 'end-' + row.id ? 'text-blue-400' : 'text-zinc-500'}`} /></button>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={addRow} className="mt-4 w-full py-2 text-[10px] font-medium rounded-lg border-2 border-dashed border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400 hover:bg-zinc-900/50 transition-colors flex items-center justify-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Row
              </button>
              </div>
            </section>

            {/* ══ Live Preview ══ */}
            <section className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Live Preview</span>
                <span className="ml-auto text-[9px] text-zinc-600">Sample data</span>
              </div>

              <div className="inline-block" style={{
                fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '8pt', lineHeight: '1.1',
                border: '1px solid #000', background: PREVIEW_STYLE.bg, color: PREVIEW_STYLE.fg,
              }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={row.id} style={{ background: ri === 0 ? PREVIEW_STYLE.bg : PREVIEW_STYLE.bg }}>
                        {row.cells.map((c, ci) => {
                          const val = c.field === 'text' ? (c.textContent || '') : getFieldValueFromSample(c.field);
                          const display = `${c.prefix || ''}${val}${c.suffix || ''}`;
                          const align = getAlign(c);
                          return (
                            <td key={c.id} style={{
                              padding: ri === 0 ? '3pt 1pt' : '0 1pt 3pt 1pt',
                              width: `${c.width}%`,
                              textAlign: align,
                              verticalAlign: 'top',
                              textTransform: c.field === 'set' ? 'uppercase' : 'none',
                              fontWeight: c.field === 'sceneNumber' ? 700 : 500,
                              borderRight: ci < row.cells.length - 1 ? '1px solid #000' : 'none',
                              borderBottom: '1px solid #000',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: c.wrap ? 'normal' : 'nowrap',
                              wordBreak: c.wrap ? 'break-word' : undefined,
                              color: c.field ? undefined : '#d4d4d8',
                            }}>
                              {display || (c.field ? '' : '—')}
                            </td>
                          );
                        })}
                        {/* spacer to match + button width */}
                        <td style={{ width: '48px', borderBottom: '1px solid #000', borderLeft: '1px solid rgba(0,0,0,0.08)' }} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
