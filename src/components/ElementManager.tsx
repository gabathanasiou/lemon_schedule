import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useProject, PROTECTED_CATEGORIES } from '../store';
import { ProjectElement, CustomCategoryDef } from '../types';
import { getElementsFromScenes } from '../store';
import { getFieldItems, isMultiValue } from '../lib/categories';
import { useDialog } from './Dialog';
import { generateUUID } from '../lib/utils';
import { Trash2, Plus, Save, Undo2, Pencil, Eye, EyeOff, Check } from 'lucide-react';
import { ELEMENT_CATEGORIES, CAT_ICONS, CUSTOM_ICON_OPTIONS, getCustomIcon, getLabel } from '../lib/categories';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';

function loadCategoryElements(project: any, category: string): ProjectElement[] {
  if (category === 'cast') {
    const sceneIds = getElementsFromScenes(project.scenes, 'cast');
    const merged = new Map<string, ProjectElement>();
    for (const e of sceneIds) merged.set(e.id, { id: e.id, name: '' });
    for (const m of project.castMembers || []) merged.set(m.id, { id: m.id, name: m.name.toUpperCase() });
    return [...merged.values()];
  }
  const stored: ProjectElement[] = (project.breakdownElements || {})[category] || [];
  const nameMap = new Map(stored.map(e => [e.name.toLowerCase(), e]));
  const seen = new Set<string>();
  const items: ProjectElement[] = [];
  for (const e of stored) {
    const key = (e.id || e.name).toLowerCase();
    if (!seen.has(key)) { items.push(e); seen.add(key); }
  }
  const sceneElems = getElementsFromScenes(project.scenes, category);
  for (const e of sceneElems) {
    const key = (e.id || e.name).toLowerCase();
    if (!seen.has(key) && !nameMap.has(e.name.toLowerCase())) { items.push(e); seen.add(key); }
  }
  return items;
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
    const val = isC ? s.cast : (s as any)[cat] as string;
    if (!val) continue;
    const items = getFieldItems(cat, val);
    for (const item of items) {
      const key = item.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

export function ElementManager({ initialCategory, onCategoryChange, headerTarget }: { initialCategory?: string; onCategoryChange?: (cat: string) => void; headerTarget?: HTMLElement | null }) {
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

  const prevElementsRef = useRef(project.breakdownElements);
  const prevScenesRef = useRef(project.scenes);
  useEffect(() => {
    if (project.breakdownElements !== prevElementsRef.current || project.scenes !== prevScenesRef.current) {
      rowsByCat.current = {};
      snapByCat.current = {};
      const r = loadRows(category);
      snapByCat.current[category] = [...r];
      rowsByCat.current[category] = r;
      setRows(r);
      prevElementsRef.current = project.breakdownElements;
      prevScenesRef.current = project.scenes;
    }
  }, [project.breakdownElements, project.scenes, category]);

  const isCast = category === 'cast';
  const isSet = category === 'set';

  const rowsByCat = useRef<Record<string, LocalRow[]>>({});
  const snapByCat = useRef<Record<string, LocalRow[]>>({});
  const inputsRef = useRef<Map<string, HTMLInputElement>>(new Map());

  function loadRows(cat: string): LocalRow[] {
    const elems = loadCategoryElements(project, cat);
    const counts = countOccurrences(project.scenes, cat, cat === 'cast');
    let rows = elems.map(e => ({
      key: elementKey(e), id: e.id, name: e.name,
      occ: counts.get((cat === 'cast' ? e.id : e.name).toLowerCase()) || 0,
    }));
    if (cat === 'cast') {
      rows.sort((a, b) => {
        const na = parseInt(a.id, 10);
        const nb = parseInt(b.id, 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        if (!isNaN(na)) return -1;
        if (!isNaN(nb)) return 1;
        return a.id.localeCompare(b.id);
      });
    }
    return rows;
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
  const [newCatMultiValue, setNewCatMultiValue] = useState(true);
  const autoMergeRef = useRef(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortMode, setSortMode] = useState<'id' | 'name' | 'occurrences'>(isCast ? 'id' : 'name');

  useEffect(() => {
    setSortMode(isCast ? 'id' : 'name');
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortByIdFn = useCallback(() => {
    setRows(prev => [...prev].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })));
  }, []);
  const sortByNameFn = useCallback(() => {
    setRows(prev => [...prev].sort((a, b) => (a.name || a.id).toLowerCase().localeCompare((b.name || b.id).toLowerCase())));
  }, []);
  const sortByOccurrencesFn = useCallback(() => {
    setRows(prev => [...prev].sort((a, b) => b.occ - a.occ || (a.name || a.id).toLowerCase().localeCompare((b.name || b.id).toLowerCase())));
  }, []);

  const applySort = useCallback((mode: 'id' | 'name' | 'occurrences') => {
    setSortMode(mode);
    setShowSortMenu(false);
    if (mode === 'id') sortByIdFn();
    else if (mode === 'name') sortByNameFn();
    else sortByOccurrencesFn();
  }, [sortByIdFn, sortByNameFn, sortByOccurrencesFn]);

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
    const preMerged = new Map<string, Set<string>>();
    if (autoMergeRef.current) {
      for (const cat of Object.keys(rowsByCat.current)) {
        if (cat === 'cast') continue;
        const current = rowsByCat.current[cat] || [];
        const snap = snapByCat.current[cat] || [];
        const snapMap = new Map<string, LocalRow>(snap.map(r => [r.key, r]));
        const groups = new Map<string, LocalRow[]>();
        for (const r of current) {
          const normKey = (r.name || r.id).toLowerCase();
          if (!groups.has(normKey)) groups.set(normKey, []);
          groups.get(normKey)!.push(r);
        }
        for (const [, group] of groups) {
          if (group.length <= 1) continue;
          let target = group[0];
          for (const r of group) { if (r.name) { target = r; break; } }
          const sourceIds: string[] = [];
          for (const r of group) {
            if (r.key === target.key) continue;
            const snapRow = snapMap.get(r.key);
            if (snapRow && snapRow.id) sourceIds.push(snapRow.id);
          }
          if (sourceIds.length > 0) {
            dispatch({ type: 'MERGE_ELEMENTS', payload: { category: cat, sourceIds, targetId: target.id, targetName: target.name } });
            let s = preMerged.get(cat);
            if (!s) { s = new Set(); preMerged.set(cat, s); }
            for (const sid of sourceIds) s.add(sid);
          }
        }
      }
      for (const cat of Object.keys(rowsByCat.current)) {
        if (cat !== 'cast') mergeCategory(cat);
      }
    }
    for (const cat of Object.keys(rowsByCat.current)) {
      const snap = snapByCat.current[cat] || [];
      const current = rowsByCat.current[cat] || [];
      const snapMap = new Map<string, LocalRow>(snap.map(r => [r.key, r]));
      const rowMap = new Map<string, LocalRow>(current.map(r => [r.key, r]));

      const mergedSources = new Set<string>(preMerged.get(cat) || []);
      const merges: { sourceIds: string[]; targetId: string; targetName: string }[] = [];

      for (const orig of snap) {
        if (!rowMap.has(orig.key)) {
          const surviving = current.find(r => r.name && r.name.toLowerCase() === orig.name.toLowerCase());
          if (surviving && cat !== 'cast') {
            mergedSources.add(orig.id);
            let merge = merges.find(m => m.targetId === surviving.id);
            if (!merge) {
              merge = { sourceIds: [], targetId: surviving.id, targetName: surviving.name };
              merges.push(merge);
            }
            merge.sourceIds.push(orig.id);
          }
        }
      }

      for (const merge of merges) {
        dispatch({ type: 'MERGE_ELEMENTS', payload: { category: cat, ...merge } });
      }

      const mergeTargets = new Set(merges.map(m => m.targetId));

      for (const row of current) {
        if (mergeTargets.has(row.id)) continue;
        const orig = snapMap.get(row.key);
        if (!orig) {
          const match = snap.find(s => s.name.toLowerCase() === row.name.toLowerCase());
          if (match && !mergedSources.has(match.id)) {
            dispatch({ type: 'UPDATE_ELEMENT', payload: { category: cat, id: match.id, updates: { id: row.id, name: row.name } } });
            snapMap.delete(match.key);
          } else if (!match) {
            dispatch({ type: 'ADD_ELEMENT', payload: { category: cat, element: { id: row.id, name: row.name } } });
          }
        } else if (orig.id !== row.id || orig.name !== row.name) {
          dispatch({ type: 'UPDATE_ELEMENT', payload: { category: cat, id: orig.id, updates: { id: row.id, name: row.name } } });
        }
      }

      for (const orig of snap) {
        if (!rowMap.has(orig.key)) {
          if (mergedSources.has(orig.id)) continue;
          dispatch({ type: 'DELETE_ELEMENT', payload: { category: cat, id: orig.id } });
        }
      }
    }
    autoMergeRef.current = false;
    snapByCat.current = {};
    for (const cat of Object.keys(rowsByCat.current)) {
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

  function countTotal(cat: string): number {
    const r = rowsByCat.current[cat];
    if (r) return r.length;
    const elems = loadCategoryElements(project, cat);
    return elems.length;
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

  const label = getLabel(category, ELEMENT_CATEGORIES.find(c => c.key === category)?.label || category, project.categoryLabels);

  const topBar = (
    <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm shrink-0">
      <span className="text-xs font-semibold text-zinc-800">{label}</span>
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
  );

  const actionBar = (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm flex-wrap shrink-0">
      <span className="text-[11px] text-zinc-500 font-semibold">{rows.length} {rows.length === 1 ? 'element' : 'elements'}</span>
    </div>
  );

  const headerContent = (
    <>
      <span className="text-xs font-semibold text-zinc-700 mr-2">{label}</span>
      {hasChanges && (
        <button onClick={doRevert} className="bg-white border border-zinc-300 px-2.5 py-1 text-zinc-500 rounded text-[11px] hover:bg-zinc-50 transition-colors flex items-center gap-1">
          <Undo2 className="w-3 h-3" /> Revert
        </button>
      )}
      <button onClick={doSave} className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 ${hasChanges ? 'bg-zinc-900 text-white hover:bg-zinc-800' : 'bg-zinc-100 text-zinc-400'}`}>
        <Save className="w-3 h-3" /> {hasChanges ? 'Save' : 'Saved'}
      </button>
      <div className="w-px h-4 bg-zinc-300 mx-1.5" />
      <span className="text-[11px] text-zinc-500 font-medium">{rows.length} {rows.length === 1 ? 'elem' : 'elems'}</span>
      <DropdownMenu open={showSortMenu} onClose={() => setShowSortMenu(false)} width="w-40" theme="light"
        trigger={
          <button onClick={() => setShowSortMenu(p => !p)} className="bg-white border border-zinc-300 px-2 py-1 text-zinc-600 rounded text-[11px] font-medium hover:bg-zinc-50 transition-colors">
            Sort ▾
          </button>
        }
      >
        {isCast && (
          <DropdownItem onClick={() => applySort('id')} icon={sortMode === 'id' ? <Check className="w-3.5 h-3.5" /> : undefined}>
            By ID
          </DropdownItem>
        )}
        <DropdownItem onClick={() => applySort('name')} icon={sortMode === 'name' ? <Check className="w-3.5 h-3.5" /> : undefined}>
          By Name
        </DropdownItem>
        <DropdownItem onClick={() => applySort('occurrences')} icon={sortMode === 'occurrences' ? <Check className="w-3.5 h-3.5" /> : undefined}>
          By Occurrences
        </DropdownItem>
      </DropdownMenu>
      {isCast && (
        <button onClick={() => setRows(prev => { const max = prev.reduce((m, r) => { const n = parseInt(r.id, 10); return isNaN(n) ? m : Math.max(m, n); }, 0); let n = max + 1; return prev.map(r => r.id.trim() ? r : { ...r, id: String(n++) }); })} className="bg-white border border-zinc-300 px-2 py-1 text-zinc-600 rounded text-[11px] font-medium hover:bg-zinc-50 transition-colors">
          Auto-ID
        </button>
      )}
      {!isCast && (
        <button onClick={() => { autoMergeRef.current = true; doSave(); }} className="bg-white border border-zinc-300 px-2 py-1 text-zinc-600 rounded text-[11px] font-medium hover:bg-zinc-50 transition-colors">
          Merge Duplicates
        </button>
      )}
    </>
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {headerTarget ? createPortal(headerContent, headerTarget) : null}
      <aside className="w-[188px] shrink-0 bg-zinc-50 border-r border-zinc-200 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-zinc-50 px-3 pt-3 pb-1.5">
          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Categories</span>
        </div>
        <div className="px-3 pb-20">
          <div className="space-y-0.5">
            {allCategoryKeys.map(({ key, isCustom, isHidden }) => {
              const Icon = isCustom ? getCustomIcon(project.customCategories.find(c => c.key === key)?.icon || 'Tag') : CAT_ICONS[key];
              const isActive = key === category;
              const hasLabelOverride = !isCustom && !!project.categoryLabels?.[key];
              const label = isCustom
                ? project.customCategories.find(c => c.key === key)?.label || key
                : getLabel(key, ELEMENT_CATEGORIES.find(c => c.key === key)?.label || key, project.categoryLabels);
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
                            setEditCatKey(key); setNewCatName(cat?.label || label); setNewCatIcon(cat?.icon || 'Tag'); setNewCatMultiValue(cat?.multiValue ?? true); setShowEditCustom(true);
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
        {!headerTarget && topBar}
        {!headerTarget && actionBar}
        <div className="flex flex-col h-full px-4 py-4 gap-3">

          {/* Table card */}
          <div className="flex-1 overflow-hidden rounded-xl bg-white border border-zinc-200/80 shadow-sm min-h-0">
            <div className="h-full overflow-auto tab-scroll pb-10">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    {isCast && <th className="sticky top-0 z-10 bg-zinc-50 px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-16">ID</th>}
                    <th className="sticky top-0 z-10 bg-zinc-50 px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Name</th>
                    <th className="sticky top-0 z-10 bg-zinc-50 px-3 py-2 text-center text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-14">Occ</th>
                    <th className="sticky top-0 z-10 bg-zinc-50 px-3 py-2 text-center w-10" />
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
                <span>Add {getLabel(category, 'element', project.categoryLabels)}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Duplicate dialog */}
        {dupDialog && (
          <Modal open onClose={() => setDupDialog(null)} title="Duplicate Elements Found" width="max-w-lg"
            footer={
              <ModalFooter>
                <button onClick={() => { setDupDialog(null); performSave(); }} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Save as-is</button>
                <button onClick={() => { autoMergeRef.current = true; setDupDialog(null); performSave(); }} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors">Merge & Save</button>
              </ModalFooter>
            }
          >
            <div className="p-6">
              <p className="text-xs text-zinc-400">
                The following categories have elements with the same name:{' '}
                {dupDialog.cats.map(c => getLabel(c, c, project.categoryLabels)).join(', ')}.
                Merge duplicates into single entries?
              </p>
            </div>
          </Modal>
        )}

        {/* Add Custom Category modal */}
        {showAddCustom && (
          <Modal open onClose={() => setShowAddCustom(false)} title="Add Category" icon={<Plus className="w-4 h-4" />} width="max-w-md"
            footer={
              <ModalFooter>
                <button onClick={() => setShowAddCustom(false)} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
                <button onClick={createCustomCategory} disabled={!newCatName.trim()} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 disabled:opacity-40 transition-colors">Create</button>
              </ModalFooter>
            }
          >
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newCatName.trim()) createCustomCategory(); }}
                  autoFocus
                  className="w-full mt-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                  placeholder="e.g. Firearms, Period Vehicles..."
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Icon</label>
                <div className="mt-1 grid grid-cols-4 gap-1.5">
                  {CUSTOM_ICON_OPTIONS.map(opt => {
                    const Icon = opt.Icon;
                    const selected = newCatIcon === opt.name;
                    return (
                      <button
                        key={opt.name}
                        onClick={() => setNewCatIcon(opt.name)}
                        className={`p-2 rounded-md transition-colors flex items-center justify-center ${
                          selected ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Value Type</label>
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setNewCatMultiValue(true)}
                    className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${newCatMultiValue ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
                  >
                    Multiple values
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCatMultiValue(false)}
                    className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${!newCatMultiValue ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
                  >
                    Single value
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )}

        {/* Edit Custom Category modal */}
        {showEditCustom && (
          <Modal open onClose={() => setShowEditCustom(false)} title="Edit Category" icon={<Pencil className="w-4 h-4" />} width="max-w-md"
            footer={
              <ModalFooter>
                <button onClick={() => setShowEditCustom(false)} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
                <button onClick={updateCustomCategory} disabled={!newCatName.trim()} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 disabled:opacity-40 transition-colors">Save</button>
              </ModalFooter>
            }
          >
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newCatName.trim()) updateCustomCategory(); }}
                  autoFocus
                  className="w-full mt-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Icon</label>
                <div className="mt-1 grid grid-cols-4 gap-1.5">
                  {CUSTOM_ICON_OPTIONS.map(opt => {
                    const Icon = opt.Icon;
                    const selected = newCatIcon === opt.name;
                    return (
                      <button
                        key={opt.name}
                        onClick={() => setNewCatIcon(opt.name)}
                        className={`p-2 rounded-md transition-colors flex items-center justify-center ${
                          selected ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Value Type</label>
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setNewCatMultiValue(true)}
                    className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${newCatMultiValue ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
                  >
                    Multiple values
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCatMultiValue(false)}
                    className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${!newCatMultiValue ? 'bg-zinc-800 text-white' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
                  >
                    Single value
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )}

        {/* Edit Built-in Category Label modal */}
        {showEditBuiltin && (
          <Modal open onClose={() => setShowEditBuiltin(false)} title="Rename Category" icon={<Pencil className="w-4 h-4" />} width="max-w-md"
            footer={
              <ModalFooter>
                <button onClick={() => setShowEditBuiltin(false)} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
                <button onClick={updateBuiltinLabel} disabled={!newCatName.trim()} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 disabled:opacity-40 transition-colors">Save</button>
              </ModalFooter>
            }
          >
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">New label</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newCatName.trim()) updateBuiltinLabel(); }}
                  autoFocus
                  className="w-full mt-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                />
              </div>
            </div>
          </Modal>
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
    dispatch({ type: 'ADD_CUSTOM_CATEGORY', payload: { key, label: newCatName.trim(), icon: newCatIcon, multiValue: newCatMultiValue } });
    setShowAddCustom(false);
    switchCategory(key);
  }

  function updateCustomCategory() {
    if (!newCatName.trim()) return;
    dispatch({ type: 'UPDATE_CUSTOM_CATEGORY', payload: { key: editCatKey, label: newCatName.trim(), icon: newCatIcon, multiValue: newCatMultiValue } });
    setShowEditCustom(false);
  }
}
