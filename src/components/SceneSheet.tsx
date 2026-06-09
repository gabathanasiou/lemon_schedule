import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useProject } from '../store';
import { Scene, IntExt, DayNight } from '../types';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { EntityDropdown } from './EntityDropdown';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import { CellInput } from './CellInput';
import { parsePageCount, formatPageCount } from '../lib/utils';

const INT_EXT_OPTIONS: IntExt[] = ['INT', 'EXT', 'INT/EXT'];
const DAY_NIGHT_OPTIONS: DayNight[] = ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'DAWN', 'DUSK'];

const BREAKDOWN_CATS = [
  'set', 'cast', 'extras', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup',
  'sfx', 'vfx', 'sound', 'music', 'animals', 'weapons', 'greenery', 'artDept', 'notes',
];
const BREAKDOWN_LABEL: Record<string, string> = {
  set: 'Set', cast: 'Cast', extras: 'Supporting Artists', stunts: 'Stunts', vehicles: 'Vehicles',
  props: 'Props', wardrobe: 'Wardrobe', makeup: 'Makeup & Hair',
  sfx: 'SFX', vfx: 'VFX', sound: 'Sound', music: 'Music',
  animals: 'Animals', weapons: 'Weapons', greenery: 'Greenery', artDept: 'Art Dept', notes: 'Notes',
};

let persistedIndex = 0;

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
  const inputsRef = useRef<Map<string, HTMLElement>>(new Map());

  const scene = scenes[index];
  const currentEdits = scene ? (edits[scene.id] || {}) : {};

  const goTo = useCallback((n: number) => {
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

  const doSave = useCallback(() => {
    const added = new Set<string>();
    for (const [id, e] of Object.entries(edits)) {
      if (!e) continue;
      for (const cat of BREAKDOWN_CATS) {
        if (cat === 'notes') continue;
        const v = (e as any)[cat]; if (!v) continue;
        const elements = breakdownElements[cat] || [];
        const existing = new Set(elements.flatMap((x: any) => [x.name.toLowerCase(), x.id.toLowerCase()]));
        for (const item of v.split(',').map((x: string) => x.trim()).filter(Boolean)) {
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

  const breakdownItems = useMemo(() => {
    const result: Record<string, { id: string; name: string }[]> = {};
    for (const cat of BREAKDOWN_CATS) {
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
        for (const v of raw.split(',').map((x: string) => x.trim()).filter(Boolean)) {
          const matched = nameMap.get(v.toLowerCase()); addItem(matched?.id || v, matched?.name || v);
        }
      }
      if (scene) {
        const ev = (edits[scene.id] as Record<string, any>)?.[cat];
        if (ev) for (const v of ev.split(',').map((x: string) => x.trim()).filter(Boolean)) { const matched = nameMap.get(v.toLowerCase()); addItem(matched?.id || v, matched?.name || v); }
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

  const inputCls = "w-full border-0 px-0 py-0 text-xs focus:outline-none focus:ring-0 bg-transparent";

  if (scenes.length === 0) return <div className="flex-1 flex items-center justify-center bg-zinc-50"><p className="text-sm text-zinc-500">No scenes defined yet.</p></div>;

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-100 overflow-hidden">
      <div className="max-w-4xl mx-auto w-full flex flex-col h-full px-4 py-3 gap-3">
        {/* Nav bar */}
        <div className="shrink-0 flex items-center justify-between px-4 py-2.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm">
          <div className="flex items-center gap-2.5">
            <button onClick={() => goTo(index - 1)} disabled={index === 0} className="p-1 rounded-md hover:bg-zinc-100 transition-colors disabled:opacity-30"><ChevronLeft className="w-4 h-4 text-zinc-600" /></button>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-zinc-400">Sheet</span>
              <input type="text" value={sheetInput} onChange={e => setSheetInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const n = parseInt(sheetInput, 10); if (n >= 1 && n <= scenes.length) goTo(n - 1); } }} className="w-12 text-center border border-zinc-200 rounded-md px-1 py-0.5 text-sm font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900" />
              <span className="text-zinc-400">of {scenes.length}</span>
            </div>
            <button onClick={() => goTo(index + 1)} disabled={index >= scenes.length - 1} className="p-1 rounded-md hover:bg-zinc-100 transition-colors disabled:opacity-30"><ChevronRight className="w-4 h-4 text-zinc-600" /></button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">{Object.keys(edits).length} edited</span>
            <button onClick={doSave} className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors shadow-sm"><Save className="w-3 h-3" /> Save</button>
          </div>
        </div>

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
                <td className="px-2.5 py-1.5 border-r border-zinc-300"><EntityDropdown value={val('set')} onChange={v => update('set', v.toUpperCase())} items={setItems} mode="select" placeholder="Set" className="text-xs" /></td>
                <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300">Location</td>
                <td className="px-2.5 py-1.5"><input className={inputCls} onKeyDown={blurOnEnter} /></td>
              </tr>
              <tr className="border-b border-zinc-300">
                <td className="px-2.5 py-1.5 text-[10px] font-bold text-zinc-700 uppercase bg-zinc-100 border-r border-zinc-300">Pages</td>
                <td className="px-2.5 py-1.5 border-r border-zinc-300"><CellInput value={val('pageCount')} onChange={v => { const d = parsePageCount(v); update('pageCount', formatPageCount(d)); }} className="w-full border-0 px-0 py-0 text-xs focus:outline-none focus:ring-0 bg-transparent" suffix="pgs" /></td>
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
        <div className="flex-1 overflow-auto tab-scroll">
          <div className="grid grid-cols-3 gap-2 pr-0.5">
            {BREAKDOWN_CATS.filter(c => c !== 'set').map(cat => (
              <div key={cat} className="bg-white border border-zinc-300 rounded overflow-hidden">
                <div className="bg-zinc-100 px-2.5 py-1.5 border-b border-zinc-300 text-[10px] font-bold text-zinc-700 uppercase leading-tight">{BREAKDOWN_LABEL[cat]}</div>
                <div className={cat === 'cast' ? 'p-1 min-h-[80px]' : 'p-1'}>
                  {cat === 'notes' ? (
                    <textarea className="w-full border-0 p-0 text-xs focus:outline-none focus:ring-0 bg-transparent resize-none" rows={2}
                      value={val('notes')} onChange={e => update('notes', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur(); } }} />
                  ) : cat === 'cast' ? (
                    <EntityDropdown value={val('cast')} onChange={v => update('cast', v)} items={breakdownItems['cast'] || []} positioning="fixed" mode="multi" placeholder="Cast" className="text-xs" displayMode="id" renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name || '—'}</span></>} />
                  ) : (
                    <EntityDropdown value={val(cat)} onChange={v => update(cat, v)} items={breakdownItems[cat] || []} positioning="fixed" mode="multi" placeholder={BREAKDOWN_LABEL[cat]} className="text-xs" renderItem={(item) => <span className="truncate flex-1">{item.name}</span>} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
      </div>
    </div>
  );
}
