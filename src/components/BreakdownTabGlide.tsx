import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import DataEditor, {
  GridCellKind,
  type GridCell,
  type GridColumn,
  type Item,
  type GridSelection,
  type EditableGridCell,
  CompactSelection,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { useProject, DEFAULT_CATEGORY_LABELS } from '../store';
import { Scene } from '../types';
import { generateUUID, formatPageCount, parsePageCount } from '../lib/utils';
import {
  Trash2, Copy, Scissors, ClipboardPaste, Plus, ArrowDown, Eye,
  ChevronDown, ZoomIn, ZoomOut, RotateCcw, FileDown, Search,
} from 'lucide-react';
import Papa from 'papaparse';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import { EntityDropdown } from './EntityDropdown';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import MiniTab from './MiniTab';
import { getIntExtOptions, getDayNightOptions } from '../lib/ribbonUtils';
import { getFieldItems, isMultiValue } from '../lib/categories';
import { IS_COARSE } from '../lib/device';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import { useSpreadsheetFontSize, SS_FONT_SIZE_DEFAULT } from '../lib/persist';
import { createGlideTheme } from '../lib/glideTheme';

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
  { key: 'sceneNumber', label: 'Scene #', width: 60, icon: undefined },
  { key: 'pageCount', label: 'Pages', width: 80, icon: undefined },
  { key: 'scriptDay', label: 'Script Day', width: 80, icon: undefined },
  { key: 'intExt', label: 'I/E', width: 80, icon: undefined },
  { key: 'set', label: 'Set', width: 180, icon: undefined },
  { key: 'dayNight', label: 'D/N', width: 90, icon: undefined },
  { key: 'description', label: 'Description', width: 300, icon: undefined },
  { key: 'cast', label: 'Cast', width: 120, icon: undefined },
  { key: 'notes', label: 'Notes', width: 200, icon: undefined },
];

const INT_EXT_COL = 3;
const DAY_NIGHT_COL = 5;
const SET_COL = 4;
const CAST_COL = 7;
const PAGES_COL = 1;

function textCell(data: string, opts?: Partial<{ readonly: boolean; displayData: string }>): GridCell {
  return {
    kind: GridCellKind.Text,
    data,
    displayData: opts?.displayData ?? data,
    allowOverlay: true,
    readonly: opts?.readonly ?? false,
  } as GridCell;
}

