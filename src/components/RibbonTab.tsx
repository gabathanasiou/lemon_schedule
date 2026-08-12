import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useProject } from '../store';
import { RibbonCell, RibbonRow, RibbonDesign } from '../types';
import {
  ALL_FIELDS, FIELD_MAP, CATEGORIES, SAMPLE,
  getDefaultRibbonRows, getDefaultColWidths, cid, MIN_PCT,
  getCustomFieldDefs, getAlign, getRibbonCellBaseStyle,
  getMergeLookup, mergeSiblingIds, normalizeColWidths,
} from '../lib/ribbonUtils';
import { IS_COARSE } from '../lib/device';
import {
  Hash, Clock, Timer, MapPin, Building2, Sun, Users, FileText, AlignLeft,
  Calendar, StickyNote, UserPlus, Sparkles, Car, Package, Shirt, Scissors,
  Volume1, Video, Volume2, Music, PawPrint, Sword, Leaf, PaintBucket,
  Plus, Trash2, GripHorizontal,
  ArrowRightLeft, ArrowUp, ArrowDown,
  ChevronDown, ArrowLeft, ArrowRight,
  AlignCenter, AlignRight, WrapText, Ellipsis, X, Type, CircleDot,
  ClipboardList,
  Check,
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
import RibbonPalette from './ribbon/RibbonPalette';
import { FIELD_ICONS, getCustomIcon } from './ribbon/ribbonPaletteMeta';
import RibbonToolbar from './ribbon/RibbonToolbar';
import RibbonDesignerGrid from './ribbon/RibbonDesignerGrid';
import RibbonLivePreview from './ribbon/RibbonLivePreview';
import RibbonContextMenu from './ribbon/RibbonContextMenu';

function cloneRows(rs: RibbonRow[]): RibbonRow[] {
  return JSON.parse(JSON.stringify(rs));
}

function getLabel(field: string) {
  if (!field) return 'Empty';
  const f = FIELD_MAP[field];
  return f ? f.label : field;
}

/**
 * Compares two ribbon layouts ignoring cell/row ids (which are random) —
 * JSON.stringify comparison always differs because getDefaultRibbonRows()
 * generates fresh ids per call.
 */
function rowsEqualContent(a: RibbonRow[], b: RibbonRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name) return false;
    const ca = a[i].cells, cb = b[i].cells;
    if (ca.length !== cb.length) return false;
    for (let j = 0; j < ca.length; j++) {
      const x = ca[j], y = cb[j];
      if (x.field !== y.field || x.align !== y.align || x.verticalAlign !== y.verticalAlign
        || x.wrap !== y.wrap || x.truncation !== y.truncation || x.overflowVisible !== y.overflowVisible
        || x.prefix !== y.prefix || x.suffix !== y.suffix || x.textContent !== y.textContent) return false;
    }
  }
  return true;
}

