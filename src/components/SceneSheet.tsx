import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
    for (const [id, e] of Object.entries(edits)) {
      if (!e) continue;
      for (const cat of BREAKDOWN_CATS) {
        const v = (e as any)[cat]; if (!v) continue;
        const existing = (breakdownElements[cat] || []).map((x: any) => x.name.toLowerCase());
        for (const item of v.split(',').map((x: string) => x.trim()).filter(Boolean)) {
          if (!existing.includes(item.toLowerCase())) dispatch({ type: 'ADD_ELEMENT', payload: { category: cat, element: { id: item, name: item } } });
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
      const addItem = (id: string, name: string) => { const k = id || name; if (!items.some(i => (i.id || i.name) === k)) items.push({ id, name }); };
      for (const e of stored) addItem(e.id || e.name, e.name);
      if (cat === 'cast') {
        for (const m of castMembers) addItem(m.id, m.name);
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
  }, [scenes, breakdownElements, edits, scene]);

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

        {/* Header boxes — same style as category grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white border border-zinc-300 rounded overflow-hidden">
            <div className="bg-zinc-100 px-2.5 py-1.5 border-b border-zinc-300 text-[10px] font-bold text-zinc-700 uppercase leading-tight">Scene Sheet</div>
            <div className="px-2.5 py-1.5"><span className="text-sm font-semibold text-zinc-800">{index + 1}</span></div>
          </div>
          <div className="bg-white border border-zinc-300 rounded overflow-hidden">
            <div className="bg-zinc-100 px-2.5 py-1.5 border-b border-zinc-300 text-[10px] font-bold text-zinc-700 uppercase leading-tight">Scene No.</div>
            <div className="px-2.5 py-1.5"><input className={inputCls} value={val('sceneNumber')} onChange={e => update('sceneNumber', e.target.value)} onKeyDown={blurOnEnter} /></div>
          </div>
          <div className="bg-white border border-zinc-300 rounded overflow-hidden">
            <div className="bg-zinc-100 px-2.5 py-1.5 border-b border-zinc-300 text-[10px] font-bold text-zinc-700 uppercase leading-tight">Int/Ext</div>
            <div className="px-2.5 py-1.5"><AutocompleteDropdown value={val('intExt')} onChange={v => update('intExt', v)} options={INT_EXT_OPTIONS} showAll /></div>
          </div>
          <div className="bg-white border border-zinc-300 rounded overflow-hidden">
            <div className="bg-zinc-100 px-2.5 py-1.5 border-b border-zinc-300 text-[10px] font-bold text-zinc-700 uppercase leading-tight">Day/Night</div>
            <div className="px-2.5 py-1.5"><AutocompleteDropdown value={val('dayNight')} onChange={v => update('dayNight', v)} options={DAY_NIGHT_OPTIONS} showAll /></div>
          </div>
          <div className="bg-white border border-zinc-300 rounded overflow-hidden">
            <div className="bg-zinc-100 px-2.5 py-1.5 border-b border-zinc-300 text-[10px] font-bold text-zinc-700 uppercase leading-tight">Set</div>
            <div className="px-2.5 py-1.5"><input className={inputCls} value={val('set')} onChange={e => update('set', e.target.value.toUpperCase())} onKeyDown={blurOnEnter} /></div>
          </div>
          <div className="bg-white border border-zinc-300 rounded overflow-hidden">
            <div className="bg-zinc-100 px-2.5 py-1.5 border-b border-zinc-300 text-[10px] font-bold text-zinc-700 uppercase leading-tight">Location</div>
            <div className="px-2.5 py-1.5"><input className={inputCls} onKeyDown={blurOnEnter} /></div>
          </div>
          <div className="bg-white border border-zinc-300 rounded overflow-hidden">
            <div className="bg-zinc-100 px-2.5 py-1.5 border-b border-zinc-300 text-[10px] font-bold text-zinc-700 uppercase leading-tight">Pages</div>
            <div className="px-2.5 py-1.5"><input className={inputCls} value={val('pageCount')} onChange={e => update('pageCount', e.target.value)} onKeyDown={blurOnEnter} /></div>
          </div>
          <div className="bg-white border border-zinc-300 rounded overflow-hidden">
            <div className="bg-zinc-100 px-2.5 py-1.5 border-b border-zinc-300 text-[10px] font-bold text-zinc-700 uppercase leading-tight">Script Day</div>
            <div className="px-2.5 py-1.5"><input className={inputCls} value={val('scriptDay')} onChange={e => update('scriptDay', e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={blurOnEnter} /></div>
          </div>
          <div className="bg-white border border-zinc-300 rounded overflow-hidden col-span-2">
            <div className="bg-zinc-100 px-2.5 py-1.5 border-b border-zinc-300 text-[10px] font-bold text-zinc-700 uppercase leading-tight">Synopsis</div>
            <div className="px-2.5 py-1.5">
              <textarea className="w-full border-0 px-0 py-0 text-xs focus:outline-none focus:ring-0 bg-transparent resize-none" rows={2}
                value={val('description')} onChange={e => update('description', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur(); } }} />
            </div>
          </div>
        </div>

        {/* Category grid — 3 columns, each box has header + body, matches print */}
        <div className="flex-1 overflow-auto tab-scroll">
          <div className="grid grid-cols-3 gap-2 pr-0.5">
            {BREAKDOWN_CATS.map(cat => (
              <div key={cat} className="bg-white border border-zinc-300 rounded overflow-hidden">
                <div className="bg-zinc-100 px-2.5 py-1.5 border-b border-zinc-300 text-[10px] font-bold text-zinc-700 uppercase leading-tight">{BREAKDOWN_LABEL[cat]}</div>
                <div className={cat === 'cast' ? 'p-1 min-h-[80px]' : 'p-1'}>
                  {cat === 'cast' ? (
                    <EntityDropdown value={val('cast')} onChange={v => update('cast', v)} items={breakdownItems['cast'] || []} positioning="fixed" mode="multi" placeholder="Cast" className="text-xs" renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name || '—'}</span></>} />
                  ) : (
                    <EntityDropdown value={val(cat)} onChange={v => update(cat, v)} items={breakdownItems[cat] || []} positioning="fixed" mode="multi" placeholder={BREAKDOWN_LABEL[cat]} className="text-xs" renderItem={(item) => <span className="truncate flex-1">{item.name}</span>} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white border border-zinc-300 rounded overflow-hidden">
          <div className="bg-zinc-100 px-2.5 py-1.5 border-b border-zinc-300 text-[10px] font-bold text-zinc-700 uppercase leading-tight">Notes</div>
          <div className="px-2.5 py-1.5">
            <textarea className="w-full border-0 px-0 py-0 text-xs focus:outline-none focus:ring-0 bg-transparent resize-none" rows={2}
              value={val('notes')} onChange={e => update('notes', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur(); } }} />
          </div>
        </div>
      </div>
    </div>
  );
}
