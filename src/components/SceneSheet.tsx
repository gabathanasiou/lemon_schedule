import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Spreadsheet, { CellBase, DataEditorComponent } from 'react-spreadsheet';
import { useProject } from '../store';
import { Scene, IntExt, DayNight } from '../types';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { EntityDropdown } from './EntityDropdown';
import { AutocompleteDropdown } from './AutocompleteDropdown';

const INT_EXT_OPTIONS: IntExt[] = ['INT', 'EXT', 'INT/EXT'];
const DAY_NIGHT_OPTIONS: DayNight[] = ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'DAWN', 'DUSK'];

const BREAKDOWN_CATS = [
  'cast', 'extras', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup',
  'sfx', 'vfx', 'sound', 'music', 'animals', 'weapons', 'greenery', 'artDept',
];
const BREAKDOWN_LABEL: Record<string, string> = {
  cast: 'Cast', extras: 'Supporting Artists', stunts: 'Stunts', vehicles: 'Vehicles',
  props: 'Props', wardrobe: 'Wardrobe', makeup: 'Makeup & Hair',
  sfx: 'SFX', vfx: 'VFX', sound: 'Sound', music: 'Music',
  animals: 'Animals', weapons: 'Weapons', greenery: 'Greenery', artDept: 'Art Dept',
};

const COLUMNS = [
  { key: 'sceneNumber', label: 'Scene #' },
  { key: 'pageCount', label: 'Pages' },
  { key: 'scriptDay', label: 'Day' },
  { key: 'intExt', label: 'I/E' },
  { key: 'set', label: 'Set' },
  { key: 'dayNight', label: 'D/N' },
  { key: 'description', label: 'Synopsis' },
  { key: 'cast', label: 'Cast' },
  { key: 'notes', label: 'Notes' },
  ...BREAKDOWN_CATS.filter(c => c !== 'cast').map(key => ({ key, label: BREAKDOWN_LABEL[key] })),
];

let persistedIndex = 0;

const CELL_CSS = `
.Spreadsheet { border-collapse: collapse; width: 100%; font-family: inherit; font-size: 11px; }
.Spreadsheet__table { border-collapse: collapse; }
.Spreadsheet__header-row { background: #f4f4f5; }
.Spreadsheet__header-row th { border: 1px solid #d4d4d8; font-weight: 600; font-size: 9px; color: #52525b; padding: 3px 4px; text-transform: uppercase; letter-spacing: 0.05em; }
.Spreadsheet__cell { border: 1px solid #d4d4d8; padding: 2px 4px; min-height: 22px; }
.Spreadsheet__cell--selected { background: #e8f0fe; }
.Spreadsheet__cell--active { box-shadow: inset 0 0 0 1.5px #18181b; }
.Spreadsheet__cell input { appearance: none; width: 100%; height: 100%; border: 0; outline: none; padding: 0 2px; font-family: inherit; font-size: 11px; background: transparent; }
.Spreadsheet__data-editor { appearance: none; width: 100%; height: 100%; border: 0; outline: none; padding: 1px 2px; font-family: inherit; font-size: 11px; }
`;

