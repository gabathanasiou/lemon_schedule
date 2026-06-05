import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useProject } from '../store';
import { ProjectElement } from '../types';
import { getElementsFromScenes } from '../store';
import { Trash2, Plus } from 'lucide-react';
import { EntityDropdown } from './EntityDropdown';

const ELEMENT_CATEGORIES = [
  { key: 'cast', label: 'Cast' },
  { key: 'set', label: 'Sets' },
  { key: 'props', label: 'Props' },
  { key: 'extras', label: 'Supporting Artists' },
  { key: 'stunts', label: 'Stunts' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'wardrobe', label: 'Wardrobe' },
  { key: 'makeup', label: 'Makeup & Hair' },
  { key: 'sfx', label: 'SFX' },
  { key: 'vfx', label: 'VFX' },
  { key: 'sound', label: 'Sound' },
  { key: 'music', label: 'Music / Playback' },
  { key: 'animals', label: 'Animals' },
  { key: 'weapons', label: 'Weapons / Armoury' },
  { key: 'greenery', label: 'Greenery / Set Dressing' },
  { key: 'artDept', label: 'Art Department' },
];

function loadCategoryElements(project: any, category: string): ProjectElement[] {
  const stored = (project.breakdownElements || {})[category];
  if (stored && stored.length > 0) {
    const seen = new Map<string, ProjectElement>();
    for (const e of stored) {
      const normalized = category === 'set' ? { ...e, name: e.name.toUpperCase(), id: e.id.toUpperCase() } : e;
      const key = normalized.id || normalized.name.toLowerCase();
      if (!seen.has(key)) seen.set(key, normalized);
    }
    return [...seen.values()];
  }
  if (category === 'cast') {
    const sceneIds = getElementsFromScenes(project.scenes, 'cast');
    const merged = new Map<string, ProjectElement>();
    for (const e of sceneIds) merged.set(e.id, { id: e.id, name: '' });
    for (const m of project.castMembers || []) merged.set(m.id, { id: m.id, name: m.name });
    return [...merged.values()];
  }
  return getElementsFromScenes(project.scenes, category).map(e => ({ id: e.name, name: e.name }));
}

interface LocalRow {
  key: string;
  id: string;
  name: string;
  occ: number;
}

function elementKey(e: { id: string; name: string }) { return e.id || e.name || '__new__'; }

