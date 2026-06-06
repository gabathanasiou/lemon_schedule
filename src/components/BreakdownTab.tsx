import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import Spreadsheet, { CellBase, DataViewerComponent, DataEditorComponent, ColumnIndicatorComponent, EntireRowsSelection, RangeSelection } from 'react-spreadsheet';
import { useProject } from '../store';
import { Scene, IntExt, DayNight } from '../types';
import { generateUUID, formatPageCount, parsePageCount } from '../lib/utils';
import { Trash2, Copy, Scissors, ClipboardPaste, Plus, ArrowDown, Eye } from 'lucide-react';
import Papa from 'papaparse';
import { ElementManager } from './ElementManager';
import { SceneSheet } from './SceneSheet';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import { EntityDropdown } from './EntityDropdown';
import { AutocompleteDropdown } from './AutocompleteDropdown';

const BREAKDOWN_CATEGORIES = [
  'set', 'extras', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup',
  'sfx', 'vfx', 'sound', 'music', 'animals', 'weapons', 'greenery', 'artDept',
];
const BREAKDOWN_LABELS: Record<string, string> = {
  set: 'Set', extras: 'Supporting Artists', stunts: 'Stunts', vehicles: 'Vehicles',
  props: 'Props', wardrobe: 'Wardrobe', makeup: 'Makeup & Hair',
  sfx: 'SFX', vfx: 'VFX', sound: 'Sound', music: 'Music',
  animals: 'Animals', weapons: 'Weapons', greenery: 'Greenery',
  artDept: 'Art Dept',
};

const COLUMNS = [
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
  ...BREAKDOWN_CATEGORIES.filter(k => k !== 'set').map(key => ({ key, label: BREAKDOWN_LABELS[key] })),
];

const ACTIONS_COL = 0;
const INT_EXT_COL = 3;
const DAY_NIGHT_COL = 5;
const CAST_COL = 8;

const INT_EXT_OPTIONS: IntExt[] = ['INT', 'EXT', 'INT/EXT'];
const DAY_NIGHT_OPTIONS: DayNight[] = ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'DAWN', 'DUSK'];