export function GlideBreakdownTab({
  onOpenSheet,
}: {
  onOpenSheet?: (rowIndex: number) => void;
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
    ...FIXED_COLS,
    ...allBreakdownCategories.filter(k => k !== 'set').map(key => ({
      key, label: allBreakdownLabels[key], width: 100, icon: undefined,
    })),
  ], [allBreakdownCategories, allBreakdownLabels]);

  const glideColumns: GridColumn[] = useMemo(() =>
    COLUMNS.map(c => ({ title: c.label, width: c.width })),
  [COLUMNS]);

  const [fontSize, setFontSize] = useSpreadsheetFontSize();
  const theme = useMemo(() => createGlideTheme(fontSize), [fontSize]);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number; col?: number } | null>(null);
  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const editingCellRef = useRef<Item>([-1, -1]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const editorRef = useRef<any>(null);

  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const projectRef = useRef(project);
  projectRef.current = project;
  const intExtOptionsRef = useRef(getIntExtOptions(project.colorPalette));
  intExtOptionsRef.current = getIntExtOptions(project.colorPalette);
  const dayNightOptionsRef = useRef(getDayNightOptions(project.colorPalette));
  dayNightOptionsRef.current = getDayNightOptions(project.colorPalette);
  const allBreakdownLabelsRef = useRef(allBreakdownLabels);
  allBreakdownLabelsRef.current = allBreakdownLabels;
  const customCategoriesRef = useRef(project.customCategories);
  customCategoriesRef.current = project.customCategories;

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
    } else if (colKey === 'intExt') {
      const match = intExtOptionsRef.current.find(opt => opt.toLowerCase() === newVal.toLowerCase());
      if (match) updates.intExt = match;
    } else if (colKey === 'dayNight') {
      const match = dayNightOptionsRef.current.find(opt => opt.toLowerCase() === newVal.toLowerCase());
      if (match) updates.dayNight = match;
    }
    if (colKey === 'cast' || allBreakdownCategories.includes(colKey)) {
      const isCast = colKey === 'cast';
      const existing = (currentProject.breakdownElements || {})[colKey] || [];
      const existingSet = new Set(isCast ? existing.map((e: any) => e.id) : existing.map((e: any) => e.name.toLowerCase()));
      const newItems = getFieldItems(colKey, newVal).filter(
        v => isCast ? !existingSet.has(v) : !existingSet.has(v.toLowerCase())
      );
      for (const item of newItems) {
        dispatch({ type: 'ADD_ELEMENT', payload: { category: colKey, element: isCast ? { id: item, name: '' } : { id: item, name: item } } });
      }
    }
    dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, ...updates } });
  }, [dispatch, allBreakdownCategories]);

  const setItems = useMemo(() => {
    const sets = new Map<string, string>();
    for (const s of scenes) { const v = s.set.trim().toUpperCase(); if (v) sets.set(v, v); }
    for (const e of project.breakdownElements?.['set'] || []) { const v = e.name.toUpperCase(); if (v) sets.set(v, v); }
    return [...sets.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id));
  }, [scenes, project.breakdownElements]);
  const setItemsRef = useRef(setItems);
  setItemsRef.current = setItems;

  const breakdownEditorItems = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    for (const key of allBreakdownCategories) {
      const storedElements: { id: string; name: string }[] = project.breakdownElements?.[key] || [];
      map.set(key, storedElements.map(e => ({ id: e.id, name: e.name })));
    }
    return map;
  }, [project.breakdownElements, allBreakdownCategories]);
  const breakdownEditorItemsRef = useRef(breakdownEditorItems);
  breakdownEditorItemsRef.current = breakdownEditorItems;

  const getCellContent = useCallback(([col, row]: Item): GridCell => {
    if (row >= scenes.length) return textCell('');

    const scene = scenes[row];
    const colDef = COLUMNS[col];
    if (!colDef) return textCell('');

    const raw = (scene as any)[colDef.key] ?? '';
    const val = String(raw);

    if (col === PAGES_COL) {
      return textCell(val);
    }
    if (col === SET_COL) {
      return textCell(val.toUpperCase());
    }
    return textCell(val);
  }, [scenes, COLUMNS]);

  const GlideAutocompleteEditor = useCallback((optionsRef: React.MutableRefObject<string[]>): React.FC<any> => {
    return ({ onChange, onFinishedEditing, value }: any) => {
      const val = value?.data ?? '';
      return React.createElement(AutocompleteDropdown, {
        value: val,
        onChange: (newVal: string) => {
          onChange({ kind: GridCellKind.Text, data: newVal, displayData: newVal, allowOverlay: true });
        },
        onExit: () => onFinishedEditing(undefined, [0, 0]),
        options: optionsRef.current,
        positioning: 'relative',
        defaultOpen: true,
        autoFocus: true,
        showAll: true,
      });
    };
  }, []);

  const GlideSetEditor: React.FC<any> = useCallback(({ onChange, onFinishedEditing, value }: any) => {
    const val = value?.data ?? '';
    return React.createElement(EntityDropdown, {
      value: val,
      onChange: (newVal: string) => {
        onChange({ kind: GridCellKind.Text, data: newVal, displayData: newVal, allowOverlay: true });
      },
      onExit: () => onFinishedEditing(undefined, [0, 0]),
      items: setItemsRef.current,
      mode: 'single',
      uppercase: true,
      keepAlphabetical: true,
      panelMinWidth: 'min-w-[220px]',
      positioning: 'relative',
      defaultOpen: true,
      autoFocus: true,
      className: 'text-xs',
    });
  }, []);

  const GlideCastEditor: React.FC<any> = useCallback(({ onChange, onFinishedEditing, value }: any) => {
    const val = value?.data ?? '';
    return React.createElement(EntityDropdown, {
      value: val,
      onChange: (newVal: string) => {
        onChange({ kind: GridCellKind.Text, data: newVal, displayData: newVal, allowOverlay: true });
      },
      onExit: () => onFinishedEditing(undefined, [0, 0]),
      positioning: 'relative',
      defaultOpen: true,
      autoFocus: true,
      mode: 'multi',
      placeholder: 'Cast',
      className: 'text-xs',
      displayMode: 'id',
      renderItem: (item: any) => React.createElement(React.Fragment, null,
        React.createElement('span', { className: 'text-zinc-400 shrink-0' }, item.id + '.'),
        React.createElement('span', { className: 'truncate flex-1' }, item.name && item.name !== item.id ? item.name : '—')
      ),
    });
  }, []);

  const GlideBreakdownEditor = useCallback((categoryKey: string): React.FC<any> => {
    return ({ onChange, onFinishedEditing, value }: any) => {
      const val = value?.data ?? '';
      const items = breakdownEditorItemsRef.current.get(categoryKey) || [];
      const isMulti = isMultiValue(categoryKey, customCategoriesRef.current);
      return React.createElement(EntityDropdown, {
        value: val,
        onChange: (newVal: string) => {
          onChange({ kind: GridCellKind.Text, data: newVal, displayData: newVal, allowOverlay: true });
        },
        onExit: () => onFinishedEditing(undefined, [0, 0]),
        items,
        placeholder: allBreakdownLabelsRef.current[categoryKey],
        positioning: 'relative',
        defaultOpen: true,
        autoFocus: true,
        mode: isMulti ? 'multi' : 'single',
        renderItem: (item: any) => React.createElement(React.Fragment, null,
          item.id && item.id !== item.name && React.createElement('span', { className: 'text-zinc-400 shrink-0' }, item.id + '.'),
          React.createElement('span', { className: 'truncate flex-1' }, item.name)
        ),
      });
    };
  }, []);

  const provideEditor: any = useCallback((cell: GridCell) => {
    const col = editingCellRef.current[0];
    if (col < 0) return undefined;
    if (col === INT_EXT_COL) return GlideAutocompleteEditor(intExtOptionsRef);
    if (col === DAY_NIGHT_COL) return GlideAutocompleteEditor(dayNightOptionsRef);
    if (col === SET_COL) return GlideSetEditor;
    if (col === CAST_COL) return GlideCastEditor;
    const colDef = COLUMNS[col];
    if (colDef && allBreakdownCategories.includes(colDef.key)) return GlideBreakdownEditor(colDef.key);
    return undefined;
  }, [COLUMNS, allBreakdownCategories, GlideAutocompleteEditor, GlideSetEditor, GlideCastEditor, GlideBreakdownEditor]);

  const onCellEdited = useCallback(([col, row]: Item, newValue: EditableGridCell) => {
    if (row >= scenes.length) return;
    const scene = scenesRef.current[row];
    if (!scene) return;
    const colDef = COLUMNS[col];
    if (!colDef) return;
    if (newValue.kind === GridCellKind.Text) {
      commitEdit(scene.id, colDef.key, newValue.data);
    }
  }, [COLUMNS, commitEdit]);

  const onRowAppended = useCallback(async () => {
    const newScene: Scene = {
      id: generateUUID(), sceneNumber: '', pageCount: '', pageCountDecimal: 0,
      scriptDay: '', intExt: '' as any, set: '', dayNight: '' as any,
      description: '', cast: '', notes: '',
      backgroundActors: '', stunts: '', vehicles: '', props: '', wardrobe: '',
      makeup: '', sfx: '', vfx: '', sound: '', music: '',
      animalsAndWranglers: '', weapons: '', greenery: '', artDept: '',
      shootDay: null,
    };
    dispatch({ type: 'ADD_SCENE', payload: newScene });
    return scenesRef.current.length;
  }, [dispatch]);

  const onDelete = useCallback((sel: GridSelection): boolean => {
    if (!sel.current) return false;
    const { range } = sel.current;
    for (let r = range.y; r <= range.y + range.height; r++) {
      if (r >= scenesRef.current.length) continue;
      for (let c = range.x; c <= range.x + range.width; c++) {
        const colDef = COLUMNS[c];
        if (!colDef) continue;
        commitEdit(scenesRef.current[r].id, colDef.key, '');
      }
    }
    return false;
  }, [COLUMNS, commitEdit]);

  const handlePaste = useCallback((target: Item, values: readonly (readonly string[])[]): boolean => {
    const currentScenes = scenesRef.current;
    const newScenes: Scene[] = [];
    const editRows: { col: number; row: number; colKey: string; val: string }[] = [];

    for (let r = 0; r < values.length; r++) {
      const targetRow = target[1] + r;
      if (targetRow < currentScenes.length) {
        for (let c = 0; c < values[r].length; c++) {
          const targetCol = target[0] + c;
          if (targetCol < COLUMNS.length) {
            editRows.push({ col: targetCol, row: targetRow, colKey: COLUMNS[targetCol].key, val: values[r][c] });
          }
        }
      } else {
        const newScene: any = {};
        for (let c = 0; c < values[r].length && c < COLUMNS.length; c++) {
          newScene[COLUMNS[c].key] = values[r][c];
        }
        newScenes.push(newScene);
      }
    }

    if (newScenes.length > 0) {
      dispatch({ type: 'BATCH_START' });
      for (const s of newScenes) {
        const scene = {
          id: generateUUID(), sceneNumber: s.sceneNumber || '', pageCount: '', pageCountDecimal: 0,
          scriptDay: (s.scriptDay || '').replace(/[^0-9]/g, ''),
          intExt: s.intExt || '', set: (s.set || '').toUpperCase(), dayNight: s.dayNight || '',
          description: s.description || '', cast: s.cast || '', notes: s.notes || '',
          backgroundActors: s.backgroundActors || '', stunts: s.stunts || '', vehicles: s.vehicles || '',
          props: s.props || '', wardrobe: s.wardrobe || '', makeup: s.makeup || '',
          sfx: s.sfx || '', vfx: s.vfx || '', sound: s.sound || '', music: s.music || '',
          animalsAndWranglers: s.animalsAndWranglers || '', weapons: s.weapons || '', greenery: s.greenery || '', artDept: s.artDept || '',
          shootDay: null,
        };
        const decimal = parsePageCount(scene.pageCount || '0');
        scene.pageCount = formatPageCount(decimal);
        scene.pageCountDecimal = decimal;
        dispatch({ type: 'ADD_SCENE', payload: scene as Scene });
      }
      dispatch({ type: 'BATCH_COMMIT' });
    }

    for (const edit of editRows) {
      commitEdit(currentScenes[edit.row].id, edit.colKey, edit.val);
    }
    return false;
  }, [COLUMNS, dispatch, commitEdit]);

  const addScene = useCallback(() => {
    dispatch({ type: 'ADD_SCENE', payload: {
      id: generateUUID(), sceneNumber: '', pageCount: '', pageCountDecimal: 0,
      scriptDay: '', intExt: '' as any, set: '', dayNight: '' as any,
      description: '', cast: '', notes: '',
      backgroundActors: '', stunts: '', vehicles: '', props: '', wardrobe: '',
      makeup: '', sfx: '', vfx: '', sound: '', music: '',
      animalsAndWranglers: '', weapons: '', greenery: '', artDept: '',
      shootDay: null,
    }});
  }, [dispatch]);

  const insertSceneAt = useCallback((index: number) => {
    const newScene: Scene = {
      id: generateUUID(), sceneNumber: '', pageCount: '', pageCountDecimal: 0,
      scriptDay: '', intExt: '' as any, set: '', dayNight: '' as any,
      description: '', cast: '', notes: '',
      backgroundActors: '', stunts: '', vehicles: '', props: '', wardrobe: '',
      makeup: '', sfx: '', vfx: '', sound: '', music: '',
      animalsAndWranglers: '', weapons: '', greenery: '', artDept: '',
      shootDay: null,
    };
    dispatch({ type: 'INSERT_SCENE_AT', payload: { index, scene: newScene } });
  }, [dispatch]);

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

  const deleteSelectedRows = useCallback(() => {
    if (!gridSelection.current) return;
    const rows = new Set<number>();
    for (let r = gridSelection.current.range.y; r <= gridSelection.current.range.y + gridSelection.current.range.height; r++) {
      rows.add(r);
    }
    const indices = [...rows].sort((a, b) => b - a);
    for (const idx of indices) {
      if (idx < scenes.length) deleteScene(scenes[idx].id);
    }
  }, [gridSelection, scenes, deleteScene]);

  const handleCopy = useCallback(async () => {
    if (!gridSelection.current?.range) return;
    const { x, y, width, height } = gridSelection.current.range;
    const rows: string[] = [];
    for (let r = y; r <= y + height; r++) {
      if (r >= scenes.length) break;
      const cols: string[] = [];
      for (let c = x; c <= x + width; c++) {
        cols.push(String((scenes[r] as any)[COLUMNS[c]?.key] ?? ''));
      }
      rows.push(cols.join('\t'));
    }
    if (rows.length > 0) await navigator.clipboard.writeText(rows.join('\n'));
    setContextMenu(null);
  }, [gridSelection, scenes, COLUMNS]);

  const handleCut = useCallback(async () => {
    if (!gridSelection.current?.range) return;
    const { x, y, width, height } = gridSelection.current.range;
    const rows: string[] = [];
    const edits: { row: number; colKey: string }[] = [];
    for (let r = y; r <= y + height; r++) {
      if (r >= scenes.length) continue;
      const cols: string[] = [];
      for (let c = x; c <= x + width; c++) {
        const key = COLUMNS[c]?.key;
        if (!key) continue;
        cols.push(String((scenes[r] as any)[key] ?? ''));
        edits.push({ row: r, colKey: key });
      }
      rows.push(cols.join('\t'));
    }
    if (rows.length > 0) {
      await navigator.clipboard.writeText(rows.join('\n'));
      for (const edit of edits) {
        commitEdit(scenes[edit.row].id, edit.colKey, '');
      }
    }
    setContextMenu(null);
  }, [gridSelection, scenes, COLUMNS, commitEdit]);

  const handlePasteFromMenu = useCallback(async () => {
    if (!gridSelection.current?.cell) return;
    const text = await navigator.clipboard.readText();
    if (!text) return;
    const pastedRows = text.split(/\r\n|\n|\r/);
    const pastedData = pastedRows.map(r => r.split('\t'));
    handlePaste(gridSelection.current.cell, pastedData);
    setContextMenu(null);
  }, [gridSelection, handlePaste]);

  const handleClear = useCallback(() => {
    if (!gridSelection.current?.range) return;
    const { x, y, width, height } = gridSelection.current.range;
    for (let r = y; r <= y + height; r++) {
      if (r >= scenes.length) continue;
      for (let c = x; c <= x + width; c++) {
        const key = COLUMNS[c]?.key;
        if (!key) continue;
        commitEdit(scenes[r].id, key, '');
      }
    }
    setContextMenu(null);
  }, [gridSelection, scenes, COLUMNS, commitEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      addScene();
    }
  }, [addScene]);

  const handleCellContextMenu = useCallback((cell: Item, event: any) => {
    const [col, row] = cell;
    if (row < 0 || row >= scenes.length) return;
    setContextMenu({ x: event.clientX ?? event.bounds?.x ?? 0, y: event.clientY ?? event.bounds?.y ?? 0, row, col });
  }, [scenes.length]);

  const handleCellActivated = useCallback((cell: Item) => {
    editingCellRef.current = cell;
    const [, row] = cell;
    if (row >= 0 && row < scenes.length && onOpenSheet) {
      onOpenSheet(row);
    }
  }, [scenes.length, onOpenSheet]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
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
          backgroundActors: '', stunts: '', vehicles: '', props: '', wardrobe: '', makeup: '',
          sfx: '', vfx: '', sound: '', music: '', animalsAndWranglers: '', weapons: '', greenery: '', artDept: '',
          shootDay: null,
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
              const existingSet = new Set(isCast ? existing.map((e: any) => e.id) : existing.map((e: any) => e.name.toLowerCase()));
              const items = getFieldItems(category, val);
              for (const item of items) {
                if (isCast ? !existingSet.has(item) : !existingSet.has(item.toLowerCase())) {
                  dispatch({ type: 'ADD_ELEMENT', payload: { category, element: isCast ? { id: item, name: '' } : { id: item, name: item } } });
                }
              }
            }
          }
          dispatch({ type: 'BATCH_COMMIT' });
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
    });
  };

  const cleanEmptyRows = useCallback(() => {
    const toDelete: string[] = [];
    for (const s of scenes) {
      const isEmpty = !s.sceneNumber && !s.set && !s.description && !s.cast && !s.notes && !s.pageCount && !s.intExt && !s.dayNight;
      if (isEmpty) toDelete.push(s.id);
    }
    for (const id of toDelete) dispatch({ type: 'DELETE_SCENE', payload: id });
  }, [scenes, dispatch]);

  const totalPagesDecimal = useMemo(() => scenes.reduce((sum, s) => sum + (s.pageCountDecimal || 0), 0), [scenes]);

  const contextMenuRow = contextMenu?.row ?? -1;
  const contextMenuCol = contextMenu?.col;
  const hasSelection = gridSelection.current?.range !== undefined;
  const hasActiveCell = gridSelection.current?.cell !== undefined;

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden relative">
      <MiniTab
        tabs={[{ id: 'glide', label: 'Glide Breakdown' }]}
        activeTab="glide"
        onChange={() => {}}
        rightContent={
          <>
            <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen} width="w-44" theme="light"
              trigger={
                <button className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer select-none hover:bg-zinc-200 text-zinc-600 border border-transparent hover:border-zinc-300">
                  Edit
                  <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
                </button>
              }
            >
              <DropdownItem onClick={() => { setActionsOpen(false); dispatch({ type: 'SORT_SCENES' }); }} icon={<Search className="w-3.5 h-3.5" />}>
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
        }
      />
      <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.tsv" onChange={handleImport} />
      <div className="flex-1 overflow-hidden">
        <DataEditor
          ref={editorRef}
          columns={glideColumns}
          rows={scenes.length}
          getCellContent={getCellContent}
          provideEditor={provideEditor}
          onCellEdited={onCellEdited}
          onRowAppended={onRowAppended}
          onPaste={handlePaste}
          onDelete={onDelete}
          onKeyDown={handleKeyDown}
          onCellClicked={(cell: Item) => { editingCellRef.current = cell; }}
          onCellContextMenu={handleCellContextMenu}
          onCellActivated={handleCellActivated}
          getCellsForSelection={true}
          gridSelection={gridSelection}
          onGridSelectionChange={setGridSelection}
          freezeColumns={1}
          rowMarkers="clickable-number"
          rowMarkerStartIndex={1}
          rangeSelect="multi-rect"
          rowSelect="multi"
          columnSelect="multi"
          theme={theme}
          headerHeight={IS_COARSE ? 40 : 30}
          rowHeight={IS_COARSE ? Math.round(fontSize * 3.2) : Math.round(fontSize * 2.55)}
          trailingRowOptions={{ hint: 'Add scene...', sticky: false }}
          className={readOnly ? 'opacity-60 pointer-events-none' : ''}
        />
      </div>

      <ContextMenu open={!!contextMenu} x={contextMenu?.x ?? 0} y={contextMenu?.y ?? 0} onClose={() => setContextMenu(null)}>
        {contextMenu && contextMenuRow < scenes.length && (
          <>
            {contextMenuCol !== undefined && (
              <>
                <ContextMenuItem onClick={handleCopy} icon={<Copy className="w-3 h-3 text-zinc-400" />} disabled={!hasSelection && !hasActiveCell}>Copy</ContextMenuItem>
                <ContextMenuItem onClick={handleCut} icon={<Scissors className="w-3 h-3 text-zinc-400" />} disabled={!hasSelection && !hasActiveCell}>Cut</ContextMenuItem>
                <ContextMenuItem onClick={handlePasteFromMenu} icon={<ClipboardPaste className="w-3 h-3 text-zinc-400" />} disabled={!hasActiveCell}>Paste</ContextMenuItem>
                <ContextMenuItem onClick={handleClear} icon={<Trash2 className="w-3 h-3 text-zinc-400" />} disabled={!hasSelection && !hasActiveCell}>Clear</ContextMenuItem>
                <ContextMenuDivider />
              </>
            )}
            <ContextMenuItem onClick={() => { insertSceneAt(contextMenuRow); setContextMenu(null); }} icon={<Plus className="w-3 h-3 text-zinc-400" />}>Insert Above</ContextMenuItem>
            <ContextMenuItem onClick={() => { insertSceneAt(contextMenuRow + 1); setContextMenu(null); }} icon={<ArrowDown className="w-3 h-3 text-zinc-400" />}>Insert Below</ContextMenuItem>
            <ContextMenuItem onClick={() => { duplicateSceneAt(contextMenuRow); setContextMenu(null); }} icon={<Copy className="w-3 h-3 text-zinc-400" />}>Duplicate</ContextMenuItem>
            <ContextMenuDivider />
            <ContextMenuItem onClick={() => { if (onOpenSheet) onOpenSheet(contextMenuRow); setContextMenu(null); }} icon={<Eye className="w-3 h-3 text-zinc-400" />}>Open Sheet</ContextMenuItem>
            <ContextMenuDivider />
            <ContextMenuItem onClick={() => { deleteScene(scenes[contextMenuRow]?.id); setContextMenu(null); }} variant="danger" icon={<Trash2 className="w-3 h-3" />}>Delete Row</ContextMenuItem>
            {contextMenuCol !== undefined && (() => {
              const colKey = COLUMNS[contextMenuCol]?.key;
              const isElementColumn = colKey && (colKey === 'cast' || colKey === 'set' || allBreakdownCategories.includes(colKey));
              if (!isElementColumn) return null;
              const colLabel = colKey ? (allBreakdownLabels[colKey] || COLUMNS[contextMenuCol]?.label || colKey) : '';
              return (
                <>
                  <ContextMenuDivider />
                  <ContextMenuItem onClick={() => { setContextMenu(null); }} icon={<Eye className="w-3 h-3 text-zinc-400" />}>
                    Go to Element Manager → {colLabel}
                  </ContextMenuItem>
                </>
              );
            })()}
          </>
        )}
        {contextMenu && contextMenuRow >= scenes.length && (
          <ContextMenuItem onClick={() => { addScene(); setContextMenu(null); }} icon={<Plus className="w-3 h-3 text-zinc-400" />}>Add Scene</ContextMenuItem>
        )}
      </ContextMenu>
    </div>
  );
}
