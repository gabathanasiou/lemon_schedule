import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useProject, PROTECTED_CATEGORIES, useIsCloudProject } from '../store';
import { ProjectElement, CustomCategoryDef } from '../types';
import { getElementsFromScenes } from '../store';
import { getFieldItems, isMultiValue } from '../lib/categories';
import { useDialog } from './Dialog';
import { generateUUID } from '../lib/utils';
import { Trash2, Plus, Save, Undo2, Pencil, Eye, EyeOff, Check, ArrowRight } from 'lucide-react';
import { ELEMENT_CATEGORIES, CAT_ICONS, CUSTOM_ICON_OPTIONS, getCustomIcon, getLabel } from '../lib/categories';
import Modal from './Modal';
import { ModalFooter } from './Modal';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import { useCurrentDocument } from '../lib/popoutTarget';
import { loadCategoryElements, elementKey, countOccurrences } from '../lib/elements';
import { registerUnsavedGuard, wasUnsavedPromptHandled, consumePendingTab, setPendingTab, notifyGuardChanged } from '../lib/unsavedGuard';
import { AddCustomCategoryModal, EditCustomCategoryModal, EditBuiltinLabelModal } from './elements/CategoryModals';

interface LocalRow {
  key: string;
  id: string;
  name: string;
  occ: number;
}

interface MergeInfo {
  sourceNames: string[];
  targetName: string;
  sceneNumbers: string[];
}

interface CategoryDiff {
  renames: { oldName: string; newName: string }[];
  removes: { id: string; name: string; toTrash: boolean }[];
  adds: { id: string; name: string }[];
  merges: MergeInfo[];
}

