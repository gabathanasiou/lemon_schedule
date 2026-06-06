import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useProject } from '../store';
import { ProjectElement } from '../types';
import { getElementsFromScenes } from '../store';
import { Trash2, Plus, ChevronDown, Save, Undo2 } from 'lucide-react';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';

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
  if (category === 'cast') {
    const sceneIds = getElementsFromScenes(project.scenes, 'cast');
    const merged = new Map<string, ProjectElement>();
    for (const e of sceneIds) merged.set(e.id, { id: e.id, name: '' });
    for (const m of project.castMembers || []) merged.set(m.id, { id: m.id, name: m.name.toUpperCase() });
    return [...merged.values()];
  }
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

export function ElementManager({ initialCategory, onCategoryChange }: { initialCategory?: string; onCategoryChange?: (cat: string) => void }) {
  const { state, dispatch } = useProject();
  const project = state.present;

  const [category, setCategory] = useState(initialCategory || 'cast');

  useEffect(() => {
    if (initialCategory && initialCategory !== category) setCategory(initialCategory);
  }, [initialCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCast = category === 'cast';
  const isSet = category === 'set';

  const rowsByCat = useRef<Record<string, LocalRow[]>>({});
  const snapByCat = useRef<Record<string, LocalRow[]>>({});
  const inputsRef = useRef<Map<string, HTMLInputElement>>(new Map());

  function loadRows(cat: string): LocalRow[] {
    const elems = loadCategoryElements(project, cat);
    const counts = countOccurrences(project.scenes, cat, cat === 'cast');
    return elems.map(e => ({
      key: elementKey(e), id: e.id, name: e.name,
      occ: counts.get((cat === 'cast' ? e.id : e.name).toLowerCase()) || 0,
    }));
  }

  const [rows, setRows] = useState<LocalRow[]>(() => {
    const cat = initialCategory || 'cast';
    const r = loadRows(cat);
    snapByCat.current[cat] = [...r];
    return r;
  });
  const [saveVersion, setSaveVersion] = useState(0);

  const saveCurrentCategory = useCallback(() => {
    rowsByCat.current[category] = rows;
  }, [category, rows]);

  const switchCategory = useCallback((newCat: string) => {
    if (newCat === category) return;
    rowsByCat.current[category] = rows;
    if (rowsByCat.current[newCat]) {
      setRows(rowsByCat.current[newCat]);
    } else {
      const r = loadRows(newCat);
      snapByCat.current[newCat] = [...r];
      rowsByCat.current[newCat] = r;
      setRows(r);
    }
    setCategory(newCat);
    onCategoryChange?.(newCat);
  }, [category, rows, project, onCategoryChange]);

  const hasChanges = useMemo(() => {
    rowsByCat.current[category] = rows;
    const allCats = new Set([...Object.keys(rowsByCat.current), ...Object.keys(snapByCat.current)]);
    for (const cat of allCats) {
      const r = rowsByCat.current[cat] || [];
      const s = snapByCat.current[cat] || [];
      if (r.length !== s.length) return true;
      for (let i = 0; i < r.length; i++) {
        if (r[i].id !== s[i].id || r[i].name !== s[i].name) return true;
      }
    }
    return false;
  }, [rows, category, saveVersion]);

  const [catOpen, setCatOpen] = useState(false);
  const currentCat = ELEMENT_CATEGORIES.find(c => c.key === category);
  const [dupDialog, setDupDialog] = useState<{ cats: string[] } | null>(null);
  const autoMergeRef = useRef(false);

  const updateRow = useCallback((key: string, field: 'id' | 'name', value: string) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
  }, []);

  const deleteRow = useCallback((key: string) => {
    setRows(prev => prev.filter(r => r.key !== key));
  }, []);

  const addNew = useCallback(() => {
    setRows(prev => [...prev, { key: String(Date.now()), id: '', name: '', occ: 0 }]);
  }, []);

  const focusNext = useCallback((key: string, field: 'id' | 'name') => {
    const idx = rows.findIndex(r => r.key === key);
    if (idx < 0) return;
    const isCastCat = category === 'cast';
    const fields = isCastCat ? ['id', 'name'] : ['name'];
    const curFieldIdx = fields.indexOf(field);
    if (curFieldIdx < fields.length - 1) {
      const nextKey = rows[idx].key;
      const nextId = `${nextKey}-${fields[curFieldIdx + 1]}`;
      inputsRef.current.get(nextId)?.focus();
    } else if (idx < rows.length - 1) {
      const nextKey = rows[idx + 1].key;
      const nextId = `${nextKey}-${fields[0]}`;
      inputsRef.current.get(nextId)?.focus();
    }
  }, [rows, category]);

  function findDuplicates(cat: string): boolean {
    const rows = rowsByCat.current[cat] || [];
    if (cat === 'cast') return false;
    const seen = new Set<string>();
    for (const r of rows) {
      const key = r.name.toLowerCase();
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }

  function mergeCategory(cat: string) {
    const rows = rowsByCat.current[cat] || [];
    const seen = new Map<string, LocalRow>();
    for (const r of rows) {
      const key = r.name.toLowerCase();
      if (!seen.has(key)) seen.set(key, r);
    }
    rowsByCat.current[cat] = [...seen.values()];
  }

  const doSave = useCallback(() => {
    rowsByCat.current[category] = rows;
    if (!autoMergeRef.current) {
      const dupCats = Object.keys(rowsByCat.current).filter(cat => findDuplicates(cat));
      if (dupCats.length > 0) { setDupDialog({ cats: dupCats }); return; }
    }
    performSave();
  }, [rows, category, dispatch]);

  function performSave() {
    for (const cat of Object.keys(rowsByCat.current)) {
      if (autoMergeRef.current && cat !== 'cast') mergeCategory(cat);
      const snap = snapByCat.current[cat] || [];
      const current = rowsByCat.current[cat] || [];
      const snapMap = new Map<string, LocalRow>(snap.map(r => [r.key, r]));
      const rowMap = new Map<string, LocalRow>(current.map(r => [r.key, r]));
      for (const row of current) {
        const orig = snapMap.get(row.key);
        if (!orig) {
          const match = snap.find(s => s.name.toLowerCase() === row.name.toLowerCase());
          if (match) {
            dispatch({ type: 'UPDATE_ELEMENT', payload: { category: cat, id: match.id, updates: { id: row.id, name: row.name } } });
            snapMap.delete(match.key);
          } else {
            dispatch({ type: 'ADD_ELEMENT', payload: { category: cat, element: { id: row.id, name: row.name } } });
          }
        } else if (orig.id !== row.id || orig.name !== row.name) {
          dispatch({ type: 'UPDATE_ELEMENT', payload: { category: cat, id: orig.id, updates: { id: row.id, name: row.name } } });
        }
      }
      for (const orig of snap) {
        if (!rowMap.has(orig.key)) {
          const isMerged = !(cat === 'cast') && current.some(r => r.name.toLowerCase() === orig.name.toLowerCase());
          if (!isMerged) dispatch({ type: 'DELETE_ELEMENT', payload: { category: cat, id: orig.id } });
        }
      }
    }
    snapByCat.current = {};
    for (const cat of Object.keys(rowsByCat.current)) {
      snapByCat.current[cat] = (rowsByCat.current[cat] || []).map(r => ({ ...r }));
      if (autoMergeRef.current && cat !== 'cast') rowsByCat.current[cat] = snapByCat.current[cat];
    }
    if (dupDialog) setDupDialog(null);
    setSaveVersion(v => v + 1);
  }

  const doRevert = useCallback(() => {
    for (const cat of Object.keys(snapByCat.current)) rowsByCat.current[cat] = snapByCat.current[cat].map(r => ({ ...r }));
    setRows(rowsByCat.current[category] || []);
    setSaveVersion(v => v + 1);
  }, [category]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey) {
        if (e.key === 'n' && e.shiftKey) { e.preventDefault(); addNew(); }
        if (e.key === 's') { e.preventDefault(); doSave(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [addNew, doSave]);

  const renderInput = (key: string, field: 'id' | 'name', val: string, onChange: (v: string) => void, numeric?: boolean, upper?: boolean) => {
    const inputId = `${key}-${field}`;
    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
      if (e.key === 'Tab') {
        e.preventDefault();
        focusNext(key, field);
      }
    };
    const transform = (v: string) => numeric ? v.replace(/[^0-9]/g, '') : upper ? v.toUpperCase() : v;
    return (
      <input
        ref={el => { if (el) inputsRef.current.set(inputId, el); else inputsRef.current.delete(inputId); }}
        type="text"
        value={val}
        onChange={e => onChange(transform(e.target.value))}
        onKeyDown={handleKey}
        className="w-full border border-zinc-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 bg-white transition-shadow"
      />
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-100 overflow-hidden">
      <div className="max-w-5xl mx-auto w-full flex flex-col h-full px-4 py-4 gap-3">

        {/* Top bar card */}
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Category</span>
            <DropdownMenu
              open={catOpen}
              onClose={() => setCatOpen(false)}
              align="left"
              width="w-52"
              trigger={
                <button
                  onClick={() => setCatOpen(p => !p)}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 rounded-md text-xs font-semibold text-zinc-800 transition-colors"
                >
                  {currentCat?.label || category}
                  <ChevronDown className="w-3 h-3 text-zinc-500" />
                </button>
              }
            >
              {ELEMENT_CATEGORIES.map(c => (
                <DropdownItem key={c.key} onClick={() => { switchCategory(c.key); setCatOpen(false); }}>
                  {c.label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-1.5">
            {hasChanges && (
              <button onClick={doRevert} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-zinc-500 hover:bg-zinc-100 transition-colors">
                <Undo2 className="w-3 h-3" />
                Revert
              </button>
            )}
            <button onClick={doSave} className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold transition-all shadow-sm ${hasChanges ? 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-zinc-900/20' : 'bg-zinc-100 text-zinc-400'}`}>
              <Save className="w-3 h-3" />
              {hasChanges ? 'Save Changes' : 'Saved'}
            </button>
          </div>
        </div>

        {/* Action bar card */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm flex-wrap">
          <span className="text-[11px] text-zinc-500 font-semibold">{rows.length} {rows.length === 1 ? 'element' : 'elements'}</span>
          <span className="text-zinc-300 mx-1">|</span>
          <button onClick={() => setRows(prev => [...prev].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })))} className="text-[11px] text-zinc-500 hover:text-zinc-900 font-medium transition-colors">
            Sort by ID
          </button>
          <span className="text-zinc-300">·</span>
          <button onClick={() => setRows(prev => { const max = prev.reduce((m, r) => { const n = parseInt(r.id, 10); return isNaN(n) ? m : Math.max(m, n); }, 0); let n = max + 1; return prev.map(r => r.id.trim() ? r : { ...r, id: String(n++) }); })} className="text-[11px] text-zinc-500 hover:text-zinc-900 font-medium transition-colors">
            Auto-ID
          </button>
          <span className="text-zinc-300">·</span>
          <button onClick={() => setRows(prev => prev.filter(r => r.occ > 0 || (isCast && r.id)))} className="text-[11px] text-zinc-500 hover:text-zinc-900 font-medium transition-colors">
            Clear Zero
          </button>
          {!isCast && (
            <>
              <span className="text-zinc-300">·</span>
              <button onClick={() => setRows(prev => { const seen = new Map<string, LocalRow>(); for (const r of prev) { const key = r.name.toLowerCase(); if (!seen.has(key)) seen.set(key, r); } return [...seen.values()]; })} className="text-[11px] text-zinc-500 hover:text-zinc-900 font-medium transition-colors">
                Merge Duplicates
              </button>
            </>
          )}
        </div>

        {/* Table card */}
        <div className="flex-1 overflow-hidden rounded-xl bg-white border border-zinc-200/80 shadow-sm">
          <div className="h-full overflow-auto tab-scroll">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200 sticky top-0">
                  {isCast && <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-16">ID</th>}
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Name</th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-14">Occ</th>
                  <th className="px-3 py-2 text-center w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={r.key} className={`border-b border-zinc-100 transition-colors ${ri % 2 === 0 ? 'bg-white' : 'bg-zinc-50/30'} hover:bg-blue-50/20`}>
                    {isCast && (
                      <td className="px-3 py-1">{renderInput(r.key, 'id', r.id, v => updateRow(r.key, 'id', v), true)}</td>
                    )}
                    <td className="px-3 py-1">{renderInput(r.key, 'name', r.name, v => updateRow(r.key, 'name', v), false, isCast || isSet)}</td>
                    <td className="px-3 py-1 text-center text-[11px] text-zinc-400 font-medium">{r.occ}</td>
                    <td className="px-3 py-1 text-center">
                      <button onClick={() => deleteRow(r.key)} className="p-1 rounded-md hover:bg-red-50 transition-colors opacity-40 hover:opacity-100">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button onClick={addNew} className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition-colors w-full">
              <Plus className="w-3.5 h-3.5" />
              <span>Add {currentCat?.label || 'element'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Duplicate dialog */}
      {dupDialog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[420px] p-6 space-y-4">
            <h3 className="text-base font-bold text-zinc-900">Duplicate Elements Found</h3>
            <p className="text-sm text-zinc-600">
              The following categories have elements with the same name:{' '}
              {dupDialog.cats.map(c => ELEMENT_CATEGORIES.find(ec => ec.key === c)?.label || c).join(', ')}.
              Merge duplicates into single entries?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => { setDupDialog(null); performSave(); }} className="px-4 py-2 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">Save as-is</button>
              <button onClick={() => { autoMergeRef.current = true; setDupDialog(null); performSave(); }} className="px-4 py-2 rounded-md text-sm font-bold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors">Merge & Save</button>
              <button onClick={() => { autoMergeRef.current = true; setDupDialog(null); performSave(); }} className="px-4 py-2 rounded-md text-sm font-bold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors">Always Merge</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
