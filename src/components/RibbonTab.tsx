import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useProject } from '../store';
import { RibbonCell, RibbonRow, RibbonDesign } from '../types';
import {
  ALL_FIELDS, FIELD_MAP, CATEGORIES, SAMPLE,
  getFieldValueFromSample, getDefaultRibbonRows, getDefaultColWidths, cid, MIN_PCT,
  getCustomFieldDefs, getAlign, getRibbonCellBaseStyle, formatCellText, resolveSceneColor, getCellBorderProps, getFallbackStripColors,
  computeMergeGroups, getMergeLookup, mergeSiblingIds, normalizeColWidths,
} from '../lib/ribbonUtils';
import { IS_COARSE } from '../lib/device';
import {
  Hash, Clock, Timer, MapPin, Building2, Sun, Users, FileText, AlignLeft,
  Calendar, StickyNote, UserPlus, Sparkles, Car, Package, Shirt, Scissors,
  Volume1, Video, Volume2, Music, PawPrint, Sword, Leaf, PaintBucket,
  Plus, Trash2, GripHorizontal,
  Eye, ArrowRightLeft, ArrowUp, ArrowDown,
  ChevronDown, ArrowLeft, ArrowRight,
  AlignCenter, AlignRight, WrapText, Ellipsis, X, Type, Tag, CircleDot,
  ClipboardList,
  Check, Pencil,
  PanelTop, Equal, PanelBottom,
} from 'lucide-react';
import DropdownMenu from './DropdownMenu';
import { ItemManagerDropdown } from './DropdownMenu';
import DropdownItem from './DropdownItem';
import { useDialog } from './Dialog';
import { generateUUID } from '../lib/utils';
import { useViewMode, useCellBorders } from '../lib/persist';
import { useCurrentWindow, useCurrentDocument } from '../lib/popoutTarget';
import { Tooltip } from './Tooltip';
import { RibbonCellText } from './RibbonCellText';

