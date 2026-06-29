import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useProject } from '../store';
import { RibbonCell, RibbonRow, RibbonDesign } from '../types';
import {
  ALL_FIELDS, FIELD_MAP, CATEGORIES, SAMPLE,
  getFieldValueFromSample, getDefaultRibbonRows, getDefaultColWidths, cid, MIN_PCT,
  getCustomFieldDefs, getAlign, getRibbonCellBaseStyle, resolveSceneColor, getCellBorderProps,
  computeMergeGroups, getMergeLookup, mergeSiblingIds,
} from '../lib/ribbonUtils';
import {
  Hash, Clock, Timer, MapPin, Building2, Sun, Users, FileText, AlignLeft,
  Calendar, StickyNote, UserPlus, Sparkles, Car, Package, Shirt, Scissors,
  Volume1, Video, Volume2, Music, PawPrint, Sword, Leaf, PaintBucket,
  Plus, Trash2, GripHorizontal,
  Eye, ArrowRightLeft, RotateCcw, ArrowUp, ArrowDown,
  ChevronDown, ArrowLeft, ArrowRight,
  AlignCenter, AlignRight, WrapText, Grid3X3, Type, Tag, CircleDot,
  Download, Upload, Copy, Check, Pencil,
  PanelTop, Equal, PanelBottom,
} from 'lucide-react';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import { useDialog } from './Dialog';
import { generateUUID } from '../lib/utils';
import { useViewMode, useCellBorders } from '../lib/persist';
import { Tooltip } from './Tooltip';