export function BreakdownTab({ subTab: externalSubTab, onSubTabChange, savedCat, onCategoryChange, savedSheetIdx, onSheetIdxChange, onOpenSheet }: {
  subTab: 'scenes' | 'elements' | 'sheet';
  onSubTabChange: (t: 'scenes' | 'elements' | 'sheet') => void;
  savedCat: string;
  onCategoryChange: (c: string) => void;
  savedSheetIdx: number;
  onSheetIdxChange: (i: number) => void;
  onOpenSheet?: (rowIndex: number) => void;
}) {
  const { state, dispatch } = useProject();
  const project = state.present;
  const scenes = project.scenes;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subTab = externalSubTab;
  const scrollTops = useRef<Record<string, number>>({});
  useEffect(() => {
    const el = document.querySelector('.tab-scroll');
    if (el && scrollTops.current[subTab] !== undefined) el.scrollTop = scrollTops.current[subTab];
  }, [subTab]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number } | null>(null);

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
      extras: '',
      stunts: '',
      vehicles: '',
      props: '',
      wardrobe: '',
      makeup: '',
      sfx: '',
      vfx: '',
      sound: '',
      music: '',
      animals: '',
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
    const used = scenes.filter(s => s.id !== original.id && s.sceneNumber.match(new RegExp('^' + base + '[A-Z]$'))).map(s => s.sceneNumber.slice(-1));
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
      const isEmpty = !s.sceneNumber && !s.set && !s.description && !s.cast && !s.notes && s.pageCount === '1' && s.intExt === 'INT' && s.dayNight === 'DAY';
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
        mode="multi"
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
    for (const key of BREAKDOWN_CATEGORIES) {
      const sceneValues: string[] = [...new Set(scenes.map(s => (s as any)[key] as string).filter(Boolean).flatMap(v => v.split(',').map(x => x.trim())) as string[])];
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
            placeholder={BREAKDOWN_LABELS[key]}
            positioning="relative"
            defaultOpen
            autoFocus
            mode="multi"
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

  const CustomColIndicator: ColumnIndicatorComponent = useCallback(({ column, label }) => {
    const width = colWidths.current[column];
    const isResizing = resizeRef.current?.col === column;
    return (
      <th
        className="Spreadsheet__header"
        style={{ width, maxWidth: width, minWidth: width, position: 'relative', overflow: 'visible' }}
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
  }, [widthVersion]);

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
      ...BREAKDOWN_CATEGORIES.filter(k => k !== 'set').map(key => ({ value: (scene as any)[key] || '', DataEditor: breakdownEditors.get(key) })),
    ]);
    rows.push(COLUMNS.map((c, i) => {
      if (i === ACTIONS_COL) return { value: '', readOnly: true };
      if (i === 2) return { value: '', DataEditor: PageCountEditor };
      if (i === 4) return { value: '', DataEditor: IntExtEditor };
      if (i === 5) return { value: '', DataEditor: SetEditor };
      if (i === 6) return { value: '', DataEditor: DayNightEditor };
      if (i === CAST_COL) return { value: '', DataEditor: CastEditor };
      if (BREAKDOWN_CATEGORIES.includes(c.key)) return { value: '', DataEditor: breakdownEditors.get(c.key)! };
      return { value: '' };
    }));
    return rows;
  }, [scenes, IntExtEditor, DayNightEditor, DeleteViewer, PageCountEditor, SetEditor, CastEditor, breakdownEditors]);

  const RowIndicator: React.FC<{ row: number; label?: React.ReactNode; selected: boolean; onSelect: (row: number, extend: boolean) => void }> = useCallback(({ row, selected }) => (
    <td
      className={`Spreadsheet__header text-center cursor-pointer select-none transition-colors ${selected ? 'bg-blue-50' : ''}`}
      style={{ width: 17, minWidth: 17, maxWidth: 17, fontSize: row < 0 ? 7 : 10, fontWeight: 600 }}
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
      dispatch({ type: 'ADD_SCENE', payload: newScene as Scene });
      createdAny = true;
    }

    if (createdAny) return;

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
            if (colDef.key === 'cast' || BREAKDOWN_CATEGORIES.includes(colDef.key)) {
              const isCast = colDef.key === 'cast';
              const existing = (project.breakdownElements || {})[colDef.key] || [];
              const existingSet = new Set(
                isCast ? existing.map(e => e.id) : existing.map(e => e.name.toLowerCase())
              );
              const newItems = newVal.split(',').map(x => x.trim()).filter(Boolean)
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
  }, [scenes, dispatch, project]);

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
          set: row['Set'] || '',
          dayNight: (row['D/N'] || 'DAY') as any,
          description: row['Description'] || '',
          cast: row['Cast'] || '',
          notes: row['Notes'] || '',
          extras: '',
          stunts: '',
          vehicles: '',
          props: '',
          wardrobe: '',
          makeup: '',
          sfx: '',
          vfx: '',
          sound: '',
          music: '',
          animals: '',
          weapons: '',
          greenery: '',
          artDept: '',
          shootDay: null
        }));
        if (imported.length > 0) {
          dispatch({ type: 'IMPORT_SCENES', payload: imported });
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
        pageCount: '1',
        pageCountDecimal: 1.0,
        scriptDay: '1',
        intExt: 'INT',
        set: 'NEW SET',
        dayNight: 'DAY',
        description: 'New scene',
        cast: '',
        notes: '',
        extras: '',
        stunts: '',
        vehicles: '',
        props: '',
        wardrobe: '',
        makeup: '',
        sfx: '',
        vfx: '',
        sound: '',
        music: '',
        animals: '',
        weapons: '',
        greenery: '',
        artDept: '',
        shootDay: null
      }
    });
  };

  const totalPagesDecimal = scenes.reduce((sum, s) => sum + (s.pageCountDecimal || 0), 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-white text-zinc-900 border-x border-zinc-200 shadow-xl overflow-hidden relative select-none">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-200 bg-white">
        <button onClick={() => { scrollTops.current[subTab] = document.querySelector('.tab-scroll')?.scrollTop || 0; onSubTabChange('scenes'); }} className={`px-3 py-1 rounded-sm text-xs font-semibold ${subTab === 'scenes' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'}`}>
          Scene Breakdown
        </button>
        <button onClick={() => { scrollTops.current[subTab] = document.querySelector('.tab-scroll')?.scrollTop || 0; onSubTabChange('elements'); }} className={`px-3 py-1 rounded-sm text-xs font-semibold ${subTab === 'elements' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'}`}>
          Elements
        </button>
        <button onClick={() => { scrollTops.current[subTab] = document.querySelector('.tab-scroll')?.scrollTop || 0; onSubTabChange('sheet'); }} className={`px-3 py-1 rounded-sm text-xs font-semibold ${subTab === 'sheet' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'}`}>
          Sheet
        </button>
      </div>
      {subTab === 'elements' ? <ElementManager initialCategory={savedCat} onCategoryChange={onCategoryChange} /> : subTab === 'sheet' ? <SceneSheet initialIndex={savedSheetIdx} onIndexChange={onSheetIdxChange} /> : (
        <>
      <div className="flex-1 overflow-auto bg-white">
      <div className="min-w-[800px]">
           <style>{`
            .Spreadsheet {
              border-collapse: collapse;
              width: 100%;
              font-family: inherit;
              font-size: 13px;
            }
            .Spreadsheet__table {
              border-collapse: collapse;
              width: 100%;
              table-layout: fixed;
            }
            .Spreadsheet__header-row {
              background: white;
              border-bottom: 2px solid #0a0a0a;
              position: sticky;
              top: 0;
              z-index: 10;
            }
            .Spreadsheet__header-row th {
              padding: 0;
              font-family: ui-monospace, monospace;
              font-size: 12px;
              font-weight: 600;
              text-align: left;
              border-right: 1px solid #e4e4e7;
              color: #18181b;
              white-space: nowrap;
              position: relative;
              user-select: none;
            }
            .Spreadsheet__header-label {
              padding: 8px 6px;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .Spreadsheet__cell {
              border: none;
              border-right: 1px solid #e4e4e7;
              border-bottom: 1px solid #e4e4e7;
              padding: 0;
              height: 34px;
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
            .Spreadsheet__cell input {
              width: 100%;
              height: 100%;
              border: none;
              outline: none;
              padding: 6px 8px;
              font-size: 13px;
              font-family: inherit;
              background: transparent;
            }
            .Spreadsheet__cell .Spreadsheet__data-viewer {
              padding: 6px 8px;
              min-height: 34px;
              display: flex;
              align-items: center;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
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
          <Spreadsheet
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
                }
              } else if (sel instanceof RangeSelection) {
                const rows = new Set<number>();
                for (let r = sel.range.start.row; r <= sel.range.end.row; r++) rows.add(r);
                setSelectedRows(rows);
              } else {
                setSelectedRows(new Set());
              }
            }}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                addScene();
              }
            }}
          />
        </div>
      </div>

      <div className="bg-zinc-100 border-t border-zinc-300 p-3 flex items-center justify-between shadow-inner">
        <div className="flex items-center space-x-4">
          <button onClick={addScene} className="bg-zinc-900 border-2 border-transparent text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-zinc-800 transition-colors">
            + Add Scene
          </button>
          <button onClick={() => dispatch({type: 'SORT_SCENES'})} className="bg-white border border-zinc-300 px-4 py-1.5 text-zinc-700 rounded text-sm hover:bg-zinc-50 transition-colors">
            Sort by Scene #
          </button>
          <button onClick={cleanEmptyRows} className="bg-white border border-zinc-300 px-3 py-1.5 text-zinc-500 rounded text-sm hover:bg-zinc-50 transition-colors">
            Clean Empty Rows
          </button>
          <div className="relative">
            <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImport} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="bg-white border border-zinc-300 px-3 py-1.5 text-zinc-700 rounded text-sm hover:bg-zinc-50 transition-colors">
              Import CSV
            </button>
          </div>
        </div>
        <div className="flex font-mono text-xs items-center space-x-8 text-zinc-600">
          <div className="flex flex-col">
            <span className="uppercase text-[10px] text-zinc-400 font-semibold tracking-widest">Scenes</span>
            <span className="text-zinc-900 font-medium text-sm">{scenes.length}</span>
          </div>
          <div className="flex flex-col">
            <span className="uppercase text-[10px] text-zinc-400 font-semibold tracking-widest">Total Pages</span>
            <span className="text-zinc-900 font-medium text-sm">{formatPageCount(totalPagesDecimal)} <span className="text-zinc-400 font-normal">({totalPagesDecimal.toFixed(3)})</span></span>
          </div>
        </div>
      </div>
        </>
      )}

      {/* Context Menu */}
      <ContextMenu open={!!contextMenu} x={contextMenu?.x ?? 0} y={contextMenu?.y ?? 0} onClose={() => setContextMenu(null)}>
        {contextMenu && contextMenu.row < scenes.length && (
          <>
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
          </>
        )}
        {contextMenu && contextMenu.row >= scenes.length && (
          <ContextMenuItem onClick={() => { addScene(); setContextMenu(null); }} icon={<Plus className="w-3 h-3 text-zinc-400" />}>Add Scene</ContextMenuItem>
        )}
      </ContextMenu>
    </div>
  );
}
