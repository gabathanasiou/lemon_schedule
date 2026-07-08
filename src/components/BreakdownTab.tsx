import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useProject, DEFAULT_CATEGORY_LABELS } from '../store';
import { Scene, IntExt, DayNight } from '../types';
import { generateUUID, formatPageCount, parsePageCount } from '../lib/utils';
import { Trash2, Copy, Scissors, ClipboardPaste, Plus, ArrowDown, Eye, ChevronDown, ZoomIn, ZoomOut, RotateCcw, FileDown, Search } from 'lucide-react';
import Papa from 'papaparse';
import { ElementManager } from './ElementManager';
import { SceneSheet } from './SceneSheet';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import { EntityDropdown } from './EntityDropdown';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import MiniTab from './MiniTab';
import { INT_EXT_OPTIONS, DAY_NIGHT_OPTIONS } from '../lib/ribbonUtils';
import { getFieldItems, isMultiValue } from '../lib/categories';
import { IS_COARSE } from '../lib/device';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import DropdownSubmenu from './DropdownSubmenu';
import { useSpreadsheetFontSize, SS_FONT_SIZE_DEFAULT, useKeyboardMode } from '../lib/persist';

type CellValue = { value: string };
type CellEditor = React.FC<{ cell?: CellValue; onChange: (cell: CellValue) => void; exitEditMode: () => void }>;
type CellViewer = React.FC<{ cell?: CellValue; row?: number }>;

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

const ACTIONS_COL = 0;
const INT_EXT_COL = 3;
const DAY_NIGHT_COL = 5;
const CAST_COL = 8;