export default function RibbonTab({ headerTarget }: { headerTarget?: HTMLElement | null }) {
  const { state, dispatch, readOnly } = useProject();
  const dialog = useDialog();
  const project = state.present;
  const activeDesign = project.ribbonDesigns.find(d => d.id === project.activeRibbonId)
    || { id: '', name: 'Default', colWidths: getDefaultColWidths(), rows: getDefaultRibbonRows(), createdAt: 0 };
  const activeDesignRef = useRef(activeDesign);
  activeDesignRef.current = activeDesign;
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
  const cellClipboardRef = useRef<{ field: string; align?: string; wrap?: boolean; truncation?: boolean; overflowVisible?: boolean; prefix?: string; suffix?: string; textContent?: string; verticalAlign?: string } | null>(null);

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

  const saveDefaultAsDesign = useCallback(() => {
    // No active design (project without designs or stale active id): if the
    // default layout was actually modified, save it automatically as a design
    // named "Default" — no dialog, the user sees it appear in the design menu.
    if (activeDesignRef.current.id) return;
    if (rowsEqualContent(rowsRef.current, getDefaultRibbonRows())) return;
    const newId = generateUUID();
    dispatch({ type: 'ADD_RIBBON_DESIGN', payload: { name: 'Default', rows: cloneRows(rowsRef.current), colWidths: [...colWidthsRef.current] } });
    dispatch({ type: 'SET_ACTIVE_RIBBON', payload: newId });
  }, [dispatch]);

  const saveDefaultAsDesignRef = useRef(saveDefaultAsDesign);
  saveDefaultAsDesignRef.current = saveDefaultAsDesign;

  useEffect(() => {
    return () => {
      saveDefaultAsDesignRef.current();
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

  /* Style edits - propagate to merge siblings */
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

  const setOverflow = useCallback((cellId: string, mode: 'truncate' | 'wrap' | 'none' | 'visible') => {
    const ids = mergeSiblingIds(cellId, rows);
    const update: Partial<RibbonCell> = mode === 'wrap'
      ? { wrap: true, truncation: undefined, overflowVisible: undefined }
      : mode === 'none'
        ? { wrap: undefined, truncation: false, overflowVisible: undefined }
        : mode === 'visible'
          ? { wrap: undefined, truncation: undefined, overflowVisible: true }
          : { wrap: undefined, truncation: undefined, overflowVisible: undefined };
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
            overflowVisible: sc.cell.overflowVisible,
            prefix: sc.cell.prefix,
            suffix: sc.cell.suffix,
            textContent: sc.cell.textContent,
            verticalAlign: sc.cell.verticalAlign,
          };
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        const target = e.target as HTMLElement;
        const isEditable = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) && !(target as HTMLInputElement).readOnly;
        if (isEditable) return;
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
              overflowVisible: clip.overflowVisible || undefined,
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
        onSelect={async (id) => { saveDefaultAsDesign(); dispatch({ type: 'SET_ACTIVE_RIBBON', payload: id }); }}
        onRename={(id, name) => dispatch({ type: 'RENAME_RIBBON_DESIGN', payload: { id, name } })}
        onDuplicate={(id) => {
          const d = project.ribbonDesigns.find(x => x.id === id);
          if (!d) return;
          const newId = generateUUID();
          dispatch({ type: 'ADD_RIBBON_DESIGN', payload: { id: newId, name: `${d.name} Copy`, cloneFromId: id } });
          return newId;
        }}
        onDelete={async (id) => {
          const ok = await dialog.confirm({ title: 'Delete Design?', message: 'This can be restored from Trash.', danger: true, suppressKey: 'lemon_schedule_dnwa_delete_design' });
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
        <RibbonPalette
          allCategories={allCategories}
          allFields={allFields}
          used={used as Set<string>}
          placed={placed}
          total={total}
          customCategories={project.customCategories || []}
          readOnly={readOnly}
          selId={selId}
          assign={assign}
        />

        {/* ── Canvas ── */}
        <div ref={canvasRef} className="flex-1 overflow-auto bg-zinc-950 p-6 pr-12" onClick={() => setSelId(null)}>
          {/* Toolbar */}
          <RibbonToolbar
            readOnly={readOnly}
            selCell={selCell}
            selId={selId}
            numCols={numCols}
            rows={rows}
            onAddColumn={(ci) => setSelId(addColumn(ci))}
            removeColumn={removeColumn}
            addRow={addRow}
            removeRow={removeRow}
            swapCellsAllRows={swapCellsAllRows}
            moveRow={moveRow}
            copyFromAbove={copyFromAbove}
            copyFromBelow={copyFromBelow}
            copyFromLeft={copyFromLeft}
            copyFromRight={copyFromRight}
            setAlign={setAlign}
            setVerticalAlign={setVerticalAlign}
            setOverflow={setOverflow}
            setTextContent={setTextContent}
            setAffix={setAffix}
            onOpenFieldMenu={(e) => { if (!selCell) return; const rect = e.currentTarget.getBoundingClientRect(); setContextPos({ x: rect.left, y: rect.bottom }); }}
            dispatch={dispatch}
            designId={activeDesign.id}
            cellPaddingV={activeDesign.cellPaddingV}
            cellPaddingH={activeDesign.cellPaddingH}
            edgePadding={activeDesign.edgePadding}
          />
          <div className="mx-auto space-y-6" style={{ width: viewWidth ? `${viewWidth}px` : '100%' }}>

            <RibbonDesignerGrid
              readOnly={readOnly}
              rows={rows}
              colWidths={colWidths}
              numCols={numCols}
              selId={selId}
              setSelId={setSelId}
              setContextPos={setContextPos}
              tabBarRef={tabBarRef}
              gridRef={gridRef}
              cellRefs={cellRefs}
              mergeLookup={mergeLookup}
              cellDragRef={cellDragRef}
              setCellDrag={setCellDrag}
              setCellDropTarget={setCellDropTarget}
              setDropHover={setDropHover}
              dropHover={dropHover}
              cellDropTarget={cellDropTarget}
              startResize={startResize}
              moveCellToRow={moveCellToRow}
              assign={assign}
              customFieldLabels={customFieldLabels}
              cellPaddingV={activeDesign.cellPaddingV}
              cellPaddingH={activeDesign.cellPaddingH}
              edgePadding={activeDesign.edgePadding}
            />

            <RibbonLivePreview
              rows={rows}
              colWidths={colWidths}
              palette={project.colorPalette}
              cellBorders={cellBorders}
              customFieldLabels={customFieldLabels}
              previewSectionRef={previewSectionRef}
              cellPaddingV={activeDesign.cellPaddingV}
              cellPaddingH={activeDesign.cellPaddingH}
              edgePadding={activeDesign.edgePadding}
            />

          </div>
        </div>
      </div>

      <RibbonContextMenu
        contextPos={contextPos}
        setContextPos={setContextPos}
        selCell={selCell}
        setSelId={setSelId}
        allFields={allFields}
        customCategories={project.customCategories}
        assign={assign}
        setAffix={setAffix}
        setTextContent={setTextContent}
        clearCell={clearCell}
        removeColumn={removeColumn}
      />
    </div>
  );
}
