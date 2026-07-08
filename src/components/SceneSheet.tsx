import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useProject, DEFAULT_CATEGORY_LABELS } from '../store';
import { Scene } from '../types';
import { ChevronLeft, ChevronRight, Plus, Copy, Trash2 } from 'lucide-react';
import { EntityDropdown } from './EntityDropdown';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import { CellInput } from './CellInput';
import { parsePageCount, formatPageCount, generateUUID, formatDateLong } from '../lib/utils';
import { sceneStyle, INT_EXT_OPTIONS, DAY_NIGHT_OPTIONS, getFallbackStripColors } from '../lib/ribbonUtils';
import { getFieldItems, isMultiValue } from '../lib/categories';

const BREAKDOWN_CATS = [
  'set', 'cast', 'backgroundActors', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup',
  'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept', 'notes',
];
const BREAKDOWN_LABEL: Record<string, string> = {
  set: 'Set', cast: 'Cast', backgroundActors: 'Background Actors', stunts: 'Stunts', vehicles: 'Vehicles',
  props: 'Props', wardrobe: 'Wardrobe', makeup: 'Makeup & Hair',
  sfx: 'SFX', vfx: 'VFX', sound: 'Sound', music: 'Music',
  animalsAndWranglers: 'Animals & Wranglers', weapons: 'Weapons', greenery: 'Greenery', artDept: 'Art Dept', notes: 'Notes',
};

let persistedIndex = 0;

