import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import DataEditor, {
  GridCellKind,
  type GridCell,
  type GridColumn,
  type Item,
  type GridSelection,
  type EditableGridCell,
  type DataEditorRef,
  CompactSelection,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { useProject, DEFAULT_CATEGORY_LABELS, useIsCloudProject } from '../store';
import { Scene } from '../types';
import { generateUUID, formatPageCount, parsePageCount, clipboardWrite, clipboardRead } from '../lib/utils';
import {
  Trash2, Copy, Scissors, ClipboardPaste, Plus, ArrowDown, ArrowUp, Eye, Square, CheckSquare,
  ChevronDown, ZoomIn, ZoomOut, RotateCcw, FileDown, Search, Download, ExternalLink,
} from 'lucide-react';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import { getFieldItems, isMultiValue } from '../lib/categories';
import { getCategoryElements } from '../lib/elements';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import ImportDialog from './ImportDialog';
import { exportBreakdownCSV, parseCSV } from '../lib/import';
import type { ImportResult } from '../lib/import';
import Modal, { ModalFooter } from './Modal';
import Checkbox from './Checkbox';
import { useSpreadsheetFontSize, SS_FONT_SIZE_DEFAULT, useGlideSmoothScroll, useKeyboardMode } from '../lib/persist';
import { IS_COARSE, useHardwareKeyboard, isTouchLike } from '../lib/device';
import { createGlideTheme } from '../lib/glideTheme';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import { EntityDropdown } from './EntityDropdown';
import { usePortalTarget, useCurrentDocument } from '../lib/popoutTarget';
import { useMarqueeMode, getMarqueeMode } from '../lib/useLongPressMenu';
import { textCell, buildCopyText, buildCutPlan } from '../lib/glideCells';
import { planPaste } from '../lib/glidePaste';
import { createGlideCellEditor, type GlideColumnEditor } from '../lib/glideEditor';
import { useGlidePasteInterception } from '../lib/glidePasteIntercept';
import { useGlideColumnWidths } from '../lib/glideColumns';
import { useDedupeCellCommit } from '../lib/glideEditGuard';
import { createBlankScene } from '../lib/sceneFactory';

const BREAKDOWN_CATEGORIES = [
  'set', 'backgroundActors', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup',
  'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept',
];

const BREAKDOWN_LABELS: Record<string, string> = {
  set: 'Set', backgroundActors: 'Background Actors', stunts: 'Stunts', vehicles: 'Vehicles',
  props: 'Props', wardrobe: 'Wardrobe', makeup: 'Makeup & Hair',
  sfx: 'SFX', vfx: 'VFX', sound: 'Sound', music: 'Music',
  animalsAndWranglers: 'Animals & Wranglers', weapons: 'Weapons', greenery: 'Greenery',
  artDept: 'Art Dept',
};

const FIXED_COLS = [
  { key: 'actions', label: '', width: IS_COARSE ? 48 : 36 },
  { key: 'sceneNumber', label: 'Scene #', width: 60 },
  { key: 'pageCount', label: 'Pages', width: 80 },
  { key: 'scriptDay', label: 'Script Day', width: 80 },
  { key: 'intExt', label: 'I/E', width: 80 },
  { key: 'set', label: 'Set', width: 180 },
  { key: 'dayNight', label: 'D/N', width: 90 },
  { key: 'description', label: 'Description', width: 300 },
  { key: 'cast', label: 'Cast', width: 120 },
  { key: 'notes', label: 'Notes', width: 200 },
];

export function GlideBreakdownTab({
  onOpenSheet,
  onOpenSheetInPopout,
  headerTarget,
}: {
  onOpenSheet?: (rowIndex: number) => void;
  onOpenSheetInPopout?: (rowIndex: number) => void;
  headerTarget?: HTMLElement | null;
}) {
  const { state, dispatch, readOnly } = useProject();
  const isCloud = useIsCloudProject();
  const project = state.present;
  const scenes = project.scenes;

  const hiddenSet = useMemo(() => new Set(project.hiddenCategories || []), [project.hiddenCategories]);
  const allBreakdownCategories = useMemo(() => [
    ...BREAKDOWN_CATEGORIES.filter(k => !hiddenSet.has(k)),
    ...(project.customCategories || []).map(c => c.key),
  ], [project.customCategories, hiddenSet]);
  const allBreakdownLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const k of BREAKDOWN_CATEGORIES) labels[k] = project.categoryLabels?.[k] || DEFAULT_CATEGORY_LABELS[k] || BREAKDOWN_LABELS[k] || k;
    for (const c of project.customCategories || []) labels[c.key] = c.label;
    return labels;
  }, [project.customCategories, project.categoryLabels]);

  const [columnWidths, setColumnWidth] = useGlideColumnWidths(`lemon_schedule_glide_cols_${project.id}`);

  const [fontSize, setFontSizeBase] = useSpreadsheetFontSize(IS_COARSE ? 12.5 : undefined);
  const [fontVersion, setFontVersion] = useState(0);
  const setFontSize = useCallback((n: number) => { setFontSizeBase(n); setFontVersion(v => v + 1); }, [setFontSizeBase]);
  const [smoothScroll, setSmoothScroll] = useGlideSmoothScroll(IS_COARSE);
  const [keyboardMode] = useKeyboardMode();
  const hwKeyboard = useHardwareKeyboard();
  /** Keyboard off + no physical keyboard: text cells are read-only, entity cells become pickers. */
  const kbLocked = IS_COARSE && !hwKeyboard && keyboardMode === 'off';
  const marqueeMode = useMarqueeMode();

  const COLUMNS = useMemo(() => [
    ...FIXED_COLS.map(c => ({ ...c, width: columnWidths[c.key] ?? c.width })),
    ...allBreakdownCategories.filter(k => k !== 'set').map(key => ({
      key, label: allBreakdownLabels[key], width: columnWidths[key] ?? 100,
    })),
  ], [allBreakdownCategories, allBreakdownLabels, columnWidths]);

  const COLUMNSRef = useRef(COLUMNS);
  COLUMNSRef.current = COLUMNS;

  useEffect(() => {
    localStorage.setItem(`lemon_schedule_glide_cols_${project.id}`, JSON.stringify(columnWidths));
  }, [project.id, columnWidths]);

  const onColumnResize = useCallback((_col: any, w: number, ci: number) => {
    const key = COLUMNSRef.current[ci]?.key;
    if (!key) return;
    const scale = fontSize / SS_FONT_SIZE_DEFAULT;
    setColumnWidth(key, Math.round(w / scale));
  }, [fontSize, setColumnWidth]);

  const glideColumns: GridColumn[] = useMemo(() => {
    const scale = fontSize / SS_FONT_SIZE_DEFAULT;
    return COLUMNS.map(c =>
      c.key === 'actions'
        ? { title: '', width: Math.round(c.width * scale), themeOverride: { textDark: '#ef4444' } } as GridColumn
        : { title: c.label, width: Math.round(c.width * scale) }
    );
  }, [COLUMNS, fontSize]);

  const trashImg = useRef<HTMLImageElement | null>(null);
  const plusImg = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const trashSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
    const plusSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
    const tImg = new Image();
    tImg.src = 'data:image/svg+xml;base64,' + btoa(trashSvg);
    trashImg.current = tImg;
    const pImg = new Image();
    pImg.src = 'data:image/svg+xml;base64,' + btoa(plusSvg);
    plusImg.current = pImg;
  }, []);

  const drawCell = useCallback((args: any, draw: (a: any) => boolean) => {
    if (args.col === 0) {
      draw(args);
      if (args.row > scenesRef.current.length) return true;
      const isAddRow = args.row === scenesRef.current.length;
      const img = isAddRow ? plusImg.current : trashImg.current;
      if (img && img.complete) {
        const { ctx, rect } = args;
        const size = Math.min(14, rect.width - 4, rect.height - 4);
        const x = rect.x + (rect.width - size) / 2;
        const y = rect.y + (rect.height - size) / 2;
        ctx.drawImage(img, x, y, size, size);
      }
      return true;
    }
    return draw(args);
  }, []);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number; col?: number } | null>(null);
  /** Last row-marker click, to disambiguate Glide's time-based isDoubleClick (it
   *  flags two taps anywhere in the grid within ~1s as a double-click even on
   *  different cells, which would wrongly open the scene sheet). */
  const lastMarkerClickRef = useRef<{ col: number; row: number } | null>(null);
  /** Glide computes isTouch from pointerType === 'touch' only, so Apple Pencil
   *  (pointerType 'pen') arrives as a "mouse" click. Track the real pointer so
   *  pencil taps behave like finger taps. */
  const lastPointerRef = useRef<string>('touch');
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const touchDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const touchDownCellRef = useRef<{ col: number; row: number } | null>(null);
  const lastTouchTapRef = useRef<{ time: number; col: number; row: number } | null>(null);
  useEffect(() => {
    // Touch/pen selection parity with mouse:
    // - Mouse drags anchor on the PRESSED cell (Glide calls handleSelect at
    //   pointerdown). Touch defers selection to release, so without help a
    //   finger drag would grow from the previous selection's anchor and a
    //   "tap" with slight movement would spawn a phantom range. Anchor
    //   current at the pressed cell ourselves — mouse parity, and it keeps
    //   double-tap edit working (Glide's activation check needs current).
    // - When Select mode is OFF, drop the anchor once the finger really
    //   moves (>5px = a drag, not a tap) so no range can be grown. Select
    //   mode's whole purpose is finger drag-selection, so the anchor stays.
    // - A second tap on the same cell within Glide's touch double-click
    //   window is an edit attempt: leave the anchor alone even if the press
    //   jiggles, or the activation check finds no current and double-tap
    //   never opens the editor.
    const isOnGrid = (t: EventTarget | null) => !!gridContainerRef.current?.contains(t as Node);
    const onDown = (e: PointerEvent) => {
      lastPointerRef.current = e.pointerType;
      if (!isTouchLike(e.pointerType) || !isOnGrid(e.target)) return;
      const loc = gridRef.current?.getMouseArgsForPosition(e.clientX, e.clientY, e)?.location;
      const col = loc?.[0] ?? -2;
      const row = loc?.[1] ?? -2;
      const isDataCell = col >= 1 && row >= 0 && row < scenesRef.current.length;
      touchDownCellRef.current = isDataCell ? { col, row } : null;
      const prevTap = lastTouchTapRef.current;
      const doubleTapAttempt = prevTap !== null && Date.now() - prevTap.time < 1000 && prevTap.col === col && prevTap.row === row;
      touchDownPosRef.current = doubleTapAttempt ? null : { x: e.clientX, y: e.clientY };
      if (isDataCell) {
        setGridSelection(prev => {
          const c = prev.current;
          if (c && c.cell[0] === col && c.cell[1] === row && c.range.width === 1 && c.range.height === 1) return prev;
          return { ...prev, current: { cell: [col, row], range: { x: col, y: row, width: 1, height: 1 }, rangeStack: [] } };
        });
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!isTouchLike(e.pointerType) || getMarqueeMode() === 'tool' || !isOnGrid(e.target)) return;
      const down = touchDownPosRef.current;
      if (!down) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) return;
      touchDownPosRef.current = null;
      setGridSelection(prev => (prev.current !== undefined ? { ...prev, current: undefined } : prev));
    };
    const onUp = () => {
      touchDownPosRef.current = null;
      const cell = touchDownCellRef.current;
      touchDownCellRef.current = null;
      if (cell) lastTouchTapRef.current = { time: Date.now(), col: cell.col, row: cell.row };
    };
    const onCancel = () => {
      touchDownPosRef.current = null;
      touchDownCellRef.current = null;
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
    };
  }, []);

  // Select mode = frozen canvas: block wheel/trackpad scrolling over the grid
  // so the only thing a drag can do is select. (Touch pans are already
  // disabled by the wrapper's touchAction: none.)
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (getMarqueeMode() !== 'tool') return;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => el.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
  }, []);

  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true); };
    const onUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false); };
    const onBlur = () => setShiftHeld(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  const [sortMenu, setSortMenu] = useState<{ x: number; y: number; colKey: string; label: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ sceneId: string; sceneNumber: string } | null>(null);
  const [suppressDeleteWarning, setSuppressDeleteWarning] = useState(false);
  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const gridRef = useRef<DataEditorRef>(null);
  const portalTarget = usePortalTarget();
  const currentDocument = useCurrentDocument();
  const portalRef = useRef<HTMLElement | null>(null);
  useEffect(() => { portalRef.current = portalTarget ?? document.getElementById('portal'); }, [portalTarget]);
  const gridPortalRef = useRef<HTMLElement | null>(null);
  useEffect(() => { gridPortalRef.current = portalTarget ? portalTarget.querySelector('#portal') : document.getElementById('portal'); }, [portalTarget]);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (!gridRef.current) return;
    const all: { cell: Item }[] = [];
    for (let r = 0; r < scenes.length + 5; r++)
      for (let c = 0; c < COLUMNS.length; c++)
        all.push({ cell: [c, r] });
    setTimeout(() => gridRef.current?.updateCells(all), 0);
  }, [scenes, COLUMNS, kbLocked]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingCSVImport, setPendingCSVImport] = useState<{ result: ImportResult; fileName: string } | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const setItems = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of scenes) {
      const v = s.set.trim().toUpperCase();
      if (v) map.set(v, v);
    }
    for (const e of project.breakdownElements?.set || []) {
      const v = e.name.toUpperCase();
      if (v) map.set(v, v);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [scenes, project.breakdownElements]);

  const castItems = useMemo(() => {
    const seen = new Set<string>();
    const items: { id: string; name: string }[] = [];
    for (const e of project.castMembers || []) {
      if (e.id && !seen.has(e.id)) { items.push(e); seen.add(e.id); }
    }
    for (const sc of scenes) {
      for (const v of (sc.cast || '').split(',').map(x => x.trim()).filter(Boolean)) {
        if (!seen.has(v)) { items.push({ id: v, name: '' }); seen.add(v); }
      }
    }
    return items;
  }, [scenes, project.castMembers]);

  const breakdownEditorItems = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    for (const key of allBreakdownCategories) {
      map.set(key, getCategoryElements(project, key).map(e => ({ id: e.id, name: e.name })));
    }
    return map;
  }, [project, allBreakdownCategories]);

  const intExtOptions = useMemo(() =>
    project.colorPalette?.intExtOptions || ['INT', 'EXT', 'D/E', 'EXT/INT'],
  [project.colorPalette]);

  const dayNightOptions = useMemo(() =>
    project.colorPalette?.dayNightOptions || ['DAY', 'NIGHT', 'MORNING', 'EVENING'],
  [project.colorPalette]);

  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const selectModeRef = useRef(false);
  selectModeRef.current = marqueeMode === 'tool';
  const projectRef = useRef(project);
  projectRef.current = project;
  const allBreakdownLabelsRef = useRef(allBreakdownLabels);
  allBreakdownLabelsRef.current = allBreakdownLabels;
  const gridSelectionRef = useRef(gridSelection);
  gridSelectionRef.current = gridSelection;

  const commitEdit = useCallback((sceneId: string, colKey: string, newVal: string) => {
    const currentProject = projectRef.current;
    const updates: any = { [colKey]: newVal };
    if (colKey === 'pageCount') {
      if (newVal === '') { updates.pageCount = ''; updates.pageCountDecimal = 0; }
      else { const decimal = parsePageCount(newVal); updates.pageCountDecimal = decimal; updates.pageCount = formatPageCount(decimal); }
    } else if (colKey === 'scriptDay') {
      updates.scriptDay = newVal.replace(/[^0-9]/g, '');
    } else if (colKey === 'set') {
      updates.set = newVal.toUpperCase();
    }
    if (colKey === 'cast' || allBreakdownCategories.includes(colKey)) {
      const isCast = colKey === 'cast';
      const existing = isCast ? (currentProject.castMembers || []) : (currentProject.breakdownElements || {})[colKey] || [];
      const existingSet = new Set(existing.map((e: any) => (isCast ? e.id : e.name.toLowerCase())));
      const newItems = getFieldItems(colKey, newVal).filter(
        v => isCast ? !existingSet.has(v) : !existingSet.has(v.toLowerCase())
      );
      for (const item of newItems) {
        dispatch({ type: 'ADD_ELEMENT', payload: { category: colKey, element: isCast ? { id: item, name: '' } : { id: item, name: item } } });
      }
    }
    dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, ...updates } });
  }, [dispatch, allBreakdownCategories]);

  const getSceneValue = useCallback((scene: Scene, colKey: string): string => {
    if (colKey === 'intExt' || colKey === 'dayNight') return (scene as any)[colKey] || '';
    return String((scene as any)[colKey] ?? '');
  }, []);

  const isEntityCol = useCallback((key: string) =>
    key === 'cast' || key === 'set' || key === 'intExt' || key === 'dayNight' || allBreakdownCategories.includes(key),
  [allBreakdownCategories]);

  const getCellContent = useCallback(([col, row]: Item): GridCell => {
    const scene = scenesRef.current[row];
    // Select mode = selection only: lock every cell so no overlay editor can
    // open (double-tap, Enter, editOnType) and paste has no writable target.
    const selectLock = marqueeMode === 'tool';
    if (!scene) {
      if (row === scenesRef.current.length) {
        const colDef = COLUMNS[col];
        if (!colDef) return textCell('', { readonly: true });
        if (colDef.key === 'actions') return textCell('', { readonly: true, allowOverlay: false, cursor: 'pointer', themeOverride: { bgCell: '#f3f4f6' } });
        return textCell('', (selectLock || kbLocked) && !isEntityCol(colDef.key) ? { readonly: true, allowOverlay: false } : undefined);
      }
      return {
        kind: GridCellKind.Text,
        data: '',
        displayData: '',
        allowOverlay: false,
        readonly: true,
        style: 'faded',
      } as GridCell;
    }
    const colDef = COLUMNS[col];
    if (!colDef) return textCell('', { readonly: true });
    const colKey = colDef.key;
    if (colKey === 'actions') return textCell('', { readonly: true, allowOverlay: false, cursor: 'pointer', themeOverride: { bgCell: '#fef2f2' } });
    const val = getSceneValue(scene, colKey);
    if (colKey === 'cast') {
      const members = projectRef.current.castMembers || [];
      const displayValue = val
        ? val.split(',').map((id: string) => {
            const trimmed = id.trim();
            if (!trimmed) return '';
            const member = members.find((m: any) => m.id === trimmed);
            return member ? `${member.id}. ${member.name || trimmed}` : trimmed;
          }).filter(Boolean).join(', ')
        : '';
      return textCell(val, selectLock ? { displayData: displayValue, readonly: true, allowOverlay: false } : { displayData: displayValue });
    }
    return textCell(val, selectLock || (kbLocked && !isEntityCol(colKey)) ? { readonly: true, allowOverlay: false } : undefined);
  }, [COLUMNS, getSceneValue, isEntityCol, kbLocked, marqueeMode]);

  const getNextSceneNumber = useCallback((prevSceneNumber?: string): string => {
    if (!prevSceneNumber) return '';
    const match = prevSceneNumber.match(/^(\d+)/);
    if (!match) return '';
    return String(parseInt(match[1], 10) + 1);
  }, []);

  const dedupeCellCommit = useDedupeCellCommit();

  const onCellEdited = useCallback(([col, row]: Item, newValue: EditableGridCell) => {
    if (row === scenesRef.current.length) {
      const colDef = COLUMNS[col];
      if (!colDef || colDef.key === 'actions') return;
      if (newValue.kind !== GridCellKind.Text || !newValue.data.trim()) return;
      if (!dedupeCellCommit(`${colDef.key}:${newValue.data}`)) return;
      const val = colDef.key === 'pageCount'
        ? formatPageCount(parsePageCount(newValue.data))
        : colDef.key === 'scriptDay'
          ? newValue.data.replace(/[^0-9]/g, '')
          : colDef.key === 'set'
            ? newValue.data.toUpperCase()
            : newValue.data;
      const newScene: Scene = createBlankScene({
        sceneNumber: colDef.key === 'sceneNumber' ? val : '',
        [colDef.key]: val,
      } as Partial<Scene>);
      if (!newScene.sceneNumber) {
        const prev = scenesRef.current[scenesRef.current.length - 1];
        const nextNum = prev ? getNextSceneNumber(prev.sceneNumber) : '1';
        newScene.sceneNumber = nextNum;
      }
      dispatch({ type: 'ADD_SCENE', payload: newScene });
      return;
    }
    if (row >= scenesRef.current.length) return;
    const scene = scenesRef.current[row];
    if (!scene) return;
    const colDef = COLUMNS[col];
    if (!colDef || colDef.key === 'actions') return;
    if (newValue.kind === GridCellKind.Text) {
      commitEdit(scene.id, colDef.key, newValue.data);
    }
  }, [COLUMNS, dispatch, commitEdit, getNextSceneNumber, dedupeCellCommit]);

  const glideEditors = useMemo<Record<string, GlideColumnEditor>>(() => {
    const editors: Record<string, GlideColumnEditor> = {
      intExt: { kind: 'enum', options: intExtOptions, placeholder: 'INT, EXT, D/E...' },
      dayNight: { kind: 'enum', options: dayNightOptions, placeholder: 'DAY, NIGHT, MORNING...' },
      set: { kind: 'entity', mode: 'single', uppercase: true, keepAlphabetical: true, items: setItems, placeholder: 'Set' },
      cast: {
        kind: 'entity', mode: 'multi', displayMode: 'id', items: castItems, placeholder: 'Cast',
        renderItem: (item: any, _sel: any) => (<><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '\u2014'}</span></>),
      },
    };
    for (const cat of allBreakdownCategories) {
      if (cat === 'set' || cat === 'cast') continue;
      editors[cat] = {
        kind: 'entity',
        mode: isMultiValue(cat, project.customCategories) ? 'multi' : 'single',
        items: breakdownEditorItems.get(cat) || [],
        placeholder: allBreakdownLabels[cat] || cat,
      };
    }
    return editors;
  }, [intExtOptions, dayNightOptions, setItems, castItems, allBreakdownCategories, allBreakdownLabels, project.customCategories, breakdownEditorItems]);

  const provideEditor = useMemo(() => createGlideCellEditor({
    readOnlyRef,
    columns: COLUMNS,
    getValue: (row: number, colKey: string) => String(scenesRef.current[row]?.[colKey] ?? ''),
    editors: glideEditors,
    portalRef,
  }), [COLUMNS, glideEditors]);

  const onDelete = useCallback((sel: GridSelection): boolean => {
    if (selectModeRef.current) return false;
    if (!sel.current) return false;
    dispatch({ type: 'BATCH_START' });
    const { range } = sel.current;
    const damageList: { cell: Item }[] = [];
    for (let r = range.y; r < range.y + range.height; r++) {
      if (r >= scenesRef.current.length) continue;
      for (let c = range.x; c < range.x + range.width; c++) {
        const colDef = COLUMNS[c];
        if (!colDef) continue;
        if (colDef.key === 'actions') continue;
        commitEdit(scenesRef.current[r].id, colDef.key, '');
        damageList.push({ cell: [c, r] });
      }
    }
    dispatch({ type: 'BATCH_COMMIT' });
    setTimeout(() => gridRef.current?.updateCells(damageList), 0);
    return false;
  }, [COLUMNS, commitEdit, dispatch]);

  const handlePaste = useCallback((target: Item, values: readonly (readonly string[])[]): boolean => {
    // Select mode claims the paste but does nothing — selection only.
    if (selectModeRef.current) return true;
    const currentScenes = scenesRef.current;
    const sel = gridSelectionRef.current?.current?.range;
    const { editRows, newScenes } = planPaste(target, values, currentScenes, COLUMNS, sel);

    if (editRows.length === 0 && newScenes.length === 0) return false;

    dispatch({ type: 'BATCH_START' });
    for (const s of newScenes) {
      dispatch({ type: 'ADD_SCENE', payload: s });
    }
    for (const edit of editRows) {
      commitEdit(currentScenes[edit.row].id, edit.colKey, edit.val);
    }
    dispatch({ type: 'BATCH_COMMIT' });
    const damageList: { cell: Item }[] = [];
    for (const edit of editRows) {
      for (let c = 0; c < COLUMNS.length; c++) {
        if (COLUMNS[c].key === edit.colKey) { damageList.push({ cell: [c, edit.row] }); break; }
      }
    }
    gridRef.current?.updateCells(damageList);
    return false;
  }, [COLUMNS, dispatch, commitEdit]);

  const addScene = useCallback(() => {
    const prev = scenesRef.current[scenesRef.current.length - 1];
    const nextNum = prev ? getNextSceneNumber(prev.sceneNumber) : '1';
    dispatch({ type: 'ADD_SCENE', payload: createBlankScene({ sceneNumber: nextNum, containerId: null } as any) });
  }, [dispatch, getNextSceneNumber]);

  const insertSceneAt = useCallback((index: number) => {
    const prev = scenesRef.current[index - 1];
    const nextNum = prev ? getNextSceneNumber(prev.sceneNumber) : '1';
    const newScene: Scene = createBlankScene({ sceneNumber: nextNum } as any);
    dispatch({ type: 'INSERT_SCENE_AT', payload: { index, scene: newScene } });
  }, [dispatch, getNextSceneNumber]);

  const duplicateSceneAt = useCallback((index: number) => {
    const original = scenes[index];
    if (!original) return;
    const duplicate: Scene = { ...original, id: generateUUID() };
    const base = original.sceneNumber.replace(/[A-Z]+$/, '');
    const used = scenes.filter(s => s.sceneNumber.match(new RegExp('^' + base + '[A-Z]$'))).map(s => s.sceneNumber.slice(-1));
    let letter = 'A';
    for (let c = 65; c <= 90; c++) { if (!used.includes(String.fromCharCode(c))) { letter = String.fromCharCode(c); break; } }
    duplicate.sceneNumber = base + letter;
    dispatch({ type: 'INSERT_SCENE_AT', payload: { index: index + 1, scene: duplicate } });
  }, [dispatch, scenes]);

  const deleteScene = useCallback((id: string) => {
    dispatch({ type: 'DELETE_SCENE', payload: id });
  }, [dispatch]);

  const getEffectiveRange = useCallback((): { x: number; y: number; width: number; height: number } | null => {
    const sel = gridSelection.current;
    if (sel?.range) return sel.range;
    if (gridSelection.rows.length > 0) {
      const selectedRows = Array.from({ length: scenes.length }, (_, i) => i).filter(i => gridSelection.rows.hasIndex(i));
      if (selectedRows.length === 0) return null;
      return { x: 0, y: selectedRows[0], width: COLUMNS.length, height: selectedRows.length };
    }
    if (gridSelection.columns.length > 0) {
      const selectedCols = Array.from({ length: COLUMNS.length }, (_, i) => i).filter(i => gridSelection.columns.hasIndex(i));
      if (selectedCols.length === 0) return null;
      return { x: selectedCols[0], y: 0, width: selectedCols.length, height: scenes.length };
    }
    return null;
  }, [gridSelection, scenes.length, COLUMNS.length]);

  const handleCopy = useCallback(async () => {
    const range = getEffectiveRange();
    if (!range) return;
    const { x, y, width, height } = range;
    const text = buildCopyText(scenes, COLUMNS, { x, y, width, height });
    if (text.length > 0) await clipboardWrite(text);
    setContextMenu(null);
  }, [scenes, COLUMNS, getEffectiveRange]);

  const handleCut = useCallback(async () => {
    if (selectModeRef.current) { setContextMenu(null); return; }
    const range = getEffectiveRange();
    if (!range) return;
    const { x, y, width, height } = range;
    const { text, committers } = buildCutPlan(scenes, COLUMNS, { x, y, width, height });
    if (text.length > 0) {
      await clipboardWrite(text);
      dispatch({ type: 'BATCH_START' });
      for (const c of committers) commitEdit(scenes[c.row].id, c.colKey, '');
      dispatch({ type: 'BATCH_COMMIT' });
      gridRef.current?.updateCells(committers.map(c => {
        const colIndex = COLUMNS.findIndex(col => col.key === c.colKey);
        return { cell: [Math.max(0, colIndex), c.row] as Item };
      }));
    }
    setContextMenu(null);
  }, [scenes, COLUMNS, commitEdit, dispatch, getEffectiveRange]);

  const getPasteTarget = useCallback((): Item | null => {
    const sel = gridSelectionRef.current;
    let cell = sel.current?.cell;
    if (!cell && sel.rows.length > 0) {
      for (let i = 0; i < scenesRef.current.length; i++) {
        if (sel.rows.hasIndex(i)) { cell = [0, i] as Item; break; }
      }
    }
    return cell ?? null;
  }, []);

  const pasteTextAtSelection = useCallback((text: string) => {
    if (readOnlyRef.current || selectModeRef.current) return;
    const cell = getPasteTarget();
    if (!cell) return;
    const pastedRows = text.split(/\r\n|\n|\r/);
    handlePaste(cell, pastedRows.map(r => r.split('\t')));
  }, [getPasteTarget, handlePaste]);

  const handlePasteFromMenu = useCallback(async () => {
    const text = await clipboardRead();
    if (!text) return;
    pasteTextAtSelection(text);
    setContextMenu(null);
  }, [pasteTextAtSelection]);

  const handlePasteToAddRow = useCallback(async () => {
    const text = await clipboardRead();
    if (!text) return;
    const pastedRows = text.split(/\r\n|\n|\r/);
    handlePaste([1, scenesRef.current.length] as Item, pastedRows.map(r => r.split('\t')));
    setContextMenu(null);
  }, [handlePaste]);

  const handlePasteAtRow = useCallback(async (row: number) => {
    const text = await clipboardRead();
    if (!text) return;
    const pastedRows = text.split(/\r\n|\n|\r/);
    handlePaste([1, row] as Item, pastedRows.map(r => r.split('\t')));
    setContextMenu(null);
  }, [handlePaste]);

  const handleClear = useCallback(() => {
    if (selectModeRef.current) { setContextMenu(null); return; }
    const range = getEffectiveRange();
    if (!range) return;
    dispatch({ type: 'BATCH_START' });
    const { x, y, width, height } = range;
    const damageList: { cell: Item }[] = [];
    for (let r = y; r < y + height; r++) {
      if (r >= scenes.length) continue;
      for (let c = x; c < x + width; c++) {
        const key = COLUMNS[c]?.key;
        if (!key || key === 'actions') continue;
        commitEdit(scenes[r].id, key, '');
        damageList.push({ cell: [c, r] });
      }
    }
    dispatch({ type: 'BATCH_COMMIT' });
    setTimeout(() => gridRef.current?.updateCells(damageList), 0);
    setContextMenu(null);
  }, [scenes, COLUMNS, commitEdit, dispatch, getEffectiveRange]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !selectModeRef.current) {
      e.preventDefault();
      addScene();
    }
  }, [addScene]);

  // Physical keyboard (Cmd/Ctrl+C/X/V). iOS Safari won't give the grid canvas
  // real keyboard focus from a touch tap (activeElement stays on a button), so
  // Glide's window copy/paste handlers — which check document.activeElement
  // inside the grid — never run and the shortcuts do nothing. Drive the same
  // handlers the context menu uses from document-level listeners instead.
  // (Arrow-key navigation / shift+arrow selection is handled in onCellClicked:
  // the grid is focused explicitly on clicks/taps.)
  const clipboardShortcutsRef = useRef<{
    copy: () => void;
    cut: () => void;
    paste: () => void;
  }>({ copy: () => {}, cut: () => {}, paste: () => {} });
  clipboardShortcutsRef.current = { copy: handleCopy, cut: handleCut, paste: handlePasteFromMenu };
  useGlidePasteInterception(pasteTextAtSelection);

  useEffect(() => {
    const doc = currentDocument;
    const isEditableTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'c' && key !== 'x' && key !== 'v') return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const h = clipboardShortcutsRef.current;
      if (key === 'c') h.copy();
      else if (key === 'x') { if (!readOnlyRef.current) h.cut(); }
      // V: preventDefault so the browser's own paste event never fires (it
      // would land twice — Glide's async clipboard read also pastes). We read
      // the clipboard ourselves; the window-capture interceptor still handles
      // paste gestures that don't go through a keydown (menu-bar Paste, etc).
      else if (key === 'v') void h.paste();
    };
    doc.addEventListener('keydown', onKeyDown, true);
    return () => {
      doc.removeEventListener('keydown', onKeyDown, true);
    };
  }, [currentDocument]);

  const onCellContextMenu = useCallback((cell: Item, e: any) => {
    e.preventDefault();
    const [col, row] = cell;
    if (row < 0 || row > scenes.length) return;
    if (col < 0 && row < scenes.length) {
      const savedRows = gridSelectionRef.current?.rows;
      const rowIsSelected = savedRows?.hasIndex(row);
      const effectiveRows = rowIsSelected ? savedRows! : CompactSelection.fromSingleSelection(row);
      const selectedRowCount = effectiveRows.length;
      const firstSelectedRow = effectiveRows.first() ?? row;
      setTimeout(() => {
        setGridSelection({
          columns: CompactSelection.empty(),
          rows: effectiveRows,
          current: {
            cell: [0, row] as Item,
            range: { x: 0, y: firstSelectedRow, width: COLUMNS.length, height: selectedRowCount },
            rangeStack: [],
          },
        });
      }, 0);
    }
    const x = (e.bounds?.x ?? 0) + (e.localEventX ?? 0);
    const y = (e.bounds?.y ?? 0) + (e.localEventY ?? 0);
    setContextMenu({ x, y, row, col });
  }, [scenes.length, COLUMNS.length]);

  const onCellClicked = useCallback((cell: Item, e: any) => {
    const [col, row] = cell;
    const penTouch = isTouchLike(lastPointerRef.current);
    if (row < 0 || row > scenes.length) return;
    if (IS_COARSE || penTouch) {
      // iPadOS doesn't focus the grid canvas from a click/tap (activeElement
      // stays on a button), so Glide's canvas keydown handler — arrows,
      // shift+arrow multi-select, Home/End, Delete — never runs. Focus the
      // grid explicitly so hardware-keyboard selection matches desktop.
      gridRef.current?.focus();
    }
    if (row === scenes.length) {
      if (col < 0 && (penTouch || e.button === 2)) {
        const x = (e.bounds?.x ?? 0) + (e.localEventX ?? 0);
        const y = (e.bounds?.y ?? 0) + (e.localEventY ?? 0);
        setContextMenu({ x, y, row, col });
      }
      if (col === 0 && !readOnlyRef.current && getMarqueeMode() !== 'tool') {
        addScene();
      }
      return;
    }
    if (col === 0) {
      if (readOnlyRef.current || getMarqueeMode() === 'tool') return;
      const scene = scenesRef.current[row];
      if (!scene) return;
      const suppressedUntil = localStorage.getItem('lemon_schedule_suppress_delete_warning');
      if (suppressedUntil && Date.now() < parseInt(suppressedUntil, 10)) {
        deleteScene(scene.id);
      } else {
        setDeleteConfirm({ sceneId: scene.id, sceneNumber: scene.sceneNumber || String(row + 1) });
      }
      return;
    }
    if (col >= 0) return;
    if (e.isDoubleClick) {
      const prev = lastMarkerClickRef.current;
      const sameCell = prev !== null && prev.col === col && prev.row === row;
      lastMarkerClickRef.current = { col, row };
      if (sameCell && !penTouch) {
        // Double-CLICK (mouse) opens the scene sheet. Touch/pen double-taps do
        // not — the context menu's "Open Sheet" is the mobile path.
        if (!IS_COARSE && shiftHeld && onOpenSheetInPopout) {
          onOpenSheetInPopout(row);
        } else {
          onOpenSheet?.(row);
        }
        return;
      }
      // Spurious cross-cell double-click (Glide only checks timing) or a
      // touch/pen double-tap: fall through as a single tap on the marker.
    } else {
      lastMarkerClickRef.current = { col, row };
    }
    // Glide accumulates row markers on touch regardless of rowSelectionMode —
    // when not in Select Mode, replace the selection with just this row.
    if (penTouch && marqueeMode === 'off') {
      setGridSelection({
        rows: CompactSelection.fromSingleSelection(row),
        columns: CompactSelection.empty(),
        current: {
          cell: [0, row] as Item,
          range: { x: 0, y: row, width: COLUMNS.length, height: 1 },
          rangeStack: [],
        },
      });
    }
    if (penTouch || e.button === 2) {
      const x = (e.bounds?.x ?? 0) + (e.localEventX ?? 0);
      const y = (e.bounds?.y ?? 0) + (e.localEventY ?? 0);
      setContextMenu({ x, y, row, col });
    }
  }, [scenes.length, onOpenSheet, onOpenSheetInPopout]);

  const onHeaderContextMenu = useCallback((colIndex: number, e: any) => {
    e.preventDefault();
    if (colIndex === -1) {
      const x = (e.bounds?.x ?? 0) + (e.localEventX ?? 0);
      const y = (e.bounds?.y ?? 0) + (e.localEventY ?? 0);
      setSortMenu({ x, y, colKey: 'sceneNumber', label: 'Scene #' });
      return;
    }
    const colKey = COLUMNS[colIndex]?.key;
    if (!colKey || colKey === 'actions') return;
    const label = COLUMNS[colIndex]?.label || colKey;
    const x = (e.bounds?.x ?? 0) + (e.localEventX ?? 0);
    const y = (e.bounds?.y ?? 0) + (e.localEventY ?? 0);
    setSortMenu({ x, y, colKey, label });
  }, [COLUMNS]);

  const cleanEmptyRows = useCallback(() => {
    const toDelete: string[] = [];
    for (const s of scenes) {
      const isEmpty = !s.sceneNumber && !s.set && !s.description && !s.cast && !s.notes && !s.pageCount && !s.intExt && !s.dayNight;
      if (isEmpty) toDelete.push(s.id);
    }
    for (const id of toDelete) dispatch({ type: 'DELETE_SCENE', payload: id });
  }, [scenes, dispatch]);

  const totalPagesDecimal = useMemo(() => scenes.reduce((sum, s) => sum + (s.pageCountDecimal || 0), 0), [scenes]);

  const hasSelection = gridSelection.current?.range !== undefined || gridSelection.rows.length > 0 || gridSelection.columns.length > 0;
  const hasActiveCell = gridSelection.current?.cell !== undefined || gridSelection.rows.length > 0;

  const handleCSVFile = useCallback(async (file: File) => {
    try {
      const result = await parseCSV(file, project.castMembers || [], project.customCategories || [], project.categoryLabels || {});
      if (result.scenes.length === 0 && result.unknownCategories.length === 0) return;
      setPendingCSVImport({ result, fileName: file.name });
    } catch (_) {
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [project.castMembers, project.customCategories, project.categoryLabels]);

  const headerContent = (
    <div className="flex items-center justify-end gap-1">
      <button
        onClick={addScene}
        disabled={readOnly}
        className={`${isCloud ? "bg-blue-950 hover:bg-blue-900" : "bg-zinc-900 hover:bg-zinc-800"} text-white px-3 py-1 rounded text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        + Add Scene
      </button>
      <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen} width="w-44" theme="light"
        trigger={
          <button className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer select-none hover:bg-zinc-200 text-zinc-600 border border-transparent hover:border-zinc-300">
            Edit
            <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
          </button>
        }
      >
        <DropdownItem onClick={() => { setActionsOpen(false); dispatch({type: 'SORT_SCENES'}); }} icon={<Search className="w-3.5 h-3.5" />} disabled={readOnly}>
          Sort by #
        </DropdownItem>
        <DropdownItem onClick={() => { setActionsOpen(false); cleanEmptyRows(); }} icon={<RotateCcw className="w-3.5 h-3.5" />} disabled={readOnly}>
          Clean Empty
        </DropdownItem>
        <DropdownDivider />
        <DropdownItem onClick={() => { setActionsOpen(false); fileInputRef.current?.click(); }} icon={<FileDown className="w-3.5 h-3.5" />} disabled={readOnly}>
          Import CSV
        </DropdownItem>
        <DropdownItem onClick={() => { setActionsOpen(false); exportBreakdownCSV(project); }} icon={<Download className="w-3.5 h-3.5" />}>
          Export Breakdown to CSV
        </DropdownItem>
      </DropdownMenu>

      <DropdownMenu open={viewOpen} onOpenChange={setViewOpen} width="w-44" theme="light"
        trigger={
          <button className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer select-none hover:bg-zinc-200 text-zinc-600 border border-transparent hover:border-zinc-300">
            View
            <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
          </button>
        }
      >
        <DropdownItem onClick={() => { setFontSize(fontSize + 1.5); }} keepOpen icon={<ZoomIn className="w-3.5 h-3.5" />}>
          Bigger
        </DropdownItem>
        <DropdownItem onClick={() => { setFontSize(fontSize - 1.5); }} keepOpen icon={<ZoomOut className="w-3.5 h-3.5" />}>
          Smaller
        </DropdownItem>
        <DropdownDivider />
        <DropdownItem onClick={() => { setFontSize(IS_COARSE ? 12.5 : SS_FONT_SIZE_DEFAULT); }} keepOpen icon={<RotateCcw className="w-3.5 h-3.5" />}>
          Reset
        </DropdownItem>
        <DropdownDivider />
        <DropdownItem onClick={() => { setSmoothScroll(!smoothScroll); }} keepOpen icon={smoothScroll ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}>
          Smooth scroll
        </DropdownItem>
      </DropdownMenu>

      <DropdownMenu open={infoOpen} onOpenChange={setInfoOpen} width="w-48" theme="light"
        trigger={
          <button className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer select-none hover:bg-zinc-200 text-zinc-600 border border-transparent hover:border-zinc-300">
            Info
            <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
          </button>
        }
      >
        <div className="px-4 py-2.5 text-xs text-zinc-500 space-y-1.5">
          <div className="flex items-center justify-between gap-6">
            <span className="font-medium text-zinc-400 uppercase tracking-wider text-[10px]">Scenes</span>
            <span className="font-semibold text-zinc-800">{scenes.length}</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="font-medium text-zinc-400 uppercase tracking-wider text-[10px]">Pages</span>
            <span className="font-semibold text-zinc-800">{formatPageCount(totalPagesDecimal)}</span>
          </div>
        </div>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full">
      {headerTarget ? createPortal(headerContent, headerTarget) : (
        <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b border-zinc-200 bg-white shrink-0">
          {headerContent}
        </div>
      )}

      {/* Grid */}
      <div ref={gridContainerRef} style={{ flex: 1, minHeight: 0, touchAction: 'none' }}>
        <DataEditor
          key={fontVersion}
          ref={gridRef}
          columns={glideColumns}
          rows={scenes.length + 5}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          getCellsForSelection={true}
          gridSelection={gridSelection}
          onGridSelectionChange={setGridSelection}
          theme={createGlideTheme(fontSize)}
          rowHeight={Math.round(34 * fontSize / SS_FONT_SIZE_DEFAULT)}
          headerHeight={Math.round(36 * fontSize / SS_FONT_SIZE_DEFAULT)}
          onKeyDown={onKeyDown}
          onDelete={onDelete}
          onPaste={handlePaste}
          onColumnResize={onColumnResize}
          onCellContextMenu={onCellContextMenu}
          onCellClicked={onCellClicked}
          onHeaderContextMenu={onHeaderContextMenu}
          drawCell={drawCell}
          provideEditor={provideEditor}
          rowMarkers={{ kind: 'clickable-number', width: IS_COARSE ? 72 : 50, startIndex: 1, theme: { bgCell: '#fafafa', accentLight: '#e8e8ec' } }}
          freezeColumns={1}
          editOnType
          rangeSelect={IS_COARSE && !(hwKeyboard || marqueeMode === 'tool') ? "cell" : "rect"}
          cellActivationBehavior="double-click"
          rowSelectionMode={marqueeMode === 'tool' ? 'multi' : 'single'}
          smoothScrollX={smoothScroll}
          smoothScrollY={smoothScroll}
          portalElementRef={gridPortalRef}
          readonly={readOnly}
          {...({ experimental: { eventTarget: currentDocument } } as any)}
        />
      </div>

      {/* Context Menu */}
      <ContextMenu open={!!contextMenu} x={contextMenu?.x ?? 0} y={contextMenu?.y ?? 0} onClose={() => setContextMenu(null)}>
        {contextMenu && contextMenu.row < scenes.length && (
          <>
            {contextMenu.col !== undefined && (
              <>
                <ContextMenuItem onClick={handleCopy} icon={<Copy className="w-3 h-3 text-zinc-400" />} disabled={!hasSelection}>Copy</ContextMenuItem>
                <ContextMenuItem onClick={handleCut} icon={<Scissors className="w-3 h-3 text-zinc-400" />} disabled={!hasSelection || readOnly || marqueeMode === 'tool'}>Cut</ContextMenuItem>
                {contextMenu.col >= 0 ? (
                  <ContextMenuItem onClick={handlePasteFromMenu} icon={<ClipboardPaste className="w-3 h-3 text-zinc-400" />} disabled={!hasActiveCell || readOnly || marqueeMode === 'tool'}>Paste</ContextMenuItem>
                ) : (
                  <ContextMenuItem onClick={() => handlePasteAtRow(contextMenu.row)} icon={<ClipboardPaste className="w-3 h-3 text-zinc-400" />} disabled={readOnly || marqueeMode === 'tool'}>Paste</ContextMenuItem>
                )}
                <ContextMenuItem onClick={handleClear} icon={<Trash2 className="w-3 h-3 text-zinc-400" />} disabled={!hasSelection || readOnly || marqueeMode === 'tool'}>Clear</ContextMenuItem>
                <ContextMenuDivider />
              </>
            )}
            <ContextMenuItem onClick={() => { insertSceneAt(contextMenu.row); setContextMenu(null); }} icon={<Plus className="w-3 h-3 text-zinc-400" />} disabled={readOnly || marqueeMode === 'tool'}>Insert Above</ContextMenuItem>
            <ContextMenuItem onClick={() => { insertSceneAt(contextMenu.row + 1); setContextMenu(null); }} icon={<ArrowDown className="w-3 h-3 text-zinc-400" />} disabled={readOnly || marqueeMode === 'tool'}>Insert Below</ContextMenuItem>
            <ContextMenuItem onClick={() => { duplicateSceneAt(contextMenu.row); setContextMenu(null); }} icon={<Copy className="w-3 h-3 text-zinc-400" />} disabled={readOnly || marqueeMode === 'tool'}>Duplicate</ContextMenuItem>
            <ContextMenuDivider />
            {!IS_COARSE && shiftHeld && onOpenSheetInPopout ? (
              <ContextMenuItem onClick={() => { if (onOpenSheetInPopout) onOpenSheetInPopout(contextMenu.row); setContextMenu(null); }} icon={<ExternalLink className="w-3 h-3 text-zinc-400" />}>Open in New Window</ContextMenuItem>
            ) : (
              <ContextMenuItem onClick={() => { if (onOpenSheet) onOpenSheet(contextMenu.row); setContextMenu(null); }} icon={<Eye className="w-3 h-3 text-zinc-400" />}>Open Sheet</ContextMenuItem>
            )}
            <ContextMenuDivider />
            <ContextMenuItem
              onClick={() => {
                const range = getEffectiveRange();
                const rowCount = range ? range.height : 1;
                if (rowCount > 1 && range) {
                  const ids = scenes.slice(range.y, range.y + range.height).map(s => s.id);
                  const startScene = scenes[range.y];
                  setDeleteConfirm({ sceneId: ids.join(','), sceneNumber: `${rowCount} scenes` });
                } else {
                  const scene = scenes[contextMenu.row];
                  if (scene) {
                    setDeleteConfirm({ sceneId: scene.id, sceneNumber: scene.sceneNumber || String(contextMenu.row + 1) });
                  }
                }
                setContextMenu(null);
              }}
              variant="danger"
              icon={<Trash2 className="w-3 h-3" />}
              disabled={readOnly || marqueeMode === 'tool'}
            >
              {(() => {
                const range = getEffectiveRange();
                return range && range.height > 1 ? 'Delete Scenes' : 'Delete Scene';
              })()}
            </ContextMenuItem>
            {contextMenu.col !== undefined && (() => {
              const colKey = COLUMNS[contextMenu.col!]?.key;
              const isElementColumn = colKey && (colKey === 'cast' || colKey === 'set' || allBreakdownCategories.includes(colKey));
              if (!isElementColumn) return null;
              const colLabel = colKey ? (allBreakdownLabels[colKey] || COLUMNS[contextMenu.col!]?.label || colKey) : '';
              return (
                <>
                  <ContextMenuDivider />
                  <ContextMenuItem onClick={() => {
                    if (onOpenSheet && typeof onOpenSheet === 'function') {
                      onOpenSheet(contextMenu.row);
                    }
                    setContextMenu(null);
                  }} icon={<Eye className="w-3 h-3 text-zinc-400" />}>
                    Go to Element Manager → {colLabel}
                  </ContextMenuItem>
                </>
              );
            })()}
          </>
        )}
        {contextMenu && contextMenu.row === scenes.length && (
          <ContextMenuItem onClick={handlePasteToAddRow} icon={<ClipboardPaste className="w-3 h-3 text-zinc-400" />} disabled={readOnly}>Paste</ContextMenuItem>
        )}
      </ContextMenu>

      {/* Sort Context Menu */}
      <ContextMenu open={!!sortMenu} x={sortMenu?.x ?? 0} y={sortMenu?.y ?? 0} onClose={() => setSortMenu(null)}>
        {sortMenu && (() => {
          const numericKeys = new Set(['pageCount', 'scriptDay']);
          const isNumeric = numericKeys.has(sortMenu.colKey);
          return (
            <>
              <ContextMenuItem
                onClick={() => { dispatch({ type: 'SORT_SCENES_BY', payload: { key: sortMenu.colKey, direction: 'asc' } }); setSortMenu(null); }}
                icon={<ArrowUp className="w-3 h-3 text-zinc-400" />}
                disabled={readOnly}
              >
                {isNumeric ? 'Sort Smallest to Largest' : 'Sort A to Z'}
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => { dispatch({ type: 'SORT_SCENES_BY', payload: { key: sortMenu.colKey, direction: 'desc' } }); setSortMenu(null); }}
                icon={<ArrowDown className="w-3 h-3 text-zinc-400" />}
                disabled={readOnly}
              >
                {isNumeric ? 'Sort Largest to Smallest' : 'Sort Z to A'}
              </ContextMenuItem>
            </>
          );
        })()}
      </ContextMenu>

      <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleCSVFile(f); }} />
      {pendingCSVImport && <ImportDialog initialResult={pendingCSVImport.result} initialFileName={pendingCSVImport.fileName} fileFilter=".csv" onClose={() => setPendingCSVImport(null)} />}

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => { setDeleteConfirm(null); setSuppressDeleteWarning(false); }}
        title={deleteConfirm?.sceneId.includes(',') ? 'Delete Scenes' : 'Delete Scene'}
        width="max-w-sm"
        footer={
          <ModalFooter>
            <button
              onClick={() => { setDeleteConfirm(null); setSuppressDeleteWarning(false); }}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (deleteConfirm) {
                  const ids = deleteConfirm.sceneId.split(',');
                  if (ids.length > 1) dispatch({ type: 'BATCH_START' });
                  for (const id of ids) deleteScene(id);
                  if (ids.length > 1) dispatch({ type: 'BATCH_COMMIT' });
                  if (suppressDeleteWarning) {
                    localStorage.setItem('lemon_schedule_suppress_delete_warning', String(Date.now() + 86400000));
                  }
                  setDeleteConfirm(null);
                  setSuppressDeleteWarning(false);
                }
              }}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-500 transition-colors"
            >
              Delete
            </button>
          </ModalFooter>
        }
      >
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-zinc-300">
            Are you sure you want to delete{deleteConfirm?.sceneId.includes(',') ? '' : ' scene'} <span className="font-semibold text-white">{deleteConfirm?.sceneNumber}</span>?
          </p>
          <Checkbox
            block
            checked={suppressDeleteWarning}
            onChange={setSuppressDeleteWarning}
            tone="danger"
            label="Don't ask again (24 hours)"
          />
        </div>
      </Modal>
    </div>
  );
}
