import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useProject } from '../store';
import { RibbonCell, RibbonRow, RibbonDesign } from '../types';
import {
  ALL_FIELDS, FIELD_MAP, CATEGORIES, SAMPLE,
  normalizeCells, getFieldValueFromSample, getDefaultRibbonRows, cid, MIN_PCT,
  getCustomFieldDefs,
} from '../lib/ribbonUtils';
import {
  Hash, Clock, Timer, MapPin, Building2, Sun, Users, FileText, AlignLeft,
  Calendar, StickyNote, UserPlus, Sparkles, Car, Package, Shirt, Scissors,
  Volume1, Video, Volume2, Music, PawPrint, Sword, Leaf, PaintBucket,
  Plus, Trash2, GripHorizontal,
  Eye, ArrowRightLeft, RotateCcw, ArrowUp, ArrowDown,
  Columns3, ChevronDown, ArrowLeft, ArrowRight,
  AlignCenter, AlignRight, WrapText, Grid3X3, Type, Tag, CircleDot,
  Download, Upload, Copy, Check, Pencil,
} from 'lucide-react';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import { useDialog } from './Dialog';
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

const CUSTOM_ICON_MAP: Record<string, React.ElementType> = {
  Tag, Package, Car, Shirt, Sword, Sparkles, Volume1, Music,
  PawPrint, Leaf, PaintBucket, UserPlus, Video, Scissors, Users, Building2, Volume2, CircleDot,
};

function getCustomIcon(name: string): React.ElementType {
  return CUSTOM_ICON_MAP[name] || Tag;
}

const PREVIEW_STYLE = { bg: '#ffffff', fg: '#464646' };

function pvSceneStyle(scene?: { intExt?: string; dayNight?: string } | null): React.CSSProperties {
  if (!scene) return { background: '#ffffff', color: '#18181b' };
  const intExt = (scene.intExt || '').toUpperCase();
  const dayNight = (scene.dayNight || '').toUpperCase();
  if (intExt.includes('INT') && dayNight.includes('DAY')) return { background: '#ffffff', color: '#464646' };
  if (intExt.includes('EXT') && dayNight.includes('DAY')) return { background: '#bdd857', color: '#000000' };
  if (intExt.includes('INT') && dayNight.includes('NIGHT')) return { background: '#67832e', color: '#f2fce3' };
  if (intExt.includes('EXT') && dayNight.includes('NIGHT')) return { background: '#2148a7', color: '#ffffff' };
  if (intExt.includes('INT') && dayNight.includes('MORNING')) return { background: '#efbea0', color: '#4a3730' };
  if (intExt.includes('EXT') && dayNight.includes('MORNING')) return { background: '#e88aa5', color: '#ffffff' };
  if (intExt.includes('INT') && dayNight.includes('EVENING')) return { background: '#e29926', color: '#000000' };
  if (intExt.includes('EXT') && dayNight.includes('EVENING')) return { background: '#ce7d21', color: '#000000' };
  return { background: '#ffffff', color: '#18181b' };
}