export function SceneSheet({ initialIndex, onIndexChange, headerTarget, onOpenSchedule }: { initialIndex?: number; onIndexChange?: (idx: number) => void; headerTarget?: HTMLElement | null; onOpenSchedule?: (sceneId: string) => void }) {
  const { state, dispatch } = useProject();
  const project = state.present;
  const scenes = project.scenes;
  const breakdownElements = project.breakdownElements || {};
  const castMembers = project.castMembers || [];

  const hiddenSet = useMemo(() => new Set(project.hiddenCategories || []), [project.hiddenCategories]);

  const allBreakdownCats = useMemo(() => [
    ...BREAKDOWN_CATS.filter(k => !hiddenSet.has(k)),
    ...(project.customCategories || []).map(c => c.key),
  ], [project.customCategories, hiddenSet]);

  const allBreakdownLabel = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const k of BREAKDOWN_CATS) labels[k] = project.categoryLabels?.[k] || DEFAULT_CATEGORY_LABELS[k] || BREAKDOWN_LABEL[k] || k;
    for (const c of project.customCategories || []) labels[c.key] = c.label;
    return labels;
  }, [project.customCategories, project.categoryLabels]);

  const [index, setIndex] = useState(() => Math.min(initialIndex ?? persistedIndex, Math.max(scenes.length - 1, 0)));
  useEffect(() => { persistedIndex = index; }, [index]);
  const [sheetInput, setSheetInput] = useState(String(index + 1));
  const [edits, setEdits] = useState<Record<string, Partial<Scene>>>({});
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputsRef = useRef<Map<string, HTMLElement>>(new Map());

  const scene = scenes[index];
  const currentEdits = scene ? (edits[scene.id] || {}) : {};

  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const scheduleRow = scene ? activeVersion?.rows.find(r => r.sceneId === scene.id) : null;
  const shootDay = scheduleRow?.shootDay;
  const shootDayMeta = shootDay != null ? activeVersion?.dayMeta?.[shootDay] : null;

  const chronoDayMap = useMemo(() => {
    const m = new Map<number, number>();
    const existingDays = Object.keys(activeVersion?.dayMeta || {}).map(Number).sort((a, b) => {
      const dateA = activeVersion?.dayMeta?.[a]?.date || '';
      const dateB = activeVersion?.dayMeta?.[b]?.date || '';
      return dateA.localeCompare(dateB);
    });
    let counter = 0;
    for (const d of existingDays) {
      const status = activeVersion?.dayMeta?.[d]?.status;
      if (!status || status === 'work') { counter++; m.set(d, counter); }
    }
    return m;
  }, [activeVersion?.dayMeta]);

  const displayDay = shootDay != null ? (chronoDayMap.get(shootDay) ?? shootDay) : null;

  const goTo = useCallback((n: number) => {
    if (Object.keys(editsRef.current).length > 0) {
      saveRef.current();
    }
    const idx = Math.max(0, Math.min(scenes.length - 1, n));
    setIndex(idx); setSheetInput(String(idx + 1));
    onIndexChange?.(idx);
  }, [scenes.length, onIndexChange]);

  const update = useCallback((field: string, value: any) => {
    if (!scene) return;
    setEdits(prev => {
      const existing = prev[scene.id] || {} as Partial<Scene>;
      return { ...prev, [scene.id]: { ...existing, [field]: value } };
    });
  }, [scene]);

  const val = useCallback((field: string): any => {
    if (!scene) return '';
    const cur = (currentEdits as any)[field];
    return cur !== undefined ? cur : (scene as any)[field] || '';
  }, [scene, currentEdits]);

  const createNewScene = useCallback(() => {
    if (Object.keys(editsRef.current).length > 0) {
      saveRef.current();
    }
    const newId = generateUUID();
    dispatch({
      type: 'ADD_SCENE',
      payload: {
        id: newId,
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
        shootDay: null,
      }
    });
    const newIdx = scenes.length;
    setIndex(newIdx);
    setSheetInput(String(newIdx + 1));
    onIndexChange?.(newIdx);
  }, [dispatch, scenes.length, onIndexChange]);

  const duplicateScene = useCallback(() => {
    if (!scene) return;
    if (Object.keys(editsRef.current).length > 0) {
      saveRef.current();
    }
    const dup: Scene = { ...scene, id: generateUUID() };
    dispatch({ type: 'INSERT_SCENE_AT', payload: { index: index + 1, scene: dup } });
    const newIdx = index + 1;
    setIndex(newIdx);
    setSheetInput(String(newIdx + 1));
    onIndexChange?.(newIdx);
  }, [scene, index, dispatch, onIndexChange]);

  const deleteCurrentScene = useCallback(() => {
    if (!scene) return;
    if (Object.keys(editsRef.current).length > 0) {
      setEdits({});
    }
    dispatch({ type: 'DELETE_SCENE', payload: scene.id });
    const newLen = scenes.length - 1;
    const newIdx = Math.min(index, Math.max(0, newLen - 1));
    setIndex(newIdx);
    setSheetInput(String(newIdx + 1));
    onIndexChange?.(newIdx);
  }, [scene, index, dispatch, scenes.length, onIndexChange]);

  const doSave = useCallback(() => {
    const added = new Set<string>();
    for (const [id, e] of Object.entries(edits)) {
      if (!e) continue;
      for (const cat of allBreakdownCats) {
        if (cat === 'notes') continue;
        const v = (e as any)[cat]; if (!v) continue;
        const elements = breakdownElements[cat] || [];
        const existing = new Set(elements.flatMap((x: any) => [x.name.toLowerCase(), x.id.toLowerCase()]));
        for (const item of getFieldItems(cat, v)) {
          const key = `${cat}:${item.toLowerCase()}`;
          if (!existing.has(item.toLowerCase()) && !added.has(key)) {
            added.add(key);
            const name = cat === 'cast' ? (castMembers.find(m => m.id === item)?.name ?? '') : item;
            dispatch({ type: 'ADD_ELEMENT', payload: { category: cat, element: { id: item, name } } });
          }
        }
      }
      dispatch({ type: 'UPDATE_SCENE', payload: { id, ...(e as Record<string, any>) } });
    }
    setEdits({});
  }, [edits, dispatch, breakdownElements, castMembers]);

  const saveRef = useRef(doSave);
  saveRef.current = doSave;

  const breakdownItems = useMemo(() => {
    const result: Record<string, { id: string; name: string }[]> = {};
    for (const cat of allBreakdownCats) {
      if (cat === 'notes') continue;
      const stored: { id: string; name: string }[] = (breakdownElements[cat] || []);
      const nameMap = new Map(stored.map(e => [e.name.toLowerCase(), e]));
      const items: { id: string; name: string }[] = [];
      const addItem = (iid: string, iname: string) => {
        const k = (iid || iname).toLowerCase();
        if (items.some(i => (i.id || i.name).toLowerCase() === k)) return;
        if (cat === 'cast') {
          const nameIdx = items.findIndex(i => i.name.toLowerCase() === iname.toLowerCase());
          if (nameIdx >= 0) {
            if (!items[nameIdx].id && iid) items[nameIdx] = { id: iid, name: iname };
            return;
          }
        }
        items.push({ id: iid, name: iname });
      };
      for (const e of stored) addItem(e.id || e.name, e.name);
      if (cat === 'cast') {
        for (const m of castMembers) { addItem(m.id, m.name); nameMap.set(m.id.toLowerCase(), m); nameMap.set(m.name.toLowerCase(), m); }
      }
      for (const s of scenes) {
        const raw = cat === 'cast' ? s.cast : (s as any)[cat] || '';
        for (const v of getFieldItems(cat, raw)) {
          const matched = nameMap.get(v.toLowerCase()); addItem(matched?.id || v, matched?.name || v);
        }
      }
      if (scene) {
        const ev = (edits[scene.id] as Record<string, any>)?.[cat];
        if (ev) for (const v of getFieldItems(cat, ev)) { const matched = nameMap.get(v.toLowerCase()); addItem(matched?.id || v, matched?.name || v); }
      }
      result[cat] = items;
    }
    return result;
  }, [scenes, breakdownElements, castMembers, edits, scene]);

  const setItems = useMemo(() => {
    const sets = new Map<string, string>();
    for (const s of scenes) { const v = s.set.trim().toUpperCase(); if (v) sets.set(v, v); }
    (breakdownElements['set'] || []).forEach(e => { const v = e.name.toUpperCase(); if (v) sets.set(v, v); });
    return [...sets.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id));
  }, [scenes, breakdownElements]);

  const blurOnEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } };
  const focusNext = (key: string) => { /* tab order follows DOM by default */ };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onFocusOut = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node)) {
        if (Object.keys(editsRef.current).length > 0) {
          saveRef.current();
        }
      }
    };
    el.addEventListener('focusout', onFocusOut);
    return () => el.removeEventListener('focusout', onFocusOut);
  }, []);

  useEffect(() => {
    return () => {
      if (Object.keys(editsRef.current).length > 0) {
        saveRef.current();
      }
    };
  }, []);

  const inputCls = "w-full border-0 px-0 py-0 text-xs focus:outline-none focus:ring-0 bg-transparent";

  if (scenes.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center bg-zinc-50 gap-4">
      <p className="text-sm text-zinc-500">No scenes defined yet.</p>
      <button
        onClick={createNewScene}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors shadow-sm"
      >
        <Plus className="w-4 h-4" />
        Create First Scene
      </button>
    </div>
  );

  const navBar = scenes.length > 0 ? (
    <div className="shrink-0 flex items-center justify-between px-4 py-2.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm">
      <div className="flex items-center gap-2.5">
        <button onClick={() => goTo(index - 1)} disabled={index === 0} className="p-1 rounded-md hover:bg-zinc-100 transition-colors disabled:opacity-30"><ChevronLeft className="w-4 h-4 text-zinc-600" /></button>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-zinc-400">Sheet</span>
          <input type="text" value={sheetInput} onChange={e => setSheetInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const n = parseInt(sheetInput, 10); if (n >= 1 && n <= scenes.length) goTo(n - 1); } }} className="w-12 text-center border border-zinc-200 rounded-md px-1 py-0.5 text-sm font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900" />
          <span className="text-zinc-400">of {scenes.length}</span>
        </div>
        <button onClick={() => goTo(index + 1)} disabled={index >= scenes.length - 1} className="p-1 rounded-md hover:bg-zinc-100 transition-colors disabled:opacity-30"><ChevronRight className="w-4 h-4 text-zinc-600" /></button>
        <div className="w-px h-5 bg-zinc-200 mx-1" />
        <button onClick={createNewScene} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-colors" title="New Scene Sheet">
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
        <button onClick={duplicateScene} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-colors" title="Duplicate Scene Sheet">
          <Copy className="w-3.5 h-3.5" />
          Duplicate
        </button>
      </div>
      <button onClick={deleteCurrentScene} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors" title="Delete Scene Sheet">
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>
    </div>
  ) : null;

  const headerContent = scenes.length > 0 ? (
    <>
      <button onClick={() => goTo(index - 1)} disabled={index === 0} className="p-1 rounded hover:bg-zinc-100 transition-colors disabled:opacity-30"><ChevronLeft className="w-4 h-4 text-zinc-500" /></button>
      <span className="text-[11px] text-zinc-500">Sheet</span>
      <input type="text" value={sheetInput} onChange={e => setSheetInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const n = parseInt(sheetInput, 10); if (n >= 1 && n <= scenes.length) goTo(n - 1); } }} className="w-10 text-center border border-zinc-200 rounded px-1 py-0.5 text-[11px] font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900" />
      <span className="text-[11px] text-zinc-500">of {scenes.length}</span>
      <button onClick={() => goTo(index + 1)} disabled={index >= scenes.length - 1} className="p-1 rounded hover:bg-zinc-100 transition-colors disabled:opacity-30"><ChevronRight className="w-4 h-4 text-zinc-500" /></button>
      <div className="w-px h-4 bg-zinc-300 mx-1.5" />
      <button onClick={createNewScene} className="bg-zinc-900 text-white px-2.5 py-1 rounded text-[11px] font-semibold hover:bg-zinc-800 transition-colors flex items-center gap-1">
        <Plus className="w-3 h-3" /> New
      </button>
      <button onClick={duplicateScene} className="bg-white border border-zinc-300 px-2.5 py-1 text-zinc-600 rounded text-[11px] font-medium hover:bg-zinc-50 transition-colors flex items-center gap-1">
        <Copy className="w-3 h-3" /> Duplicate
      </button>
      <button onClick={deleteCurrentScene} className="bg-white border border-zinc-300 px-2.5 py-1 text-rose-600 rounded text-[11px] font-medium hover:bg-rose-50 transition-colors flex items-center gap-1">
        <Trash2 className="w-3 h-3" /> Delete
      </button>
    </>
  ) : null;

  return (
    <div ref={containerRef} className="flex-1 flex flex-col h-full bg-zinc-100 overflow-y-auto" style={{ paddingBottom: 'calc(120px + env(safe-area-inset-bottom, 0px))' }}>
      {headerTarget && headerContent ? createPortal(headerContent, headerTarget) : null}

      {scene && (() => {
        const colors = sceneStyle(scene, project.colorPalette?.sceneColors, getFallbackStripColors(project.colorPalette));
        return (
          <div
            className="shrink-0 w-full flex items-center gap-3 px-4 py-1.5 cursor-pointer select-none"
            style={{ background: colors.background, color: colors.color }}
            onClick={() => onOpenSchedule?.(scene.id)}
            title="Click to open in Schedule"
          >
            {shootDayMeta ? (
              <>
                <span className="font-bold text-sm whitespace-nowrap">Day {displayDay}</span>
                <span className="flex-1 text-center text-xs font-semibold opacity-80">Date: {formatDateLong(shootDayMeta.date)}</span>
              </>
            ) : (
              <span className="text-center text-xs font-semibold opacity-80 w-full">Unscheduled</span>
            )}
          </div>
        );
      })()}

      <div className="max-w-4xl mx-auto w-full flex flex-col h-full px-4 py-3 gap-3">
        {!headerTarget && navBar}

        {/* Header table — matches print layout */}
        <div className="bg-white border border-zinc-300">
          <table className="w-full border-collapse text-xs">
            <tbody>
              <tr className="border-b border-zinc-300">
                <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300 w-[85px]">Scene Sheet</td>
                <td className="px-2.5 py-1.5 border-r border-zinc-300"><span className="text-sm font-semibold text-zinc-800">{index + 1}</span></td>
                <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300 w-[85px]">Scene No.</td>
                <td className="px-2.5 py-1.5"><input className={inputCls} value={val('sceneNumber')} onChange={e => update('sceneNumber', e.target.value)} onKeyDown={blurOnEnter} /></td>
              </tr>
              <tr className="border-b border-zinc-300">
                <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300">Int/Ext</td>
                <td className="px-2.5 py-1.5 border-r border-zinc-300"><AutocompleteDropdown value={val('intExt')} onChange={v => update('intExt', v)} options={INT_EXT_OPTIONS} showAll /></td>
                <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300">Day/Night</td>
                <td className="px-2.5 py-1.5"><AutocompleteDropdown value={val('dayNight')} onChange={v => update('dayNight', v)} options={DAY_NIGHT_OPTIONS} showAll /></td>
              </tr>
              <tr className="border-b border-zinc-300">
                <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300">Set</td>
                <td className="px-2.5 py-1.5 border-r border-zinc-300"><EntityDropdown value={val('set')} onChange={v => update('set', v.toUpperCase())} items={setItems} mode="single" keepAlphabetical panelMinWidth="min-w-[220px]" placeholder="Set" className="text-xs" /></td>
                <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300">Location</td>
                <td className="px-2.5 py-1.5"><input className={inputCls} onKeyDown={blurOnEnter} /></td>
              </tr>
              <tr className="border-b border-zinc-300">
                <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300">Pages</td>
                <td className="px-2.5 py-1.5 border-r border-zinc-300"><CellInput value={val('pageCount')} onChange={v => { if (v === '') { update('pageCount', ''); } else { const d = parsePageCount(v); update('pageCount', formatPageCount(d)); } }} className="w-full border-0 px-0 py-0 text-xs focus:outline-none focus:ring-0 bg-transparent" suffix="pgs" /></td>
                <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300">Script Day</td>
                <td className="px-2.5 py-1.5"><input className={inputCls} value={val('scriptDay')} onChange={e => update('scriptDay', e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={blurOnEnter} /></td>
              </tr>
              <tr>
                <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300 align-top">Synopsis</td>
                <td colSpan={3} className="px-2.5 py-1.5">
                  <textarea className="w-full border-0 px-0 py-0 text-xs focus:outline-none focus:ring-0 bg-transparent resize-none" rows={2}
                    value={val('description')} onChange={e => update('description', e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur(); } }} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Category grid — 3 columns, each box has header + body, matches print */}
        <div className="grid grid-cols-3 gap-2 pr-0.5">
            {allBreakdownCats.filter(c => c !== 'set').map(cat => (
              <div key={cat} className="bg-white border border-zinc-300 rounded overflow-hidden">
                <div className="bg-zinc-100 px-2.5 py-1.5 border-b border-zinc-300 text-[10px] font-bold text-zinc-700 uppercase leading-tight">{allBreakdownLabel[cat]}</div>
                <div className={cat === 'cast' ? 'p-1 min-h-[80px]' : 'p-1'}>
                  {cat === 'notes' ? (
                    <textarea className="w-full border-0 p-0 text-xs focus:outline-none focus:ring-0 bg-transparent resize-none" rows={2}
                      value={val('notes')} onChange={e => update('notes', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur(); } }} />
                  ) : cat === 'cast' ? (
                    <EntityDropdown value={val('cast')} onChange={v => update('cast', v)} items={breakdownItems['cast'] || []} positioning="fixed" mode="multi" placeholder="Cast" className="text-xs" displayMode="id" renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name || '—'}</span></>} />
                  ) : (
                    <EntityDropdown value={val(cat)} onChange={v => update(cat, v)} items={breakdownItems[cat] || []} positioning="fixed" mode={isMultiValue(cat, project.customCategories) ? 'multi' : 'single'} placeholder={allBreakdownLabel[cat]} className="text-xs" renderItem={(item) => <span className="truncate flex-1">{item.name}</span>} />
                  )}
                </div>
              </div>
            ))}
          </div>

        {/* Notes */}
      </div>
    </div>
  );
}