export function BreakdownTab({ subTab: externalSubTab, onSubTabChange, savedCat, onCategoryChange, savedSheetIdx, onSheetIdxChange, onOpenSheet, onOpenSchedule }: {
 subTab: 'scenes' | 'elements' | 'sheet';
 onSubTabChange: (t: 'scenes' | 'elements' | 'sheet') => void;
  savedCat: string;
  onCategoryChange: (c: string) => void;
  savedSheetIdx: number;
  onSheetIdxChange: (i: number) => void;
  onOpenSheet?: (rowIndex: number) => void;
  onOpenSchedule?: (sceneId: string) => void;
}) {
  const { state, dispatch, readOnly } = useProject();
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

  const COLUMNS = useMemo(() => [
    { key: 'actions', label: '' },
    { key: 'sceneNumber', label: 'Scene #' },
    { key: 'pageCount', label: 'Pages' },
    { key: 'scriptDay', label: 'Script Day' },
    { key: 'intExt', label: 'I/E' },
    { key: 'set', label: 'Set' },
    { key: 'dayNight', label: 'D/N' },
    { key: 'description', label: 'Description' },
    { key: 'cast', label: 'Cast' },
    { key: 'notes', label: 'Notes' },
    ...allBreakdownCategories.filter(k => k !== 'set').map(key => ({ key, label: allBreakdownLabels[key] })),
  ], [allBreakdownCategories, allBreakdownLabels]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subTab = externalSubTab;
  const scrollTops = useRef<Record<string, number>>({});
  useEffect(() => {
    const el = document.querySelector('.tab-scroll');
    if (el && scrollTops.current[subTab] !== undefined) el.scrollTop = scrollTops.current[subTab];
  }, [subTab]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number; col?: number } | null>(null);
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [editCell, setEditCell] = useState<{ row: number; col: number } | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: { row: number; col: number }; end: { row: number; col: number } } | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [fontSize, setFontSize] = useSpreadsheetFontSize();
  const [keyboardMode] = useKeyboardMode();
  const textEditingEnabled = keyboardMode === 'on' || !IS_COARSE;
  const editingEnabled = !readOnly && textEditingEnabled;

  // Stable refs for mutable data — lets editor components stay referentially stable
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const projectRef = useRef(project);
  projectRef.current = project;
  const breakdownElementsRef = useRef(project.breakdownElements);
  breakdownElementsRef.current = project.breakdownElements;
  const allBreakdownLabelsRef = useRef(allBreakdownLabels);
  allBreakdownLabelsRef.current = allBreakdownLabels;
  const customCategoriesRef = useRef(project.customCategories);
  customCategoriesRef.current = project.customCategories;

  const deleteScene = useCallback((id: string) => {
    dispatch({ type: 'DELETE_SCENE', payload: id });
  }, [dispatch]);

  const insertSceneAt = (index: number) => {
    const newScene: Scene = {
      id: generateUUID(),
      sceneNumber: '',
      pageCount: '',
      pageCountDecimal: 0,
      scriptDay: '',
      intExt: '' as IntExt,
      set: '',
      dayNight: '' as DayNight,
      description: '',
      cast: '',
      notes: '',
      backgroundActors: '',
      stunts: '',
      vehicles: '',
      props: '',
      wardrobe: '',
      makeup: '',
      sfx: '',
      vfx: '',
      sound: '',
      music: '',
      animalsAndWranglers: '',
      weapons: '',
      greenery: '',
      artDept: '',
      shootDay: null
    };
    dispatch({ type: 'INSERT_SCENE_AT', payload: { index, scene: newScene } });
  };

  const duplicateSceneAt = (index: number) => {
    const original = scenes[index];
    if (!original) return;
    const duplicate: Scene = { ...original, id: generateUUID() };
    const base = original.sceneNumber.replace(/[A-Z]+$/, '');
    const used = scenes.filter(s => s.sceneNumber.match(new RegExp('^' + base + '[A-Z]$'))).map(s => s.sceneNumber.slice(-1));
    let letter = 'A';
    for (let c = 65; c <= 90; c++) { if (!used.includes(String.fromCharCode(c))) { letter = String.fromCharCode(c); break; } }
    duplicate.sceneNumber = base + letter;
    dispatch({ type: 'INSERT_SCENE_AT', payload: { index: index + 1, scene: duplicate } });
  };

  const deleteSelectedRows = () => {
    const indices = [...selectedRows].sort((a: number, b: number) => b - a);
    for (const idx of indices) {
      if (idx < scenes.length) deleteScene(scenes[idx].id);
    }
  };

  const cleanEmptyRows = () => {
    const toDelete: string[] = [];
    for (const s of scenes) {
      const isEmpty = !s.sceneNumber && !s.set && !s.description && !s.cast && !s.notes && !s.pageCount && !s.intExt && !s.dayNight;
      if (isEmpty) toDelete.push(s.id);
    }
    for (const id of toDelete) dispatch({ type: 'DELETE_SCENE', payload: id });
  };

  const CastEditor: CellEditor = useCallback(({ cell, onChange, exitEditMode }) => (
    <EntityDropdown
      value={cell?.value || ''}
      onChange={val => onChange({ value: val })}
      onExit={() => exitEditMode()}
      positioning="relative"
      defaultOpen
      autoFocus
      mode="multi"
      placeholder="Cast"
      className="text-xs"
      displayMode="id"
      renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '—'}</span></>}
    />
  ), []);

  const PageCountEditor: CellEditor = useCallback(({ cell, onChange, exitEditMode }) => {
    const [val, setVal] = useState(cell?.value || '');
    return (
      <input
        type="text"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { onChange({ value: val }); exitEditMode(); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onChange({ value: val }); exitEditMode(); }
          if (e.key === 'Escape') exitEditMode();
        }}
        autoFocus
      />
    );
  }, []);

  const setItems = useMemo(() => {
    const sets = new Map<string, string>();
    for (const s of scenes) { const v = s.set.trim().toUpperCase(); if (v) sets.set(v, v); }
    for (const e of project.breakdownElements?.['set'] || []) { const v = e.name.toUpperCase(); if (v) sets.set(v, v); }
    return [...sets.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id));
  }, [scenes, project.breakdownElements]);
  const setItemsRef = useRef(setItems);
  setItemsRef.current = setItems;

  const SetEditor: CellEditor = useCallback(({ cell, onChange, exitEditMode }) => {
    return (
      <EntityDropdown
        value={cell?.value || ''}
        onChange={val => onChange({ value: val })}
        onExit={() => exitEditMode()}
        items={setItemsRef.current}
        mode="single"
        uppercase
        keepAlphabetical
        panelMinWidth="min-w-[220px]"
        positioning="relative"
        defaultOpen
        autoFocus
        className="text-xs"
      />
    );
  }, []);

  const IntExtEditor: CellEditor = useCallback(({ cell, onChange, exitEditMode }) => (
    <AutocompleteDropdown
      value={cell?.value || ''}
      onChange={val => onChange({ value: val })}
      onExit={() => exitEditMode()}
      options={INT_EXT_OPTIONS}
      positioning="relative"
      defaultOpen
      autoFocus
      showAll
    />
  ), []);

  const DayNightEditor: CellEditor = useCallback(({ cell, onChange, exitEditMode }) => (
    <AutocompleteDropdown
      value={cell?.value || ''}
      onChange={val => onChange({ value: val })}
      onExit={() => exitEditMode()}
      options={DAY_NIGHT_OPTIONS}
      positioning="relative"
      defaultOpen
      autoFocus
      showAll
    />
  ), []);

  const breakdownEditorItems = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    for (const key of allBreakdownCategories) {
      const storedElements: { id: string; name: string }[] = project.breakdownElements?.[key] || [];
      const items: { id: string; name: string }[] = storedElements.map(e => ({ id: e.id, name: e.name }));
      map.set(key, items);
    }
    return map;
  }, [project.breakdownElements, allBreakdownCategories]);
  const breakdownEditorItemsRef = useRef(breakdownEditorItems);
  breakdownEditorItemsRef.current = breakdownEditorItems;

  const breakdownEditors = useMemo(() => {
    const map = new Map<string, CellEditor>();
    for (const key of allBreakdownCategories) {
      const Editor: CellEditor = ({ cell, onChange, exitEditMode }) => {
        const items = breakdownEditorItemsRef.current.get(key) || [];
        return (
          <EntityDropdown
            value={cell?.value || ''}
            onChange={val => onChange({ value: val })}
            onExit={() => exitEditMode()}
            items={items}
            placeholder={allBreakdownLabelsRef.current[key]}
            positioning="relative"
            defaultOpen
            autoFocus
            mode={isMultiValue(key, customCategoriesRef.current) ? 'multi' : 'single'}
            renderItem={(item) => (
              <>
                {item.id && item.id !== item.name && <span className="text-zinc-400 shrink-0">{item.id}.</span>}
                <span className="truncate flex-1">{item.name}</span>
              </>
            )}
          />
        );
      };
      map.set(key, Editor);
    }
    return map;
  }, [allBreakdownCategories]);

  const ROW_INDICATOR_W = IS_COARSE ? 65 : 55;

  const colWidths = useRef<number[]>((() => {
    const arr = IS_COARSE
      ? [44, 90, 80, 80, 80, 180, 90, 300, 120, 200, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]
      : [28, 60, 80, 80, 80, 180, 90, 300, 120, 200, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
    arr[0] = ROW_INDICATOR_W;
    return arr;
  })());
  const DEFAULT_WIDTHS = useMemo(() => {
    const arr = [...colWidths.current];
    arr[0] = ROW_INDICATOR_W;
    return arr;
  }, []);
  const [widthVersion, setWidthVersion] = useState(0);

  const ROW_HEIGHT = Math.round(fontSize * (IS_COARSE ? 3.2 : 2.55));

  const getColWidth = useCallback((colIndex: number) => {
    return colWidths.current[colIndex + 1] || DEFAULT_WIDTHS[colIndex + 1] || 100;
  }, []);

  const totalWidth = useMemo(() => {
    let w = ROW_INDICATOR_W;
    for (let i = 0; i < COLUMNS.length; i++) w += getColWidth(i);
    return w;
  }, [COLUMNS, widthVersion, getColWidth]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const totalRows = scenes.length + 1;
  const virtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: IS_COARSE ? 3 : 5,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const virtualTotalHeight = virtualizer.getTotalSize();

  const isCellReadOnly = useCallback((row: number, col: number) => {
    if (col === ACTIONS_COL) return true;
    if (readOnly) return true;
    if (!editingEnabled) {
      const colKey = COLUMNS[col]?.key;
      if (colKey === 'cast' || colKey === 'set' || colKey === 'intExt' || colKey === 'dayNight' || allBreakdownCategories.includes(colKey)) return false;
      return true;
    }
    return false;
  }, [readOnly, editingEnabled, COLUMNS, allBreakdownCategories]);

  const commitEdit = useCallback((sceneId: string, colKey: string, newVal: string) => {
    const project = projectRef.current;
    const updates: any = { [colKey]: newVal };
    if (colKey === 'pageCount') {
      if (newVal === '') {
        updates.pageCount = '';
        updates.pageCountDecimal = 0;
      } else {
        const decimal = parsePageCount(newVal);
        updates.pageCountDecimal = decimal;
        updates.pageCount = formatPageCount(decimal);
      }
    } else if (colKey === 'scriptDay') {
      updates.scriptDay = newVal.replace(/[^0-9]/g, '');
    } else if (colKey === 'set') {
      updates.set = newVal.toUpperCase();
    } else if (colKey === 'intExt') {
      const match = INT_EXT_OPTIONS.find(opt => opt.toLowerCase() === newVal.toLowerCase());
      if (match) updates.intExt = match;
    } else if (colKey === 'dayNight') {
      const match = DAY_NIGHT_OPTIONS.find(opt => opt.toLowerCase() === newVal.toLowerCase());
      if (match) updates.dayNight = match;
    }
    if (colKey === 'cast' || allBreakdownCategories.includes(colKey)) {
      const isCast = colKey === 'cast';
      const existing = (project.breakdownElements || {})[colKey] || [];
      const existingSet = new Set(
        isCast ? existing.map(e => e.id) : existing.map(e => e.name.toLowerCase())
      );
      const newItems = getFieldItems(colKey, newVal)
        .filter(v => isCast ? !existingSet.has(v) : !existingSet.has(v.toLowerCase()));
      for (const item of newItems) {
        dispatch({ type: 'ADD_ELEMENT', payload: {
          category: colKey,
          element: isCast ? { id: item, name: '' } : { id: item, name: item }
        } });
      }
    }
    dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, ...updates } });
  }, [dispatch, allBreakdownCategories]);

  const commitPhantomCell = useCallback((colKey: string, value: string) => {
    if (!value.trim()) return;
    const currentProject = projectRef.current;
    const newScene: Record<string, any> = { shootDay: null, id: generateUUID() };
    newScene[colKey] = value;
    if (colKey === 'pageCount') {
      const decimal = parsePageCount(value);
      newScene.pageCount = formatPageCount(decimal);
      newScene.pageCountDecimal = decimal;
    } else if (colKey === 'scriptDay') {
      newScene.scriptDay = value.replace(/[^0-9]/g, '');
    } else if (colKey === 'set') {
      newScene.set = value.toUpperCase();
    }
    for (const k of ['sceneNumber', 'pageCount', 'pageCountDecimal', 'scriptDay', 'intExt', 'set', 'dayNight', 'description', 'cast', 'notes', ...allBreakdownCategories]) {
      if (!(k in newScene)) newScene[k] = '';
    }
    dispatch({ type: 'BATCH_START' });
    dispatch({ type: 'ADD_SCENE', payload: newScene as Scene });
    const entityCategories = ['cast', ...allBreakdownCategories];
    for (const category of entityCategories) {
      const val = String(newScene[category] ?? '');
      if (!val.trim()) continue;
      const isCast = category === 'cast';
      const existing = (currentProject.breakdownElements || {})[category] || [];
      const existingSet = new Set(isCast ? existing.map(e => e.id) : existing.map(e => e.name.toLowerCase()));
      const items = getFieldItems(category, val);
      for (const item of items) {
        if (isCast ? !existingSet.has(item) : !existingSet.has(item.toLowerCase())) {
          dispatch({ type: 'ADD_ELEMENT', payload: { category, element: isCast ? { id: item, name: '' } : { id: item, name: item } } });
        }
      }
    }
    dispatch({ type: 'BATCH_COMMIT' });
  }, [dispatch, allBreakdownCategories]);

  const commitCellValue = useCallback((rowIndex: number, colIndex: number, value: string) => {
    if (colIndex === ACTIONS_COL) return;
    const colKey = COLUMNS[colIndex]?.key;
    if (!colKey) return;
    if (rowIndex >= scenes.length) {
      commitPhantomCell(colKey, value);
    } else {
      commitEdit(scenes[rowIndex].id, colKey, value);
    }
  }, [scenes, commitEdit, COLUMNS, commitPhantomCell]);

  const handleCellClick = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (e.shiftKey && activeCell) {
      setSelectionRange({
        start: { row: Math.min(activeCell.row, row), column: Math.min(activeCell.col, col) },
        end: { row: Math.max(activeCell.row, row), column: Math.max(activeCell.col, col) },
      });
    } else {
      setActiveCell({ row, col });
      setSelectionRange(null);
    }
    if (editCell && (editCell.row !== row || editCell.col !== col)) {
      setEditCell(null);
    }
  }, [activeCell, editCell]);

  const handleCellDoubleClick = useCallback((row: number, col: number) => {
    if (col === ACTIONS_COL) return;
    if (!isCellReadOnly(row, col)) {
      setActiveCell({ row, col });
      setEditCell({ row, col });
    }
  }, [isCellReadOnly]);

  const handleCellContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const cell = (e.target as HTMLElement).closest('[data-row]');
    let row = -1, col = -1;
    if (cell) {
      row = parseInt(cell.getAttribute('data-row') || '-1');
      col = parseInt(cell.getAttribute('data-col') || '-1');
    } else if (activeCell) {
      row = activeCell.row;
      col = activeCell.col;
    }
    if (row < 0) return;
    setContextMenu(null);
    setContextMenu({ x: e.clientX, y: e.clientY, row, col: col >= 0 ? col : undefined });
  }, [activeCell]);

  const isInSelection = useCallback((row: number, col: number) => {
    if (!selectionRange) return false;
    const { start, end } = selectionRange;
    return row >= start.row && row <= end.row && col >= start.column && col <= end.column;
  }, [selectionRange]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const imported: Scene[] = results.data.map((row: any) => ({
          id: generateUUID(),
          sceneNumber: typeof row['Scene #'] === 'string' ? row['Scene #'] : typeof row['Scene'] === 'string' ? row['Scene'] : String(row['Scene'] || row['Scene #'] || ''),
          pageCount: formatPageCount(parsePageCount(row['Pages'] || '0')),
          pageCountDecimal: parsePageCount(row['Pages'] || '0'),
          scriptDay: row['Script Day'] || '',
          intExt: (row['I/E'] || 'INT') as any,
          set: (row['Set'] || '').toUpperCase(),
          dayNight: (row['D/N'] || 'DAY') as any,
          description: row['Description'] || '',
          cast: row['Cast'] || '',
          notes: row['Notes'] || '',
          backgroundActors: '',
          stunts: '',
          vehicles: '',
          props: '',
          wardrobe: '',
          makeup: '',
          sfx: '',
          vfx: '',
          sound: '',
          music: '',
          animalsAndWranglers: '',
          weapons: '',
          greenery: '',
          artDept: '',
          shootDay: null
        }));
        if (imported.length > 0) {
          dispatch({ type: 'BATCH_START' });
          dispatch({ type: 'IMPORT_SCENES', payload: imported });
          const entityCategories = ['cast', ...allBreakdownCategories];
          for (const scene of imported) {
            for (const category of entityCategories) {
              const val = String((scene as any)[category] ?? '');
              if (!val.trim()) continue;
              const isCast = category === 'cast';
              const existing = (project.breakdownElements || {})[category] || [];
              const existingSet = new Set(
                isCast ? existing.map(e => e.id) : existing.map(e => e.name.toLowerCase())
              );
              const items = getFieldItems(category, val);
              for (const item of items) {
                if (isCast ? !existingSet.has(item) : !existingSet.has(item.toLowerCase())) {
                  dispatch({ type: 'ADD_ELEMENT', payload: {
                    category,
                    element: isCast ? { id: item, name: '' } : { id: item, name: item }
                  } });
                }
              }
            }
          }
          dispatch({ type: 'BATCH_COMMIT' });
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  const addScene = () => {
    dispatch({
      type: 'ADD_SCENE',
      payload: {
        id: generateUUID(),
        sceneNumber: '',
        pageCount: '',
        pageCountDecimal: 0,
        scriptDay: '',
        intExt: '' as any,
        set: '',
        dayNight: '' as any,
        description: '',
        cast: '',
        notes: '',
        backgroundActors: '',
        stunts: '',
        vehicles: '',
        props: '',
        wardrobe: '',
        makeup: '',
        sfx: '',
        vfx: '',
        sound: '',
        music: '',
        animalsAndWranglers: '',
        weapons: '',
        greenery: '',
        artDept: '',
        shootDay: null
      }
    });
  };

  const totalPagesDecimal = useMemo(() => scenes.reduce((sum, s) => sum + (s.pageCountDecimal || 0), 0), [scenes]);

  const handleCopy = useCallback(async () => {
    const range = selectionRange ?? (activeCell ? { start: activeCell, end: activeCell } : null);
    if (!range) return;
    const { start, end } = range;
    const rows: string[] = [];
    for (let r = start.row; r <= end.row; r++) {
      const cols: string[] = [];
      for (let c = start.column; c <= end.column; c++) {
        if (c === ACTIONS_COL) continue;
        const colKey = COLUMNS[c]?.key;
        const val = r < scenes.length && colKey ? String((scenes[r] as any)[colKey] ?? '') : '';
        cols.push(val);
      }
      rows.push(cols.join('\t'));
    }
    await navigator.clipboard.writeText(rows.join('\n'));
    setContextMenu(null);
  }, [selectionRange, activeCell, scenes, COLUMNS]);

  const handleClear = useCallback(() => {
    const range = selectionRange ?? (activeCell ? { start: activeCell, end: activeCell } : null);
    if (!range) return;
    const { start, end } = range;
    let needsBatch = false;
    for (let r = start.row; r <= end.row; r++) {
      if (r >= scenes.length) continue;
      for (let c = start.column; c <= end.column; c++) {
        if (c === ACTIONS_COL) continue;
        if (!needsBatch) { needsBatch = true; dispatch({ type: 'BATCH_START' }); }
        commitEdit(scenes[r].id, COLUMNS[c].key, '');
      }
    }
    if (needsBatch) dispatch({ type: 'BATCH_COMMIT' });
    setContextMenu(null);
  }, [selectionRange, activeCell, scenes, commitEdit, COLUMNS, dispatch]);

  const handleCut = useCallback(async () => {
    const range = selectionRange ?? (activeCell ? { start: activeCell, end: activeCell } : null);
    if (!range) return;
    const { start, end } = range;
    const rows: string[] = [];
    for (let r = start.row; r <= end.row; r++) {
      const cols: string[] = [];
      for (let c = start.column; c <= end.column; c++) {
        if (c === ACTIONS_COL) continue;
        const colKey = COLUMNS[c]?.key;
        const val = r < scenes.length && colKey ? String((scenes[r] as any)[colKey] ?? '') : '';
        cols.push(val);
      }
      rows.push(cols.join('\t'));
    }
    await navigator.clipboard.writeText(rows.join('\n'));
    let needsBatch = false;
    for (let r = start.row; r <= end.row; r++) {
      if (r >= scenes.length) continue;
      for (let c = start.column; c <= end.column; c++) {
        if (c === ACTIONS_COL) continue;
        if (!needsBatch) { needsBatch = true; dispatch({ type: 'BATCH_START' }); }
        commitEdit(scenes[r].id, COLUMNS[c].key, '');
      }
    }
    if (needsBatch) dispatch({ type: 'BATCH_COMMIT' });
    setContextMenu(null);
  }, [selectionRange, activeCell, scenes, commitEdit, COLUMNS, dispatch]);

  const handlePaste = useCallback(async () => {
    if (!activeCell) return;
    setContextMenu(null);
    const text = await navigator.clipboard.readText();
    if (!text) return;
    const pastedRows = text.split(/\r\n|\n|\r/);
    const pastedData = pastedRows.map(r => r.split('\t'));
    let needsBatch = false;
    const currentProject = projectRef.current;
    const phantomData: Record<number, Record<string, string>> = {};
    for (let r = 0; r < pastedData.length; r++) {
      for (let c = 0; c < pastedData[r].length; c++) {
        if (c === ACTIONS_COL) continue;
        if (c >= COLUMNS.length) continue;
        const targetRow = activeCell.row + r;
        const targetCol = activeCell.column + c;
        const value = pastedData[r][c];
        if (!value.trim()) continue;
        if (targetRow < scenes.length) {
          if (!needsBatch) { needsBatch = true; dispatch({ type: 'BATCH_START' }); }
          commitEdit(scenes[targetRow].id, COLUMNS[targetCol].key, value);
        } else {
          if (!phantomData[targetRow]) phantomData[targetRow] = {};
          phantomData[targetRow][COLUMNS[targetCol].key] = value;
        }
      }
    }
    const phantomIndices = Object.keys(phantomData).map(Number).sort();
    for (const rowIdx of phantomIndices) {
      if (!needsBatch) { needsBatch = true; dispatch({ type: 'BATCH_START' }); }
      const data = phantomData[rowIdx];
      const newScene: Record<string, any> = { shootDay: null, id: generateUUID() };
      for (const [k, v] of Object.entries(data)) newScene[k] = v;
      for (const k of ['sceneNumber', 'pageCount', 'pageCountDecimal', 'scriptDay', 'intExt', 'set', 'dayNight', 'description', 'cast', 'notes', ...allBreakdownCategories]) {
        if (!(k in newScene)) newScene[k] = '';
      }
      if (newScene.pageCount && typeof newScene.pageCount === 'string') {
        const decimal = parsePageCount(newScene.pageCount);
        newScene.pageCount = formatPageCount(decimal);
        newScene.pageCountDecimal = decimal;
      }
      if (newScene.scriptDay) newScene.scriptDay = String(newScene.scriptDay).replace(/[^0-9]/g, '');
      if (newScene.set) newScene.set = String(newScene.set).toUpperCase();
      dispatch({ type: 'ADD_SCENE', payload: newScene as Scene });
      for (const category of ['cast', ...allBreakdownCategories]) {
        const val = String(newScene[category] ?? '');
        if (!val.trim()) continue;
        const isCast = category === 'cast';
        const existing = (currentProject.breakdownElements || {})[category] || [];
        const existingSet = new Set(isCast ? existing.map(e => e.id) : existing.map(e => e.name.toLowerCase()));
        const items = getFieldItems(category, val);
        for (const item of items) {
          if (isCast ? !existingSet.has(item) : !existingSet.has(item.toLowerCase())) {
            dispatch({ type: 'ADD_ELEMENT', payload: { category, element: isCast ? { id: item, name: '' } : { id: item, name: item } } });
          }
        }
      }
    }
    if (needsBatch) dispatch({ type: 'BATCH_COMMIT' });
  }, [activeCell, scenes, commitEdit, COLUMNS, allBreakdownCategories, dispatch]);

  const renderCellValue = useCallback((value: string, colKey: string) => {
    return value;
  }, []);

  const renderCellEditor = useCallback((rowIndex: number, colIndex: number, value: string, colKey: string) => {
    const commit = (newVal: string) => {
      commitCellValue(rowIndex, colIndex, newVal);
      setEditCell(null);
    };
    const cancel = () => setEditCell(null);

    if (colKey === 'cast') {
      return <CastEditor cell={{ value }} onChange={c => commit(c.value)} exitEditMode={cancel} />;
    }
    if (colKey === 'set') {
      return <SetEditor cell={{ value }} onChange={c => commit(c.value)} exitEditMode={cancel} />;
    }
    if (colKey === 'intExt') {
      return <IntExtEditor cell={{ value }} onChange={c => commit(c.value)} exitEditMode={cancel} />;
    }
    if (colKey === 'dayNight') {
      return <DayNightEditor cell={{ value }} onChange={c => commit(c.value)} exitEditMode={cancel} />;
    }
    if (colKey === 'pageCount') {
      return <PageCountEditor cell={{ value }} onChange={c => commit(c.value)} exitEditMode={cancel} />;
    }
    const breakdownEditor = breakdownEditors.get(colKey);
    if (breakdownEditor) {
      return <breakdownEditor cell={{ value }} onChange={c => commit(c.value)} exitEditMode={cancel} />;
    }
    return (
      <input
        type="text"
        defaultValue={value}
        autoFocus
        style={{ width: '100%', height: '100%', border: 'none', outline: 'none', padding: IS_COARSE ? '8px 10px' : '4px 8px', fontSize, fontFamily: 'inherit', background: 'transparent' }}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          if (e.key === 'Escape') cancel();
        }}
      />
    );
  }, [CastEditor, SetEditor, IntExtEditor, DayNightEditor, PageCountEditor, breakdownEditors, commitCellValue, fontSize]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editCell) {
      if (e.key === 'Escape') { setEditCell(null); e.preventDefault(); }
      return;
    }
    if (!activeCell) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab') {
        setActiveCell({ row: 0, col: 1 });
        e.preventDefault();
      }
      return;
    }
    const { row, col } = activeCell;
    switch (e.key) {
      case 'ArrowUp':
        if (row > 0) setActiveCell({ row: row - 1, col });
        e.preventDefault();
        break;
      case 'ArrowDown':
        if (row < totalRows - 1) setActiveCell({ row: row + 1, col });
        e.preventDefault();
        break;
      case 'ArrowLeft':
        if (col > 0) setActiveCell({ row, col: col - 1 });
        e.preventDefault();
        break;
      case 'ArrowRight':
        if (col < COLUMNS.length - 1) setActiveCell({ row, col: col + 1 });
        e.preventDefault();
        break;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          if (col > 0) setActiveCell({ row, col: col - 1 });
          else if (row > 0) setActiveCell({ row: row - 1, col: COLUMNS.length - 1 });
        } else {
          if (col < COLUMNS.length - 1) setActiveCell({ row, col: col + 1 });
          else if (row < totalRows - 1) setActiveCell({ row: row + 1, col: 0 });
        }
        break;
      case 'Enter':
        if (!isCellReadOnly(row, col)) setEditCell({ row, col });
        e.preventDefault();
        break;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      addScene();
      e.preventDefault();
    }
  }, [activeCell, editCell, totalRows, COLUMNS, isCellReadOnly, addScene]);

  return (
    <div className="flex-1 flex flex-col h-full bg-white text-zinc-900 border-x border-zinc-200 overflow-hidden relative select-none">
      <MiniTab
        tabs={[
          { id: 'sheet', label: 'Sheet' },
          { id: 'elements', label: 'Element Manager' },
          { id: 'scenes', label: 'Scene Breakdown' },
        ]}
        activeTab={subTab}
        onChange={(id) => {
          scrollTops.current[subTab] = document.querySelector('.tab-scroll')?.scrollTop || 0;
          onSubTabChange(id as 'scenes' | 'elements' | 'sheet');
        }}
        rightContent={
          <>
            {subTab === 'scenes' && (
              <>
                <button onClick={addScene} className="bg-zinc-900 text-white px-3 py-1 rounded text-[11px] font-semibold hover:bg-zinc-800 transition-colors">
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
                  <DropdownItem onClick={() => { setActionsOpen(false); dispatch({type: 'SORT_SCENES'}); }} icon={<Search className="w-3.5 h-3.5" />}>
                    Sort by #
                  </DropdownItem>
                  <DropdownItem onClick={() => { setActionsOpen(false); cleanEmptyRows(); }} icon={<RotateCcw className="w-3.5 h-3.5" />}>
                    Clean Empty
                  </DropdownItem>
                  <DropdownDivider />
                  <DropdownItem onClick={() => { setActionsOpen(false); fileInputRef.current?.click(); }} icon={<FileDown className="w-3.5 h-3.5" />}>
                    Import CSV
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
                  <DropdownItem onClick={() => { setFontSize(fontSize + 3); }} keepOpen icon={<ZoomIn className="w-3.5 h-3.5" />}>
                    Bigger
                  </DropdownItem>
                  <DropdownItem onClick={() => { setFontSize(fontSize - 3); }} keepOpen icon={<ZoomOut className="w-3.5 h-3.5" />}>
                    Smaller
                  </DropdownItem>
                  <DropdownDivider />
                  <DropdownItem onClick={() => { setViewOpen(false); setFontSize(SS_FONT_SIZE_DEFAULT); }} icon={<RotateCcw className="w-3.5 h-3.5" />}>
                    Reset
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
              </>
            )}
            <div ref={el => { setPortalTarget(el); }} className={subTab === 'scenes' ? 'hidden' : 'flex items-center gap-2'} />
          </>
        }
      />
      {subTab === 'elements' ? <ElementManager initialCategory={savedCat} onCategoryChange={onCategoryChange} headerTarget={portalTarget} /> : subTab === 'sheet' ? <SceneSheet initialIndex={savedSheetIdx} onIndexChange={onSheetIdxChange} headerTarget={portalTarget} onOpenSchedule={onOpenSchedule} /> : (
        <>
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative" onContextMenu={handleCellContextMenu}>
            <div
              ref={scrollRef}
              tabIndex={0}
              className="flex-1 overflow-auto outline-none"
              style={{ opacity: readOnly ? 0.6 : 1 }}
              onKeyDown={handleKeyDown}
            >
              <div style={{ width: totalWidth, height: ROW_HEIGHT + virtualTotalHeight, position: 'relative' }}>
                {/* Sticky header row */}
                <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', height: ROW_HEIGHT, background: 'white', borderBottom: '1px solid #d4d4d8' }}>
                  <div style={{ width: ROW_INDICATOR_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 25, background: 'white', borderRight: '1px solid #e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize, fontWeight: 500, color: '#71717a', userSelect: 'none' }}>
                    #
                  </div>
                  {COLUMNS.map((col, i) => (
                    <div key={col.key} style={{ width: getColWidth(i), flexShrink: 0, position: 'relative', borderRight: '1px solid #e4e4e7', display: 'flex', alignItems: 'center', padding: '3px 8px', fontSize, fontWeight: 500, color: '#71717a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', userSelect: 'none' }}>
                      <span className="truncate">{col.label}</span>
                      <div
                        className="column-resize-handle"
                        onMouseDown={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          const startX = e.clientX;
                          const startW = getColWidth(i);
                          const handleMouseMove = (ev: MouseEvent) => {
                            const diff = ev.clientX - startX;
                            const newW = Math.max(30, startW + diff);
                            colWidths.current[i + 1] = newW;
                            setWidthVersion(v => v + 1);
                          };
                          const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                            document.body.style.cursor = '';
                            document.body.style.userSelect = '';
                          };
                          document.addEventListener('mousemove', handleMouseMove);
                          document.addEventListener('mouseup', handleMouseUp);
                          document.body.style.cursor = 'col-resize';
                          document.body.style.userSelect = 'none';
                        }}
                        style={{ position: 'absolute', top: 0, right: -3, width: 6, height: '100%', cursor: 'col-resize', zIndex: 30, background: 'transparent' }}
                      />
                    </div>
                  ))}
                </div>

                {/* Virtual rows */}
                {virtualItems.map(virtualItem => {
                  const rowIndex = virtualItem.index;
                  const isPhantom = rowIndex >= scenes.length;
                  const scene = isPhantom ? null : scenes[rowIndex];
                  const isSelected = selectionRange && rowIndex >= selectionRange.start.row && rowIndex <= selectionRange.end.row;
                  const isActive = activeCell?.row === rowIndex;

                  return (
                    <div
                      key={virtualItem.key}
                      data-row={rowIndex}
                      style={{ position: 'absolute', top: ROW_HEIGHT + virtualItem.start, height: ROW_HEIGHT, left: 0, right: 0, display: 'flex', borderBottom: '1px solid #f4f4f5', background: isSelected ? '#eff6ff' : undefined }}
                      className={!isPhantom ? 'hover:bg-zinc-50' : ''}
                    >
                      {/* Row indicator */}
                      <div
                        data-row={rowIndex}
                        style={{ width: ROW_INDICATOR_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 5, background: isSelected ? '#eff6ff' : 'white', borderRight: '1px solid #f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isPhantom ? (IS_COARSE ? 9 : 7) : (IS_COARSE ? 13 : 10), fontWeight: 500, color: '#71717a', cursor: 'pointer', userSelect: 'none' }}
                        onMouseDown={e => {
                          e.stopPropagation();
                          if (isPhantom) return;
                          setContextMenu({ x: e.clientX, y: e.clientY, row: rowIndex });
                        }}
                        onDoubleClick={e => {
                          e.preventDefault();
                          if (!isPhantom && onOpenSheet) onOpenSheet(rowIndex);
                        }}
                        onContextMenu={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!isPhantom) setContextMenu({ x: e.clientX, y: e.clientY, row: rowIndex });
                        }}
                      >
                        {isPhantom ? '' : rowIndex + 1}
                      </div>

                      {/* Data cells */}
                      {COLUMNS.map((col, colIndex) => {
                        if (colIndex === ACTIONS_COL && !isPhantom) {
                          return (
                            <div key={col.key} data-row={rowIndex} data-col={colIndex}
                              style={{ width: getColWidth(colIndex), flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', outline: activeCell?.row === rowIndex && activeCell?.col === colIndex ? '2px solid #2563eb' : undefined, outlineOffset: -2 }}
                            >
                              <Trash2
                                className={`${IS_COARSE ? 'w-5 h-5' : 'w-4 h-4'} text-red-400/60 hover:text-red-600 cursor-pointer`}
                                onMouseDown={e => { e.stopPropagation(); deleteScene(scene!.id); }}
                              />
                            </div>
                          );
                        }
                        if (colIndex === ACTIONS_COL) return <div key={col.key} style={{ width: getColWidth(colIndex), flexShrink: 0 }} />;

                        const value = scene ? String((scene as any)[col.key] ?? '') : '';
                        const isEditing = editCell?.row === rowIndex && editCell?.col === colIndex;
                        const cellReadOnly = isCellReadOnly(rowIndex, colIndex);
                        const cellActive = activeCell?.row === rowIndex && activeCell?.col === colIndex;
                        const inSelection = isInSelection(rowIndex, colIndex);

                        return (
                          <div
                            key={col.key}
                            data-row={rowIndex}
                            data-col={colIndex}
                            style={{
                              width: getColWidth(colIndex),
                              flexShrink: 0,
                              borderRight: '1px solid #f4f4f5',
                              overflow: 'hidden',
                              padding: IS_COARSE ? '8px 10px' : '4px 8px',
                              fontSize,
                              cursor: cellReadOnly ? 'default' : 'pointer',
                              outline: cellActive ? '2px solid #2563eb' : undefined,
                              outlineOffset: -2,
                              background: inSelection ? '#dbeafe' : (cellActive ? '#f0f7ff' : undefined),
                            }}
                            onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
                            onClick={e => handleCellClick(rowIndex, colIndex, e)}
                          >
                            {isEditing ? (
                              renderCellEditor(rowIndex, colIndex, value, col.key)
                            ) : (
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minHeight: IS_COARSE ? 24 : 18, display: 'flex', alignItems: 'center', color: cellReadOnly ? '#a1a1aa' : undefined }}>
                                {renderCellValue(value, col.key)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Empty state */}
                {scenes.length === 0 && !virtualItems.length && (
                  <div style={{ position: 'absolute', top: ROW_HEIGHT, left: 0, right: 0, padding: 32, textAlign: 'center', color: '#a1a1aa', fontSize }}>
                    Click "Add Scene" or type into the empty row below to get started.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Context Menu */}
      <ContextMenu open={!!contextMenu} x={contextMenu?.x ?? 0} y={contextMenu?.y ?? 0} onClose={() => setContextMenu(null)}>
        {contextMenu && contextMenu.row < scenes.length && (
          <>
            {contextMenu.col !== undefined && (
              <>
                <ContextMenuItem onClick={handleCopy} icon={<Copy className="w-3 h-3 text-zinc-400" />} disabled={!selectionRange && !activeCell}>Copy</ContextMenuItem>
                <ContextMenuItem onClick={handleCut} icon={<Scissors className="w-3 h-3 text-zinc-400" />} disabled={!selectionRange && !activeCell}>Cut</ContextMenuItem>
                <ContextMenuItem onClick={handlePaste} icon={<ClipboardPaste className="w-3 h-3 text-zinc-400" />} disabled={!activeCell}>Paste</ContextMenuItem>
                <ContextMenuItem onClick={handleClear} icon={<Trash2 className="w-3 h-3 text-zinc-400" />} disabled={!selectionRange && !activeCell}>Clear</ContextMenuItem>
                <ContextMenuDivider />
              </>
            )}
            <ContextMenuItem onClick={() => { insertSceneAt(contextMenu.row); setContextMenu(null); }} icon={<Plus className="w-3 h-3 text-zinc-400" />}>Insert Above</ContextMenuItem>
            <ContextMenuItem onClick={() => { insertSceneAt(contextMenu.row + 1); setContextMenu(null); }} icon={<ArrowDown className="w-3 h-3 text-zinc-400" />}>Insert Below</ContextMenuItem>
            <ContextMenuItem onClick={() => { duplicateSceneAt(contextMenu.row); setContextMenu(null); }} icon={<Copy className="w-3 h-3 text-zinc-400" />}>Duplicate</ContextMenuItem>
            <ContextMenuDivider />
            <ContextMenuItem onClick={() => { if (onOpenSheet) onOpenSheet(contextMenu.row); setContextMenu(null); }} icon={<Eye className="w-3 h-3 text-zinc-400" />}>Open Sheet</ContextMenuItem>
            <ContextMenuDivider />
            {selectedRows.size > 1 ? (
              <ContextMenuItem onClick={() => { deleteSelectedRows(); setContextMenu(null); }} variant="danger" icon={<Trash2 className="w-3 h-3" />}>Delete {selectedRows.size} rows</ContextMenuItem>
            ) : (
              <ContextMenuItem onClick={() => { deleteScene(scenes[contextMenu.row]?.id); setContextMenu(null); }} variant="danger" icon={<Trash2 className="w-3 h-3" />}>Delete Row</ContextMenuItem>
            )}
             {contextMenu.col !== undefined && (() => {
              const colKey = COLUMNS[contextMenu.col!]?.key;
              const isElementColumn = colKey && (colKey === 'cast' || colKey === 'set' || allBreakdownCategories.includes(colKey));
              if (!isElementColumn) return null;
              const colLabel = colKey ? (allBreakdownLabels[colKey] || COLUMNS[contextMenu.col!]?.label || colKey) : '';
              return (
                <>
                  <ContextMenuDivider />
                  <ContextMenuItem onClick={() => {
                    onCategoryChange(colKey!);
                    onSubTabChange('elements');
                    setContextMenu(null);
                  }} icon={<Eye className="w-3 h-3 text-zinc-400" />}>
                    Go to Element Manager → {colLabel}
                  </ContextMenuItem>
                </>
              );
            })()}
          </>
        )}
        {contextMenu && contextMenu.row >= scenes.length && (
          <ContextMenuItem onClick={() => { addScene(); setContextMenu(null); }} icon={<Plus className="w-3 h-3 text-zinc-400" />}>Add Scene</ContextMenuItem>
        )}
      </ContextMenu>
    </div>
  );
}