export function ElementManager({ initialCategory, onCategoryChange, headerTarget }: { initialCategory?: string; onCategoryChange?: (cat: string) => void; headerTarget?: HTMLElement | null }) {
  const { state, dispatch, readOnly } = useProject();
  const isCloud = useIsCloudProject();
  const currentDocument = useCurrentDocument();
  const dialog = useDialog();
  const project = state.present;

  const [category, setCategory] = useState(initialCategory || 'cast');

  useEffect(() => {
    if (initialCategory && initialCategory !== category) setCategory(initialCategory);
  }, [initialCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    rowsByCat.current = {};
    snapByCat.current = {};
    undoByCat.current = {};
    redoByCat.current = {};
    notifyGuardChanged();
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
      undoByCat.current = {};
      redoByCat.current = {};
      notifyGuardChanged();
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
  const undoByCat = useRef<Record<string, LocalRow[][]>>({});
  const redoByCat = useRef<Record<string, LocalRow[][]>>({});
  // Rows captured when an input gains focus — pushed as ONE undo entry on the
  // first keystroke, discarded on blur without changes (per-operation undo).
  const pendingSnapshotRef = useRef<LocalRow[] | null>(null);

  /** Pushes a pre-operation snapshot for `cat` and clears that category's redo. */
  function pushUndo(cat: string, snapshot: LocalRow[]) {
    const stack = undoByCat.current[cat] || [];
    stack.push(snapshot);
    if (stack.length > 50) stack.shift();
    undoByCat.current[cat] = stack;
    redoByCat.current[cat] = [];
    notifyGuardChanged();
  }

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

  const categoryRef = useRef(category);
  categoryRef.current = category;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

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

  const [mergeDialog, setMergeDialog] = useState<{ categories: { label: string; merges: MergeInfo[] }[] } | null>(null);
  const pendingDiffsRef = useRef<Record<string, CategoryDiff> | null>(null);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [showEditCustom, setShowEditCustom] = useState(false);
  const [showEditBuiltin, setShowEditBuiltin] = useState(false);
  const [editCatKey, setEditCatKey] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Tag');
  const [newCatMultiValue, setNewCatMultiValue] = useState(true);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const [sortMode, setSortMode] = useState<'id' | 'name' | 'occurrences'>(isCast ? 'id' : 'name');

  useEffect(() => {
    setSortMode(isCast ? 'id' : 'name');
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortByIdFn = useCallback(() => {
    pushUndo(categoryRef.current, rowsRef.current);
    setRows(prev => [...prev].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })));
  }, []);
  const sortByNameFn = useCallback(() => {
    pushUndo(categoryRef.current, rowsRef.current);
    setRows(prev => [...prev].sort((a, b) => (a.name || a.id).toLowerCase().localeCompare((b.name || b.id).toLowerCase())));
  }, []);
  const sortByOccurrencesFn = useCallback(() => {
    pushUndo(categoryRef.current, rowsRef.current);
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
    // First mutation after an input gained focus: commit the pre-edit snapshot
    // as one undo entry (further keystrokes of the same edit do not push).
    if (pendingSnapshotRef.current) {
      pushUndo(categoryRef.current, pendingSnapshotRef.current);
      pendingSnapshotRef.current = null;
    }
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
  }, []);

  const deleteRow = useCallback((key: string) => {
    pushUndo(categoryRef.current, rowsRef.current);
    setRows(prev => prev.filter(r => r.key !== key));
  }, []);

  const addNew = useCallback(() => {
    pushUndo(categoryRef.current, rowsRef.current);
    setRows(prev => [...prev, { key: String(Date.now()), id: '', name: '', occ: 0 }]);
  }, []);

  const undoLocal = useCallback((): boolean => {
    const cat = categoryRef.current;
    const stack = undoByCat.current[cat] || [];
    if (stack.length === 0) return false;
    const snapshot = stack.pop()!;
    undoByCat.current[cat] = stack;
    const redoStack = redoByCat.current[cat] || [];
    redoStack.push(rowsRef.current);
    redoByCat.current[cat] = redoStack;
    rowsByCat.current[cat] = snapshot;
    setRows(snapshot);
    // If an input is still focused, the next keystroke starts a fresh edit
    // whose undo entry is the restored state.
    pendingSnapshotRef.current = snapshot;
    notifyGuardChanged();
    return true;
  }, []);

  const redoLocal = useCallback((): boolean => {
    const cat = categoryRef.current;
    const stack = redoByCat.current[cat] || [];
    if (stack.length === 0) return false;
    const snapshot = stack.pop()!;
    redoByCat.current[cat] = stack;
    const undoStack = undoByCat.current[cat] || [];
    undoStack.push(rowsRef.current);
    undoByCat.current[cat] = undoStack;
    rowsByCat.current[cat] = snapshot;
    setRows(snapshot);
    pendingSnapshotRef.current = snapshot;
    notifyGuardChanged();
    return true;
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

  function collectSceneNumbers(name: string, cat: string, out: Set<string>) {
    const lower = name.trim().toLowerCase();
    project.scenes.forEach((s, i) => {
      const val = (s as any)[cat];
      if (!val) return;
      if (getFieldItems(cat, val).some(x => x.toLowerCase() === lower)) {
        out.add(s.sceneNumber || String(i + 1));
      }
    });
  }

  /**
   * Diffs the edited rows against the loaded snapshot for one category and
   * produces an atomic edit set. Merge semantics (non-cast, name-keyed):
   * - rows that end up with the same name collapse into one element
   * - renamed names are remapped in every scene at once (swaps stay correct)
   * - removed rows whose name still exists elsewhere are absorbed (no trash)
   * - truly removed rows are deleted and pushed to trash
   */
  function computeCategoryDiff(cat: string): CategoryDiff {
    const snap = snapByCat.current[cat] || [];
    const current = rowsByCat.current[cat] || [];
    const snapByKey = new Map<string, LocalRow>(snap.map(r => [r.key, r]));
    const snapByName = new Map<string, LocalRow>(snap.map(r => [r.name.trim().toLowerCase(), r]));

    const renames: { oldName: string; newName: string }[] = [];
    const removes: { id: string; name: string; toTrash: boolean }[] = [];
    const adds: { id: string; name: string }[] = [];
    const merges: MergeInfo[] = [];

    const groups = new Map<string, LocalRow[]>();
    for (const r of current) {
      const name = (r.name || r.id).trim().toLowerCase();
      if (!name) continue;
      const g = groups.get(name);
      if (g) g.push(r);
      else groups.set(name, [r]);
    }

    const handled = new Set<string>();

    for (const [name, group] of groups) {
      if (group.length <= 1) continue;
      const target = group.find(r => snapByKey.get(r.key)?.name.trim().toLowerCase() === name)
        || group.find(r => snapByKey.has(r.key))
        || group[0];
      const targetSnap = snapByKey.get(target.key);
      const sourceNames: string[] = [];
      const sceneNums = new Set<string>();
      for (const r of group) {
        if (r.key === target.key) continue;
        const s = snapByKey.get(r.key);
        if (s) {
          removes.push({ id: s.id, name: s.name, toTrash: false });
          if (s.name.trim().toLowerCase() !== name) {
            renames.push({ oldName: s.name, newName: target.name.trim() });
            collectSceneNumbers(s.name, cat, sceneNums);
          }
          sourceNames.push(s.name);
        }
        handled.add(r.key);
      }
      if (targetSnap && targetSnap.name.trim().toLowerCase() !== name) {
        renames.push({ oldName: targetSnap.name, newName: target.name.trim() });
        sourceNames.push(targetSnap.name);
        collectSceneNumbers(targetSnap.name, cat, sceneNums);
      }
      handled.add(target.key);
      if (sourceNames.length > 0) {
        merges.push({ sourceNames, targetName: target.name.trim(), sceneNumbers: [...sceneNums] });
      }
    }

    const claimed = new Set<string>();
    for (const r of current) {
      if (handled.has(r.key)) continue;
      const s = snapByKey.get(r.key);
      const name = (r.name || r.id).trim().toLowerCase();
      if (s) {
        if (!name) {
          removes.push({ id: s.id, name: s.name, toTrash: true });
          continue;
        }
        if (s.name.trim().toLowerCase() !== name) {
          renames.push({ oldName: s.name, newName: r.name.trim() });
          if (snapByName.has(name)) {
            const sceneNums = new Set<string>();
            collectSceneNumbers(s.name, cat, sceneNums);
            merges.push({ sourceNames: [s.name], targetName: r.name.trim(), sceneNumbers: [...sceneNums] });
          }
        }
      } else {
        const match = snapByName.get(name);
        if (match) claimed.add(match.key);
        else if (r.name.trim()) adds.push({ id: r.name.trim(), name: r.name.trim() });
      }
    }

    const renameOld = new Set(renames.map(rn => rn.oldName.trim().toLowerCase()));
    const renameNew = new Set(renames.map(rn => rn.newName.trim().toLowerCase()));
    const curNames = new Set(current.map(r => (r.name || r.id).trim().toLowerCase()).filter(Boolean));
    for (const s of snap) {
      if (current.some(r => r.key === s.key)) continue;
      const lower = s.name.trim().toLowerCase();
      if (claimed.has(s.key)) continue;
      if (renameOld.has(lower) || renameNew.has(lower)) continue;
      if (curNames.has(lower)) {
        removes.push({ id: s.id, name: s.name, toTrash: false });
        continue;
      }
      removes.push({ id: s.id, name: s.name, toTrash: true });
    }

    return { renames, removes, adds, merges };
  }

  function hasCastChanges(cat: string): boolean {
    const snap = snapByCat.current[cat] || [];
    const current = rowsByCat.current[cat] || [];
    if (snap.length !== current.length) return true;
    const snapMap = new Map<string, LocalRow>(snap.map(r => [r.key, r]));
    for (const row of current) {
      const orig = snapMap.get(row.key);
      if (!orig) {
        const match = snap.find(s => s.name.toLowerCase() === row.name.toLowerCase());
        if (!match && (row.name.trim() || row.id.trim())) return true;
      } else if (orig.id !== row.id || orig.name !== row.name) return true;
    }
    return false;
  }

  function commitSaves(diffs: Record<string, CategoryDiff>) {
    let willDispatch = false;
    for (const cat of Object.keys(rowsByCat.current)) {
      if (cat === 'cast') {
        if (hasCastChanges(cat)) willDispatch = true;
        continue;
      }
      const d = diffs[cat];
      if (d && (d.renames.length > 0 || d.removes.length > 0 || d.adds.length > 0)) willDispatch = true;
    }
    if (willDispatch) {
      dispatch({ type: 'BATCH_START' });
      for (const cat of Object.keys(rowsByCat.current)) {
        if (cat === 'cast') {
          saveCastCategory(cat);
          continue;
        }
        const d = diffs[cat];
        if (d && (d.renames.length > 0 || d.removes.length > 0 || d.adds.length > 0)) {
          dispatch({ type: 'MERGE_ELEMENTS', payload: { category: cat, renames: d.renames, removes: d.removes, adds: d.adds } });
        }
      }
      dispatch({ type: 'BATCH_COMMIT' });
    }
    snapByCat.current = {};
    for (const cat of Object.keys(rowsByCat.current)) {
      snapByCat.current[cat] = (rowsByCat.current[cat] || []).map(r => ({ ...r }));
    }
    pendingDiffsRef.current = null;
    setMergeDialog(null);
    setSaveVersion(v => v + 1);
    // The save is committed — local history becomes one store undo entry.
    undoByCat.current = {};
    redoByCat.current = {};
    notifyGuardChanged();
    // Resume a tab switch that was waiting on this merge confirmation.
    consumePendingTab()?.();
  }

  const doSave = useCallback(() => {
    rowsByCat.current[category] = rows;
    const diffs: Record<string, CategoryDiff> = {};
    const dialogCats: { label: string; merges: MergeInfo[] }[] = [];
    for (const cat of Object.keys(rowsByCat.current)) {
      if (cat === 'cast') continue;
      const d = computeCategoryDiff(cat);
      diffs[cat] = d;
      if (d.merges.length > 0) {
        dialogCats.push({ label: getLabel(cat, ELEMENT_CATEGORIES.find(c => c.key === cat)?.label || cat, project.categoryLabels), merges: d.merges });
      }
    }
    if (dialogCats.length > 0) {
      pendingDiffsRef.current = diffs;
      setMergeDialog({ categories: dialogCats });
      return;
    }
    commitSaves(diffs);
  }, [rows, category, project]);

  /**
   * Cast members are ID-keyed (scenes store numeric ids) — saved with plain
   * ADD/UPDATE/DELETE dispatches, no name-based merging.
   */
  function saveCastCategory(cat: string) {
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
        } else if (row.name.trim() || row.id.trim()) {
          dispatch({ type: 'ADD_ELEMENT', payload: { category: cat, element: { id: row.id, name: row.name } } });
        }
      } else if (orig.id !== row.id || orig.name !== row.name) {
        dispatch({ type: 'UPDATE_ELEMENT', payload: { category: cat, id: orig.id, updates: { id: row.id, name: row.name } } });
      }
    }
    for (const orig of snap) {
      if (!rowMap.has(orig.key)) {
        dispatch({ type: 'DELETE_ELEMENT', payload: { category: cat, id: orig.id } });
      }
    }
  }

  const doRevert = useCallback(() => {
    for (const cat of Object.keys(snapByCat.current)) rowsByCat.current[cat] = snapByCat.current[cat].map(r => ({ ...r }));
    setRows(rowsByCat.current[category] || []);
    setSaveVersion(v => v + 1);
  }, [category]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey) {
        if (e.key === 'n' && e.shiftKey) { e.preventDefault(); if (!readOnly) addNew(); }
        if (e.key === 's') { e.preventDefault(); if (!readOnly) doSave(); }
      }
    };
    currentDocument.addEventListener('keydown', onKey);
    return () => currentDocument.removeEventListener('keydown', onKey);
  }, [addNew, doSave, currentDocument, readOnly]);

  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;
  const doSaveRef = useRef(doSave);
  doSaveRef.current = doSave;

  const undoLocalRef = useRef(undoLocal);
  undoLocalRef.current = undoLocal;
  const redoLocalRef = useRef(redoLocal);
  redoLocalRef.current = redoLocal;

  useEffect(() => {
    // Tab switches (top tabs, sub-tabs, popouts) consult this guard BEFORE
    // unmounting, so save + merge confirmation run while still mounted.
    // Undo/redo affordances (header buttons, Cmd+Z) route through it to the
    // local edit history first, falling back to the store undo when empty.
    registerUnsavedGuard({
      hasUnsavedChanges: () => hasChangesRef.current,
      save: () => { doSaveRef.current(); },
      hasPendingConfirmation: () => pendingDiffsRef.current !== null,
      hasLocalUndo: () => (undoByCat.current[categoryRef.current] || []).length > 0,
      hasLocalRedo: () => (redoByCat.current[categoryRef.current] || []).length > 0,
      undoLocal: () => undoLocalRef.current(),
      redoLocal: () => redoLocalRef.current(),
    });
    return () => {
      registerUnsavedGuard(null);
      // Fallback for unmount paths that bypass the guard (window close).
      if (!wasUnsavedPromptHandled() && hasChangesRef.current) {
        const doSave = doSaveRef.current;
        dialog.confirm({ title: 'Unsaved Changes', message: 'You have unsaved changes. Save before leaving?' }).then(ok => {
          if (ok) doSave();
        });
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        readOnly={readOnly}
        onChange={e => onChange(transform(e.target.value))}
        onKeyDown={handleKey}
        onFocus={() => { pendingSnapshotRef.current = rowsRef.current; }}
        onBlur={() => { pendingSnapshotRef.current = null; }}
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
          <button onClick={doRevert} disabled={readOnly} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-zinc-500 hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <Undo2 className="w-3 h-3" />
              Revert
            </button>
        )}
        <button onClick={doSave} disabled={readOnly} className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold transition-all shadow-sm ${hasChanges ? 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-zinc-900/20' : 'bg-zinc-100 text-zinc-400'}`}>
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
        <button onClick={doRevert} disabled={readOnly} className="bg-white border border-zinc-300 px-2.5 py-1 text-zinc-500 rounded text-[11px] hover:bg-zinc-50 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
          <Undo2 className="w-3 h-3" /> Revert
        </button>
      )}
      <button onClick={doSave} disabled={readOnly} className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 ${hasChanges ? (isCloud ? 'bg-blue-950 text-white hover:bg-blue-900' : 'bg-zinc-900 text-white hover:bg-zinc-800') : 'bg-zinc-100 text-zinc-400'} disabled:opacity-40 disabled:cursor-not-allowed`}>
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
        <button onClick={() => { pushUndo(categoryRef.current, rowsRef.current); setRows(prev => { const max = prev.reduce((m, r) => { const n = parseInt(r.id, 10); return isNaN(n) ? m : Math.max(m, n); }, 0); let n = max + 1; return prev.map(r => r.id.trim() ? r : { ...r, id: String(n++) }); }); }} disabled={readOnly} className="bg-white border border-zinc-300 px-2 py-1 text-zinc-600 rounded text-[11px] font-medium hover:bg-zinc-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          Auto-ID
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
                    <span className={`flex items-center gap-0.5 shrink-0 ${isHidden ? '' : 'hover-reveal'}`} onClick={e => e.stopPropagation()}>
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
                        disabled={readOnly}
                        className={`p-0.5 rounded transition-colors ${isActive ? 'hover:bg-zinc-700' : 'hover:bg-zinc-300'} disabled:opacity-30 disabled:cursor-not-allowed`}
                      >
                        <Pencil className="w-3 h-3 text-zinc-400" />
                      </button>
                      {showHideToggle && !isHidden && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = await dialog.confirm({ title: `Hide "${label}"?`, message: 'Category will be hidden from all views.', danger: true, suppressKey: 'lemon_schedule_dnwa_hide_category' });
                            if (ok) {
                              dispatch({ type: 'HIDE_CATEGORY', payload: key });
                              if (category === key) switchCategory('cast');
                            }
                          }}
                          disabled={readOnly}
                          className={`p-0.5 rounded transition-colors ${isActive ? 'hover:bg-zinc-700' : 'hover:bg-zinc-300'} disabled:opacity-30 disabled:cursor-not-allowed`}
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
                          disabled={readOnly}
                          className={`p-0.5 rounded transition-colors ${isActive ? 'hover:bg-zinc-700' : 'hover:bg-zinc-300'} disabled:opacity-30 disabled:cursor-not-allowed`}
                          title="Unhide category"
                        >
                          <Eye className="w-3 h-3 text-zinc-400" />
                        </button>
                      )}
                      {showDelete && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = await dialog.confirm({ title: `Delete "${label}"?`, message: 'Category and all its data will be permanently deleted.', danger: true, suppressKey: 'lemon_schedule_dnwa_delete_category' });
                            if (ok) {
                              dispatch({ type: 'DELETE_CUSTOM_CATEGORY', payload: key });
                              if (category === key) switchCategory('cast');
                            }
                          }}
                          disabled={readOnly}
                          className={`p-0.5 rounded transition-colors ${isActive ? 'hover:bg-red-900/50' : 'hover:bg-red-100'} disabled:opacity-30 disabled:cursor-not-allowed`}
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
            disabled={readOnly}
            className="w-full text-left px-2 py-1.5 mt-1 rounded-md text-xs text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 transition-colors flex items-center gap-2 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
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
                        <button onClick={() => deleteRow(r.key)} disabled={readOnly} className="p-1 rounded-md hover:bg-red-50 transition-colors opacity-40 hover:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button onClick={addNew} disabled={readOnly} className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition-colors w-full disabled:opacity-40 disabled:cursor-not-allowed">
                <Plus className="w-3.5 h-3.5" />
                <span>Add {getLabel(category, 'element', project.categoryLabels)}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Merge confirmation dialog */}
        {mergeDialog && (
          <Modal open onClose={() => { setMergeDialog(null); pendingDiffsRef.current = null; setPendingTab(null); }} title="Merge Elements" width="max-w-lg"
            footer={
              <ModalFooter>
                <button onClick={() => { setMergeDialog(null); pendingDiffsRef.current = null; setPendingTab(null); }} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancel</button>
                <button onClick={() => commitSaves(pendingDiffsRef.current || {})} className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors">Merge & Save</button>
              </ModalFooter>
            }
          >
            <div className="p-6 space-y-5">
              <p className="text-xs text-zinc-400 leading-relaxed">
                The following elements now share a name. Saving will merge each set into a single element and update every scene that references them.
              </p>
              {mergeDialog.categories.map(cat => (
                <div key={cat.label} className="space-y-2">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{cat.label}</h4>
                  {cat.merges.map((m, i) => (
                    <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="text-xs text-zinc-300 font-medium">{m.sourceNames.join(', ')}</span>
                          <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />
                          <span className="text-xs text-white font-semibold">{m.targetName}</span>
                        </div>
                        <span className="text-[10px] text-zinc-500 shrink-0 tabular-nums">
                          {m.sceneNumbers.length} {m.sceneNumbers.length === 1 ? 'scene' : 'scenes'}
                        </span>
                      </div>
                      {m.sceneNumbers.length > 0 && (
                        <div className="mt-1.5 text-[10px] text-zinc-500 leading-relaxed max-h-20 overflow-y-auto tab-scroll">
                          Scenes: {m.sceneNumbers.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Modal>
        )}

        <AddCustomCategoryModal
          open={showAddCustom}
          onClose={() => setShowAddCustom(false)}
          name={newCatName}
          onNameChange={setNewCatName}
          catIcon={newCatIcon}
          onIconChange={setNewCatIcon}
          multiValue={newCatMultiValue}
          onMultiValueChange={setNewCatMultiValue}
          onSubmit={createCustomCategory}
        />
        <EditCustomCategoryModal
          open={showEditCustom}
          onClose={() => setShowEditCustom(false)}
          name={newCatName}
          onNameChange={setNewCatName}
          catIcon={newCatIcon}
          onIconChange={setNewCatIcon}
          multiValue={newCatMultiValue}
          onMultiValueChange={setNewCatMultiValue}
          onSubmit={updateCustomCategory}
        />
        <EditBuiltinLabelModal
          open={showEditBuiltin}
          onClose={() => setShowEditBuiltin(false)}
          name={newCatName}
          onNameChange={setNewCatName}
          onSubmit={updateBuiltinLabel}
        />
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