function countOccurrences(scenes: any[], cat: string, isC: boolean): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of scenes) {
    const val = isC ? s.cast : cat === 'set' ? s.set : (s as any)[cat] as string;
    if (!val) continue;
    for (const item of val.split(',').map(x => x.trim()).filter(Boolean)) {
      const key = item.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

export function ElementManager() {
  const { state, dispatch } = useProject();
  const project = state.present;

  const [category, setCategory] = useState('cast');
  const isCast = category === 'cast';
  const [rows, setRows] = useState<LocalRow[]>(() => {
    const elems = loadCategoryElements(project, category);
    const counts = countOccurrences(project.scenes, category, category === 'cast');
    return elems.map(e => ({
      key: elementKey(e), id: e.id, name: e.name,
      occ: counts.get((category === 'cast' ? e.id : e.name).toLowerCase()) || 0,
    }));
  });
  const snapshotRef = useRef<LocalRow[]>(rows);

  const switchCategory = useCallback((newCat: string) => {
    setCategory(newCat);
    const loaded = loadCategoryElements(project, newCat);
    const counts = countOccurrences(project.scenes, newCat, newCat === 'cast');
    const localRows = loaded.map(e => ({
      key: elementKey(e), id: e.id, name: e.name,
      occ: counts.get((newCat === 'cast' ? e.id : e.name).toLowerCase()) || 0,
    }));
    setRows(localRows);
    snapshotRef.current = localRows;
  }, [project]);

  const hasChanges = useMemo(() => {
    const snap = snapshotRef.current;
    if (rows.length !== snap.length) return true;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].id !== snap[i].id || rows[i].name !== snap[i].name) return true;
    }
    return false;
  }, [rows]);

  const catItems = useMemo(() => ELEMENT_CATEGORIES.map(c => ({ id: c.key, name: c.label })), []);

  const updateRow = useCallback((key: string, field: 'id' | 'name', value: string) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
  }, []);

  const deleteRow = useCallback((key: string) => {
    setRows(prev => prev.filter(r => r.key !== key));
  }, []);

  const addNew = useCallback(() => {
    setRows(prev => {
      const maxNum = prev.reduce((max, r) => { const n = parseInt(r.id, 10); return isNaN(n) ? max : Math.max(max, n); }, 0);
      return [...prev, { key: String(Date.now()), id: isCast ? String(maxNum + 1) : '', name: '', occ: 0 }];
    });
  }, [isCast]);

  const doSave = useCallback(() => {
    const snap = snapshotRef.current;
    const snapMap = new Map<string, LocalRow>(snap.map(r => [r.key, r]));
    const rowMap = new Map<string, LocalRow>(rows.map(r => [r.key, r]));

    for (const row of rows) {
      const orig = snapMap.get(row.key);
      if (!orig) {
        const match = snap.find(s => s.name.toLowerCase() === row.name.toLowerCase());
        if (match) {
          dispatch({ type: 'UPDATE_ELEMENT', payload: { category, id: match.id, updates: { id: row.id, name: row.name } } });
          snapMap.delete(match.key);
        } else {
          dispatch({ type: 'ADD_ELEMENT', payload: { category, element: { id: row.id, name: row.name } } });
        }
      } else if (orig.id !== row.id || orig.name !== row.name) {
        dispatch({ type: 'UPDATE_ELEMENT', payload: { category, id: orig.id, updates: { id: row.id, name: row.name } } });
      }
    }
    for (const orig of snap) {
      if (!rowMap.has(orig.key)) {
        dispatch({ type: 'DELETE_ELEMENT', payload: { category, id: orig.id } });
      }
    }
    snapshotRef.current = rows.map(r => ({ ...r }));
  }, [rows, category, dispatch]);

  const doRevert = useCallback(() => {
    setRows(snapshotRef.current.map(r => ({ ...r })));
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full bg-white text-zinc-900 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 bg-white">
        <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Category:</span>
        <div className="w-52">
          <EntityDropdown
            value={category}
            onChange={switchCategory}
            items={catItems}
            positioning="fixed"
            standalone
            mode="single"
            placeholder="Select category..."
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-100 border-b-2 border-zinc-900 sticky top-0">
              {isCast && <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">ID</th>}
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Name</th>
              <th className="px-3 py-2 text-center text-[11px] font-semibold text-zinc-500 uppercase tracking-wider w-16">Occ</th>
              <th className="px-3 py-2 text-center w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className="border-b border-zinc-200 hover:bg-zinc-50 transition-colors">
                {isCast && (
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={r.id}
                      onChange={e => updateRow(r.key, 'id', e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full border border-zinc-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                    />
                  </td>
                )}
                <td className="px-3 py-1.5">
                  <input
                    type="text"
                    value={r.name}
                    onChange={e => updateRow(r.key, 'name', e.target.value)}
                    className="w-full border border-zinc-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                  />
                </td>
                <td className="px-3 py-1.5 text-center text-sm text-zinc-500">{r.occ}</td>
                <td className="px-3 py-1.5 text-center">
                  <button onClick={() => deleteRow(r.key)} className="p-1 rounded hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4 text-red-400/60 hover:text-red-600" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button onClick={addNew} className="flex items-center gap-1.5 px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 transition-colors w-full border-b border-zinc-200">
          <Plus className="w-3.5 h-3.5" />
          Add {ELEMENT_CATEGORIES.find(c => c.key === category)?.label || 'element'}
        </button>
      </div>

      <div className="bg-zinc-100 border-t border-zinc-300 p-3 flex items-center justify-between shadow-inner">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 uppercase tracking-wider font-mono">
            {rows.length} {rows.length === 1 ? 'element' : 'elements'}
          </span>
          <button onClick={() => setRows(prev => [...prev].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })))} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Sort by ID
          </button>
          <button onClick={() => setRows(prev => {
            const maxNum = prev.reduce((max, r) => { const n = parseInt(r.id, 10); return isNaN(n) ? max : Math.max(max, n); }, 0);
            let next = maxNum + 1;
            return prev.map(r => r.id.trim() ? r : { ...r, id: String(next++) });
          })} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Auto-ID
          </button>
          <button onClick={() => setRows(prev => prev.filter(r => r.occ > 0))} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Clear Zero
          </button>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button onClick={doRevert} className="px-4 py-1.5 rounded text-sm font-medium border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors">
              Revert
            </button>
          )}
          <button onClick={doSave} className={`px-4 py-1.5 rounded text-sm font-bold transition-colors ${hasChanges ? 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm' : 'bg-zinc-100 text-zinc-400'}`}>
            {hasChanges ? 'Save Changes' : 'Saved'}
          </button>
        </div>
      </div>
    </div>
  );
}
