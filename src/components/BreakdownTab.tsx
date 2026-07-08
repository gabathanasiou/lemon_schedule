import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import Spreadsheet, { CellBase, DataViewerComponent, DataEditorComponent, ColumnIndicatorComponent, EntireRowsSelection, EntireColumnsSelection, RangeSelection, Point, HeaderRowComponent, CornerIndicatorComponent } from 'react-spreadsheet';
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
  const [activeCell, setActiveCell] = useState<Point | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: Point; end: Point } | null>(null);
  const spreadsheetRef = useRef<any>(null);
  const portalTargetRef = useRef<HTMLDivElement>(null);
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
  const prevEditingEnabledRef = useRef(editingEnabled);
  const allBreakdownLabelsRef = useRef(allBreakdownLabels);
  allBreakdownLabelsRef.current = allBreakdownLabels;
  const customCategoriesRef = useRef(project.customCategories);
  customCategoriesRef.current = project.customCategories;

  // Stable row cache — reuse cell objects for unchanged scenes to prevent full-grid re-render
  const prevScenesRef = useRef<Scene[]>([]);
  const dataRef = useRef<CellBase[][]>([]);

  // Debounced edit commit — prevents store round-trip on every keystroke
  const editTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (editTimerRef.current) clearTimeout(editTimerRef.current); }, []);

  const deleteScene = useCallback((id: string) => {
    dispatch({ type: 'DELETE_SCENE', payload: id });
  }, [dispatch]);
  const deleteSceneRef = useRef(deleteScene);
  deleteSceneRef.current = deleteScene;

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

  const DeleteViewer: DataViewerComponent<CellBase<string>> = useCallback(({ row }) => {
    const scene = scenesRef.current[row];
    if (!scene) return null;
    return (
      <div
        className={`flex items-center justify-center h-full w-full cursor-pointer hover:bg-red-50 transition-colors ${IS_COARSE ? 'px-2' : ''}`}
        onMouseDown={e => { e.stopPropagation(); deleteSceneRef.current(scene.id); }}
      >
        <Trash2 className={`text-red-400/60 hover:text-red-600 transition-colors ${IS_COARSE ? 'w-5 h-5' : 'w-4 h-4'}`} />
      </div>
    );
  }, []);

  const CastEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => (
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

  const PageCountEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
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

  const SetEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
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

  const IntExtEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => (
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

  const DayNightEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => (
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
    const map = new Map<string, DataEditorComponent<CellBase<string>>>();
    for (const key of allBreakdownCategories) {
      const Editor: DataEditorComponent<CellBase<string>> = ({ cell, onChange, exitEditMode }) => {
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

  const DEFAULT_WIDTHS = IS_COARSE
    ? [44, 90, 80, 80, 80, 180, 90, 300, 120, 200, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]
    : [28, 60, 80, 80, 80, 180, 90, 300, 120, 200, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
  const colWidths = useRef<number[]>([...DEFAULT_WIDTHS]);
  const [widthVersion, setWidthVersion] = useState(0);

  const resizeRef = useRef<{ col: number; startX: number; startW: number } | null>(null);

  const CustomHeaderRow: HeaderRowComponent = ({ children, ...rest }) => (
    <tr {...rest} className="Spreadsheet__header-row">{children}</tr>
  );

  const CustomCornerIndicator: CornerIndicatorComponent = useCallback(({ selected, onSelect }) => (
    <th
      className={`Spreadsheet__header${selected ? ' Spreadsheet__header--selected' : ''}`}
      onClick={onSelect}
      tabIndex={0}
    >
      <div className="Spreadsheet__header-label">Sheet</div>
    </th>
  ), []);

  const CustomColIndicator: ColumnIndicatorComponent = useCallback(({ column, label, selected, onSelect }) => {
    const width = colWidths.current[column] || DEFAULT_WIDTHS[column] || 100;
    const isResizing = resizeRef.current?.col === column;
    return (
      <th
        className={`Spreadsheet__header${selected ? ' Spreadsheet__header--selected' : ''}`}
        style={{ width, maxWidth: width, minWidth: width, overflow: 'visible' }}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('.column-resize-handle')) return;
          onSelect(column, e.shiftKey);
        }}
      >
        <div className="Spreadsheet__header-label">{label !== null ? label : ''}</div>
        <div
          className="column-resize-handle"
          onMouseDown={e => {
            e.preventDefault();
            e.stopPropagation();
            resizeRef.current = { col: column, startX: e.clientX, startW: width };
            const handleMouseMove = (ev: MouseEvent) => {
              if (!resizeRef.current) return;
              const diff = ev.clientX - resizeRef.current.startX;
              const newW = Math.max(30, resizeRef.current.startW + diff);
              colWidths.current[resizeRef.current.col] = newW;
              setWidthVersion(v => v + 1);
            };
            const handleMouseUp = () => {
              resizeRef.current = null;
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
        />
      </th>
    );
  }, [widthVersion]);

  const widthStyle = useMemo(() => {
    const cols = COLUMNS.map((_, i) => {
      const w = colWidths.current[i] || DEFAULT_WIDTHS[i] || 100;
      return `.Spreadsheet th:nth-child(${i + 1}), .Spreadsheet td:nth-child(${i + 1}) { width: ${w}px; min-width: ${w}px; max-width: ${w}px; }`;
    }).join('\n');
    return cols;
  }, [widthVersion, COLUMNS]);

  const data = useMemo((): CellBase[][] => {
    const prevData = dataRef.current;
    const prevScenes = prevScenesRef.current;
    const rows: CellBase[][] = [];

    const rowFromScene = (scene: Scene): CellBase[] => [
      { value: '', readOnly: true, ...(!readOnly && { DataViewer: DeleteViewer }) },
      { value: scene.sceneNumber, ...(editingEnabled ? {} : { readOnly: true }) },
      { value: scene.pageCount, ...(editingEnabled ? { DataEditor: PageCountEditor } : { readOnly: true }) },
      { value: scene.scriptDay, ...(editingEnabled ? {} : { readOnly: true }) },
      { value: scene.intExt, ...(!readOnly && { DataEditor: IntExtEditor }) },
      { value: scene.set, ...(!readOnly && { DataEditor: SetEditor }) },
      { value: scene.dayNight, ...(!readOnly && { DataEditor: DayNightEditor }) },
      { value: scene.description, ...(editingEnabled ? {} : { readOnly: true }) },
      { value: scene.cast, ...(!readOnly && { DataEditor: CastEditor }) },
      { value: scene.notes, ...(editingEnabled ? {} : { readOnly: true }) },
      ...allBreakdownCategories.filter(k => k !== 'set').map(key => ({ value: (scene as any)[key] || '', ...(!readOnly && { DataEditor: breakdownEditors.get(key) }) })),
    ];

    for (let i = 0; i < scenes.length; i++) {
      if (!readOnly && scenes[i] === prevScenes[i] && prevData[i] && editingEnabled === prevEditingEnabledRef.current) {
        rows[i] = prevData[i];
      } else {
        rows[i] = rowFromScene(scenes[i]);
      }
    }

    rows.push(COLUMNS.map((c, i) => {
      if (i === ACTIONS_COL) return { value: '', readOnly: true };
      if (i === 2) return { value: '', ...(editingEnabled ? { DataEditor: PageCountEditor } : { readOnly: true }) };
      if (i === 4) return { value: '', ...(!readOnly && { DataEditor: IntExtEditor }) };
      if (i === 5) return { value: '', ...(!readOnly && { DataEditor: SetEditor }) };
      if (i === 6) return { value: '', ...(!readOnly && { DataEditor: DayNightEditor }) };
      if (i === CAST_COL) return { value: '', ...(!readOnly && { DataEditor: CastEditor }) };
      if (allBreakdownCategories.includes(c.key)) return { value: '', ...(!readOnly && { DataEditor: breakdownEditors.get(c.key)! }) };
      return { value: '', ...(editingEnabled ? {} : { readOnly: true }) };
    }));

    prevEditingEnabledRef.current = editingEnabled;
    prevScenesRef.current = scenes;
    dataRef.current = rows;
    return rows;
  }, [scenes, IntExtEditor, DayNightEditor, DeleteViewer, PageCountEditor, SetEditor, CastEditor, breakdownEditors, readOnly, editingEnabled]);

  const ROW_INDICATOR_W = IS_COARSE ? 80 : 70;

  const RowIndicator: React.FC<{ row: number; label?: React.ReactNode; selected: boolean; onSelect: (row: number, extend: boolean) => void }> = useCallback(({ row, selected, onSelect }) => {
    const w = ROW_INDICATOR_W;
    return (
    <td
      className={`Spreadsheet__header text-center cursor-pointer select-none transition-colors ${selected ? 'bg-blue-50' : ''}`}
      style={{ width: w, minWidth: w, maxWidth: w, fontSize: row < 0 ? (IS_COARSE ? 9 : 7) : (IS_COARSE ? 13 : 10), fontWeight: 500 }}
      onMouseDown={(e) => {
        if (row < 0) return;
        onSelect(row, e.shiftKey);
        setContextMenu({ x: e.clientX, y: e.clientY, row });
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        if (row >= 0 && onOpenSheet) onOpenSheet(row);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (row >= 0) setContextMenu({ x: e.clientX, y: e.clientY, row });
      }}
    >{row < 0 ? '#' : row + 1}</td>
    );
  }, [onOpenSheet, setContextMenu]);

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

  const handleChange = useCallback((newData: CellBase[][]) => {
    const currentScenes = scenesRef.current;
    const currentProject = projectRef.current;
    const phantomIndex = currentScenes.length;

    // Check if phantom row has content (user adding a new scene)
    const phantomRow = newData[phantomIndex];
    const phantomHasContent = phantomRow?.some((c, i) => {
      if (i === ACTIONS_COL) return false;
      const v = c?.value;
      return v !== undefined && v !== null && String(v).trim() !== '';
    });

    // Check for pasted rows beyond the phantom row
    const extraCount = newData.length - (phantomIndex + 1);

    if (phantomHasContent || extraCount > 0) {
      if (editTimerRef.current) { clearTimeout(editTimerRef.current); editTimerRef.current = null; }
      dispatch({ type: 'BATCH_START' });
      const rowsToProcess = newData.slice(phantomIndex);
      for (const rowData of rowsToProcess) {
        if (!rowData) continue;
        const hasContent = rowData.some((c, i) => {
          if (i === ACTIONS_COL) return false;
          const v = c?.value;
          return v !== undefined && v !== null && String(v).trim() !== '';
        });
        if (!hasContent) continue;
        const newScene: Partial<Record<string, any>> = { shootDay: null };
        for (let col = 0; col < COLUMNS.length; col++) {
          if (col === ACTIONS_COL) continue;
          newScene[COLUMNS[col].key] = rowData[col]?.value ?? '';
        }
        newScene.id = generateUUID();
        const decimal = parsePageCount(newScene.pageCount || '0');
        newScene.pageCount = formatPageCount(decimal);
        newScene.pageCountDecimal = decimal;
        newScene.scriptDay = (newScene.scriptDay || '').replace(/[^0-9]/g, '');
        newScene.set = String(newScene.set || '').toUpperCase();
        dispatch({ type: 'ADD_SCENE', payload: newScene as Scene });
        const entityCategories = ['cast', ...allBreakdownCategories];
        for (const category of entityCategories) {
          const val = String(newScene[category] ?? '');
          if (!val.trim()) continue;
          const isCast = category === 'cast';
          const existing = (currentProject.breakdownElements || {})[category] || [];
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
      return;
    }

    // Normal single-cell edit: debounce store dispatch
    if (editTimerRef.current) clearTimeout(editTimerRef.current);
    for (let row = 0; row < Math.min(currentScenes.length, newData.length); row++) {
      for (let col = 0; col < COLUMNS.length; col++) {
        if (col === ACTIONS_COL) continue;
        const colDef = COLUMNS[col];
        const oldVal = String((currentScenes as any)[row][colDef.key] ?? '');
        const newVal = String(newData[row]?.[col]?.value ?? '');
        if (newVal !== oldVal) {
          const sceneId = currentScenes[row].id;
          const key = colDef.key;
          editTimerRef.current = setTimeout(() => commitEdit(sceneId, key, newVal), 300);
          return;
        }
      }
    }
  }, [dispatch, COLUMNS, allBreakdownCategories, commitEdit]);

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
        cols.push(data[r]?.[c]?.value ?? '');
      }
      rows.push(cols.join('\t'));
    }
    await navigator.clipboard.writeText(rows.join('\n'));
    setContextMenu(null);
  }, [selectionRange, activeCell, data]);

  const handleCut = useCallback(async () => {
    const range = selectionRange ?? (activeCell ? { start: activeCell, end: activeCell } : null);
    if (!range) return;
    const { start, end } = range;
    const rows: string[] = [];
    for (let r = start.row; r <= end.row; r++) {
      const cols: string[] = [];
      for (let c = start.column; c <= end.column; c++) {
        cols.push(data[r]?.[c]?.value ?? '');
      }
      rows.push(cols.join('\t'));
    }
    await navigator.clipboard.writeText(rows.join('\n'));
    const newData = data.map(row => row.map(cell => ({ ...cell })));
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.column; c <= end.column; c++) {
        newData[r][c] = { ...newData[r][c], value: '' };
      }
    }
    handleChange(newData);
    setContextMenu(null);
  }, [selectionRange, activeCell, data, handleChange]);

  const handlePaste = useCallback(async () => {
    if (!activeCell) return;
    const text = await navigator.clipboard.readText();
    if (!text) return;
    const pastedRows = text.split(/\r\n|\n|\r/);
    const pastedData = pastedRows.map(r => r.split('\t'));
    const newData = data.map(row => row.map(cell => ({ ...cell })));
    for (let r = 0; r < pastedData.length; r++) {
      for (let c = 0; c < pastedData[r].length; c++) {
        const targetR = activeCell.row + r;
        const targetC = activeCell.column + c;
        if (targetR < newData.length && targetC < newData[targetR].length) {
          newData[targetR][targetC] = { ...newData[targetR][targetC], value: pastedData[r][c] };
        }
      }
    }
    handleChange(newData);
    setContextMenu(null);
  }, [activeCell, data, handleChange]);

  const handleClear = useCallback(() => {
    const range = selectionRange ?? (activeCell ? { start: activeCell, end: activeCell } : null);
    if (!range) return;
    const { start, end } = range;
    const newData = data.map(row => row.map(cell => ({ ...cell })));
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.column; c <= end.column; c++) {
        if (c === 0) continue;
        newData[r][c] = { ...newData[r][c], value: '' };
      }
    }
    handleChange(newData);
    setContextMenu(null);
  }, [selectionRange, activeCell, data, handleChange]);

  const handleCellContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const td = (e.target as HTMLElement).closest('td');
    let row = -1;
    let col = -1;
    if (td) {
      const tr = td.parentElement as HTMLTableRowElement;
      const tbody = tr.parentElement as HTMLTableSectionElement;
      if (tbody && tbody.parentElement) {
        const trs = Array.from(tbody.querySelectorAll(':scope > tr'));
        row = trs.indexOf(tr);
        const tds = Array.from(tr.querySelectorAll(':scope > td, :scope > th'));
        col = tds.indexOf(td) - 1;
      }
    } else if (activeCell) {
      row = activeCell.row;
      col = activeCell.column;
    }
    if (row < 0) return;
    setContextMenu(null);
    setContextMenu({ x: e.clientX, y: e.clientY, row, col: col >= 0 ? col : undefined });
  }, [activeCell]);

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
            <div ref={el => { portalTargetRef.current = el; setPortalTarget(el); }} className={subTab === 'scenes' ? 'hidden' : 'flex items-center gap-2'} />
          </>
        }
      />
      {subTab === 'elements' ? <ElementManager initialCategory={savedCat} onCategoryChange={onCategoryChange} headerTarget={portalTarget} /> : subTab === 'sheet' ? <SceneSheet initialIndex={savedSheetIdx} onIndexChange={onSheetIdxChange} headerTarget={portalTarget} onOpenSchedule={onOpenSchedule} /> : (
        <>
      <div className="flex-1 overflow-auto bg-white pb-40">
      <div className="min-w-[800px]">
             <style>{`
              .Spreadsheet {
                border-collapse: separate;
                border-spacing: 0;
                width: 100%;
                font-family: inherit;
                font-size: ${fontSize}px;
              }
              .Spreadsheet__table {
                border-collapse: separate;
                border-spacing: 0;
                width: 100%;
              }
              .Spreadsheet__header-row th {
                position: sticky;
                top: 0;
                z-index: 10;
                padding: 0;
                font-size: ${fontSize}px;
               font-weight: 500;
               text-align: left;
               border-right: 1px solid #e4e4e7;
               border-bottom: 1px solid #d4d4d8;
               color: #71717a;
               white-space: nowrap;
                user-select: none;
                background: white;
              }
              .Spreadsheet__header-row th:first-child {
                position: sticky;
                top: 0;
                left: 0;
                z-index: 15;
                width: ${ROW_INDICATOR_W}px;
                min-width: ${ROW_INDICATOR_W}px;
                max-width: ${ROW_INDICATOR_W}px;
              }
              tbody tr td.Spreadsheet__header {
                position: sticky;
                left: 0;
                z-index: 5;
                background: white;
              }
              th.Spreadsheet__header--selected {
                background: #dbeafe;
                color: #1e40af;
              }
              .Spreadsheet__header-label {
                padding: 3px 8px;
               overflow: hidden;
               text-overflow: ellipsis;
             }
             .Spreadsheet__cell {
                border: none;
                border-right: 1px solid #f4f4f5;
                border-bottom: 1px solid #f4f4f5;
                padding: 0;
                height: ${Math.round(fontSize * 2.55)}px;
                overflow: hidden;
              }
             .Spreadsheet__cell--selected {
               outline: 2px solid #2563eb;
               outline-offset: -2px;
               z-index: 2;
               position: relative;
             }
              .Spreadsheet__cell--active {
                outline: 2px solid #2563eb;
                outline-offset: -2px;
                z-index: 2;
                position: relative;
              }
               .Spreadsheet__floating-rect--selected {
                 z-index: 15;
               }
             .Spreadsheet__cell input {
                width: 100%;
                height: 100%;
                border: none;
                outline: none;
                padding: 4px 8px;
                font-size: ${fontSize}px;
                font-family: inherit;
                background: transparent;
              }
              .Spreadsheet__cell .Spreadsheet__data-viewer {
                padding: 4px 8px;
                min-height: 28px;
                display: flex;
                align-items: center;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: ${fontSize}px;
              }
             .Spreadsheet__data-editor {
               width: 100%;
               height: 100%;
             }
              tr:hover .Spreadsheet__cell {
                background: #fafafa;
              }
              tr:hover .Spreadsheet__cell--selected,
              tr:hover .Spreadsheet__cell--active {
                background: transparent;
              }
              tr:hover td.Spreadsheet__header {
                background: #fafafa;
              }
             .Spreadsheet__cell--readonly {
               background: white;
             }
             .column-resize-handle {
               position: absolute;
               top: 0;
               right: -3px;
               width: 6px;
               height: 100%;
               cursor: col-resize;
               z-index: 20;
               background: transparent;
             }
             .column-resize-handle:hover,
             .column-resize-handle:active {
               background: rgba(37, 99, 235, 0.3);
             }
                ${IS_COARSE ? `
               .Spreadsheet__cell { height: ${Math.round(fontSize * 3.2)}px; }
               .Spreadsheet__cell input { padding: 8px 10px; font-size: ${fontSize}px; }
               .Spreadsheet__cell .Spreadsheet__data-viewer { padding: 8px 10px; min-height: ${Math.round(fontSize * 3.2)}px; font-size: ${fontSize}px; }
               .Spreadsheet__header-label { padding: 6px 10px; }
               .Spreadsheet__data-editor .uppercase { font-size: ${fontSize}px; }
              ` : ''}
               ${widthStyle}
             `}</style>
            <div onContextMenu={handleCellContextMenu} className={readOnly ? 'opacity-60' : ''}>
             <Spreadsheet
              ref={spreadsheetRef}
              data={data}
              onChange={handleChange}
              columnLabels={COLUMNS.map(c => c.label)}
              RowIndicator={RowIndicator}
              ColumnIndicator={CustomColIndicator}
              HeaderRow={CustomHeaderRow}
              CornerIndicator={CustomCornerIndicator}
             onSelect={(sel) => {
               if (sel instanceof EntireRowsSelection) {
                 const range = sel.toRange(data);
                 if (range) {
                   const rows = new Set<number>();
                   for (let r = range.start.row; r <= range.end.row; r++) rows.add(r);
                   setSelectedRows(rows);
                   setSelectionRange(range);
                 }
               } else if (sel instanceof EntireColumnsSelection) {
                 const range = sel.toRange(data);
                 if (range) {
                   const rows = new Set<number>();
                   for (let r = range.start.row; r <= range.end.row; r++) rows.add(r);
                   setSelectedRows(rows);
                   setSelectionRange(range);
                 }
               } else if (sel instanceof RangeSelection) {
                 const rows = new Set<number>();
                 for (let r = sel.range.start.row; r <= sel.range.end.row; r++) rows.add(r);
                 setSelectedRows(rows);
                 setSelectionRange(sel.range);
               } else {
                 setSelectedRows(new Set());
                 setSelectionRange(null);
               }
             }}
              onActivate={(point) => setActiveCell(point)}
             onKeyDown={e => {
               if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                 e.preventDefault();
                 addScene();
               }
             }}
           />
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
