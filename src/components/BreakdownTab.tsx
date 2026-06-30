import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import Spreadsheet, { CellBase, DataViewerComponent, DataEditorComponent, ColumnIndicatorComponent, EntireRowsSelection, EntireColumnsSelection, RangeSelection, Point } from 'react-spreadsheet';
import { useProject, DEFAULT_CATEGORY_LABELS } from '../store';
import { Scene, IntExt, DayNight } from '../types';
import { generateUUID, formatPageCount, parsePageCount } from '../lib/utils';
import { Trash2, Copy, Scissors, ClipboardPaste, Plus, ArrowDown, Eye } from 'lucide-react';
import Papa from 'papaparse';
import { ElementManager } from './ElementManager';
import { SceneSheet } from './SceneSheet';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import { EntityDropdown } from './EntityDropdown';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import MiniTab from './MiniTab';
import { INT_EXT_OPTIONS, DAY_NIGHT_OPTIONS } from '../lib/ribbonUtils';
import { getFieldItems, isMultiValue } from '../lib/categories';

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
  const { state, dispatch } = useProject();
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

  const DeleteViewer: DataViewerComponent<CellBase<string>> = useCallback(({ row }) => {
    const scene = scenes[row];
    if (!scene) return null;
    return (
      <div
        className="flex items-center justify-center h-full w-full cursor-pointer hover:bg-red-50 transition-colors"
        onMouseDown={e => { e.stopPropagation(); deleteScene(scene.id); }}
      >
        <Trash2 className="w-4 h-4 text-red-400/60 hover:text-red-600 transition-colors" />
      </div>
    );
  }, [scenes, deleteScene]);

  const CastEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
    const committedRef = useRef(false);
    const handleChange = (val: string) => {
      if (committedRef.current) return;
      committedRef.current = true;
      onChange({ value: val });
      exitEditMode();
    };
    return (
      <EntityDropdown
        value={cell?.value || ''}
        onChange={handleChange}
        positioning="fixed"
        defaultOpen
        autoFocus
        mode="multi"
        placeholder="Cast"
        className="text-xs"
        displayMode="id"
        renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '—'}</span></>}
      />
    );
  }, []);

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

  const SetEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => {
    const setItems = useMemo(() => {
      const sets = new Map<string, string>();
      for (const s of scenes) { const v = s.set.trim().toUpperCase(); if (v) sets.set(v, v); }
      for (const e of project.breakdownElements?.['set'] || []) { const v = e.name.toUpperCase(); if (v) sets.set(v, v); }
      return [...sets.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id));
    }, [scenes, project.breakdownElements]);
    return (
      <EntityDropdown
        value={cell?.value || ''}
        onChange={val => { onChange({ value: val }); exitEditMode(); }}
        items={setItems}
        mode="single"
        positioning="relative"
        defaultOpen
        autoFocus
        className="text-xs"
      />
    );
  }, [scenes, project.breakdownElements]);

  const IntExtEditor: DataEditorComponent<CellBase<string>> = useCallback(({ cell, onChange, exitEditMode }) => (
    <AutocompleteDropdown
      value={cell?.value || ''}
      onChange={val => { onChange({ value: val }); exitEditMode(); }}
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
      onChange={val => { onChange({ value: val }); exitEditMode(); }}
      options={DAY_NIGHT_OPTIONS}
      positioning="relative"
      defaultOpen
      autoFocus
      showAll
    />
  ), []);

  const breakdownEditors = useMemo(() => {
    const map = new Map<string, DataEditorComponent<CellBase<string>>>();
    for (const key of allBreakdownCategories) {
      const sceneValues: string[] = [...new Set(scenes.map(s => (s as any)[key] as string).filter(Boolean).flatMap(v => getFieldItems(key, v)) as string[])];
      const storedElements: { id: string; name: string }[] = (project as any).breakdownElements?.[key] || [];
      const nameMap = new Map<string, { id: string; name: string }>(storedElements.map(e => [e.name.toLowerCase(), e]));
      const seen = new Set<string>();
      const items: { id: string; name: string }[] = [];
      for (const v of sceneValues) {
        const lc = v.toLowerCase();
        const matched = nameMap.get(lc);
        if (matched) {
          const key = matched.id || matched.name;
          if (!seen.has(key)) { items.push({ id: matched.id, name: matched.name }); seen.add(key); }
        } else {
          if (!seen.has(v)) { items.push({ id: v, name: v }); seen.add(v); }
        }
      }
      for (const e of storedElements) {
        const key = e.id || e.name;
        if (!seen.has(key)) { items.push({ id: e.id, name: e.name }); seen.add(key); }
      }
      const Editor: DataEditorComponent<CellBase<string>> = ({ cell, onChange, exitEditMode }) => {
        const committedRef = useRef(false);
        return (
          <EntityDropdown
            value={cell?.value || ''}
            onChange={val => {
              if (committedRef.current) return;
              committedRef.current = true;
              onChange({ value: val });
              exitEditMode();
            }}
            items={items}
            placeholder={allBreakdownLabels[key]}
            positioning="relative"
            defaultOpen
            autoFocus
            mode={isMultiValue(key, project.customCategories) ? 'multi' : 'single'}
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
  }, [scenes, project.breakdownElements]);

  const DEFAULT_WIDTHS = [28, 60, 80, 80, 80, 180, 90, 300, 120, 200, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
  const colWidths = useRef<number[]>([...DEFAULT_WIDTHS]);
  const [widthVersion, setWidthVersion] = useState(0);

  const resizeRef = useRef<{ col: number; startX: number; startW: number } | null>(null);

  const CustomColIndicator: ColumnIndicatorComponent = useCallback(({ column, label, selected, onSelect }) => {
    const width = colWidths.current[column] || DEFAULT_WIDTHS[column] || 100;
    const isResizing = resizeRef.current?.col === column;
    return (
      <th
        className={`Spreadsheet__header${selected ? ' Spreadsheet__header--selected' : ''}`}
        style={{ width, maxWidth: width, minWidth: width, position: 'relative', overflow: 'visible' }}
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
    const rows = scenes.map(scene => [
      { value: '', readOnly: true, DataViewer: DeleteViewer },
      { value: scene.sceneNumber },
      { value: scene.pageCount, DataEditor: PageCountEditor },
      { value: scene.scriptDay },
      { value: scene.intExt, DataEditor: IntExtEditor },
      { value: scene.set, DataEditor: SetEditor },
      { value: scene.dayNight, DataEditor: DayNightEditor },
      { value: scene.description },
      { value: scene.cast, DataEditor: CastEditor },
      { value: scene.notes },
      ...allBreakdownCategories.filter(k => k !== 'set').map(key => ({ value: (scene as any)[key] || '', DataEditor: breakdownEditors.get(key) })),
    ]);
    rows.push(COLUMNS.map((c, i) => {
      if (i === ACTIONS_COL) return { value: '', readOnly: true };
      if (i === 2) return { value: '', DataEditor: PageCountEditor };
      if (i === 4) return { value: '', DataEditor: IntExtEditor };
      if (i === 5) return { value: '', DataEditor: SetEditor };
      if (i === 6) return { value: '', DataEditor: DayNightEditor };
      if (i === CAST_COL) return { value: '', DataEditor: CastEditor };
      if (allBreakdownCategories.includes(c.key)) return { value: '', DataEditor: breakdownEditors.get(c.key)! };
      return { value: '' };
    }));
    return rows;
  }, [scenes, IntExtEditor, DayNightEditor, DeleteViewer, PageCountEditor, SetEditor, CastEditor, breakdownEditors]);

  const RowIndicator: React.FC<{ row: number; label?: React.ReactNode; selected: boolean; onSelect: (row: number, extend: boolean) => void }> = useCallback(({ row, selected, onSelect }) => (
    <td
      className={`Spreadsheet__header text-center cursor-pointer select-none transition-colors ${selected ? 'bg-blue-50' : ''}`}
      style={{ width: 17, minWidth: 17, maxWidth: 17, fontSize: row < 0 ? 7 : 10, fontWeight: 500 }}
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
  ), [onOpenSheet, setContextMenu]);

  const handleChange = useCallback((newData: CellBase[][]) => {
    const phantomIndex = scenes.length;

    // Process all pasted/extra rows beyond existing scenes
    let createdAny = false;
    const hasPastedRows = newData.length > phantomIndex;
    if (hasPastedRows) dispatch({ type: 'BATCH_START' });
    for (let row = phantomIndex; row < newData.length; row++) {
      const row_data = newData[row];
      if (!row_data) continue;
      const hasContent = row_data.some((c, i) => {
        if (i === ACTIONS_COL) return false;
        const v = c?.value;
        return v !== undefined && v !== null && String(v).trim() !== '';
      });
      if (!hasContent) continue;
      const newScene: Partial<Record<string, any>> = { shootDay: null };
      for (let col = 0; col < COLUMNS.length; col++) {
        if (col === ACTIONS_COL) continue;
        const val = row_data[col]?.value ?? '';
        newScene[COLUMNS[col].key] = val;
      }
      newScene.id = generateUUID();
      const decimal = parsePageCount(newScene.pageCount || '1');
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
      createdAny = true;
    }

    if (createdAny) {
      dispatch({ type: 'BATCH_COMMIT' });
      return;
    }
    if (hasPastedRows) dispatch({ type: 'BATCH_COMMIT' });

    for (let row = 0; row < Math.min(scenes.length, newData.length); row++) {
      for (let col = 0; col < COLUMNS.length; col++) {
        if (col === ACTIONS_COL) continue;
        const colDef = COLUMNS[col];
        const oldVal = String((scenes as any)[row][colDef.key] ?? '');
        const newVal = String(newData[row]?.[col]?.value ?? '');
          if (newVal !== oldVal) {
            const updates: any = { [colDef.key]: newVal };
            if (colDef.key === 'pageCount') {
              const decimal = parsePageCount(newVal);
              updates.pageCountDecimal = decimal;
              updates.pageCount = formatPageCount(decimal);
            }
            if (colDef.key === 'scriptDay') {
              updates.scriptDay = newVal.replace(/[^0-9]/g, '');
            }
            if (colDef.key === 'set') {
              updates.set = newVal.toUpperCase();
            }
            if (colDef.key === 'intExt') {
              const match = INT_EXT_OPTIONS.find(opt => opt.toLowerCase() === newVal.toLowerCase());
              if (match) updates.intExt = match;
            }
            if (colDef.key === 'dayNight') {
              const match = DAY_NIGHT_OPTIONS.find(opt => opt.toLowerCase() === newVal.toLowerCase());
              if (match) updates.dayNight = match;
            }
            if (colDef.key === 'cast' || allBreakdownCategories.includes(colDef.key)) {
              const isCast = colDef.key === 'cast';
              const existing = (project.breakdownElements || {})[colDef.key] || [];
              const existingSet = new Set(
                isCast ? existing.map(e => e.id) : existing.map(e => e.name.toLowerCase())
              );
              const newItems = getFieldItems(colDef.key, newVal)
                .filter(v => isCast ? !existingSet.has(v) : !existingSet.has(v.toLowerCase()));
              for (const item of newItems) {
                dispatch({ type: 'ADD_ELEMENT', payload: {
                  category: colDef.key,
                  element: isCast ? { id: item, name: '' } : { id: item, name: item }
                } });
              }
            }
            dispatch({ type: 'UPDATE_SCENE', payload: { id: scenes[row].id, ...updates } });
        }
      }
    }
  }, [scenes, dispatch, project, COLUMNS, allBreakdownCategories]);

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
          pageCount: formatPageCount(parsePageCount(row['Pages'] || '1')),
          pageCountDecimal: parsePageCount(row['Pages'] || '1'),
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

  const totalPagesDecimal = scenes.reduce((sum, s) => sum + (s.pageCountDecimal || 0), 0);

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
                <button onClick={() => dispatch({type: 'SORT_SCENES'})} className="bg-white border border-zinc-300 px-2.5 py-1 text-zinc-600 rounded text-[11px] font-medium hover:bg-zinc-50 transition-colors">
                  Sort by #
                </button>
                <button onClick={cleanEmptyRows} className="bg-white border border-zinc-300 px-2.5 py-1 text-zinc-500 rounded text-[11px] hover:bg-zinc-50 transition-colors">
                  Clean Empty
                </button>
                <div className="relative">
                  <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImport} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} className="bg-white border border-zinc-300 px-2.5 py-1 text-zinc-600 rounded text-[11px] hover:bg-zinc-50 transition-colors">
                    Import CSV
                  </button>
                </div>
                <div className="w-px h-5 bg-zinc-200" />
                <div className="flex items-center gap-3 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400 font-medium uppercase tracking-wider text-[10px]">Scenes</span>
                    <span className="text-zinc-800 font-semibold">{scenes.length}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400 font-medium uppercase tracking-wider text-[10px]">Pages</span>
                    <span className="text-zinc-800 font-semibold">{formatPageCount(totalPagesDecimal)} <span className="text-zinc-400 font-normal">({totalPagesDecimal.toFixed(3)})</span></span>
                  </div>
                </div>
              </>
            )}
            <div ref={el => { portalTargetRef.current = el; setPortalTarget(el); }} className={subTab === 'scenes' ? 'hidden' : 'flex items-center gap-2'} />
          </>
        }
      />
      {subTab === 'elements' ? <ElementManager initialCategory={savedCat} onCategoryChange={onCategoryChange} headerTarget={portalTarget} /> : subTab === 'sheet' ? <SceneSheet initialIndex={savedSheetIdx} onIndexChange={onSheetIdxChange} headerTarget={portalTarget} onOpenSchedule={onOpenSchedule} /> : (
        <>
      <div className="flex-1 overflow-auto bg-white">
      <div className="min-w-[800px]">
            <style>{`
             .Spreadsheet {
               border-collapse: separate;
               border-spacing: 0;
               width: 100%;
               font-family: inherit;
               font-size: 11px;
             }
             .Spreadsheet__table {
               border-collapse: separate;
               border-spacing: 0;
               width: 100%;
             }
             .Spreadsheet__header-row {
               position: sticky;
               top: 0;
               z-index: 10;
             }
             .Spreadsheet__header-row th {
               padding: 0;
               font-size: 11px;
               font-weight: 500;
               text-align: left;
               border-right: 1px solid #e4e4e7;
               border-bottom: 1px solid #d4d4d8;
               color: #71717a;
               white-space: nowrap;
               position: relative;
               user-select: none;
                background: #fafafa;
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
               height: 28px;
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
               font-size: 11px;
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
               font-size: 11px;
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
              ${widthStyle}
            `}</style>
           <div onContextMenu={handleCellContextMenu}>
           <Spreadsheet
             ref={spreadsheetRef}
             data={data}
             onChange={handleChange}
             columnLabels={COLUMNS.map(c => c.label)}
             RowIndicator={RowIndicator}
             ColumnIndicator={CustomColIndicator}
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