const FIELD_ICONS: Record<string, React.ElementType> = {
  sceneNumber: Hash, callTime: Clock, duration: Timer, intExt: MapPin,
  set: Building2, dayNight: Sun, cast: Users, pageCount: FileText,
  description: AlignLeft, scriptDay: Calendar, notes: StickyNote,
  backgroundActors: UserPlus, stunts: Sparkles, vehicles: Car, props: Package,
  wardrobe: Shirt, makeup: Scissors, sfx: Volume1, vfx: Video,
  sound: Volume2, music: Music, animalsAndWranglers: PawPrint, weapons: Sword,
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

const PREVIEW_SAMPLES = [
  { intExt: 'INT', dayNight: 'DAY', sceneNumber: '5' },
  { intExt: 'EXT', dayNight: 'DAY', sceneNumber: '12' },
  { intExt: 'INT', dayNight: 'NIGHT', sceneNumber: '20A' },
];

function cloneRows(rs: RibbonRow[]): RibbonRow[] {
  return JSON.parse(JSON.stringify(rs));
}

function getLabel(field: string) {
  if (!field) return 'Empty';
  const f = FIELD_MAP[field];
  return f ? f.label : field;
}

export default function RibbonTab({ headerTarget }: { headerTarget?: HTMLElement | null }) {
  const { state, dispatch } = useProject();
  const dialog = useDialog();
  const project = state.present;
  const activeDesign = project.ribbonDesigns.find(d => d.id === project.activeRibbonId)
    || { id: '', name: 'Default', colWidths: getDefaultColWidths(), rows: getDefaultRibbonRows(), createdAt: 0 };
  const [viewMode, setViewMode, viewWidth] = useViewMode();
  const [cellBorders] = useCellBorders();

  const [selId, setSelId] = useState<string | null>(null);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [dropHover, setDropHover] = useState<string | null>(null);
  const [cellDrag, setCellDrag] = useState<{ rowId: string; cellId: string } | null>(null);
  const cellDragRef = useRef<{ rowId: string; cellId: string } | null>(null);
  const [cellDropTarget, setCellDropTarget] = useState<string | null>(null);
  const [betweenDrop, setBetweenDrop] = useState<string | null>(null);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const gridRef = useRef<HTMLDivElement>(null);
  const previewSectionRef = useRef<HTMLDivElement>(null);

  const initialRows = cloneRows(activeDesign?.rows || []);
  const [rows, setRows] = useState<RibbonRow[]>(cloneRows(initialRows));
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const colWidths = activeDesign?.colWidths ?? getDefaultColWidths();
  const colWidthsRef = useRef(colWidths);
  colWidthsRef.current = colWidths;
  const numCols = colWidths.length;
  const [designMenuOpen, setDesignMenuOpen] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  const mergeLookup = useMemo(() => getMergeLookup(rows), [rows]);

  const resetRows = useCallback((newRows: RibbonRow[]) => {
    setRows(cloneRows(newRows));
  }, []);

  useEffect(() => {
    const design = project.ribbonDesigns.find(d => d.id === project.activeRibbonId);
    if (design) {
      resetRows(design.rows);
    }
  }, [project.ribbonDesigns, project.activeRibbonId, resetRows]);

  const saveToStore = useCallback((rws: RibbonRow[], cws: number[]) => {
    if (!activeDesign || !activeDesign.id) return;
    dispatch({ type: 'UPDATE_RIBBON_DESIGN', payload: { id: activeDesign.id, rows: cloneRows(rws), colWidths: [...cws] } });
  }, [activeDesign, dispatch]);

  const promptSaveDefault = useCallback(async () => {
    if (activeDesign.id) return;
    const defaults = getDefaultRibbonRows();
    if (JSON.stringify(rowsRef.current) === JSON.stringify(defaults)) return;
    const name = await dialog.prompt({ title: 'Save Default Design?', defaultValue: 'My Design', placeholder: 'Enter a name for your design' });
    if (name) {
      const newId = generateUUID();
      dispatch({ type: 'ADD_RIBBON_DESIGN', payload: { name: name.trim(), rows: cloneRows(rowsRef.current), colWidths: [...colWidthsRef.current] } });
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

  const commit = useCallback((next: RibbonRow[], nextCW: number[]) => {
    setRows(cloneRows(next));
    saveToStore(next, nextCW);
  }, [saveToStore]);

  const findCell = useCallback((cid: string) => {
    for (const r of rows) {
      const ci = r.cells.findIndex(c => c.id === cid);
      if (ci >= 0) return { row: r, ci, cell: r.cells[ci] };
    }
    return null;
  }, [rows]);

  const selCell = selId ? findCell(selId) : null;

  /* ── Actions ── */

  const assign = useCallback((cellId: string, key: string) => {
    const f = FIELD_MAP[key];
    const dp = f?.defaultPrefix;
    const ds = f?.defaultSuffix;
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => c.id === cellId ? {
        ...c, field: key,
        prefix: dp, suffix: ds, align: f?.align,
        ...(key !== 'text' ? { textContent: undefined } : {}),
      } : c),
    })), colWidths);
  }, [rows, colWidths, commit]);

  const clearCell = useCallback((cellId: string) => {
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => c.id === cellId ? { ...c, field: '' } : c),
    })), colWidths);
  }, [rows, colWidths, commit]);

  /* Column operations */
  const removeColumn = useCallback((ci: number) => {
    if (numCols <= 1) return;
    commit(
      rows.map(r => ({ ...r, cells: r.cells.filter((_, i) => i !== ci) })),
      colWidths.filter((_, i) => i !== ci),
    );
    setSelId(null);
  }, [rows, colWidths, numCols, commit]);

  const addColumn = useCallback((after: number): string => {
    const newId = cid();
    commit(
      rows.map(r => {
        const nc = [...r.cells];
        nc.splice(after + 1, 0, { id: cid(), field: '' });
        return { ...r, cells: nc };
      }),
      [...colWidths.slice(0, after + 1), 10, ...colWidths.slice(after + 1)],
    );
    return newId;
  }, [rows, colWidths, commit]);

  const insertColumnAt = useCallback((ci: number, fieldKey?: string): string => {
    const newId = cid();
    const f = fieldKey ? FIELD_MAP[fieldKey] : null;
    const dw = f?.defaultWidth || 10;
    commit(
      rows.map(r => {
        const nc = [...r.cells];
        nc.splice(ci, 0, { id: cid(), field: fieldKey || '', suffix: f?.defaultSuffix, align: f?.align, wrap: f?.defaultWrap });
        return { ...r, cells: nc };
      }),
      [...colWidths.slice(0, ci), dw, ...colWidths.slice(ci)],
    );
    return newId;
  }, [rows, colWidths, commit]);

  const swapCellsAllRows = useCallback((ci: number, cj: number) => {
    if (ci === cj || ci < 0 || cj < 0 || ci >= numCols || cj >= numCols) return;
    const newCW = [...colWidths];
    [newCW[ci], newCW[cj]] = [newCW[cj], newCW[ci]];
    commit(
      rows.map(r => {
        const nc = [...r.cells];
        if (nc[ci] && nc[cj]) [nc[ci], nc[cj]] = [nc[cj], nc[ci]];
        return { ...r, cells: nc };
      }),
      newCW,
    );
  }, [rows, colWidths, numCols, commit]);

  /* Style edits — propagate to merge siblings */
  const setVerticalAlign = useCallback((cellId: string, va: 'top' | 'middle' | 'bottom' | undefined) => {
    const ids = mergeSiblingIds(cellId, rows);
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => ids.includes(c.id) ? { ...c, verticalAlign: va } : c),
    })), colWidths);
  }, [rows, colWidths, commit]);

  const copyFromRow = useCallback((cellId: string, srcRowIdx: number) => {
    const target = findCell(cellId);
    if (!target) return;
    const srcRow = rows[srcRowIdx];
    if (!srcRow || !srcRow.cells[target.ci]) return;
    const src = srcRow.cells[target.ci];
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => c.id === cellId ? {
        ...c,
        field: src.field,
        align: src.align,
        wrap: src.wrap,
        prefix: src.prefix,
        suffix: src.suffix,
        textContent: src.textContent,
        verticalAlign: src.verticalAlign,
      } : c),
    })), colWidths);
  }, [rows, colWidths, commit, findCell]);

  const copyFromAbove = useCallback((cellId: string) => {
    const target = findCell(cellId);
    if (!target) return;
    const ri = rows.findIndex(r => r.id === target.row.id);
    if (ri <= 0) return;
    copyFromRow(cellId, ri - 1);
  }, [findCell, rows, copyFromRow]);

  const copyFromBelow = useCallback((cellId: string) => {
    const target = findCell(cellId);
    if (!target) return;
    const ri = rows.findIndex(r => r.id === target.row.id);
    if (ri < 0 || ri >= rows.length - 1) return;
    copyFromRow(cellId, ri + 1);
  }, [findCell, rows, copyFromRow]);

  const setAlign = useCallback((cellId: string, align: 'left' | 'center' | 'right' | undefined) => {
    const ids = mergeSiblingIds(cellId, rows);
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => ids.includes(c.id) ? { ...c, align } : c),
    })), colWidths);
  }, [rows, colWidths, commit]);

  const setWrapCell = useCallback((cellId: string, wrap: boolean) => {
    const ids = mergeSiblingIds(cellId, rows);
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => ids.includes(c.id) ? { ...c, wrap: wrap || undefined } : c),
    })), colWidths);
  }, [rows, colWidths, commit]);

  const setAffix = useCallback((cellId: string, key: 'prefix' | 'suffix', value: string) => {
    const ids = mergeSiblingIds(cellId, rows);
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => ids.includes(c.id) ? { ...c, [key]: value || undefined } : c),
    })), colWidths);
  }, [rows, colWidths, commit]);

  const setTextContent = useCallback((cellId: string, text: string) => {
    const ids = mergeSiblingIds(cellId, rows);
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => ids.includes(c.id) ? { ...c, textContent: text || undefined } : c),
    })), colWidths);
  }, [rows, colWidths, commit]);

  /* Row operations */
  const addRow = useCallback(() => {
    const emptyCells: RibbonCell[] = [];
    for (let i = 0; i < numCols; i++) emptyCells.push({ id: cid(), field: '' });
    commit([...rows, { id: `row-${cid()}`, name: `Row ${rows.length + 1}`, cells: emptyCells }], colWidths);
  }, [rows, colWidths, numCols, commit]);

  const removeRow = useCallback((rid: string) => {
    if (rows.length <= 1) return;
    commit(rows.filter(r => r.id !== rid), colWidths);
    setSelId(null);
  }, [rows, colWidths, commit]);

  const moveRow = useCallback((rid: string, dir: -1 | 1) => {
    const i = rows.findIndex(r => r.id === rid);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next, colWidths);
  }, [rows, colWidths, commit]);

  /* Cell swap between rows (cross-row drag) */
  const moveCellToRow = useCallback((srcRowId: string, srcCi: number, tgtRowId: string, tgtCi: number) => {
    if (srcRowId === tgtRowId && srcCi === tgtCi) return;
    const srcRow = rows.find(r => r.id === srcRowId);
    const tgtRow = rows.find(r => r.id === tgtRowId);
    if (!srcRow || !tgtRow) return;
    commit(rows.map(r => {
      if (r.id === srcRowId && r.id === tgtRowId) {
        const nc = [...r.cells];
        const [moved] = nc.splice(srcCi, 1);
        nc.splice(tgtCi > srcCi ? tgtCi - 1 : tgtCi, 0, moved);
        return { ...r, cells: nc };
      }
      if (r.id === srcRowId) {
        const nc = [...r.cells];
        nc[srcCi] = { ...tgtRow.cells[tgtCi] };
        return { ...r, cells: nc };
      }
      if (r.id === tgtRowId) {
        const nc = [...r.cells];
        nc[tgtCi] = { ...srcRow.cells[srcCi] };
        return { ...r, cells: nc };
      }
      return r;
    }), colWidths);
  }, [rows, colWidths, commit]);

  /* ── Direct-DOM column resize ── */
  const startResize = useCallback((ci: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const gridEl = gridRef.current;
    if (!gridEl) return;
    const startX = e.clientX;
    const gridWidth = gridEl.offsetWidth;
    const initial = colWidthsRef.current;

    const applyCss = (cw: number[]) => {
      const css = cw.map(w => `${w}%`).join(' ');
      gridEl.style.gridTemplateColumns = css;
      // Also update preview grids
      const prevSection = previewSectionRef.current;
      if (prevSection) {
        prevSection.querySelectorAll('[data-preview-grid]').forEach(pg => {
          (pg as HTMLElement).style.gridTemplateColumns = css;
        });
      }
    };

    const onMove = (e: MouseEvent) => {
      const deltaPct = ((e.clientX - startX) / gridWidth) * 100;
      const cw = [...initial];
      if (ci >= cw.length - 1) return;
      const curA = cw[ci];
      const curB = cw[ci + 1];
      const totalAB = curA + curB;

      if (e.shiftKey) {
        const rightSum = cw.slice(ci + 1).reduce((s, w) => s + w, 0);
        const nRight = cw.length - ci - 1;
        const newA = Math.max(MIN_PCT, Math.min(curA + rightSum - MIN_PCT * nRight, curA + deltaPct));
        const remaining = rightSum + curA - newA;
        const scale = remaining / rightSum;
        cw[ci] = Math.round(newA * 100) / 100;
        for (let i = ci + 1; i < cw.length; i++) {
          cw[i] = Math.max(MIN_PCT, Math.round(cw[i] * scale * 100) / 100);
        }
      } else {
        const newA = Math.max(MIN_PCT, Math.min(totalAB - MIN_PCT, curA + deltaPct));
        const newB = totalAB - newA;
        cw[ci] = Math.round(newA * 100) / 100;
        cw[ci + 1] = Math.round(newB * 100) / 100;
      }

      applyCss(cw);
      colWidthsRef.current = cw;
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveToStore(rowsRef.current, [...colWidthsRef.current]);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [saveToStore]);

  /* ── Keyboard (use refs for stable closures) ── */
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

  const headerContent = (
    <>
      <DropdownMenu
        open={designMenuOpen}
        onOpenChange={setDesignMenuOpen}
        width="w-52"
        trigger={
          <button className="flex items-center gap-1.5 hover:bg-zinc-800 rounded px-2 py-1 transition-colors">
            <span className="text-xs font-semibold text-zinc-500">Editing:</span>
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
      <DropdownMenu
        open={fileMenuOpen}
        onOpenChange={setFileMenuOpen}
        width="w-44"
        trigger={
          <button className="flex items-center gap-1.5 hover:bg-zinc-800 rounded px-2 py-1 transition-colors">
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
            dispatch({ type: 'ADD_RIBBON_DESIGN', payload: { name: n.trim(), cloneFromId: activeDesign.id } });
            setFileMenuOpen(false);
          }
        }}
          icon={<Copy className="w-3.5 h-3.5" />}>
          Duplicate
        </DropdownItem>
        <DropdownDivider />
        <DropdownItem onClick={() => {
           const blob = new Blob([JSON.stringify({ name: activeDesign.name, colWidths, rows, cellPadding: activeDesign.cellPadding, edgePadding: activeDesign.edgePadding }, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
           a.href = url; a.download = `${activeDesign.name.replace(/\s+/g, '_')}.ribbon`;
           a.click(); URL.revokeObjectURL(url); setFileMenuOpen(false);
        }}
          icon={<Download className="w-3.5 h-3.5" />}>
          Export
        </DropdownItem>
        <DropdownItem onClick={() => {
          const input = document.createElement('input');
           input.type = 'file'; input.accept = '.ribbon,.json';
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const data = JSON.parse(reader.result as string);
                if (data.rows && Array.isArray(data.rows)) {
                   dispatch({ type: 'ADD_RIBBON_DESIGN', payload: { name: data.name || 'Imported', rows: data.rows, colWidths: data.colWidths, cellPadding: data.cellPadding, edgePadding: data.edgePadding } });
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
      <button onClick={() => commit(getDefaultRibbonRows(), getDefaultColWidths())}
        className="h-7 px-2.5 text-[10px] rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 flex items-center gap-1.5 transition-colors">
        <RotateCcw className="w-3 h-3" /> Reset
      </button>
      <div className="flex-1" />
      <DropdownMenu
        open={viewMenuOpen}
        onOpenChange={setViewMenuOpen}
        width="w-36"
        trigger={
          <button className="flex items-center gap-1.5 hover:bg-zinc-800 rounded px-2 py-1 transition-colors">
            <span className="text-xs font-semibold text-zinc-500">View:</span>
            <span className="text-xs font-semibold text-zinc-200">{viewMode === 'portrait' ? 'A4 Portrait' : viewMode === 'landscape' ? 'A4 Landscape' : 'Full Width'}</span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>
        }
      >
        {(['portrait', 'landscape', 'full'] as const).map(m => (
          <DropdownItem
            key={m}
            onClick={() => { setViewMode(m); setViewMenuOpen(false); }}
            icon={viewMode === m ? <Check className="w-3.5 h-3.5" /> : undefined}
          >
            {m === 'portrait' ? 'A4 Portrait' : m === 'landscape' ? 'A4 Landscape' : 'Full Width'}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </>
   );

   return (
     <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-300 overflow-hidden" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif' }}>
       {headerTarget ? createPortal(headerContent, headerTarget) : (
         <header className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0 select-none">
           {headerContent}
         </header>
       )}

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
          {/* Toolbar */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 mb-4 flex items-center gap-1.5 flex-wrap min-h-[36px] select-none">
            <Tooltip content="Change Field">
              <button
                onClick={e => { if (!selCell) return; const rect = e.currentTarget.getBoundingClientRect(); setContextPos({ x: rect.left, y: rect.bottom }); }}
                disabled={!selCell}
                className="h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 flex items-center gap-1 transition-colors">
                <ArrowRightLeft className="w-3 h-3" /> Change
                <ChevronDown className="w-3 h-3 text-zinc-500 ml-0.5" />
              </button>
            </Tooltip>
            <Tooltip content="Delete Column">
              <button onClick={() => selCell && removeColumn(selCell.ci)} disabled={!selCell || numCols <= 1}
                className="h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 flex items-center gap-1.5 transition-colors">
                <Trash2 className="w-3 h-3" /> Delete Col
              </button>
            </Tooltip>
            <Tooltip content="Delete Row">
              <button onClick={() => selCell && removeRow(selCell.row.id)} disabled={!selCell || rows.length <= 1}
                className="h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-red-950/50 disabled:opacity-30 flex items-center gap-1.5 transition-colors">
                <Trash2 className="w-3 h-3" /> Row
              </button>
            </Tooltip>
            <Tooltip content="Add Column After">
              <button onClick={() => selCell && setSelId(addColumn(selCell.ci))} disabled={!selCell}
                className="h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 flex items-center gap-1.5 transition-colors">
                <Plus className="w-3 h-3" /> Add Col
              </button>
            </Tooltip>
            <div className="w-px h-5 bg-zinc-700 mx-1" />
            <Tooltip content="Move Column Left">
              <button onClick={() => selCell && swapCellsAllRows(selCell.ci, selCell.ci - 1)} disabled={!selCell || selCell.ci === 0}
                className="h-7 w-7 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center justify-center transition-colors">
                <ArrowLeft className="w-3 h-3" />
              </button>
            </Tooltip>
            <Tooltip content="Move Column Right">
              <button onClick={() => selCell && swapCellsAllRows(selCell.ci, selCell.ci + 1)} disabled={!selCell || (selCell && selCell.ci >= numCols - 1)}
                className="h-7 w-7 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center justify-center transition-colors">
                <ArrowRight className="w-3 h-3" />
              </button>
            </Tooltip>
            <div className="w-px h-5 bg-zinc-700 mx-1" />
            <Tooltip content="Move Row Up">
              <button onClick={() => selCell && moveRow(selCell.row.id, -1)} disabled={!selCell || rows.findIndex(r => r.id === selCell.row.id) <= 0}
                className="h-7 w-7 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center justify-center transition-colors">
                <ArrowUp className="w-3 h-3" />
              </button>
            </Tooltip>
            <Tooltip content="Move Row Down">
              <button onClick={() => selCell && moveRow(selCell.row.id, 1)} disabled={!selCell || rows.findIndex(r => r.id === selCell.row.id) >= rows.length - 1}
                className="h-7 w-7 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center justify-center transition-colors">
                <ArrowDown className="w-3 h-3" />
              </button>
            </Tooltip>
            <Tooltip content="Copy field from row above">
              <button onClick={() => selCell && copyFromAbove(selCell.cell.id)} disabled={!selCell || rows.findIndex(r => r.id === selCell.row.id) <= 0}
                className="h-7 px-2 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center gap-0.5 transition-colors">
                <ArrowDown className="w-2.5 h-2.5" /> Copy
              </button>
            </Tooltip>
            <Tooltip content="Copy field from row below">
              <button onClick={() => selCell && copyFromBelow(selCell.cell.id)} disabled={!selCell || rows.findIndex(r => r.id === selCell.row.id) >= rows.length - 1}
                className="h-7 px-2 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center gap-0.5 transition-colors">
                <ArrowUp className="w-2.5 h-2.5" /> Copy
              </button>
            </Tooltip>
            <div className="w-px h-5 bg-zinc-700 mx-1" />
            {(['left', 'center', 'right'] as const).map(a => {
              const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
              const active = selCell?.cell.align === a || (!selCell?.cell.align && getAlign(selCell?.cell) === a);
              const label = a === 'left' ? 'Align Left' : a === 'center' ? 'Align Center' : 'Align Right';
              return (
                <Tooltip key={a} content={label}>
                  <button
                    onClick={() => selCell && setAlign(selId!, active ? undefined : a)}
                    disabled={!selCell}
                    className={`h-7 w-7 rounded border flex items-center justify-center disabled:opacity-25 transition-colors ${
                      active ? 'bg-blue-900/50 border-blue-700 text-blue-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700'
                    }`}>
                    <Icon className="w-3 h-3" />
                  </button>
                </Tooltip>
              );
            })}
            <div className="w-px h-5 bg-zinc-700 mx-1" />
            {(['top', 'middle', 'bottom'] as const).map(va => {
              const Icon = va === 'top' ? PanelTop : va === 'middle' ? Equal : PanelBottom;
              const active = va === 'middle'
                ? (!selCell?.cell.verticalAlign || selCell?.cell.verticalAlign === 'middle')
                : selCell?.cell.verticalAlign === va;
              const label = va === 'top' ? 'Align Top' : va === 'middle' ? 'Align Middle' : 'Align Bottom';
              return (
                <Tooltip key={va} content={label}>
                  <button
                    onClick={() => selCell && setVerticalAlign(selId!, active && va !== 'middle' ? undefined : va)}
                    disabled={!selCell}
                    className={`h-7 w-7 rounded border flex items-center justify-center disabled:opacity-25 transition-colors ${
                      active ? 'bg-blue-900/50 border-blue-700 text-blue-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700'
                    }`}>
                    <Icon className="w-3 h-3" />
                  </button>
                </Tooltip>
              );
            })}
            <div className="w-px h-5 bg-zinc-700 mx-1" />
            <Tooltip content="Toggle Text Wrap">
              <button onClick={() => selCell && setWrapCell(selId!, !selCell.cell.wrap)}
                disabled={!selCell}
                className={`h-7 w-7 rounded border flex items-center justify-center disabled:opacity-25 transition-colors ${
                  selCell?.cell.wrap ? 'bg-blue-900/50 border-blue-700 text-blue-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700'
                }`}>
                <WrapText className="w-3 h-3" />
              </button>
            </Tooltip>
            <Tooltip content="Toggle Grid Lines">
              <button onClick={() => setShowGrid(g => !g)}
                className={`h-7 w-7 rounded border flex items-center justify-center transition-colors ${
                  showGrid ? 'bg-blue-900/50 border-blue-700 text-blue-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700'
                }`}>
                <Grid3X3 className="w-3 h-3" />
              </button>
            </Tooltip>
            <div className="w-px h-5 bg-zinc-700 mx-1" />
            <span className="text-[10px] text-zinc-500 shrink-0">Pad</span>
            <Tooltip content="Cell Padding (px)">
              <input
                type="number"
                min={0}
                max={24}
                value={activeDesign.cellPadding ?? 6}
                onChange={e => {
                  const v = Math.max(0, Math.min(24, parseInt(e.target.value) || 0));
                  dispatch({ type: 'SET_RIBBON_CELL_PADDING', payload: { id: activeDesign.id, cellPadding: v } });
                }}
                className="w-10 h-6 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-center text-zinc-300 outline-none focus:border-blue-500 shrink-0"
              />
            </Tooltip>
            <Tooltip content="Edge Padding (px)">
              <input
                type="number"
                min={0}
                max={12}
                value={activeDesign.edgePadding ?? 2}
                onChange={e => {
                  const v = Math.max(0, Math.min(12, parseInt(e.target.value) || 0));
                  dispatch({ type: 'SET_RIBBON_EDGE_PADDING', payload: { id: activeDesign.id, edgePadding: v } });
                }}
                className="ml-1 w-10 h-6 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-center text-zinc-300 outline-none focus:border-blue-500 shrink-0"
              />
            </Tooltip>
            <span className="text-[10px] text-zinc-500 shrink-0">Edge</span>
            {selCell && (
              <>
                <div className="w-px h-5 bg-zinc-700 mx-1" />
                {selCell.cell.field === 'text' ? (
                  <Tooltip content="Static Text Content">
                    <input
                      value={selCell.cell.textContent || ''}
                      onChange={e => setTextContent(selCell.cell.id, e.target.value)}
                      placeholder="Text content..."
                      className="h-7 px-2 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500 w-32 shrink-0"
                    />
                  </Tooltip>
                ) : selCell.cell.field ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <Tooltip content="Prefix">
                      <input
                        value={selCell.cell.prefix || ''}
                        onChange={e => setAffix(selCell.cell.id, 'prefix', e.target.value)}
                        placeholder="Prefix"
                        className="h-7 w-14 px-1.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                      />
                    </Tooltip>
                    <Tooltip content="Suffix">
                      <input
                        value={selCell.cell.suffix || ''}
                        onChange={e => setAffix(selCell.cell.id, 'suffix', e.target.value)}
                        placeholder="Suffix"
                        className="h-7 w-14 px-1.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                      />
                    </Tooltip>
                  </div>
                ) : null}
              </>
            )}
          </div>
          <div className="mx-auto space-y-6" style={{ width: viewWidth ? `${viewWidth}px` : '100%' }}>

            {/* ══ Designer (CSS Grid) ══ */}
            <section className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Pencil className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Designer</span>
              </div>

              <div className="space-y-5">
                {rows.map((row, ri) => (
                  <div key={row.id} className="group/row">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold text-zinc-500 select-none">{row.name}</span>
                      <span className="text-[9px] text-zinc-600 select-none">{numCols}c</span>
                    </div>
                  </div>
                ))}

                {/* Single CSS Grid */}
                <div ref={gridRef} style={{
                  display: 'grid',
                  gridTemplateColumns: colWidths.map(w => `${w}%`).join(' '),
                  gridTemplateRows: `repeat(${rows.length}, auto)`,
                  border: '1px solid #000',
                  background: PREVIEW_STYLE.bg,
                  color: PREVIEW_STYLE.fg,
                  fontFamily: 'Helvetica, sans-serif',
                  fontSize: '8pt',
                  lineHeight: 1.1,
                  paddingTop: (activeDesign.edgePadding ?? 2),
                  paddingBottom: (activeDesign.edgePadding ?? 2),
                  paddingLeft: (activeDesign.edgePadding ?? 2),
                  paddingRight: (activeDesign.edgePadding ?? 2),
                }}>
                  {rows.map((row, ri) =>
                    row.cells.map((c, ci) => {
                      const assigned = Boolean(c.field);
                      const isSel    = selId === c.id;
                      const align    = getAlign(c);
                      const label    = c.field === 'text' ? (c.textContent || 'Text') : FIELD_MAP[c.field]?.label || customFieldLabels[c.field] || c.field || 'Empty';
                      const mergeInfo = mergeLookup.get(c.id);

                      return (
                        <div key={c.id}
                          ref={el => { if (el) cellRefs.current.set(c.id, el); else cellRefs.current.delete(c.id); }}
                          onClick={() => setSelId(c.id)}
                          onDoubleClick={e => { setSelId(c.id); setContextPos({ x: e.clientX, y: e.clientY }); }}
                          onContextMenu={e => { e.preventDefault(); setSelId(c.id); setContextPos({ x: e.clientX, y: e.clientY }); }}
                          draggable
                          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'cell'); const val = { rowId: row.id, cellId: c.id }; cellDragRef.current = val; setCellDrag(val); }}
                          onDragEnd={() => { cellDragRef.current = null; setCellDrag(null); setCellDropTarget(null); }}
                          onDragOver={e => {
                            const d = cellDragRef.current;
                            if (d && d.cellId !== c.id) { e.preventDefault(); setCellDropTarget(c.id); e.dataTransfer.dropEffect = 'move'; }
                            else if (!d) { e.preventDefault(); setDropHover(c.id); }
                          }}
                          onDragLeave={() => { setCellDropTarget(null); setDropHover(null); }}
                          onDrop={e => {
                            e.preventDefault();
                            const d = cellDragRef.current;
                            if (d) {
                              const src = rows.find(r2 => r2.id === d.rowId);
                              const sci = src?.cells.findIndex(cc => cc.id === d.cellId);
                              if (sci != null && sci >= 0) moveCellToRow(d.rowId, sci, row.id, ci);
                              cellDragRef.current = null; setCellDrag(null); setCellDropTarget(null);
                            } else {
                              const k = e.dataTransfer.getData('text/field');
                              if (k) assign(c.id, k);
                              setDropHover(null);
                            }
                          }}
                          style={{
                            gridColumn: ci + 1,
                            gridRow: ri + 1,
                            display: 'flex',
                            position: 'relative',
                            padding: `${activeDesign.cellPadding ?? 6}px 6px`,
                            borderRight: ci < numCols - 1 ? (showGrid ? '1px solid #000' : 'none') : 'none',
                            borderBottom: ri < rows.length - 1 ? '1px solid #000' : 'none',
                            borderLeft: cellDropTarget === c.id ? '3px solid #3b82f6' : mergeInfo ? '3px solid #60a5fa' : 'none',
                            outline: isSel ? '2px solid #3b82f6' : dropHover === c.id && !cellDragRef.current ? '2px dashed #3b82f6' : 'none',
                            outlineOffset: -1,
                            background: cellDropTarget === c.id ? 'rgba(59,130,246,0.15)' : dropHover === c.id && !cellDragRef.current ? 'rgba(59,130,246,0.1)' : isSel ? 'rgba(59,130,246,0.08)' : mergeInfo ? 'rgba(96,165,250,0.06)' : 'transparent',
                            minHeight: 16,
                            cursor: 'pointer',
                            overflow: 'hidden',
                            userSelect: 'none',
                          }}>
                          <div style={{
                            display: 'flex', flex: 1, minWidth: 0,
                            fontWeight: c.field === 'sceneNumber' ? 700 : 500,
                            textTransform: c.field === 'set' ? 'uppercase' : 'none',
                            color: assigned ? undefined : '#71717a',
                            overflow: c.wrap ? 'visible' : 'hidden',
                          }}>
                            {(align === 'center' || align === 'right') && <span style={{ flex: '1 1 0' }} />}
                            {c.prefix && <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{c.prefix}{'\u00A0'}</span>}
                            <span style={{
                              flexShrink: 1, minWidth: 0,
                              overflow: c.wrap ? 'visible' : 'hidden',
                              textOverflow: c.wrap ? 'clip' : 'ellipsis',
                              whiteSpace: c.wrap ? 'normal' : 'nowrap',
                              wordBreak: c.wrap ? 'break-word' : undefined,
                            }}>{assigned ? label : 'Empty'}{c.suffix ? '\u00A0' + c.suffix : ''}</span>
                            {(align === 'left' || align === 'center') && ci < numCols - 1 && <span style={{ flex: '1 1 0' }} />}
                          </div>
                          {/* Merge badges */}
                          {mergeInfo && !mergeInfo.isLead && (
                            <div className="absolute right-0.5 top-0.5 text-blue-400 opacity-60 leading-none pointer-events-none" style={{ fontSize: '6px' }}>&#x21d5;</div>
                          )}
                          {mergeInfo && mergeInfo.isLead && (
                            <div className="absolute bottom-0 right-0 px-1 bg-blue-100 text-blue-600 leading-none rounded-tl-sm z-20 pointer-events-none" style={{ fontSize: '7px', fontWeight: 700 }}>&#x21d5;{mergeInfo.group.span}</div>
                          )}
                          {/* Column resize handle */}
                          {ci < numCols - 1 && (
                            <div
                              onMouseDown={e => startResize(ci, e)}
                              className="absolute right-0 top-0 bottom-0 w-[6px] cursor-col-resize z-10 group/h"
                            >
                              <div className="absolute right-0 top-1 bottom-1 w-[2px] bg-zinc-600 group-hover/h:bg-blue-400 transition-colors rounded-full" />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <button onClick={addRow} className="mt-5 w-full py-2.5 text-[10px] font-medium rounded-lg border-2 border-dashed border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400 hover:bg-zinc-900/50 transition-colors flex items-center justify-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
              </div>
            </section>

            {/* ══ Live Preview (Grid + Merge) ══ */}
            <section ref={previewSectionRef} className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Live Preview</span>
                <span className="ml-auto text-[9px] text-zinc-600">Sample data · {rows.length} rows · {rows.reduce((s, r) => s + r.cells.length, 0)} cells</span>
              </div>

              <div style={{
                fontFamily: 'Helvetica, sans-serif', fontSize: '8pt', lineHeight: 1.1, border: '2px solid #000',
              }}>
                {rows.length >= 1 && PREVIEW_SAMPLES.map((sample, si) => {
                  const rowStyle = resolveSceneColor(sample.intExt || '', sample.dayNight || '', project.colorPalette?.sceneColors);
                  return (
                    <div key={si} className="flex items-stretch min-w-0" style={{ borderBottom: si < PREVIEW_SAMPLES.length - 1 ? '2px solid #000' : 'none' }}>
                      <div className="flex-1 min-w-0 flex flex-col" style={{ ...rowStyle, paddingTop: (activeDesign.edgePadding ?? 2), paddingBottom: (activeDesign.edgePadding ?? 2), paddingLeft: (activeDesign.edgePadding ?? 2), paddingRight: (activeDesign.edgePadding ?? 2) }}>
                        <div data-preview-grid style={{
                          display: 'grid',
                          gridTemplateColumns: colWidths.map(w => `${w}%`).join(' '),
                          gridTemplateRows: `repeat(${rows.length}, auto)`,
                        }}>
                          {(() => {
                            const mgroups = computeMergeGroups(rows);
                            const hiddenIds = new Set<string>();
                            for (const g of mgroups) {
                              for (let ri = g.rowIndex + 1; ri < g.rowIndex + g.span; ri++) {
                                const cell = rows[ri]?.cells[g.colIndex];
                                if (cell) hiddenIds.add(cell.id);
                              }
                            }
                            const items: { id: string; col: number; row: number; span: number; cell: RibbonCell }[] = [];
                            for (let ri = 0; ri < rows.length; ri++) {
                              for (let ci = 0; ci < rows[ri].cells.length; ci++) {
                                const cell = rows[ri].cells[ci];
                                if (hiddenIds.has(cell.id)) continue;
                                const g = mgroups.find(gg => gg.colIndex === ci && gg.rowIndex === ri);
                                items.push({ id: cell.id, col: ci, row: ri, span: g ? g.span : 1, cell });
                              }
                            }
                            return items.map(p => {
                              const c = p.cell;
                              const a = getAlign(c);
                              const val = c.field === 'text' ? (c.textContent || '') : c.field === 'sceneNumber' ? sample.sceneNumber : getFieldValueFromSample(c.field);
                              const fieldLabel = FIELD_MAP[c.field]?.label || customFieldLabels[c.field] || '';
                              const display = val || fieldLabel;
                              const lastVisRow = p.row + p.span - 1;
                              const cellBorderStyle = getCellBorderProps(cellBorders, rowStyle.color, p.col === rows[0].cells.length - 1, lastVisRow >= rows.length - 1);
                              return (
                                <div key={p.id} style={{
                                  gridColumn: p.col + 1,
                                  gridRow: `${p.row + 1} / span ${p.span}`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: `${activeDesign.cellPadding ?? 6}px 6px`,
                                  borderRight: p.col < rows[0].cells.length - 1 ? (cellBorders === 'vertical' || cellBorders === 'both' ? `1px solid ${rowStyle.color}` : '1px solid rgba(0,0,0,0.12)') : 'none',
                                  borderBottom: lastVisRow < rows.length - 1 ? (cellBorders === 'horizontal' || cellBorders === 'both' ? `1px solid ${rowStyle.color}` : '1px solid rgba(0,0,0,0.12)') : 'none',
                                  ...cellBorderStyle,
                                  overflow: 'hidden',
                                  fontWeight: c.field === 'sceneNumber' ? 700 : 400,
                                  textTransform: c.field === 'set' ? 'uppercase' : 'none',
                                }}>
                                  {(a === 'center' || a === 'right') && <span style={{ flex: '1 1 0' }} />}
                                  {c.prefix && val && <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{c.prefix}{'\u00A0'}</span>}
                                  <span style={{
                                    flexShrink: 1, minWidth: 0,
                                    overflow: c.wrap ? 'visible' : 'hidden',
                                    textOverflow: c.wrap ? 'clip' : 'ellipsis',
                                    whiteSpace: c.wrap ? 'normal' : 'nowrap',
                                    wordBreak: c.wrap ? 'break-word' : undefined,
                                    fontStyle: val ? 'normal' : 'italic',
                                    opacity: val ? 1 : 0.5,
                                  }}>{display}</span>
                                  {c.suffix && val && <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{'\u00A0' + c.suffix}</span>}
                                  {(a === 'left' || a === 'center') && <span style={{ flex: '1 1 0' }} />}
                                </div>
                              );
                            });
                          })()}
                        </div>
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
            style={{ left: Math.max(0, Math.min(contextPos.x, window.innerWidth - 220)), top: Math.max(0, Math.min(contextPos.y, window.innerHeight - 420)) }}
          >
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
                onClick={() => { removeColumn(selCell.ci); setContextPos(null); }}
                className="w-full text-left px-3 py-2 text-xs rounded cursor-pointer transition-colors flex items-center gap-2 text-red-400 hover:bg-rose-950/40 hover:text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate flex-1">Delete Column</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