const PREVIEW_SAMPLES = [
  { intExt: 'INT', dayNight: 'DAY' },
  { intExt: 'EXT', dayNight: 'DAY' },
  { intExt: 'INT', dayNight: 'NIGHT' },
];

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
  const dialog = useDialog();
  const project = state.present;
  const activeDesign = project.ribbonDesigns.find(d => d.id === project.activeRibbonId)
    || { id: '', name: 'Default', rows: getDefaultRibbonRows(), createdAt: 0 };

  const [selId, setSelId] = useState<string | null>(null);
  const [resizing, setResizing] = useState<{ rowId: string; ci: number; sx: number; a: number; b: number; leftSum: number; rightSum: number; n: number } | null>(null);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [dropHover, setDropHover] = useState<string | null>(null);
  const [cellDrag, setCellDrag] = useState<{ rowId: string; cellId: string } | null>(null);
  const [cellDropTarget, setCellDropTarget] = useState<string | null>(null);
  const [betweenDrop, setBetweenDrop] = useState<string | null>(null);
  const [affixEdit, setAffixEdit] = useState<{ type: 'prefix' | 'suffix'; value: string } | null>(null);
  const [textEdit, setTextEdit] = useState<string | null>(null);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastSpacerSync = useRef(0);

  const initialRows = cloneRows(activeDesign?.rows || []);
  const [rows, setRows] = useState<RibbonRow[]>(cloneRows(initialRows));
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [designMenuOpen, setDesignMenuOpen] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);

  const resetRows = useCallback((newRows: RibbonRow[]) => {
    setRows(cloneRows(newRows));
  }, []);

  useEffect(() => {
    const design = project.ribbonDesigns.find(d => d.id === project.activeRibbonId);
    if (design) {
      resetRows(design.rows);
    }
  }, [project.ribbonDesigns, project.activeRibbonId, resetRows]);

  const saveToStore = useCallback((rows: RibbonRow[]) => {
    if (!activeDesign || !activeDesign.id) return;
    dispatch({ type: 'UPDATE_RIBBON_DESIGN', payload: { id: activeDesign.id, rows: cloneRows(rows) } });
  }, [activeDesign, dispatch]);

  const promptSaveDefault = useCallback(async () => {
    if (activeDesign.id) return;
    const defaults = getDefaultRibbonRows();
    if (JSON.stringify(rowsRef.current) === JSON.stringify(defaults)) return;
    const name = await dialog.prompt({ title: 'Save Default Design?', defaultValue: 'My Design', placeholder: 'Enter a name for your design' });
    if (name) {
      const newId = generateUUID();
      dispatch({ type: 'ADD_RIBBON_DESIGN', payload: { name: name.trim(), rows: cloneRows(rowsRef.current) } });
      dispatch({ type: 'SET_ACTIVE_RIBBON', payload: newId });
    }
  }, [activeDesign, dispatch, dialog]);

  const switchDesign = useCallback(async (newId: string) => {
    await promptSaveDefault();
    dispatch({ type: 'SET_ACTIVE_RIBBON', payload: newId });
    setDesignMenuOpen(false);
  }, [promptSaveDefault, dispatch]);

  const promptSaveDefaultRef = useRef(promptSaveDefault);
  promptSaveDefaultRef.current = promptSaveDefault;

  useEffect(() => {
    return () => {
      promptSaveDefaultRef.current();
    };
  }, []);

  const commit = useCallback((next: RibbonRow[]) => {
    setRows(cloneRows(next));
    saveToStore(next);
  }, [saveToStore]);

  const liveMutate = useCallback((mutator: (r: RibbonRow[]) => void) => {
    setRows(prev => {
      const all = cloneRows(prev);
      mutator(all);
      return all;
    });
  }, []);

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
        if (b.length > 2) {
          const normal = normalizeCells(b);
          b.splice(0, b.length, ...normal);
        }
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

  /* actions */
  const assign = useCallback((cellId: string, key: string) => {
    const f = FIELD_MAP[key];
    const dw = f?.defaultWidth;
    const dp = f?.defaultPrefix;
    const ds = f?.defaultSuffix;
    commit(rows.map(r => ({
      ...r, cells: normalizeCells(r.cells.map(c => c.id === cellId ? {
        ...c, field: key, ...(dw && dw !== c.width ? { width: dw } : {}),
        prefix: dp, suffix: ds, align: f?.align,
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
      nc.splice(ci, 0, { id: newId, field: fieldKey || '', width: f?.defaultWidth || 10, suffix: f?.defaultSuffix, align: f?.align, wrap: f?.defaultWrap });
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
      saveToStore(rowsRef.current);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [resizing, liveMutate, saveToStore]);

  /* keyboard */
  const selIdRef = useRef(selId);
  selIdRef.current = selId;
  const clearCellRef = useRef(clearCell);
  clearCellRef.current = clearCell;

  const contextPosRef = useRef(contextPos);
  contextPosRef.current = contextPos;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && contextPosRef.current) { setContextPos(null); return; }
      if (e.key === 'Delete' && selIdRef.current && !contextPosRef.current) { e.preventDefault(); clearCellRef.current(selIdRef.current); return; }
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
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const used = new Set(rows.flatMap(r => r.cells.map(c => c.field)).filter(f => f && f !== 'text'));
  const customFieldDefs = useMemo(() => getCustomFieldDefs(project.customCategories || []), [project.customCategories]);
  const allFields = useMemo(() => [...ALL_FIELDS, ...customFieldDefs], [customFieldDefs]);
  const allCategories = useMemo(() => {
    const cats = [...CATEGORIES];
    if (customFieldDefs.length > 0) cats.push('Custom');
    return cats;
  }, [customFieldDefs]);
  const customFieldLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const c of project.customCategories || []) labels[c.key] = c.label;
    return labels;
  }, [project.customCategories]);
  const placed = used.size;
  const total = allFields.length;

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-300 overflow-hidden" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif' }}>
      {/* ══ Top bar ══ */}
      <header className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0 select-none">
        <Columns3 className="w-4 h-4 text-blue-500 shrink-0" />
        <DropdownMenu
          open={fileMenuOpen}
          onClose={() => setFileMenuOpen(false)}
          width="w-44"
          trigger={
            <button onClick={() => setFileMenuOpen(p => !p)} className="flex items-center gap-1.5 hover:bg-zinc-800 rounded px-2 py-1 transition-colors">
              <span className="text-xs font-semibold text-zinc-400">Edit</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>
          }
        >
          <DropdownItem onClick={async () => { await promptSaveDefault(); const n = await dialog.prompt({ title: 'New Design', defaultValue: `Design ${project.ribbonDesigns.length + 1}`, placeholder: 'Design name' }); if (n) { dispatch({ type: 'ADD_RIBBON_DESIGN', payload: { name: n.trim() } }); setFileMenuOpen(false); } }}
            icon={<Plus className="w-3.5 h-3.5" />}>
            New Design
          </DropdownItem>
          <DropdownItem onClick={async () => { const n = await dialog.prompt({ title: 'Rename Design', defaultValue: activeDesign.name, placeholder: 'New name' }); if (n) { dispatch({ type: 'RENAME_RIBBON_DESIGN', payload: { id: activeDesign.id, name: n.trim() } }); setFileMenuOpen(false); } }}
            icon={<Pencil className="w-3.5 h-3.5" />}>
            Rename
          </DropdownItem>
          <DropdownItem onClick={async () => {
            const n = await dialog.prompt({ title: 'Duplicate Design', defaultValue: `${activeDesign.name} — Copy`, placeholder: 'Name for the copy' });
            if (n) {
              const rows = activeDesign.id ? undefined : cloneRows(rowsRef.current);
              dispatch({ type: 'ADD_RIBBON_DESIGN', payload: { name: n.trim(), cloneFromId: activeDesign.id, ...(rows ? { rows } : {}) } });
              setFileMenuOpen(false);
            }
          }}
            icon={<Copy className="w-3.5 h-3.5" />}>
            Duplicate
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem onClick={() => {
            const blob = new Blob([JSON.stringify({ name: activeDesign.name, rows: rows }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${activeDesign.name.replace(/\s+/g, '_')}.json`;
            a.click(); URL.revokeObjectURL(url); setFileMenuOpen(false);
          }}
            icon={<Download className="w-3.5 h-3.5" />}>
            Export
          </DropdownItem>
          <DropdownItem onClick={() => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = '.json';
            input.onchange = () => {
              const file = input.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const data = JSON.parse(reader.result as string);
                  if (data.rows && Array.isArray(data.rows)) {
                    dispatch({ type: 'ADD_RIBBON_DESIGN', payload: { name: data.name || 'Imported', rows: data.rows } });
                  }
                } catch { dialog.alert({ title: 'Invalid File', message: 'Could not parse the imported file.' }); }
                setFileMenuOpen(false);
              };
              reader.readAsText(file);
            };
            input.click();
          }}
            icon={<Upload className="w-3.5 h-3.5" />}>
            Import
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem
            onClick={async () => { const ok = await dialog.confirm({ title: `Delete "${activeDesign.name}"?`, message: 'This can be restored from Trash.', danger: true }); if (ok) { dispatch({ type: 'DELETE_RIBBON_DESIGN', payload: activeDesign.id }); setFileMenuOpen(false); } }}
            variant="danger"
            icon={<Trash2 className="w-3.5 h-3.5" />}>
            Delete Design
          </DropdownItem>
        </DropdownMenu>
        <DropdownMenu
          open={designMenuOpen}
          onClose={() => setDesignMenuOpen(false)}
          width="w-52"
          trigger={
            <button onClick={() => setDesignMenuOpen(p => !p)} className="flex items-center gap-1.5 hover:bg-zinc-800 rounded px-2 py-1 transition-colors">
              <span className="text-xs font-semibold text-zinc-500">Ribbon:</span>
              <span className="text-xs font-semibold text-zinc-200">{activeDesign.name}</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>
          }
        >
          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Designs</div>
          {project.ribbonDesigns.map(d => (
            <DropdownItem
              key={d.id}
              onClick={() => switchDesign(d.id)}
              icon={d.id === project.activeRibbonId ? <Check className="w-3.5 h-3.5" /> : undefined}
            >
              {d.name}
            </DropdownItem>
          ))}
        </DropdownMenu>
        <div className="flex-1" />
        <button onClick={() => commit(getDefaultRibbonRows())}
          className="h-7 px-2.5 text-[10px] rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 flex items-center gap-1.5 transition-colors">
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
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

            {allCategories.map(cat => {
              const items = allFields.filter(f => f.category === cat);
              const catUsed = items.filter(f => used.has(f.key)).length;
              const catColors: Record<string, string> = {
                'Scene Info': 'text-blue-400', 'Shooting': 'text-emerald-400',
                'Cast & Talent': 'text-amber-400', 'Production': 'text-violet-400',
                'Breakdown': 'text-rose-400', 'VFX & Audio': 'text-cyan-400',
                'Misc': 'text-zinc-400', 'Special': 'text-pink-400', 'Custom': 'text-fuchsia-400',
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
                      const customCat = (project.customCategories || []).find(c => c.key === f.key);
                      const Icon = FIELD_ICONS[f.key] || (customCat ? getCustomIcon(customCat.icon) : Tag);
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
                <button
                  onClick={e => {
                    if (!selCell) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setContextPos({ x: rect.left, y: rect.bottom });
                  }}
                  disabled={!selCell}
                  className="h-7 px-2.5 text-[10px] font-medium rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 flex items-center gap-1 transition-colors">
                  <ArrowRightLeft className="w-3 h-3" /> Change
                  <ChevronDown className="w-3 h-3 text-zinc-500" />
                </button>
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
                <div className="w-px h-4 bg-zinc-800 mx-1 shrink-0" />
                {selCell && selCell.cell.field === 'text' ? (
                  <input
                    value={selCell.cell.textContent || ''}
                    onChange={e => setTextContent(selCell.cell.id, e.target.value)}
                    placeholder="Text content..."
                    className="h-7 px-2 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500 w-32 shrink-0"
                  />
                ) : selCell && selCell.cell.field ? (
                  <div className="flex items-center gap-1 shrink-0">
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
                ) : (
                  <div className="shrink-0" style={{ width: 170 }} />
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
                      fontFamily: 'Helvetica, sans-serif', fontSize: '8pt', lineHeight: 1.1,
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
                          const label = c.field === 'text' ? (c.textContent || 'Text') : FIELD_MAP[c.field]?.label || customFieldLabels[c.field] || c.field || 'Empty';
                          const shortLabel = !c.wrap && label.length <= 4;

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
                                  onDoubleClick={e => { setSelId(c.id); setContextPos({ x: e.clientX, y: e.clientY }); }}
                                  onContextMenu={e => { e.preventDefault(); setSelId(c.id); setContextPos({ x: e.clientX, y: e.clientY }); }}
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
                                    padding: '12px 4px',
                                    verticalAlign: 'middle',
                                    borderRight: showGrid && ci < row.cells.length - 1 ? '1px solid #000' : 'none',
                                    borderBottom: '1px solid #000',
                                    borderLeft: cellDropTarget === c.id ? '3px solid #3b82f6' : 'none',
                                    outline: isSel ? '2px solid #3b82f6' : dropHover === c.id && !cellDrag ? '2px dashed #3b82f6' : 'none',
                                    outlineOffset: -1,
                                    background: cellDropTarget === c.id ? 'rgba(59,130,246,0.15)' : dropHover === c.id && !cellDrag ? 'rgba(59,130,246,0.1)' : isSel ? 'rgba(59,130,246,0.08)' : 'transparent',
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
                                    <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{c.prefix || ''}{c.prefix ? '\u00A0' : ''}</span>
                                    <span style={{
                                      flexShrink: 1, minWidth: 0,
                                      overflow: c.wrap ? 'visible' : 'hidden',
                                      textOverflow: c.wrap ? 'clip' : shortLabel ? 'clip' : 'ellipsis',
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
                        className={`flex items-center justify-center cursor-pointer transition-colors bg-zinc-200 ${dropHover === row.id ? 'bg-blue-900/50 ring-2 ring-blue-500 ring-inset' : cellDropTarget === 'end-' + row.id ? 'bg-blue-900/50 ring-2 ring-blue-500 ring-inset' : 'hover:bg-zinc-300'}`}
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

            {/* ══ Live Preview (matches schedule stripboard exactly) ══ */}
            <section className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Live Preview</span>
                <span className="ml-auto text-[9px] text-zinc-600">Sample data · {rows.length} rows · {rows.reduce((s, r) => s + r.cells.length, 0)} cells</span>
              </div>

              <div style={{
                fontFamily: 'Helvetica, sans-serif', fontSize: '8pt', lineHeight: 1.1, border: '2px solid #000',
              }}>
                {rows.length >= 1 && PREVIEW_SAMPLES.map((sample, si) => {
                  const rowStyle = pvSceneStyle(sample);
                  return (
                    <div key={si} className="flex items-stretch min-w-0" style={{ borderBottom: si < PREVIEW_SAMPLES.length - 1 ? '2px solid #000' : 'none' }}>
                      <div className="flex-1 min-w-0 flex flex-col" style={rowStyle}>
                        {rows.map((row, ri) => (
                          <div key={row.id || ri} className="flex w-full min-h-0" style={ri < rows.length - 1 ? { borderBottom: '1px solid rgba(0,0,0,0.12)' } : {}}>
                            {row.cells.map((c, ci) => {
                              const val = c.field === 'text' ? (c.textContent || '') : getFieldValueFromSample(c.field);
                              const fieldLabel = FIELD_MAP[c.field]?.label || customFieldLabels[c.field] || '';
                              const display = val ? `${c.prefix || ''}${c.prefix && val ? '\u00A0' : ''}${val}${c.suffix && val ? '\u00A0' : ''}${c.suffix || ''}` : fieldLabel;
                              const shortDisplay = !c.wrap && display.length <= 4;
                              return (
                                <div key={c.id} style={{
                                  flex: `0 0 ${c.width}%`,
                                  minWidth: 0,
                                  padding: '4px 4px',
                                  borderRight: ci < row.cells.length - 1 ? '1px solid rgba(0,0,0,0.12)' : 'none',
                                  overflow: 'hidden',
                                  textOverflow: shortDisplay ? 'clip' : 'ellipsis',
                                  whiteSpace: c.wrap ? 'normal' : 'nowrap',
                                  wordBreak: c.wrap ? 'break-word' : undefined,
                                  textAlign: getAlign(c),
                                  textTransform: c.field === 'set' ? 'uppercase' : 'none',
                                  fontWeight: c.field === 'sceneNumber' ? 700 : 500,
                                }}>
                                  {display || ''}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

          </div>
        </div>
      </div>

      {contextPos && selCell && (
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setContextPos(null)} />
          <div
            className="fixed z-[120] bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl p-1 flex flex-col max-h-96 w-52"
            style={{ left: Math.min(contextPos.x, window.innerWidth - 220), top: Math.min(contextPos.y, window.innerHeight - 420) }}
          >
            {/* Scrollable field list */}
            <div
              ref={el => {
                if (el && selCell) {
                  const active = el.querySelector(`[data-field-key="${(selCell.cell as any).field}"]`) as HTMLElement;
                  if (active) active.scrollIntoView({ block: 'nearest' });
                }
              }}
              className="overflow-y-auto flex-1 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' } as React.CSSProperties}>
              {allFields.map(f => {
                const catDef = (project.customCategories || []).find(c => c.key === f.key);
                const Icon = FIELD_ICONS[f.key] || (catDef ? getCustomIcon(catDef.icon) : Tag);
                const isActive = f.key === (selCell.cell as any).field;
                return (
                  <button
                    key={f.key}
                    data-field-key={f.key}
                    onClick={() => { assign(selCell.cell.id, f.key); setContextPos(null); }}
                    className={`w-full text-left px-3 py-2 text-xs rounded cursor-pointer transition-colors flex items-center gap-2 ${isActive ? 'bg-blue-600/30 text-blue-300' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                  >
                    {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-zinc-400'}`} />}
                    <span className="truncate flex-1">{f.label}</span>
                    {isActive && <Check className="w-3 h-3 text-blue-400 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Sticky bottom actions */}
            <div className="shrink-0 border-t border-zinc-800 pt-2">

              {selCell.cell.field && selCell.cell.field !== 'text' && (
                <div className="flex items-center gap-1 px-1 mb-1.5">
                  <span className="text-[9px] text-zinc-600 shrink-0">Pfx</span>
                  <input
                    value={(selCell.cell as any).prefix || ''}
                    onChange={e => setAffix(selCell.cell.id, 'prefix', e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') setContextPos(null); }}
                    placeholder=""
                    className="flex-1 min-w-0 px-1.5 py-1.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                  />
                  <span className="text-[9px] text-zinc-600 shrink-0">Sfx</span>
                  <input
                    value={(selCell.cell as any).suffix || ''}
                    onChange={e => setAffix(selCell.cell.id, 'suffix', e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') setContextPos(null); }}
                    placeholder=""
                    className="flex-1 min-w-0 px-1.5 py-1.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                  />
                </div>
              )}

              {selCell.cell.field === 'text' && (
                <div className="px-1 mb-1">
                  <input
                    value={(selCell.cell as any).textContent || ''}
                    onChange={e => setTextContent(selCell.cell.id, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') setContextPos(null); }}
                    placeholder="Text content..."
                    className="w-full px-1.5 py-1.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                  />
                </div>
              )}

              <button
                onClick={() => { clearCell(selCell.cell.id); setContextPos(null); }}
                className="w-full text-left px-3 py-2 text-xs rounded cursor-pointer transition-colors flex items-center gap-2 text-zinc-500 hover:bg-zinc-800 hover:text-white"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate flex-1">Clear field</span>
              </button>
              <button
                onClick={() => { removeCell(selCell.row.id, selCell.ci); setContextPos(null); }}
                className="w-full text-left px-3 py-2 text-xs rounded cursor-pointer transition-colors flex items-center gap-2 text-red-400 hover:bg-rose-950/40 hover:text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate flex-1">Delete Cell</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