const FIELD_ICONS: Record<string, React.ElementType> = {
  sceneNumber: Hash, callTime: Clock, duration: Timer, intExt: MapPin,
  set: Building2, dayNight: Sun, cast: Users, pageCount: FileText,
  sheetNumber: ClipboardList,
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
  const { state, dispatch, readOnly } = useProject();
  const dialog = useDialog();
  const project = state.present;
  const activeDesign = project.ribbonDesigns.find(d => d.id === project.activeRibbonId)
    || { id: '', name: 'Default', colWidths: getDefaultColWidths(), rows: getDefaultRibbonRows(), createdAt: 0 };
  const [viewMode, setViewMode, viewWidth] = useViewMode();
  const [cellBorders] = useCellBorders();
  const currentWindow = useCurrentWindow();
  const currentDocument = useCurrentDocument();

  const [selId, setSelId] = useState<string | null>(null);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null);
  const [dropHover, setDropHover] = useState<string | null>(null);
  const [cellDrag, setCellDrag] = useState<{ rowId: string; cellId: string } | null>(null);
  const cellDragRef = useRef<{ rowId: string; cellId: string } | null>(null);
  const [cellDropTarget, setCellDropTarget] = useState<string | null>(null);
  const [betweenDrop, setBetweenDrop] = useState<string | null>(null);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const gridRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const previewSectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const cellClipboardRef = useRef<{ field: string; align?: string; wrap?: boolean; truncation?: boolean; prefix?: string; suffix?: string; textContent?: string; verticalAlign?: string } | null>(null);

  const initialRows = cloneRows(activeDesign?.rows || []);
  const [rows, setRows] = useState<RibbonRow[]>(cloneRows(initialRows));
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const colWidths = activeDesign?.colWidths ?? getDefaultColWidths();
  const colWidthsRef = useRef(colWidths);
  colWidthsRef.current = colWidths;
  const numCols = colWidths.length;
  const [designMenuOpen, setDesignMenuOpen] = useState(false);
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
    const isPageCount = key === 'pageCount';
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => c.id === cellId ? {
        ...c, field: key,
        prefix: isPageCount ? f?.defaultPrefix : undefined,
        suffix: isPageCount ? f?.defaultSuffix : undefined,
        align: f?.align,
        ...(key !== 'text' ? { textContent: undefined } : {}),
      } : c),
    })), colWidths);
  }, [rows, colWidths, commit]);

  const clearCell = useCallback((cellId: string) => {
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => c.id === cellId ? { ...c, field: '' } : c),
    })), colWidths);
  }, [rows, colWidths, commit]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.contentEditable === 'true') return;
      if (selId) { e.preventDefault(); clearCell(selId); }
    };
    currentWindow.addEventListener('keydown', handler);
    return () => currentWindow.removeEventListener('keydown', handler);
  }, [selId, clearCell, currentWindow]);

  /* Column operations */
  const removeColumn = useCallback((ci: number) => {
    if (numCols <= 1) return;
    commit(
      rows.map(r => ({ ...r, cells: r.cells.filter((_, i) => i !== ci) })),
      normalizeColWidths(colWidths.filter((_, i) => i !== ci)),
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
      normalizeColWidths([...colWidths.slice(0, after + 1), 10, ...colWidths.slice(after + 1)]),
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
        nc.splice(ci, 0, { id: cid(), field: fieldKey || '', prefix: fieldKey === 'pageCount' ? f?.defaultPrefix : undefined, suffix: fieldKey === 'pageCount' ? f?.defaultSuffix : undefined, align: f?.align, wrap: f?.defaultWrap, truncation: f?.defaultTruncation });
        return { ...r, cells: nc };
      }),
      normalizeColWidths([...colWidths.slice(0, ci), dw, ...colWidths.slice(ci)]),
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
        truncation: src.truncation,
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

  const copyFromCol = useCallback((cellId: string, srcColIdx: number) => {
    const target = findCell(cellId);
    if (!target) return;
    const srcCell = target.row.cells[srcColIdx];
    if (!srcCell) return;
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => c.id === cellId ? {
        ...c,
        field: srcCell.field,
        align: srcCell.align,
        wrap: srcCell.wrap,
        truncation: srcCell.truncation,
        prefix: srcCell.prefix,
        suffix: srcCell.suffix,
        textContent: srcCell.textContent,
        verticalAlign: srcCell.verticalAlign,
      } : c),
    })), colWidths);
  }, [rows, colWidths, commit, findCell]);

  const copyFromLeft = useCallback((cellId: string) => {
    const target = findCell(cellId);
    if (!target) return;
    if (target.ci <= 0) return;
    copyFromCol(cellId, target.ci - 1);
  }, [findCell, copyFromCol]);

  const copyFromRight = useCallback((cellId: string) => {
    const target = findCell(cellId);
    if (!target) return;
    if (target.ci < 0 || target.ci >= target.row.cells.length - 1) return;
    copyFromCol(cellId, target.ci + 1);
  }, [findCell, copyFromCol]);

  const setAlign = useCallback((cellId: string, align: 'left' | 'center' | 'right' | undefined) => {
    const ids = mergeSiblingIds(cellId, rows);
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => ids.includes(c.id) ? { ...c, align } : c),
    })), colWidths);
  }, [rows, colWidths, commit]);

  const setOverflow = useCallback((cellId: string, mode: 'truncate' | 'wrap' | 'none') => {
    const ids = mergeSiblingIds(cellId, rows);
    const update: Partial<RibbonCell> = mode === 'wrap'
      ? { wrap: true, truncation: undefined }
      : mode === 'none'
        ? { wrap: undefined, truncation: false }
        : { wrap: undefined, truncation: undefined };
    commit(rows.map(r => ({
      ...r, cells: r.cells.map(c => ids.includes(c.id) ? { ...c, ...update } : c),
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
  const currentDocumentRef = useRef(currentDocument);
  currentDocumentRef.current = currentDocument;
  const startResize = useCallback((ci: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const gridEl = gridRef.current;
    if (!gridEl) return;
    gridEl.style.touchAction = 'none';
    document.body.style.touchAction = 'none';
    const canvasEl = canvasRef.current;
    if (canvasEl) canvasEl.style.touchAction = 'none';
    const startX = e.clientX;
    const gridWidth = gridEl.offsetWidth;
    const initial = colWidthsRef.current;

    const applyCss = (cw: number[]) => {
      const css = cw.map(w => `${w}%`).join(' ');
      gridEl.style.gridTemplateColumns = css;
      if (tabBarRef.current) {
        tabBarRef.current.style.gridTemplateColumns = css;
      }
      const prevSection = previewSectionRef.current;
      if (prevSection) {
        prevSection.querySelectorAll('[data-preview-grid]').forEach(pg => {
          (pg as HTMLElement).style.gridTemplateColumns = css;
        });
      }
    };

    const onMove = (e: PointerEvent) => {
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
      currentDocumentRef.current.removeEventListener('pointermove', onMove);
      currentDocumentRef.current.removeEventListener('pointerup', onUp);
      gridEl.style.touchAction = '';
      document.body.style.touchAction = '';
      if (canvasEl) canvasEl.style.touchAction = '';
      saveToStore(rowsRef.current, [...colWidthsRef.current]);
    };

    currentDocumentRef.current.addEventListener('pointermove', onMove);
    currentDocumentRef.current.addEventListener('pointerup', onUp);
  }, [saveToStore]);

  /* ── Keyboard (use refs for stable closures) ── */
  const selIdRef = useRef(selId);
  selIdRef.current = selId;

  const clearCellRef = useRef(clearCell);
  clearCellRef.current = clearCell;

  const contextPosRef = useRef(contextPos);
  contextPosRef.current = contextPos;

  const selCellRef = useRef(selCell);
  selCellRef.current = selCell;  const commitRef = useRef(commit);
  commitRef.current = commit;
  const setAffixRef = useRef(setAffix);
  setAffixRef.current = setAffix;
  const setTextContentRef = useRef(setTextContent);
  setTextContentRef.current = setTextContent;
  const setAlignRef = useRef(setAlign);
  setAlignRef.current = setAlign;
  const setVerticalAlignRef = useRef(setVerticalAlign);
  setVerticalAlignRef.current = setVerticalAlign;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && contextPosRef.current) { setContextPos(null); return; }
      if (e.key === 'Delete' && selIdRef.current && !contextPosRef.current) { e.preventDefault(); clearCellRef.current(selIdRef.current); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        const sc = selCellRef.current;
        if (sc && sc.cell.field) {
          e.preventDefault();
          cellClipboardRef.current = {
            field: sc.cell.field,
            align: sc.cell.align,
            wrap: sc.cell.wrap,
            truncation: sc.cell.truncation,
            prefix: sc.cell.prefix,
            suffix: sc.cell.suffix,
            textContent: sc.cell.textContent,
            verticalAlign: sc.cell.verticalAlign,
          };
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        const sc = selCellRef.current;
        const clip = cellClipboardRef.current;
        if (sc && clip) {
          e.preventDefault();
          const cellId = sc.cell.id;
          const rows = rowsRef.current;
          const ids = mergeSiblingIds(cellId, rows);
          const updated = rows.map(r => ({
            ...r, cells: r.cells.map(c => ids.includes(c.id) ? {
              ...c,
              field: clip.field,
              align: clip.align,
              wrap: clip.wrap || undefined,
              truncation: clip.truncation,
              prefix: clip.prefix || undefined,
              suffix: clip.suffix || undefined,
              textContent: clip.textContent || undefined,
              verticalAlign: (clip.verticalAlign as any) || undefined,
            } : c),
          }));
          commitRef.current(updated, colWidthsRef.current);
        }
        return;
      }
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
    currentDocumentRef.current.addEventListener('keydown', onKey);
    return () => currentDocumentRef.current.removeEventListener('keydown', onKey);
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
      <ItemManagerDropdown
        open={designMenuOpen}
        onClose={(open) => setDesignMenuOpen(open)}
        items={project.ribbonDesigns.map(d => ({ id: d.id, name: d.name }))}
        activeId={project.activeRibbonId}
        onSelect={async (id) => { await promptSaveDefault(); dispatch({ type: 'SET_ACTIVE_RIBBON', payload: id }); }}
        onRename={(id, name) => dispatch({ type: 'RENAME_RIBBON_DESIGN', payload: { id, name } })}
        onDuplicate={(id) => {
          const d = project.ribbonDesigns.find(x => x.id === id);
          if (!d) return;
          const newId = generateUUID();
          dispatch({ type: 'ADD_RIBBON_DESIGN', payload: { id: newId, name: `${d.name} Copy`, cloneFromId: id } });
          return newId;
        }}
        onDelete={async (id) => {
          const ok = await dialog.confirm({ title: 'Delete Design?', message: 'This can be restored from Trash.', danger: true });
          if (ok) dispatch({ type: 'DELETE_RIBBON_DESIGN', payload: id });
        }}
        onCreate={() => {
          const name = `Design ${project.ribbonDesigns.length + 1}`;
          const newId = generateUUID();
          dispatch({ type: 'ADD_RIBBON_DESIGN', payload: { id: newId, name, cloneFromId: project.activeRibbonId } });
          return newId;
        }}
        onImport={() => {
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
                  dispatch({ type: 'ADD_RIBBON_DESIGN', payload: { name: data.name || 'Imported', rows: data.rows, colWidths: data.colWidths, cellPaddingV: data.cellPaddingV ?? data.cellPadding ?? 3, cellPaddingH: data.cellPaddingH ?? 3, edgePadding: data.edgePadding ?? 3 } });
                }
              } catch { dialog.alert({ title: 'Invalid File', message: 'Could not parse the imported file.' }); }
              setDesignMenuOpen(false);
            };
            reader.readAsText(file);
          };
          input.click();
        }}
        onExport={() => {
          const blob = new Blob([JSON.stringify({ name: activeDesign.name, colWidths, rows, cellPaddingV: activeDesign.cellPaddingV, cellPaddingH: activeDesign.cellPaddingH, edgePadding: activeDesign.edgePadding }, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `${activeDesign.name.replace(/\s+/g, '_')}.ribbon`;
          a.click(); URL.revokeObjectURL(url);
        }}
        onReset={() => {
          dispatch({ type: 'BATCH_START' });
          commit(getDefaultRibbonRows(), getDefaultColWidths());
          dispatch({ type: 'SET_RIBBON_CELL_PADDING_V', payload: { id: activeDesign.id, cellPaddingV: 3 } });
          dispatch({ type: 'SET_RIBBON_CELL_PADDING_H', payload: { id: activeDesign.id, cellPaddingH: 3 } });
          dispatch({ type: 'SET_RIBBON_EDGE_PADDING', payload: { id: activeDesign.id, edgePadding: 3 } });
          dispatch({ type: 'BATCH_COMMIT' });
        }}
        readOnly={readOnly}
        label="Editing"
        header="RIBBON DESIGNS"
        itemLabel="Design"
        trigger={
          <button className={`flex items-center gap-1.5 rounded px-2 py-1 transition-colors ${readOnly ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-800'}`}>
            <span className="text-xs font-semibold text-zinc-500">Editing:</span>
            <span className="text-xs font-semibold text-zinc-200">{activeDesign.name}</span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>
        }
      />
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
          <div className="p-3 pb-20">
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
                          onClick={() => { if (!readOnly && selId) assign(selId, f.key); }}
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
                            <GripHorizontal className="w-2.5 h-2.5 text-zinc-700 ml-auto hover-reveal shrink-0" />
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
        <div ref={canvasRef} className="flex-1 overflow-auto bg-zinc-950 p-6 pr-12" onClick={() => setSelId(null)}>
          {/* Toolbar */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg mb-4 divide-y divide-zinc-800 select-none min-w-max" onClick={e => e.stopPropagation()}>
            {/* Structure */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
              <span className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider shrink-0 w-16">Structure</span>
              <Tooltip content="Add Column After">
                <button onClick={() => selCell && setSelId(addColumn(selCell.ci))} disabled={readOnly || !selCell}
                  className="h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 flex items-center gap-1.5 transition-colors">
                  <Plus className="w-3 h-3" /> Column
                </button>
              </Tooltip>
              <Tooltip content="Delete Column">
                <button onClick={() => selCell && removeColumn(selCell.ci)} disabled={readOnly || !selCell || numCols <= 1}
                  className="h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-red-950/50 disabled:opacity-30 flex items-center gap-1.5 transition-colors">
                  <Trash2 className="w-3 h-3" /> Column
                </button>
              </Tooltip>
              <div className="w-px h-5 bg-zinc-700 mx-0.5" />
              <Tooltip content="Add Row">
                <button onClick={() => selCell && addRow()} disabled={readOnly || !selCell}
                  className="h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 flex items-center gap-1.5 transition-colors">
                  <Plus className="w-3 h-3" /> Row
                </button>
              </Tooltip>
              <Tooltip content="Delete Row">
                <button onClick={() => selCell && removeRow(selCell.row.id)} disabled={readOnly || !selCell || rows.length <= 1}
                  className="h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-red-950/50 disabled:opacity-30 flex items-center gap-1.5 transition-colors">
                  <Trash2 className="w-3 h-3" /> Row
                </button>
              </Tooltip>
              <div className="w-px h-5 bg-zinc-700 mx-0.5" />
              <Tooltip content="Move Column Left">
                <button onClick={() => selCell && swapCellsAllRows(selCell.ci, selCell.ci - 1)} disabled={readOnly || !selCell || selCell.ci === 0}
                  className="h-7 px-2 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center gap-0.5 transition-colors">
                  <ArrowLeft className="w-2.5 h-2.5" /> Move
                </button>
              </Tooltip>
              <Tooltip content="Move Column Right">
                <button onClick={() => selCell && swapCellsAllRows(selCell.ci, selCell.ci + 1)} disabled={readOnly || !selCell || (selCell && selCell.ci >= numCols - 1)}
                  className="h-7 px-2 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center gap-0.5 transition-colors">
                  <ArrowRight className="w-2.5 h-2.5" /> Move
                </button>
              </Tooltip>
              <Tooltip content="Move Row Up">
                <button onClick={() => selCell && moveRow(selCell.row.id, -1)} disabled={readOnly || !selCell || rows.findIndex(r => r.id === selCell.row.id) <= 0}
                  className="h-7 px-2 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center gap-0.5 transition-colors">
                  <ArrowUp className="w-2.5 h-2.5" /> Move
                </button>
              </Tooltip>
              <Tooltip content="Move Row Down">
                <button onClick={() => selCell && moveRow(selCell.row.id, 1)} disabled={readOnly || !selCell || rows.findIndex(r => r.id === selCell.row.id) >= rows.length - 1}
                  className="h-7 px-2 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center gap-0.5 transition-colors">
                  <ArrowDown className="w-2.5 h-2.5" /> Move
                </button>
              </Tooltip>
            </div>
            {/* Cell */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
              <span className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider shrink-0 w-16">Cell</span>
              <Tooltip content="Change Field">
                <button
                  onClick={e => { if (!selCell) return; const rect = e.currentTarget.getBoundingClientRect(); setContextPos({ x: rect.left, y: rect.bottom }); }}
                  disabled={readOnly || !selCell}
                  className="h-7 px-2.5 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 flex items-center gap-1 transition-colors">
                  <ArrowRightLeft className="w-3 h-3" /> Change
                  <ChevronDown className="w-3 h-3 text-zinc-500 ml-0.5" />
                </button>
              </Tooltip>
              <div className="w-px h-5 bg-zinc-700 mx-0.5" />
              <Tooltip content="Copy field from row above">
                <button onClick={() => selCell && copyFromAbove(selCell.cell.id)} disabled={readOnly || !selCell || rows.findIndex(r => r.id === selCell.row.id) <= 0}
                  className="h-7 px-2 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center gap-0.5 transition-colors">
                  <ArrowDown className="w-2.5 h-2.5" /> Above
                </button>
              </Tooltip>
              <Tooltip content="Copy field from row below">
                <button onClick={() => selCell && copyFromBelow(selCell.cell.id)} disabled={readOnly || !selCell || rows.findIndex(r => r.id === selCell.row.id) >= rows.length - 1}
                  className="h-7 px-2 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center gap-0.5 transition-colors">
                  <ArrowUp className="w-2.5 h-2.5" /> Below
                </button>
              </Tooltip>
              <Tooltip content="Copy field from column left">
                <button onClick={() => selCell && copyFromLeft(selCell.cell.id)} disabled={readOnly || !selCell || selCell.ci <= 0}
                  className="h-7 px-2 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center gap-0.5 transition-colors">
                  <ArrowLeft className="w-2.5 h-2.5" /> Left
                </button>
              </Tooltip>
              <Tooltip content="Copy field from column right">
                <button onClick={() => selCell && copyFromRight(selCell.cell.id)} disabled={readOnly || !selCell || (selCell && selCell.ci >= selCell.row.cells.length - 1)}
                  className="h-7 px-2 text-[10px] font-medium rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 disabled:opacity-25 flex items-center gap-0.5 transition-colors">
                  <ArrowRight className="w-2.5 h-2.5" /> Right
                </button>
              </Tooltip>
            </div>
            {/* Cell Style */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
              <span className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider shrink-0 w-16">Style</span>
              {(['left', 'center', 'right'] as const).map(a => {
                const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
                const active = selCell?.cell.align === a || (!selCell?.cell.align && getAlign(selCell?.cell) === a);
                const label = a === 'left' ? 'Align Left' : a === 'center' ? 'Align Center' : 'Align Right';
                return (
                  <Tooltip key={a} content={label}>
                    <button
                      onClick={() => selCell && setAlign(selId!, active ? undefined : a)}
                      disabled={readOnly || !selCell}
                      className={`h-7 w-7 rounded border flex items-center justify-center disabled:opacity-25 transition-colors ${
                        active ? 'bg-blue-900/50 border-blue-700 text-blue-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700'
                      }`}>
                      <Icon className="w-3 h-3" />
                    </button>
                  </Tooltip>
                );
              })}
              <div className="w-px h-5 bg-zinc-700 mx-0.5" />
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
                      disabled={readOnly || !selCell}
                      className={`h-7 w-7 rounded border flex items-center justify-center disabled:opacity-25 transition-colors ${
                        active ? 'bg-blue-900/50 border-blue-700 text-blue-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:bg-zinc-700'
                      }`}>
                      <Icon className="w-3 h-3" />
                    </button>
                  </Tooltip>
                );
              })}
              <div className="w-px h-5 bg-zinc-700 mx-0.5" />
              <div className="inline-flex rounded overflow-hidden border border-zinc-700">
                {(['truncate', 'wrap', 'none'] as const).map((mode, i) => {
                  const current = selCell?.cell.truncation === false ? 'none' : selCell?.cell.wrap ? 'wrap' : 'truncate';
                  const active = mode === current;
                  const Icon = mode === 'wrap' ? WrapText : mode === 'none' ? X : Ellipsis;
                  const label = mode === 'wrap' ? 'Wrap' : mode === 'none' ? 'None' : 'Truncate';
                  return (
                    <Tooltip key={mode} content={`Overflow: ${label}`}>
                      <button
                        onClick={() => selCell && !active && setOverflow(selId!, mode)}
                        disabled={readOnly || !selCell}
                        className={`h-7 w-7 flex items-center justify-center disabled:opacity-25 transition-colors ${
                          active ? 'bg-blue-900/50 text-blue-300' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                        } ${i < 2 ? 'border-r border-zinc-700' : ''}`}>
                        <Icon className="w-3 h-3" />
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
              <div className="w-px h-5 bg-zinc-700 mx-0.5" />
              {selCell?.cell.field === 'text' ? (
                <Tooltip content="Static Text Content">
                  <input
                    value={selCell?.cell.textContent || ''}
                    onChange={e => selCell && setTextContent(selCell.cell.id, e.target.value)}
                    placeholder="Text content..."
                    disabled={readOnly || !selCell}
                    className="h-7 px-2 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500 disabled:opacity-30 w-32 shrink-0"
                  />
                </Tooltip>
              ) : (
                <div className="flex items-center gap-1 shrink-0">
                  <Tooltip content="Prefix">
                    <input
                      value={selCell?.cell.prefix || ''}
                      onChange={e => selCell?.cell.field && setAffix(selCell.cell.id, 'prefix', e.target.value)}
                      placeholder="Prefix"
                      disabled={readOnly || !selCell || !selCell.cell.field}
                      className="h-7 w-14 px-1.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500 disabled:opacity-25"
                    />
                  </Tooltip>
                  <Tooltip content="Suffix">
                    <input
                      value={selCell?.cell.suffix || ''}
                      onChange={e => selCell?.cell.field && setAffix(selCell.cell.id, 'suffix', e.target.value)}
                      placeholder="Suffix"
                      disabled={readOnly || !selCell || !selCell.cell.field}
                      className="h-7 w-14 px-1.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500 disabled:opacity-25"
                    />
                  </Tooltip>
                </div>
              )}
            </div>
            {/* Layout */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 flex-nowrap min-w-max">
              <span className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider shrink-0 w-16">Layout</span>
              <span className="text-[10px] text-zinc-500 shrink-0">Pad V</span>
              <Tooltip content="Vertical Cell Padding (px)">
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={activeDesign.cellPaddingV ?? 6}
                  onChange={e => {
                    if (readOnly) return;
                    const v = Math.max(0, Math.min(24, parseInt(e.target.value) || 0));
                    dispatch({ type: 'SET_RIBBON_CELL_PADDING_V', payload: { id: activeDesign.id, cellPaddingV: v } });
                  }}
                  readOnly={readOnly}
                  className="w-10 h-6 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-center text-zinc-300 outline-none focus:border-blue-500 shrink-0 read-only:opacity-50"
                />
              </Tooltip>
              <span className="text-[10px] text-zinc-500 shrink-0">Pad H</span>
              <Tooltip content="Horizontal Cell Padding (px)">
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={activeDesign.cellPaddingH ?? 6}
                  onChange={e => {
                    if (readOnly) return;
                    const v = Math.max(0, Math.min(24, parseInt(e.target.value) || 0));
                    dispatch({ type: 'SET_RIBBON_CELL_PADDING_H', payload: { id: activeDesign.id, cellPaddingH: v } });
                  }}
                  readOnly={readOnly}
                  className="w-10 h-6 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-center text-zinc-300 outline-none focus:border-blue-500 shrink-0 read-only:opacity-50"
                />
              </Tooltip>
              <div className="w-px h-5 bg-zinc-700 mx-0.5" />
              <span className="text-[10px] text-zinc-500 shrink-0">Edge</span>
              <Tooltip content="Edge Padding (px)">
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={activeDesign.edgePadding ?? 2}
                  onChange={e => {
                    if (readOnly) return;
                    const v = Math.max(0, Math.min(12, parseInt(e.target.value) || 0));
                    dispatch({ type: 'SET_RIBBON_EDGE_PADDING', payload: { id: activeDesign.id, edgePadding: v } });
                  }}
                  readOnly={readOnly}
                  className="w-10 h-6 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-center text-zinc-300 outline-none focus:border-blue-500 shrink-0 read-only:opacity-50"
                />
              </Tooltip>
            </div>
          </div>
          <div className="mx-auto space-y-6" style={{ width: viewWidth ? `${viewWidth}px` : '100%' }}>

            {/* ══ Designer (CSS Grid) ══ */}
            <section className={`bg-zinc-900 rounded-lg border border-zinc-800 ${readOnly ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="flex items-center gap-2 mb-3 px-5 pt-5">
                <Pencil className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Designer</span>
              </div>

              <div className="space-y-5 pb-5">

                {/* Column resize tabs */}
                <div className={`${IS_COARSE ? 'h-10' : 'h-5'} select-none`} style={{ paddingLeft: activeDesign.edgePadding ?? 2, paddingRight: activeDesign.edgePadding ?? 2, border: '1px solid transparent', boxSizing: 'border-box' }}>
                  <div ref={tabBarRef} className="h-full relative" style={{
                    display: 'grid',
                    gridTemplateColumns: colWidths.map(w => `${w}%`).join(' '),
                  }}>
                    {colWidths.map((_w, i) => (
                      <div key={i} className="relative h-full">
                        {i < colWidths.length - 1 && (
                          <div
                            className={`absolute bottom-0 cursor-col-resize group/tab z-10 flex flex-col items-center justify-end${IS_COARSE ? ' transition-transform group-active/tab:-translate-y-2.5 touch-none px-2.5' : ''} ${readOnly ? 'pointer-events-none opacity-30' : ''}`}
                            style={{ left: '100%', transform: 'translateX(-50%)' }}
                            onPointerDown={e => !readOnly && startResize(i, e)}
                            onClick={e => e.stopPropagation()}
                          >
                            <div className={`${IS_COARSE ? 'border-l-[8px] border-r-[8px] border-t-[10px] group-active/tab:border-l-[10px] group-active/tab:border-r-[10px] group-active/tab:border-t-[14px] group-active/tab:border-t-blue-500 transition-all' : 'border-l-[5px] border-r-[5px] border-t-[6px] transition-colors'} border-l-transparent border-r-transparent border-t-zinc-500/40 group-hover/tab:border-t-blue-400`} />
                            <div className={`${IS_COARSE ? 'w-px h-5 group-active/tab:h-8 group-active/tab:bg-blue-500 transition-all' : 'w-px h-3.5 transition-colors'} mx-auto bg-zinc-500/40 group-hover/tab:bg-blue-400`} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Single CSS Grid */}
                <div ref={gridRef} className="-mt-5" onClick={() => { if (!readOnly) setSelId(null); }} style={{
                  display: 'grid',
                  gridTemplateColumns: colWidths.map(w => `${w}%`).join(' '),
                  gridTemplateRows: `repeat(${rows.length}, auto)`,
                  border: '1px solid #d4d4d8',
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
                          data-cell-id={c.id}
                          ref={el => { if (el) cellRefs.current.set(c.id, el); else cellRefs.current.delete(c.id); }}
                           onClick={e => { if (readOnly) return; e.stopPropagation(); setSelId(c.id); }}
                           onDoubleClick={e => { if (readOnly) return; e.stopPropagation(); setSelId(c.id); setContextPos({ x: e.clientX, y: e.clientY }); }}
                           onContextMenu={e => { if (readOnly) return; e.stopPropagation(); e.preventDefault(); setSelId(c.id); setContextPos({ x: e.clientX, y: e.clientY }); }}
                          draggable={!readOnly}
                          onDragStart={e => { if (readOnly) return; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'cell'); const val = { rowId: row.id, cellId: c.id }; cellDragRef.current = val; setCellDrag(val); }}
                          onDragEnd={() => { if (readOnly) return; cellDragRef.current = null; setCellDrag(null); setCellDropTarget(null); }}
                          onDragOver={e => {
                            if (readOnly) return;
                            const d = cellDragRef.current;
                            if (d && d.cellId !== c.id) { e.preventDefault(); setCellDropTarget(c.id); e.dataTransfer.dropEffect = 'move'; }
                            else if (!d) { e.preventDefault(); setDropHover(c.id); }
                          }}
                          onDragLeave={() => { if (readOnly) return; setCellDropTarget(null); setDropHover(null); }}
                          onDrop={e => {
                            if (readOnly) return;
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
                            position: 'relative',
                            ...getRibbonCellBaseStyle(c, activeDesign.cellPaddingV, activeDesign.cellPaddingH),
                            gridColumn: ci + 1,
                            gridRow: ri + 1,
                            padding: `${activeDesign.cellPaddingV ?? 6}px ${activeDesign.cellPaddingH ?? 6}px`,
                            borderTop: '1px solid #d4d4d8',
                            borderRight: '1px solid #d4d4d8',
                            borderBottom: '1px solid #d4d4d8',
                            borderLeft: cellDropTarget === c.id ? '3px solid #3b82f6' : '1px solid #d4d4d8',
                            outline: isSel ? '2px solid #3b82f6' : dropHover === c.id && !cellDragRef.current ? '2px dashed #3b82f6' : 'none',
                            outlineOffset: -1,
                            background: cellDropTarget === c.id ? 'rgba(59,130,246,0.15)' : dropHover === c.id && !cellDragRef.current ? 'rgba(59,130,246,0.1)' : isSel ? 'rgba(59,130,246,0.08)' : mergeInfo ? (mergeInfo.group.direction === 'h' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)') : assigned ? '#ffffff' : '#fafafa',
                            minHeight: 16,
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}>
                          <div style={{
                            display: 'flex', flex: 1, minWidth: 0,
                            fontWeight: c.field === 'sceneNumber' ? 700 : 500,
                            textTransform: c.field === 'set' ? 'uppercase' : 'none',
                            color: assigned ? undefined : '#a1a1aa',
                            fontStyle: assigned ? undefined : 'italic',
                          }}>
                            {(align === 'center' || align === 'right') && <span style={{ flex: '1 1 0' }} />}
                            <RibbonCellText cell={c} span={1} style={{ flexShrink: 1, minWidth: 0 }}>
                              {(c.prefix ? '*' : '') + (assigned ? label : 'Empty') + (c.suffix ? '*' : '')}
                            </RibbonCellText>
                            {(align === 'left' || align === 'center') && ci < numCols - 1 && <span style={{ flex: '1 1 0' }} />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

              </div>
            </section>

            {/* ══ Live Preview (Grid + Merge) ══ */}
            <section ref={previewSectionRef} className="bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="flex items-center gap-2 mb-3 px-5 pt-5">
                <Eye className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Live Preview</span>
                <span className="ml-auto text-[9px] text-zinc-600">Sample data · {rows.length} rows · {rows.reduce((s, r) => s + r.cells.length, 0)} cells</span>
              </div>

              <div style={{
                fontFamily: 'Helvetica, sans-serif', fontSize: '8pt', lineHeight: 1.1, border: '2px solid #000',
                marginBottom: '20px',
              }}>
                {rows.length >= 1 && PREVIEW_SAMPLES.map((sample, si) => {
                  const rowStyle = resolveSceneColor(sample.intExt || '', sample.dayNight || '', project.colorPalette?.sceneColors, getFallbackStripColors(project.colorPalette));
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
                              if (g.direction === 'v') {
                                for (let ri = g.rowIndex + 1; ri < g.rowIndex + g.span; ri++) {
                                  const cell = rows[ri]?.cells[g.colIndex];
                                  if (cell) hiddenIds.add(cell.id);
                                }
                              } else {
                                for (let ci = g.colIndex + 1; ci < g.colIndex + g.span; ci++) {
                                  const cell = rows[g.rowIndex]?.cells[ci];
                                  if (cell) hiddenIds.add(cell.id);
                                }
                              }
                            }
                            const items: { id: string; col: number; row: number; vSpan: number; hSpan: number; cell: RibbonCell }[] = [];
                            for (let ri = 0; ri < rows.length; ri++) {
                              for (let ci = 0; ci < rows[ri].cells.length; ci++) {
                                const cell = rows[ri].cells[ci];
                                if (hiddenIds.has(cell.id)) continue;
                                const g = mgroups.find(gg => gg.colIndex === ci && gg.rowIndex === ri);
                                const vSpan = g?.direction === 'v' ? (g.span || 1) : 1;
                                const hSpan = g?.direction === 'h' ? (g.span || 1) : 1;
                                items.push({ id: cell.id, col: ci, row: ri, vSpan, hSpan, cell });
                              }
                            }
                            return items.map(p => {
                              const c = p.cell;
                              const span = p.vSpan || 1;
                              const val = c.field === 'text' ? (c.textContent || '') : c.field === 'sceneNumber' ? sample.sceneNumber : getFieldValueFromSample(c.field);
                              const fieldLabel = FIELD_MAP[c.field]?.label || customFieldLabels[c.field] || '';
                              const display = val || fieldLabel;
                              const lastVisRow = p.row + span - 1;
                              const lastVisCol = (p.hSpan && p.hSpan > 1) ? p.col + p.hSpan - 1 : p.col;
                              const cellBorderStyle = getCellBorderProps(cellBorders, rowStyle.color, lastVisCol >= rows[0].cells.length - 1, lastVisRow >= rows.length - 1);
                              return (
                                <div key={p.id} style={{
                                  ...getRibbonCellBaseStyle(c, activeDesign.cellPaddingV, activeDesign.cellPaddingH, span),
                                  gridColumn: (p.hSpan && p.hSpan > 1) ? `${p.col + 1} / span ${p.hSpan}` : p.col + 1,
                                  gridRow: span > 1 ? `${p.row + 1} / span ${span}` : p.row + 1,
                                  padding: span > 1 ? `0px ${activeDesign.cellPaddingH ?? 6}px` : `${activeDesign.cellPaddingV ?? 6}px ${activeDesign.cellPaddingH ?? 6}px`,
                                  borderRight: lastVisCol < rows[0].cells.length - 1 ? (cellBorders === 'vertical' || cellBorders === 'both' ? `1px solid ${rowStyle.color}` : '1px solid rgba(0,0,0,0.12)') : 'none',
                                  borderBottom: lastVisRow < rows.length - 1 ? (cellBorders === 'horizontal' || cellBorders === 'both' ? `1px solid ${rowStyle.color}` : '1px solid rgba(0,0,0,0.12)') : 'none',
                                  ...cellBorderStyle,
                                }}>
                                  <RibbonCellText cell={c} span={span} cellPadding={activeDesign.cellPaddingV} style={{ flexShrink: 1, minWidth: 0, fontStyle: val ? 'normal' : 'italic', opacity: val ? 1 : 0.5 }}>
                                    {formatCellText(val ? c.prefix : undefined, display, val ? c.suffix : undefined)}
                                  </RibbonCellText>
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
          <div className="fixed inset-0 z-[110]" onClick={() => setContextPos(null)} onContextMenu={e => {
            e.preventDefault();
            const backdrop = e.currentTarget as HTMLElement;
            backdrop.style.pointerEvents = 'none';
            const el = document.elementFromPoint(e.clientX, e.clientY);
            backdrop.style.pointerEvents = '';
            const cellDiv = el?.closest('[data-cell-id]') as HTMLElement | null;
            if (cellDiv) {
              const cid = cellDiv.getAttribute('data-cell-id');
              if (cid) { setSelId(cid); setContextPos({ x: e.clientX, y: e.clientY }); return; }
            }
            setContextPos(null);
          }} />
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