export function SceneSheet({ initialIndex, onIndexChange }: { initialIndex?: number; onIndexChange?: (idx: number) => void }) {
  const { state, dispatch } = useProject();
  const project = state.present;
  const scenes = project.scenes;
  const breakdownElements = project.breakdownElements || {};
  const castMembers = project.castMembers || [];

  const [index, setIndex] = useState(() => Math.min(initialIndex ?? persistedIndex, Math.max(scenes.length - 1, 0)));
  useEffect(() => { persistedIndex = index; }, [index]);
  const [sheetInput, setSheetInput] = useState(String(index + 1));
  const [edits, setEdits] = useState<Record<string, Partial<Scene>>>({});
  const snapRef = useRef<{ id: string }[]>([]);

  useEffect(() => {
    snapRef.current = scenes.map(s => ({ id: s.id }));
  }, [scenes]);

  const scene = scenes[index];
  const currentEdits = scene ? (edits[scene.id] || {}) : {};

  const goTo = useCallback((n: number) => {
    const idx = Math.max(0, Math.min(scenes.length - 1, n));
    setIndex(idx); setSheetInput(String(idx + 1));
    onIndexChange?.(idx);
  }, [scenes.length, onIndexChange]);

  const val = useCallback((field: string): any => {
    if (!scene) return '';
    return field in currentEdits ? (currentEdits as any)[field] : (scene as any)[field] || '';
  }, [scene, currentEdits]);

  const doSave = useCallback(() => {
    for (const [id, e] of Object.entries(edits)) {
      if (!e) continue;
      for (const cat of BREAKDOWN_CATS) {
        const v = (e as any)[cat];
        if (!v) continue;
        const existing = (breakdownElements[cat] || []).map((x: any) => x.name.toLowerCase());
        for (const item of v.split(',').map((x: string) => x.trim()).filter(Boolean)) {
          if (!existing.includes(item.toLowerCase())) {
            dispatch({ type: 'ADD_ELEMENT', payload: { category: cat, element: { id: item, name: item } } });
          }
        }
      }
      dispatch({ type: 'UPDATE_SCENE', payload: { id, ...(e as Record<string, any>) } });
    }
    setEdits({});
  }, [edits, dispatch, breakdownElements]);

  const breakdownItems = useMemo(() => {
    const result: Record<string, { id: string; name: string }[]> = {};
    for (const cat of BREAKDOWN_CATS) {
      const stored: { id: string; name: string }[] = (breakdownElements[cat] || []);
      const nameMap = new Map(stored.map(e => [e.name.toLowerCase(), e]));
      const items: { id: string; name: string }[] = [];
      const addItem = (id: string, name: string) => {
        const key = id || name;
        if (!items.some(i => (i.id || i.name) === key)) items.push({ id, name });
      };
      for (const e of stored) addItem(e.id || e.name, e.name);
      for (const s of scenes) {
        const raw = cat === 'cast' ? s.cast : (s as any)[cat] || '';
        for (const v of raw.split(',').map((x: string) => x.trim()).filter(Boolean)) {
          const matched = nameMap.get(v.toLowerCase());
          addItem(matched?.id || v, matched?.name || v);
        }
      }
      if (scene) {
        const ev = (edits[scene.id] as Record<string, any>)?.[cat];
        if (ev) for (const v of ev.split(',').map((x: string) => x.trim()).filter(Boolean)) {
          const matched = nameMap.get(v.toLowerCase());
          addItem(matched?.id || v, matched?.name || v);
        }
      }
      result[cat] = items;
    }
    return result;
  }, [scenes, breakdownElements, edits, scene]);

  const data: CellBase[][] = useMemo(() => {
    if (!scene) return [];
    return [COLUMNS.map(c => {
      const raw = val(c.key);
      if (c.key === 'intExt') {
        return { value: raw, DataEditor: IntExtEditor };
      }
      if (c.key === 'dayNight') {
        return { value: raw, DataEditor: DayNightEditor };
      }
      if (c.key === 'cast') {
        return { value: raw, DataEditor: CastEditor };
      }
      if (c.key === 'description' || c.key === 'notes') {
        return { value: raw, DataEditor: TextareaEditor };
      }
      if (BREAKDOWN_CATS.includes(c.key)) {
        const items = breakdownItems[c.key] || [];
        return { value: raw, DataEditor: makeCatEditor(items) };
      }
      return { value: raw };
    })];
  }, [scene, val, breakdownItems]);

  const update = useCallback((field: string, value: any) => {
    if (!scene) return;
    setEdits(prev => {
      const existing = prev[scene.id] || {} as Partial<Scene>;
      return { ...prev, [scene.id]: { ...existing, [field]: value } };
    });
  }, [scene]);

  const handleChange = useCallback((newData: CellBase[][]) => {
    if (!scene || !newData[0]) return;
    for (let col = 0; col < COLUMNS.length; col++) {
      const c = COLUMNS[col];
      const newVal = String(newData[0][col]?.value ?? '');
      const oldVal = String(val(c.key));
      if (newVal !== oldVal) {
        if (c.key === 'set') update(c.key, newVal.toUpperCase());
        else if (c.key === 'scriptDay') update(c.key, newVal.replace(/[^0-9]/g, ''));
        else if (c.key === 'intExt') { const m = INT_EXT_OPTIONS.find(o => o.toLowerCase() === newVal.toLowerCase()); if (m) update(c.key, m); }
        else if (c.key === 'dayNight') { const m = DAY_NIGHT_OPTIONS.find(o => o.toLowerCase() === newVal.toLowerCase()); if (m) update(c.key, m); }
        else if (c.key === 'pageCount') { const d = parseInt(newVal.replace(/[^0-9]/g, ''), 10); update(c.key, isNaN(d) ? '' : String(d)); }
        else update(c.key, newVal);
      }
    }
  }, [scene, val, update]);

  if (scenes.length === 0) {
    return <div className="flex-1 flex items-center justify-center bg-zinc-50"><p className="text-sm text-zinc-500">No scenes defined yet.</p></div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-100 overflow-hidden">
      <div className="max-w-4xl mx-auto w-full flex flex-col h-full px-4 py-3 gap-3">
        <div className="shrink-0 flex items-center justify-between px-4 py-2.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm">
          <div className="flex items-center gap-2.5">
            <button onClick={() => goTo(index - 1)} disabled={index === 0} className="p-1 rounded-md hover:bg-zinc-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4 text-zinc-600" />
            </button>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-zinc-400">Sheet</span>
              <input type="text" value={sheetInput} onChange={e => setSheetInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { const n = parseInt(sheetInput, 10); if (n >= 1 && n <= scenes.length) goTo(n - 1); } }}
                className="w-12 text-center border border-zinc-200 rounded-md px-1 py-0.5 text-sm font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900" />
              <span className="text-zinc-400">of {scenes.length}</span>
            </div>
            <button onClick={() => goTo(index + 1)} disabled={index >= scenes.length - 1} className="p-1 rounded-md hover:bg-zinc-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">{Object.keys(edits).length} edited</span>
            <button onClick={doSave} className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors shadow-sm">
              <Save className="w-3 h-3" /> Save
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto rounded-xl bg-white border border-zinc-200/80 shadow-sm">
          <style>{CELL_CSS}</style>
          <Spreadsheet data={data} onChange={handleChange} columnLabels={COLUMNS.map(c => c.label)} />
        </div>
      </div>
    </div>
  );
}

