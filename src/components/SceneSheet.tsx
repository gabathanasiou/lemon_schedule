import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useProject } from '../store';
import { Scene, IntExt, DayNight, ProjectElement } from '../types';
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

export function SceneSheet() {
  const { state, dispatch } = useProject();
  const scenes = state.present.scenes;
  const breakdownElements = state.present.breakdownElements || {};
  const castMembers = state.present.castMembers || [];

  const [index, setIndex] = useState(0);
  const [sheetInput, setSheetInput] = useState('1');
  const [edits, setEdits] = useState<Record<string, Partial<Scene>>>({});
  const snapRef = useRef<{ id: string; sceneNumber: string }[]>([]);

  useEffect(() => {
    snapRef.current = scenes.map(s => ({ id: s.id, sceneNumber: s.sceneNumber }));
  }, [scenes]);

  const scene = scenes[index];
  const currentEdits = scene ? (edits[scene.id] || {}) : {};

  const goTo = useCallback((n: number) => {
    const idx = Math.max(0, Math.min(scenes.length - 1, n));
    setIndex(idx);
    setSheetInput(String(idx + 1));
  }, [scenes.length]);

  const update = useCallback((field: keyof Scene, value: any) => {
    if (!scene) return;
    setEdits(prev => {
      const existing = prev[scene.id] || {} as Partial<Scene>;
      return { ...prev, [scene.id]: { ...existing, [field]: value } };
    });
  }, [scene]);

  const val = useCallback((field: keyof Scene): any => {
    if (!scene) return '';
    return field in currentEdits ? currentEdits[field] : scene[field];
  }, [scene, currentEdits]);

  const doSave = useCallback(() => {
    for (const [id, e] of Object.entries(edits)) {
      if (!e) continue;
      for (const cat of BREAKDOWN_CATS) {
        const val = (e as any)[cat];
        if (!val) continue;
        const existing = (breakdownElements[cat] || []).map((x: any) => x.name.toLowerCase());
        for (const item of val.split(',').map((x: string) => x.trim()).filter(Boolean)) {
          if (!existing.includes(item.toLowerCase())) {
            dispatch({ type: 'ADD_ELEMENT', payload: { category: cat, element: { id: item, name: item } } });
          }
        }
      }
      const payload = { id, ...(e as Record<string, any>) };
      dispatch({ type: 'UPDATE_SCENE', payload });
    }
    setEdits({});
  }, [edits, dispatch, breakdownElements]);

  const breakdownItems = useMemo(() => {
    const result: Record<string, { id: string; name: string }[]> = {};
    for (const cat of BREAKDOWN_CATS) {
      const stored = breakdownElements[cat] || [];
      const nameMap = new Map(stored.map((e: any) => [e.name.toLowerCase(), e]));
      const all = [...new Set([
        ...stored.map((e: any) => ({ id: e.id || e.name, name: e.name })),
        ...scenes.flatMap(s => {
          const v = cat === 'cast' ? s.cast : (s as any)[cat] || '';
          return v.split(',').map(x => x.trim()).filter(Boolean).map(id => nameMap.get(id.toLowerCase()) || { id, name: id });
        }),
      ])];
      const seen = new Set<string>();
      result[cat] = all.filter(item => { const k = item.id || item.name; if (seen.has(k)) return false; seen.add(k); return true; });
    }
    return result;
  }, [scenes, breakdownElements]);

  if (scenes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">No scenes defined yet.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-100 overflow-hidden">
      <div className="max-w-4xl mx-auto w-full flex flex-col h-full px-4 py-3 gap-3">

        {/* Navigation bar */}
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm">
          <div className="flex items-center gap-2.5">
            <button onClick={() => goTo(index - 1)} disabled={index === 0} className="p-1 rounded-md hover:bg-zinc-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4 text-zinc-600" />
            </button>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-zinc-400">Sheet</span>
              <input
                type="text"
                value={sheetInput}
                onChange={e => setSheetInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { const n = parseInt(sheetInput, 10); if (n >= 1 && n <= scenes.length) goTo(n - 1); } }}
                className="w-12 text-center border border-zinc-200 rounded-md px-1 py-0.5 text-sm font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
              <span className="text-zinc-400">of {scenes.length}</span>
            </div>
            <button onClick={() => goTo(index + 1)} disabled={index >= scenes.length - 1} className="p-1 rounded-md hover:bg-zinc-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">{Object.keys(edits).length} scene{Object.keys(edits).length !== 1 ? 's' : ''} edited</span>
            <button onClick={doSave} className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors shadow-sm">
              <Save className="w-3 h-3" />
              Save
            </button>
          </div>
        </div>

        {/* Scene header table */}
        <div className="rounded-xl bg-white border border-zinc-200/80 shadow-sm overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {[
                ['Scene Sheet', String(index + 1), 'Scene No.', 'sceneNumber'],
                ['Int/Ext', 'intExt', 'Day/Night', 'dayNight'],
                ['Set', 'set', 'Location', null],
                ['Pages', 'pageCount', 'Script Day', 'scriptDay'],
              ].map((row, ri) => (
                <tr key={ri} className={ri < 4 ? 'border-b border-zinc-100' : ''}>
                  {row.map((field, ci) => (
                    ci % 2 === 0 ? (
                      <td key={ci} className="px-3 py-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50/50 w-[100px]">{field}</td>
                    ) : (
                      <td key={ci} className={`px-3 py-1.5 ${ci < 3 ? 'border-r border-zinc-100' : ''}`}>
                        {field === 'Scene Sheet' ? (
                          <span className="text-sm font-semibold text-zinc-800">{index + 1}</span>
                        ) : field === null ? (
                          <input className="w-full border-zinc-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 border"
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          />
                        ) : field === 'intExt' ? (
                          <AutocompleteDropdown value={val('intExt')} onChange={v => update('intExt', v)} options={INT_EXT_OPTIONS} showAll />
                        ) : field === 'dayNight' ? (
                          <AutocompleteDropdown value={val('dayNight')} onChange={v => update('dayNight', v)} options={DAY_NIGHT_OPTIONS} showAll />
                        ) : (
                          <input className="w-full border-zinc-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 border"
                            value={String(val(field as keyof Scene) || '')}
                            onChange={e => update(field as keyof Scene, e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          />
                        )}
                      </td>
                    )
                  ))}
                </tr>
              ))}
              {/* Synopsis row */}
              <tr>
                <td className="px-3 py-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50/50 w-[100px] align-top">Synopsis</td>
                <td colSpan={3} className="px-3 py-1.5">
                  <textarea className="w-full border-zinc-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 border resize-none"
                    rows={2} value={val('description') || ''} onChange={e => update('description', e.target.value)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Category grid */}
        <div className="flex-1 overflow-auto rounded-xl bg-white border border-zinc-200/80 shadow-sm">
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2">
              {BREAKDOWN_CATS.map(cat => (
                <div key={cat} className="border border-zinc-200 rounded-lg overflow-hidden">
                  <div className="bg-zinc-50 px-2.5 py-1.5 border-b border-zinc-200 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                    {BREAKDOWN_LABEL[cat]}
                  </div>
                  <div className="p-2">
                    <EntityDropdown
                      value={val(cat === 'cast' ? 'cast' : cat as keyof Scene) || ''}
                      onChange={v => update(cat === 'cast' ? 'cast' : cat as keyof Scene, v)}
                      items={breakdownItems[cat]}
                      positioning="fixed"
                      standalone
                      mode="multi"
                      placeholder={BREAKDOWN_LABEL[cat]}
                      renderItem={(item) => (
                        <>
                          {item.id && item.id !== item.name && <span className="text-zinc-400 shrink-0">{item.id}.</span>}
                          <span className="truncate flex-1">{item.name}</span>
                        </>
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-xl bg-white border border-zinc-200/80 shadow-sm overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr>
                <td className="px-3 py-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50/50 w-[100px] align-top">Notes</td>
                <td className="px-3 py-1.5">
                  <textarea className="w-full border-zinc-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 border resize-none"
                    rows={2} value={val('notes') || ''} onChange={e => update('notes', e.target.value)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
