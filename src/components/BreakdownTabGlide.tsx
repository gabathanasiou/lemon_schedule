import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
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
import { useProject, DEFAULT_CATEGORY_LABELS } from '../store';
import { Scene } from '../types';
import { generateUUID, formatPageCount, parsePageCount } from '../lib/utils';
import {
  Trash2, Copy, Scissors, ClipboardPaste, Plus, ArrowDown, Eye, Square, CheckSquare,
  ChevronDown, ZoomIn, ZoomOut, RotateCcw, FileDown, Search,
} from 'lucide-react';
import Papa from 'papaparse';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from './ContextMenu';
import { getFieldItems, isMultiValue } from '../lib/categories';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import { useSpreadsheetFontSize, SS_FONT_SIZE_DEFAULT } from '../lib/persist';
import { IS_COARSE } from '../lib/device';
import { createGlideTheme } from '../lib/glideTheme';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import { EntityDropdown } from './EntityDropdown';

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

function textCell(data: string, opts?: Partial<{ readonly: boolean; displayData: string; allowOverlay: boolean; align: 'left' | 'right' | 'center' }>): GridCell {
  return {
    kind: GridCellKind.Text,
    data,
    displayData: opts?.displayData ?? data,
    allowOverlay: opts?.allowOverlay ?? true,
    readonly: opts?.readonly ?? false,
    contentAlign: opts?.align,
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

  const STORAGE_KEY = `lemon_schedule_glide_cols_${project.id}`;

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  });

  const [fontSize, setFontSizeBase] = useSpreadsheetFontSize(IS_COARSE ? 14 : undefined);
  const [fontVersion, setFontVersion] = useState(0);
  const setFontSize = useCallback((n: number) => { setFontSizeBase(n); setFontVersion(v => v + 1); }, [setFontSizeBase]);
  const [smoothScroll, setSmoothScroll] = useState(IS_COARSE);

  const COLUMNS = useMemo(() => [
    ...FIXED_COLS.map(c => ({ ...c, width: columnWidths[c.key] ?? c.width })),
    ...allBreakdownCategories.filter(k => k !== 'set').map(key => ({
      key, label: allBreakdownLabels[key], width: columnWidths[key] ?? 100,
    })),
  ], [allBreakdownCategories, allBreakdownLabels, columnWidths]);

  const COLUMNSRef = useRef(COLUMNS);
  COLUMNSRef.current = COLUMNS;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columnWidths));
  }, [STORAGE_KEY, columnWidths]);

  const onColumnResize = useCallback((_col: any, w: number, ci: number) => {
    const key = COLUMNSRef.current[ci]?.key;
    if (!key) return;
    const scale = fontSize / SS_FONT_SIZE_DEFAULT;
    setColumnWidths(prev => ({ ...prev, [key]: Math.max(40, Math.round(w / scale)) }));
  }, [fontSize]);

  const glideColumns: GridColumn[] = useMemo(() => {
    const scale = fontSize / SS_FONT_SIZE_DEFAULT;
    return COLUMNS.map(c =>
      c.key === 'actions'
        ? { title: '', width: Math.round(c.width * scale), themeOverride: { textDark: '#ef4444' } } as GridColumn
        : { title: c.label, width: Math.round(c.width * scale) }
    );
  }, [COLUMNS, fontSize]);

  const trashImg = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(svg);
    trashImg.current = img;
  }, []);

  const drawCell = useCallback((args: any, draw: (a: any) => boolean) => {
    if (args.col === 0) {
      draw(args);
      const img = trashImg.current;
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
  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const gridRef = useRef<DataEditorRef>(null);
  const prevScenesLen = useRef(scenes.length);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; prevScenesLen.current = scenes.length; return; }
    if (scenes.length !== prevScenesLen.current || !gridRef.current) {
      prevScenesLen.current = scenes.length;
      return;
    }
    const all: { cell: Item }[] = [];
    for (let r = 0; r < scenes.length; r++)
      for (let c = 0; c < COLUMNS.length; c++)
        all.push({ cell: [c, r] });
    setTimeout(() => gridRef.current?.updateCells(all), 0);
  }, [scenes, COLUMNS]);

  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const breakdownEditorItems = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    for (const key of allBreakdownCategories) {
      const stored = project.breakdownElements?.[key] || [];
      map.set(key, stored.map(e => ({ id: e.id, name: e.name })));
    }
    return map;
  }, [project.breakdownElements, allBreakdownCategories]);

  const intExtOptions = useMemo(() =>
    project.colorPalette?.intExtOptions || ['INT', 'EXT', 'D/E', 'EXT/INT'],
  [project.colorPalette]);

  const dayNightOptions = useMemo(() =>
    project.colorPalette?.dayNightOptions || ['DAY', 'NIGHT', 'MORNING', 'EVENING'],
  [project.colorPalette]);

  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const projectRef = useRef(project);
  projectRef.current = project;
  const allBreakdownLabelsRef = useRef(allBreakdownLabels);
  allBreakdownLabelsRef.current = allBreakdownLabels;

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

  const getSceneValue = useCallback((scene: Scene, colKey: string): string => {
    if (colKey === 'intExt' || colKey === 'dayNight') return (scene as any)[colKey] || '';
    return String((scene as any)[colKey] ?? '');
  }, []);

  const getCellContent = useCallback(([col, row]: Item): GridCell => {
    const scene = scenesRef.current[row];
    if (!scene) {
      return {
        kind: GridCellKind.Text,
        data: '',
        displayData: '',
        allowOverlay: false,
        readonly: true,
      } as GridCell;
    }
    const colDef = COLUMNS[col];
    if (!colDef) return textCell('', { readonly: true });
    const colKey = colDef.key;
    if (colKey === 'actions') return textCell('', { readonly: true, allowOverlay: false });
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
      return textCell(val, { displayData: displayValue });
    }
    return textCell(val);
  }, [COLUMNS, getSceneValue]);

  const onCellEdited = useCallback(([col, row]: Item, newValue: EditableGridCell) => {
    if (row >= scenesRef.current.length) return;
    const scene = scenesRef.current[row];
    if (!scene) return;
    const colDef = COLUMNS[col];
    if (!colDef || colDef.key === 'actions') return;
    if (newValue.kind === GridCellKind.Text) {
      commitEdit(scene.id, colDef.key, newValue.data);
    }
  }, [COLUMNS, commitEdit]);

  const provideEditor = useCallback((cellData: any & { location?: Item }): any => {
    const loc = cellData.location;
    if (!loc || cellData.kind !== GridCellKind.Text) return undefined;
    const [col] = loc;
    const dataCol = col - 1;
    const colDef = COLUMNS[dataCol];
    if (!colDef) return undefined;
    const colKey = colDef.key;
    const isEntity = colKey === 'cast' || colKey === 'set' || colKey === 'intExt' || colKey === 'dayNight' || allBreakdownCategories.includes(colKey);
    if (!isEntity) return undefined;

    const editor = (p: any) => {
      const { value: cellValue, onChange, onFinishedEditing } = p;
      const currentVal = cellValue?.data ?? '';
      const latestRef = useRef(cellValue);

      const handleChange = (newVal: string) => {
        const next = {
          kind: GridCellKind.Text,
          data: newVal,
          displayData: newVal,
          allowOverlay: true,
        };
        latestRef.current = next;
        onChange(next);
      };

      const handleClose = () => {
        onFinishedEditing(latestRef.current);
      };

      if (colKey === 'intExt') {
        return <AutocompleteDropdown value={currentVal} onChange={handleChange} onExit={handleClose} options={intExtOptions} positioning="relative" defaultOpen autoFocus showAll placeholder="INT, EXT, D/E..." />;
      }
      if (colKey === 'dayNight') {
        return <AutocompleteDropdown value={currentVal} onChange={handleChange} onExit={handleClose} options={dayNightOptions} positioning="relative" defaultOpen autoFocus showAll placeholder="DAY, NIGHT, MORNING..." />;
      }
      if (colKey === 'set') {
        return <EntityDropdown value={currentVal} onChange={handleChange} onExit={handleClose} items={setItems} mode="single" uppercase keepAlphabetical positioning="relative" defaultOpen autoFocus placeholder="Set" className="text-xs" />;
      }
      if (colKey === 'cast') {
        return <EntityDropdown value={currentVal} onChange={handleChange} onExit={handleClose} mode="multi" displayMode="id" positioning="relative" defaultOpen autoFocus placeholder="Cast" className="text-xs" renderItem={(item: any, _sel: any) => (<><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '\u2014'}</span></>)} />;
      }
      const categoryItems = breakdownEditorItems.get(colKey) || [];
      return <EntityDropdown value={currentVal} onChange={handleChange} onExit={handleClose} items={categoryItems} mode={isMultiValue(colKey, project.customCategories) ? 'multi' : 'single'} positioning="relative" defaultOpen autoFocus placeholder={allBreakdownLabels[colKey] || colKey} className="text-xs" />;
    };
    editor.disablePadding = true;
    return editor;
  }, [COLUMNS, allBreakdownCategories, intExtOptions, dayNightOptions, setItems, breakdownEditorItems, allBreakdownLabels, project.customCategories]);

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
  }, [dispatch]);

  const onDelete = useCallback((sel: GridSelection): boolean => {
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
    const currentScenes = scenesRef.current;
    const newScenes: Scene[] = [];
    const editRows: { row: number; colKey: string; val: string }[] = [];

    dispatch({ type: 'BATCH_START' });

    for (let r = 0; r < values.length; r++) {
      const targetRow = target[1] + r;
      if (targetRow < currentScenes.length) {
        for (let c = 0; c < values[r].length; c++) {
          const targetCol = target[0] + c;
          if (targetCol < COLUMNS.length && COLUMNS[targetCol].key !== 'actions') {
            editRows.push({ row: targetRow, colKey: COLUMNS[targetCol].key, val: values[r][c] });
          }
        }
      } else {
        const newScene: any = {};
        for (let c = 0; c < values[r].length && c < COLUMNS.length; c++) {
          const colIndex = target[0] + c;
          if (colIndex < COLUMNS.length) {
            newScene[COLUMNS[colIndex].key] = values[r][c];
          }
        }
        newScenes.push(newScene);
      }
    }

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

  const getEffectiveRange = useCallback((): { x: number; y: number; width: number; height: number } | null => {
    const sel = gridSelection.current;
    if (sel?.range) return sel.range;
    if (gridSelection.rows.length > 0) {
      const selectedRows = Array.from({ length: scenes.length }, (_, i) => i).filter(i => gridSelection.rows.hasIndex(i));
      if (selectedRows.length === 0) return null;
      return { x: 0, y: selectedRows[0], width: COLUMNS.length, height: selectedRows.length };
    }
    return null;
  }, [gridSelection, scenes.length, COLUMNS.length]);

  const handleCopy = useCallback(async () => {
    const range = getEffectiveRange();
    if (!range) return;
    const { x, y, width, height } = range;
    const rows: string[] = [];
    for (let r = y; r < y + height; r++) {
      if (r >= scenes.length) break;
      const cols: string[] = [];
      for (let c = x; c < x + width; c++) {
        const key = COLUMNS[c]?.key;
        if (key === 'actions') continue;
        cols.push(String((scenes[r] as any)[key] ?? ''));
      }
      rows.push(cols.join('\t'));
    }
    if (rows.length > 0) await navigator.clipboard.writeText(rows.join('\n'));
    setContextMenu(null);
  }, [scenes, COLUMNS, getEffectiveRange]);

  const handleCut = useCallback(async () => {
    const range = getEffectiveRange();
    if (!range) return;
    const { x, y, width, height } = range;
    const rows: string[] = [];
    const committers: { row: number; colKey: string }[] = [];
    for (let r = y; r < y + height; r++) {
      if (r >= scenes.length) continue;
      const cols: string[] = [];
      for (let c = x; c < x + width; c++) {
        const key = COLUMNS[c]?.key;
        if (!key || key === 'actions') continue;
        cols.push(String((scenes[r] as any)[key] ?? ''));
        committers.push({ row: r, colKey: key });
      }
      rows.push(cols.join('\t'));
    }
    if (rows.length > 0) {
      await navigator.clipboard.writeText(rows.join('\n'));
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

  const handlePasteFromMenu = useCallback(async () => {
    let cell = gridSelection.current?.cell;
    if (!cell && gridSelection.rows.length > 0) {
      for (let i = 0; i < scenes.length; i++) {
        if (gridSelection.rows.hasIndex(i)) { cell = [0, i] as Item; break; }
      }
    }
    if (!cell) return;
    const text = await navigator.clipboard.readText();
    if (!text) return;
    const pastedRows = text.split(/\r\n|\n|\r/);
    handlePaste(gridSelection.current.cell, pastedRows.map(r => r.split('\t')));
    setContextMenu(null);
  }, [gridSelection, handlePaste]);

  const handleClear = useCallback(() => {
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
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      addScene();
    }
  }, [addScene]);

  const onCellContextMenu = useCallback((cell: Item, e: any) => {
    e.preventDefault();
    const [col, row] = cell;
    if (row < 0 || row >= scenes.length) return;
    const x = (e.bounds?.x ?? 0) + (e.localEventX ?? 0);
    const y = (e.bounds?.y ?? 0) + (e.localEventY ?? 0);
    setContextMenu({ x, y, row, col });
  }, [scenes.length]);

  const onCellClicked = useCallback((cell: Item, e: any) => {
    const [col, row] = cell;
    if (row < 0 || row >= scenes.length) return;
    if (col === 0) {
      deleteScene(scenesRef.current[row]?.id);
      return;
    }
    if (col >= 0) return;
    if (e.isDoubleClick) {
      onOpenSheet?.(row);
      return;
    }
    const x = (e.bounds?.x ?? 0) + (e.localEventX ?? 0);
    const y = (e.bounds?.y ?? 0) + (e.localEventY ?? 0);
    setContextMenu({ x, y, row, col });
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

  const hasSelection = gridSelection.current?.range !== undefined || gridSelection.rows.length > 0 || gridSelection.columns.length > 0;
  const hasActiveCell = gridSelection.current?.cell !== undefined || gridSelection.rows.length > 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b border-zinc-200 bg-white shrink-0">
        <div className="flex-1" />
        <button
          onClick={addScene}
          className="bg-zinc-900 text-white px-3 py-1 rounded text-[11px] font-semibold hover:bg-zinc-800 transition-colors"
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
          <DropdownItem onClick={() => { setFontSize(fontSize + 1.5); }} keepOpen icon={<ZoomIn className="w-3.5 h-3.5" />}>
            Bigger
          </DropdownItem>
          <DropdownItem onClick={() => { setFontSize(fontSize - 1.5); }} keepOpen icon={<ZoomOut className="w-3.5 h-3.5" />}>
            Smaller
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem onClick={() => { setFontSize(SS_FONT_SIZE_DEFAULT); }} keepOpen icon={<RotateCcw className="w-3.5 h-3.5" />}>
            Reset
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem onClick={() => { setSmoothScroll(p => !p); }} keepOpen icon={smoothScroll ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}>
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

      {/* Grid */}
      <div style={{ flex: 1, minHeight: 0, paddingBottom: 24, touchAction: 'none' }}>
        <DataEditor
          key={fontVersion}
          ref={gridRef}
          columns={glideColumns}
          rows={scenes.length}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          getCellsForSelection={true}
          gridSelection={gridSelection}
          onGridSelectionChange={setGridSelection}
          theme={createGlideTheme(fontSize)}
          rowHeight={Math.round(34 * fontSize / SS_FONT_SIZE_DEFAULT)}
          headerHeight={Math.round(36 * fontSize / SS_FONT_SIZE_DEFAULT)}
          onRowAppended={onRowAppended}
          onKeyDown={onKeyDown}
          onDelete={onDelete}
          onPaste={handlePaste}
          onColumnResize={onColumnResize}
          onCellContextMenu={onCellContextMenu}
          onCellClicked={onCellClicked}
          drawCell={drawCell}
          provideEditor={provideEditor}
          rowMarkers={{ kind: 'clickable-number', width: IS_COARSE ? 72 : 50, startIndex: 1, theme: { bgCell: '#fafafa', accentLight: '#e8e8ec' } }}
          trailingRowOptions={{
            hint: '',
            add: 'add',
            sticky: true,
            tint: true,
          }}
          freezeColumns={1}
          editOnType
          cellActivationBehavior="double-click"
          smoothScrollX={smoothScroll}
          smoothScrollY={smoothScroll}
        />
      </div>

      {/* Context Menu */}
      <ContextMenu open={!!contextMenu} x={contextMenu?.x ?? 0} y={contextMenu?.y ?? 0} onClose={() => setContextMenu(null)}>
        {contextMenu && contextMenu.row < scenes.length && (
          <>
            {contextMenu.col !== undefined && (
              <>
                <ContextMenuItem onClick={handleCopy} icon={<Copy className="w-3 h-3 text-zinc-400" />} disabled={!hasSelection}>Copy</ContextMenuItem>
                <ContextMenuItem onClick={handleCut} icon={<Scissors className="w-3 h-3 text-zinc-400" />} disabled={!hasSelection}>Cut</ContextMenuItem>
                <ContextMenuItem onClick={handlePasteFromMenu} icon={<ClipboardPaste className="w-3 h-3 text-zinc-400" />} disabled={!hasActiveCell}>Paste</ContextMenuItem>
                <ContextMenuItem onClick={handleClear} icon={<Trash2 className="w-3 h-3 text-zinc-400" />} disabled={!hasSelection}>Clear</ContextMenuItem>
                <ContextMenuDivider />
              </>
            )}
            <ContextMenuItem onClick={() => { insertSceneAt(contextMenu.row); setContextMenu(null); }} icon={<Plus className="w-3 h-3 text-zinc-400" />}>Insert Above</ContextMenuItem>
            <ContextMenuItem onClick={() => { insertSceneAt(contextMenu.row + 1); setContextMenu(null); }} icon={<ArrowDown className="w-3 h-3 text-zinc-400" />}>Insert Below</ContextMenuItem>
            <ContextMenuItem onClick={() => { duplicateSceneAt(contextMenu.row); setContextMenu(null); }} icon={<Copy className="w-3 h-3 text-zinc-400" />}>Duplicate</ContextMenuItem>
            <ContextMenuDivider />
            <ContextMenuItem onClick={() => { if (onOpenSheet) onOpenSheet(contextMenu.row); setContextMenu(null); }} icon={<Eye className="w-3 h-3 text-zinc-400" />}>Open Sheet</ContextMenuItem>
            <ContextMenuDivider />
            <ContextMenuItem onClick={() => { deleteScene(scenes[contextMenu.row]?.id); setContextMenu(null); }} variant="danger" icon={<Trash2 className="w-3 h-3" />}>Delete Row</ContextMenuItem>
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
        {contextMenu && contextMenu.row >= scenes.length && (
          <ContextMenuItem onClick={() => { addScene(); setContextMenu(null); }} icon={<Plus className="w-3 h-3 text-zinc-400" />}>Add Scene</ContextMenuItem>
        )}
      </ContextMenu>

      <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
    </div>
  );
}