/* --- Editors matching BreakdownTab patterns --- */

const IntExtEditor: DataEditorComponent<CellBase<string>> = ({ cell, onChange, exitEditMode }) => (
  <AutocompleteDropdown value={cell?.value || ''} onChange={v => { onChange({ value: v }); exitEditMode(); }} options={INT_EXT_OPTIONS} defaultOpen autoFocus showAll />
);
const DayNightEditor: DataEditorComponent<CellBase<string>> = ({ cell, onChange, exitEditMode }) => (
  <AutocompleteDropdown value={cell?.value || ''} onChange={v => { onChange({ value: v }); exitEditMode(); }} options={DAY_NIGHT_OPTIONS} defaultOpen autoFocus showAll />
);
const TextareaEditor: DataEditorComponent<CellBase<string>> = ({ cell, onChange, exitEditMode }) => {
  const [val, setVal] = useState(cell?.value || '');
  return <textarea className="w-full border-0 p-0 text-[11px] focus:outline-none resize-none bg-transparent" rows={2} value={val}
    onChange={e => setVal(e.target.value)}
    onBlur={() => { onChange({ value: val }); exitEditMode(); }}
    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onChange({ value: val }); exitEditMode(); } }}
    autoFocus />;
};
const CastEditor: DataEditorComponent<CellBase<string>> = ({ cell, onChange, exitEditMode }) => {
  const committedRef = useRef(false);
  return <EntityDropdown value={cell?.value || ''} onChange={v => { if (committedRef.current) return; committedRef.current = true; onChange({ value: v }); exitEditMode(); }} positioning="relative" defaultOpen autoFocus />;
};

function makeCatEditor(items: { id: string; name: string }[]): DataEditorComponent<CellBase<string>> {
  const Editor: DataEditorComponent<CellBase<string>> = ({ cell, onChange, exitEditMode }) => {
    const committedRef = useRef(false);
    return <EntityDropdown value={cell?.value || ''} onChange={v => { if (committedRef.current) return; committedRef.current = true; onChange({ value: v }); exitEditMode(); }} items={items} positioning="relative" defaultOpen autoFocus mode="multi" />;
  };
  return Editor;
}
