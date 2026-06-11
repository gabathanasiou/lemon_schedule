import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useProject, PROTECTED_CATEGORIES, DEFAULT_CATEGORY_LABELS } from '../store';
import { ProjectElement, CustomCategoryDef } from '../types';
import { getElementsFromScenes } from '../store';
import { useDialog } from './Dialog';
import { generateUUID } from '../lib/utils';
import { Trash2, Plus, Save, Undo2, Users, Building2, Package, UserPlus, Sparkles, Car, Shirt, Scissors, Volume1, Video, Volume2, Music, PawPrint, Sword, Leaf, PaintBucket, X, Tag, CircleDot, Pencil, Eye, EyeOff } from 'lucide-react';

const ELEMENT_CATEGORIES = [
  { key: 'cast', label: 'Cast' },
  { key: 'set', label: 'Sets' },
  { key: 'props', label: 'Props' },
  { key: 'backgroundActors', label: 'Background Actors' },
  { key: 'stunts', label: 'Stunts' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'wardrobe', label: 'Wardrobe' },
  { key: 'makeup', label: 'Makeup & Hair' },
  { key: 'sfx', label: 'SFX' },
  { key: 'vfx', label: 'VFX' },
  { key: 'sound', label: 'Sound' },
  { key: 'music', label: 'Music / Playback' },
  { key: 'animalsAndWranglers', label: 'Animals & Wranglers' },
  { key: 'weapons', label: 'Weapons / Armoury' },
  { key: 'greenery', label: 'Greenery' },
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
  const dialog = useDialog();
  const project = state.present;

  const [category, setCategory] = useState(initialCategory || 'cast');

  useEffect(() => {
    if (initialCategory && initialCategory !== category) setCategory(initialCategory);
  }, [initialCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    rowsByCat.current = {};
    snapByCat.current = {};
    const cat = initialCategory || 'cast';
    const r = loadRows(cat);
    snapByCat.current[cat] = [...r];
    rowsByCat.current[cat] = r;
    setRows(r);
    setCategory(cat);
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const [dupDialog, setDupDialog] = useState<{ cats: string[] } | null>(null);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [showEditCustom, setShowEditCustom] = useState(false);
  const [showEditBuiltin, setShowEditBuiltin] = useState(false);
  const [editCatKey, setEditCatKey] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Tag');
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
      const key = (r.name || r.id).toLowerCase();
      if (!seen.has(key)) seen.set(key, r);
      else if (!seen.get(key)!.name && r.name) seen.set(key, r);
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
          const isMerged = !(cat === 'cast') && current.some(r => r.name && r.name.toLowerCase() === orig.name.toLowerCase());
          if (!isMerged) dispatch({ type: 'DELETE_ELEMENT', payload: { category: cat, id: orig.id } });
        }
      }
    }
    snapByCat.current = {};
    for (const cat of Object.keys(rowsByCat.current)) {
      if (autoMergeRef.current && cat !== 'cast') mergeCategory(cat);
      snapByCat.current[cat] = (rowsByCat.current[cat] || []).map(r => ({ ...r }));
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

  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;
  const doSaveRef = useRef(doSave);
  doSaveRef.current = doSave;

  useEffect(() => {
    return () => {
      if (hasChangesRef.current) {
        const doSave = doSaveRef.current;
        dialog.confirm({ title: 'Unsaved Changes', message: 'You have unsaved changes. Save before leaving?' }).then(ok => {
          if (ok) doSave();
        });
      }
    };
  }, []);

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

  const CAT_ICONS: Record<string, React.ElementType> = {
    cast: Users, set: Building2, props: Package, backgroundActors: UserPlus, stunts: Sparkles,
    vehicles: Car, wardrobe: Shirt, makeup: Scissors, sfx: Volume1, vfx: Video,
    sound: Volume2, music: Music, animalsAndWranglers: PawPrint, weapons: Sword, greenery: Leaf, artDept: PaintBucket,
  };

  const CUSTOM_ICON_OPTIONS: { name: string; Icon: React.ElementType }[] = [
    { name: 'Tag', Icon: Tag },
    { name: 'Package', Icon: Package },
    { name: 'Car', Icon: Car },
    { name: 'Shirt', Icon: Shirt },
    { name: 'Sword', Icon: Sword },
    { name: 'Sparkles', Icon: Sparkles },
    { name: 'Volume1', Icon: Volume1 },
    { name: 'Music', Icon: Music },
    { name: 'PawPrint', Icon: PawPrint },
    { name: 'Leaf', Icon: Leaf },
    { name: 'PaintBucket', Icon: PaintBucket },
    { name: 'UserPlus', Icon: UserPlus },
    { name: 'Video', Icon: Video },
    { name: 'Scissors', Icon: Scissors },
    { name: 'Users', Icon: Users },
    { name: 'Building2', Icon: Building2 },
    { name: 'Volume2', Icon: Volume2 },
    { name: 'CircleDot', Icon: CircleDot },
  ];

  function getCustomIcon(name: string): React.ElementType {
    const opt = CUSTOM_ICON_OPTIONS.find(o => o.name === name);
    return opt ? opt.Icon : Tag;
  }

  function countTotal(cat: string): number {
    const r = rowsByCat.current[cat];
    if (r) return r.length;
    const elems = loadCategoryElements(project, cat);
    return elems.length;
  }

  function getLabel(key: string, fallback: string): string {
    return project.categoryLabels?.[key] || DEFAULT_CATEGORY_LABELS[key] || fallback;
  }

  const hiddenSet = useMemo(() => new Set(project.hiddenCategories || []), [project.hiddenCategories]);

  const allCategoryKeys = useMemo(() => {
    const keys: { key: string; isCustom: boolean; isHidden: boolean }[] = [];
    for (const c of ELEMENT_CATEGORIES) {
      keys.push({ key: c.key, isCustom: false, isHidden: hiddenSet.has(c.key) });
    }
    for (const c of project.customCategories) {
      if (!hiddenSet.has(c.key)) keys.push({ key: c.key, isCustom: true, isHidden: false });
    }
    return keys;
  }, [project.customCategories, hiddenSet]);

  return (
    <div className="flex-1 flex overflow-hidden">
      <aside className="w-[188px] shrink-0 bg-zinc-50 border-r border-zinc-200 overflow-y-auto">
        <div className="p-3">
          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-1">Categories</span>
          <div className="mt-2 space-y-0.5">
            {allCategoryKeys.map(({ key, isCustom, isHidden }) => {
              const Icon = isCustom ? getCustomIcon(project.customCategories.find(c => c.key === key)?.icon || 'Tag') : CAT_ICONS[key];
              const isActive = key === category;
              const hasLabelOverride = !isCustom && !!project.categoryLabels?.[key];
              const label = isCustom
                ? project.customCategories.find(c => c.key === key)?.label || key
                : getLabel(key, ELEMENT_CATEGORIES.find(c => c.key === key)?.label || key);
              const isProtected = PROTECTED_CATEGORIES.has(key);
              const showHideToggle = !isCustom && !isProtected;
              const showDelete = isCustom;
              return (
                <div key={key} className="group">
                  <button
                    onClick={() => switchCategory(key)}
                    className={`w-full text-left px-2 py-1.5 rounded-md transition-colors flex items-center gap-2 text-xs ${
                      isHidden
                        ? 'text-zinc-400 hover:bg-zinc-100 font-medium opacity-60'
                        : isActive
                        ? 'bg-zinc-900 text-white font-semibold'
                        : 'text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 font-medium'
                    }`}
                  >
                    {Icon && <Icon className={`w-3 h-3 shrink-0 ${isActive ? 'text-white' : isHidden ? 'text-zinc-300' : 'text-zinc-400'}`} />}
                    <span className={`truncate flex-1 ${hasLabelOverride ? 'italic' : ''}`}>{label}</span>
                    <span className={`flex items-center gap-0.5 shrink-0 ${isHidden ? '' : 'opacity-0 group-hover:opacity-100'}`} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCustom) {
                            const cat = project.customCategories.find(c => c.key === key);
                            setEditCatKey(key); setNewCatName(cat?.label || label); setNewCatIcon(cat?.icon || 'Tag'); setShowEditCustom(true);
                          } else {
                            setEditCatKey(key); setNewCatName(label); setNewCatIcon('');
                            setShowEditBuiltin(true);
                          }
                        }}
                        className={`p-0.5 rounded transition-colors ${isActive ? 'hover:bg-zinc-700' : 'hover:bg-zinc-300'}`}
                      >
                        <Pencil className="w-3 h-3 text-zinc-400" />
                      </button>
                      {showHideToggle && !isHidden && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = await dialog.confirm({ title: `Hide "${label}"?`, message: 'Category will be hidden from all views.', danger: true });
                            if (ok) {
                              dispatch({ type: 'HIDE_CATEGORY', payload: key });
                              if (category === key) switchCategory('cast');
                            }
                          }}
                          className={`p-0.5 rounded transition-colors ${isActive ? 'hover:bg-zinc-700' : 'hover:bg-zinc-300'}`}
                        >
                          <EyeOff className="w-3 h-3 text-zinc-400" />
                        </button>
                      )}
                      {showHideToggle && isHidden && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: 'SHOW_CATEGORY', payload: key });
                          }}
                          className={`p-0.5 rounded transition-colors ${isActive ? 'hover:bg-zinc-700' : 'hover:bg-zinc-300'}`}
                          title="Unhide category"
                        >
                          <Eye className="w-3 h-3 text-zinc-400" />
                        </button>
                      )}
                      {showDelete && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = await dialog.confirm({ title: `Delete "${label}"?`, message: 'Category and all its data will be permanently deleted.', danger: true });
                            if (ok) {
                              dispatch({ type: 'DELETE_CUSTOM_CATEGORY', payload: key });
                              if (category === key) switchCategory('cast');
                            }
                          }}
                          className={`p-0.5 rounded transition-colors ${isActive ? 'hover:bg-red-900/50' : 'hover:bg-red-100'}`}
                        >
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      )}
                    </span>
                    <span className={`text-[10px] tabular-nums shrink-0 ${isActive ? 'text-zinc-400' : isHidden ? 'text-zinc-300' : 'text-zinc-400'}`}>
                      {countTotal(key)}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => { setShowAddCustom(true); setNewCatName(''); setNewCatIcon('Tag'); }}
            className="w-full text-left px-2 py-1.5 mt-1 rounded-md text-xs text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 transition-colors flex items-center gap-2 font-medium"
          >
            <Plus className="w-3 h-3 shrink-0" />
            <span>Add Custom</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full bg-zinc-100 overflow-hidden">
        <div className="flex flex-col h-full px-4 py-4 gap-3">

          {/* Top bar card */}
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm shrink-0">
            <span className="text-xs font-semibold text-zinc-800">
              {getLabel(category, ELEMENT_CATEGORIES.find(c => c.key === category)?.label || category)}
            </span>
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
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm flex-wrap shrink-0">
            <span className="text-[11px] text-zinc-500 font-semibold">{rows.length} {rows.length === 1 ? 'element' : 'elements'}</span>
            {isCast && (
              <>
                <span className="text-zinc-300 mx-1">|</span>
                <button onClick={() => setRows(prev => [...prev].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })))} className="text-[11px] text-zinc-500 hover:text-zinc-900 font-medium transition-colors">
                  Sort by ID
                </button>
                <span className="text-zinc-300">·</span>
                <button onClick={() => setRows(prev => { const max = prev.reduce((m, r) => { const n = parseInt(r.id, 10); return isNaN(n) ? m : Math.max(m, n); }, 0); let n = max + 1; return prev.map(r => r.id.trim() ? r : { ...r, id: String(n++) }); })} className="text-[11px] text-zinc-500 hover:text-zinc-900 font-medium transition-colors">
                  Auto-ID
                </button>
              </>
            )}
            {!isCast && (
              <>
                <span className="text-zinc-300">·</span>
                <button onClick={() => setRows(prev => { const seen = new Map<string, LocalRow>(); for (const r of prev) { const key = (r.name || r.id).toLowerCase(); if (!seen.has(key)) seen.set(key, r); else if (!seen.get(key)!.name && r.name) seen.set(key, r); } return [...seen.values()]; })} className="text-[11px] text-zinc-500 hover:text-zinc-900 font-medium transition-colors">
                  Merge Duplicates
                </button>
              </>
            )}
          </div>

          {/* Table card */}
          <div className="flex-1 overflow-hidden rounded-xl bg-white border border-zinc-200/80 shadow-sm min-h-0">
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
                <span>Add {getLabel(category, 'element')}</span>
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
                {dupDialog.cats.map(c => getLabel(c, c)).join(', ')}.
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

        {/* Add Custom Category modal */}
        {showAddCustom && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowAddCustom(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-[380px] p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-zinc-900">Create Custom Category</h3>
                <button onClick={() => setShowAddCustom(false)} className="text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newCatName.trim()) createCustomCategory(); }}
                  autoFocus
                  className="w-full mt-1 px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="e.g. Firearms, Period Vehicles..."
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Icon</label>
                <div className="mt-1 grid grid-cols-6 gap-1.5">
                  {CUSTOM_ICON_OPTIONS.map(opt => {
                    const Icon = opt.Icon;
                    const selected = newCatIcon === opt.name;
                    return (
                      <button
                        key={opt.name}
                        onClick={() => setNewCatIcon(opt.name)}
                        className={`p-2 rounded-md transition-colors flex items-center justify-center ${
                          selected ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setShowAddCustom(false)} className="px-4 py-2 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">Cancel</button>
                <button onClick={createCustomCategory} disabled={!newCatName.trim()} className="px-4 py-2 rounded-md text-sm font-bold bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition-colors">Create</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Custom Category modal */}
        {showEditCustom && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowEditCustom(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-[380px] p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-zinc-900">Edit Custom Category</h3>
                <button onClick={() => setShowEditCustom(false)} className="text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newCatName.trim()) updateCustomCategory(); }}
                  autoFocus
                  className="w-full mt-1 px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Icon</label>
                <div className="mt-1 grid grid-cols-6 gap-1.5">
                  {CUSTOM_ICON_OPTIONS.map(opt => {
                    const Icon = opt.Icon;
                    const selected = newCatIcon === opt.name;
                    return (
                      <button
                        key={opt.name}
                        onClick={() => setNewCatIcon(opt.name)}
                        className={`p-2 rounded-md transition-colors flex items-center justify-center ${
                          selected ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setShowEditCustom(false)} className="px-4 py-2 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">Cancel</button>
                <button onClick={updateCustomCategory} disabled={!newCatName.trim()} className="px-4 py-2 rounded-md text-sm font-bold bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition-colors">Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Built-in Category Label modal */}
        {showEditBuiltin && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowEditBuiltin(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-[380px] p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-zinc-900">Rename Category</h3>
                <button onClick={() => setShowEditBuiltin(false)} className="text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newCatName.trim()) updateBuiltinLabel(); }}
                  autoFocus
                  className="w-full mt-1 px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setShowEditBuiltin(false)} className="px-4 py-2 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">Cancel</button>
                <button onClick={updateBuiltinLabel} disabled={!newCatName.trim()} className="px-4 py-2 rounded-md text-sm font-bold bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition-colors">Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  function updateBuiltinLabel() {
    if (!newCatName.trim()) return;
    dispatch({ type: 'SET_CATEGORY_LABEL', payload: { key: editCatKey, label: newCatName.trim() } });
    setShowEditBuiltin(false);
  }

  function createCustomCategory() {
    if (!newCatName.trim()) return;
    const slug = newCatName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const key = `_cat_${slug}`;
    dispatch({ type: 'ADD_CUSTOM_CATEGORY', payload: { key, label: newCatName.trim(), icon: newCatIcon } });
    setShowAddCustom(false);
    switchCategory(key);
  }

  function updateCustomCategory() {
    if (!newCatName.trim()) return;
    dispatch({ type: 'UPDATE_CUSTOM_CATEGORY', payload: { key: editCatKey, label: newCatName.trim(), icon: newCatIcon } });
    setShowEditCustom(false);
  }
}
