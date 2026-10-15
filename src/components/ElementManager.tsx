import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useProject, PROTECTED_CATEGORIES } from '../store';
import { useDialog } from './Dialog';
import { Trash2, Plus, Pencil, Eye, EyeOff, Check, Link2, Lock, LockOpen, CalendarDays, Users } from 'lucide-react';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon, getLabel, getFieldItems } from '../lib/categories';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import { loadCategoryElements, elementKey, countOccurrences } from '../lib/elements';
import { computeElementDayStats } from '../lib/elementDayStats';
import { getDayTypes } from '../lib/dayTypes';
import { formatDateShort } from '../lib/utils';
import { useRowBuffer, type CommitResult } from '../lib/rowBuffer';
import { useScrolledLeft } from '../lib/useScrolledLeft';
import { useFollowView } from '../lib/supabase/useFollowView';
import { AddCustomCategoryModal, EditCustomCategoryModal, EditBuiltinLabelModal } from './elements/CategoryModals';
import { MergeRowsModal } from './elements/MergeRowsModal';
import { LinkManagerModal } from './elements/LinkManagerModal';
import { ElementCrewLinksModal } from './crew/ElementCrewLinksModal';
import { ElementEventsModal } from './elements/ElementEventsModal';
import { MT_INPUT, MT_HEADER, MT_CELL_SMALL, MT_ADD, useManagerTableSizes } from '../lib/managerTable';
import Button from './Button';
import SidebarNav, { SidebarNavRow } from './SidebarNav';

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
  adds: { key: string; id: string; name: string }[];
  merges: MergeInfo[];
}

export function ElementManager({ initialCategory, onCategoryChange, headerTarget }: { initialCategory?: string; onCategoryChange?: (cat: string) => void; headerTarget?: HTMLElement | null }) {
  const { state, dispatch, locked } = useProject();
  const dialog = useDialog();
  const project = state.present;
  const sizes = useManagerTableSizes();

  const [category, setCategory] = useState(initialCategory || 'cast');

  useEffect(() => {
    if (initialCategory && initialCategory !== category) setCategory(initialCategory);
  }, [initialCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCast = category === 'cast';
  const isSet = category === 'set';

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

  const [mergeDialog, setMergeDialog] = useState<{ label: string; merges: MergeInfo[] } | null>(null);
  const pendingDiffRef = useRef<{ cat: string; diff: CategoryDiff } | null>(null);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [showEditCustom, setShowEditCustom] = useState(false);
  const [showEditBuiltin, setShowEditBuiltin] = useState(false);
  const [editCatKey, setEditCatKey] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Tag');
  const [newCatMultiValue, setNewCatMultiValue] = useState(true);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [eventsTarget, setEventsTarget] = useState<{ key: string; id: string; name: string } | null>(null);
  const [crewTarget, setCrewTarget] = useState<{ id: string; name: string } | null>(null);

  const [sortMode, setSortMode] = useState<'id' | 'name' | 'occurrences'>(isCast ? 'id' : 'name');

  useEffect(() => {
    setSortMode(isCast ? 'id' : 'name');
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  // The commit flow is manager-specific (diff + merge confirmation); the hook
  // calls it on every finished field edit (blur / Enter / Tab).
  const commitRef = useRef<(cat: string, current: LocalRow[], editedKey?: string) => CommitResult>(() => ({ status: 'none' }));

  const buf = useRowBuffer<LocalRow>({
    projectId: project.id,
    scope: category,
    loadRows,
    makeBlankRow: () => ({ key: String(Date.now()), id: '', name: '', occ: 0 }),
    fieldsPerRow: c => (c === 'cast' ? ['id', 'name'] : ['name']),
    reloadDeps: [project.breakdownElements, project.scenes, project.castMembers],
    commit: (cat, current, editedKey) => commitRef.current(cat, current, editedKey),
    hasPendingConfirmation: () => pendingDiffRef.current !== null,
    hasContent: r => !!(r.name.trim() || r.id.trim()),
  });
  const { rows } = buf;

  // Follow (roadmap 243): the selected category mirrors through the shared
  // registration — category keys are project data, so a key this client does
  // not have is ignored.
  const categoryRef = useRef(category);
  categoryRef.current = category;
  const allCategoryKeysRef = useRef<{ key: string; isCustom: boolean; isHidden: boolean }[]>([]);
  const switchCategoryRaw = useCallback((newCat: string) => {
    // A merge confirmation from a just-blurred field owns the commit — a
    // switch that raced the blur would desync the sidebar from the buffer.
    if (pendingDiffRef.current) return;
    buf.switchScope(newCat);
    setCategory(newCat);
    onCategoryChange?.(newCat);
  }, [buf.switchScope, onCategoryChange]);
  const follow = useFollowView({
    place: { tab: 'breakdown', sub: 'elements' },
    fields: [{ key: 'managerCategory', value: category }],
    apply: (view) => {
      const key = view.managerCategory;
      if (!key || key === categoryRef.current) return;
      if (!allCategoryKeysRef.current.some(c => c.key === key)) return;
      switchCategoryRaw(key);
    },
  });
  const switchCategory = useCallback((newCat: string) => {
    // A category click is a view-changing click: it ends follow (S3 rule).
    follow.noteUserChange();
    switchCategoryRaw(newCat);
  }, [follow, switchCategoryRaw]);

  const sortByIdFn = () => buf.sortRows((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const sortByNameFn = () => buf.sortRows((a, b) => (a.name || a.id).toLowerCase().localeCompare((b.name || b.id).toLowerCase()));
  const sortByOccurrencesFn = () => buf.sortRows((a, b) => b.occ - a.occ || (a.name || a.id).toLowerCase().localeCompare((b.name || b.id).toLowerCase()));

  const applySort = useCallback((mode: 'id' | 'name' | 'occurrences') => {
    setSortMode(mode);
    setShowSortMenu(false);
    if (mode === 'id') sortByIdFn();
    else if (mode === 'name') sortByNameFn();
    else sortByOccurrencesFn();
  }, []);

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
   * Diffs the edited rows against STORE TRUTH for one category and produces an
   * atomic edit set. Merge semantics (non-cast, name-keyed):
   * - rows that end up with the same name collapse into one element
   * - renamed names are remapped in every scene at once (swaps stay correct)
   * - removed rows whose name still exists elsewhere are absorbed (no trash)
   * - truly removed rows are deleted and pushed to trash
   */
  function computeCategoryDiff(cat: string, snap: LocalRow[], current: LocalRow[], editedKey?: string): CategoryDiff {
    const snapByKey = new Map<string, LocalRow>(snap.map(r => [r.key, r]));
    const snapByName = new Map<string, LocalRow>(snap.map(r => [r.name.trim().toLowerCase(), r]));

    const renames: { oldName: string; newName: string }[] = [];
    const removes: { id: string; name: string; toTrash: boolean }[] = [];
    const adds: { key: string; id: string; name: string }[] = [];
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
      // Only the collision THIS edit caused (or joined) asks to merge. A
      // pre-existing case-variant pair (car / CAR) must never hijack an
      // unrelated field edit into a merge dialog (roadmap 250).
      if (editedKey !== undefined && !group.some(r => r.key === editedKey)) continue;
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
        else if (r.name.trim()) adds.push({ key: r.key, id: r.name.trim(), name: r.name.trim() });
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

  /** Dispatch one finished edit set (renames/removes/adds) as ONE batch. */
  function applyDiff(cat: string, d: CategoryDiff): CommitResult {
    if (d.renames.length === 0 && d.removes.length === 0 && d.adds.length === 0) return { status: 'none' };
    dispatch({ type: 'BATCH_START' });
    dispatch({
      type: 'MERGE_ELEMENTS',
      payload: { category: cat, renames: d.renames, removes: d.removes, adds: d.adds.map(a => ({ id: a.id, name: a.name })) },
    });
    dispatch({ type: 'BATCH_COMMIT' });
    return { status: 'committed' };
  }

  /** One finished field edit: diff against store truth; a same-name collision
   *  hands over to the merge confirmation. */
  const commitCategory = useCallback((cat: string, current: LocalRow[], editedKey?: string): CommitResult => {
    const snap = loadRows(cat);
    if (cat === 'cast') return commitCast(snap, current);
    const d = computeCategoryDiff(cat, snap, current, editedKey);
    if (d.merges.length > 0) {
      pendingDiffRef.current = { cat, diff: d };
      setMergeDialog({ label: getLabel(cat, ELEMENT_CATEGORIES.find(c => c.key === cat)?.label || cat, project.categoryLabels), merges: d.merges });
      return { status: 'pending' };
    }
    return applyDiff(cat, d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, dispatch]);
  commitRef.current = commitCategory;

  /**
   * Cast members are ID-keyed (scenes store numeric ids) — committed with plain
   * ADD/UPDATE/DELETE dispatches, no name-based merging. A new row left without
   * a Board ID is assigned the next free one (the Auto-ID contract): cast
   * members are keyed by id, so several blank-id members would collide and the
   * second ADD would overwrite the first (roadmap 250). A new row whose name
   * matches a stored member recovers that member's Board ID instead.
   */
  function commitCast(snap: LocalRow[], current: LocalRow[]): CommitResult {
    const snapMap = new Map<string, LocalRow>(snap.map(r => [r.key, r]));
    const rowMap = new Map<string, LocalRow>(current.map(r => [r.key, r]));
    // Next free numeric Board ID across the store AND the rows being committed.
    const usedIds = new Set<string>();
    for (const s of snap) usedIds.add(String(s.id));
    for (const r of current) if (r.id.trim()) usedIds.add(r.id.trim());
    let maxNumeric = 0;
    for (const id of usedIds) {
      const n = parseInt(id, 10);
      if (!isNaN(n)) maxNumeric = Math.max(maxNumeric, n);
    }
    let nextId = maxNumeric + 1;
    const allocateId = () => {
      while (usedIds.has(String(nextId))) nextId++;
      const id = String(nextId);
      usedIds.add(id);
      return id;
    };
    let dispatched = false;
    // One finished edit = one undo entry: every cast change lands in ONE batch.
    const run = (fn: () => void) => {
      if (!dispatched) { dispatched = true; dispatch({ type: 'BATCH_START' }); }
      fn();
    };
    for (const row of current) {
      const orig = snapMap.get(row.key);
      if (!orig) {
        const match = snap.find(s => s.name.toLowerCase() === row.name.toLowerCase());
        if (match) {
          run(() => dispatch({ type: 'UPDATE_ELEMENT', payload: { category: 'cast', id: match.id, updates: { id: row.id, name: row.name } } }));
          snapMap.delete(match.key);
        } else if (row.name.trim() || row.id.trim()) {
          const id = row.id.trim() || allocateId();
          run(() => dispatch({ type: 'ADD_ELEMENT', payload: { category: 'cast', element: { id, name: row.name } } }));
        }
      } else if (orig.id !== row.id || orig.name !== row.name) {
        run(() => dispatch({ type: 'UPDATE_ELEMENT', payload: { category: 'cast', id: orig.id, updates: { id: row.id, name: row.name } } }));
      }
    }
    for (const orig of snap) {
      if (!rowMap.has(orig.key)) {
        run(() => dispatch({ type: 'DELETE_ELEMENT', payload: { category: 'cast', id: orig.id } }));
      }
    }
    if (dispatched) {
      dispatch({ type: 'BATCH_COMMIT' });
      return { status: 'committed' };
    }
    return { status: 'none' };
  }

  const renderInput = (key: string, field: 'id' | 'name', val: string, onChange: (v: string) => void, numeric?: boolean, upper?: boolean, centered?: boolean, wrap = false) => {
    const handleKey = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
      // Tab moves to the next field/cell (committing this one on the blur);
      // with nowhere to go it falls through to the browser's Tab — focus
      // leaves the table and the field still commits.
      if (e.key === 'Tab' && buf.focusNext(key, field)) e.preventDefault();
    };
    const transform = (v: string) => numeric ? v.replace(/[^0-9]/g, '') : upper ? v.toUpperCase() : v.replace(/\n/g, ' ');
    // The name field wraps to a second line on long names (auto-sized textarea,
    // same `field-sizing: content` pattern as the day-modal notes).
    if (wrap) {
      return (
        <textarea
          ref={el => buf.registerInput(key, field, el)}
          rows={1}
          data-manager-name=""
          value={val}
          readOnly={locked}
          onChange={e => onChange(transform(e.target.value))}
          onKeyDown={handleKey}
          onFocus={() => buf.noteFocus(key, field)}
          onBlur={buf.commitEdit}
          style={sizes.input}
          className={`${MT_INPUT} [field-sizing:content] resize-none overflow-hidden leading-snug align-middle ${centered ? 'text-center' : ''}`}
        />
      );
    }
    return (
      <input
        ref={el => buf.registerInput(key, field, el)}
        type="text"
        value={val}
        readOnly={locked}
        onChange={e => onChange(transform(e.target.value))}
        onKeyDown={handleKey}
        onFocus={() => buf.noteFocus(key, field)}
        onBlur={buf.commitEdit}
        style={sizes.input}
        className={`${MT_INPUT} ${centered ? 'text-center' : ''}`}
      />
    );
  };

  function countTotal(cat: string): number {
    if (cat === category) return rows.length;
    return loadCategoryElements(project, cat).length;
  }

  const hiddenSet = useMemo(() => new Set(project.hiddenCategories || []), [project.hiddenCategories]);
  const lockedIds = useMemo(() => new Set((project.lockedElementIds || {})[category] || []), [project.lockedElementIds, category]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableScrolled = useScrolledLeft(scrollRef);

  const dayTypes = useMemo(() => getDayTypes(project), [project]);
  const dayStats = useMemo(() => computeElementDayStats(project, category), [project, category]);

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
  // The follow applier (registered once) reads the live key list through a ref.
  allCategoryKeysRef.current = allCategoryKeys;

  const actionBar = (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm flex-wrap shrink-0">
      <Button onClick={() => setShowLinks(true)} disabled={locked} title="Link elements so adding the anchor adds its linked elements too" data-presence-anchor="toolbar:elements:links">
        <Link2 className="w-3 h-3" />
        Links
      </Button>
    </div>
  );

  const headerContent = (
    <>
      <Button onClick={() => setShowLinks(true)} disabled={locked} data-presence-anchor="toolbar:elements:links">
        <Link2 className="w-3 h-3" /> Links
      </Button>
      <DropdownMenu open={showSortMenu} onOpenChange={setShowSortMenu} width="w-40" theme="light"
        trigger={
          <Button data-presence-anchor="toolbar:elements:sort">Sort ▾</Button>
        }
      >
        {isCast && (
          <DropdownItem onClick={() => applySort('id')} icon={sortMode === 'id' ? <Check className="w-3.5 h-3.5" /> : undefined}>
            By Board ID
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
        <Button
          onClick={async () => {
            const ok = await dialog.confirm({
              title: 'Auto-ID Cast Members?',
              message: 'Auto-ID assigns sequential Board IDs (continuing after the highest existing one) to cast members with an empty Board ID. Locked Board IDs are never changed.',
              suppressKey: 'lemon_schedule_dnwa_auto_id',
            });
            if (!ok) return;
            buf.applyRows(prev => { const max = prev.reduce((m, r) => { const n = parseInt(r.id, 10); return isNaN(n) ? m : Math.max(m, n); }, 0); let n = max + 1; return prev.map(r => r.id.trim() || lockedIds.has(r.key) ? r : { ...r, id: String(n++) }); });
          }}
          disabled={locked}
        >
          Auto-ID
        </Button>
      )}
    </>
  );

  const renderRowActions = (row: SidebarNavRow, active: boolean) => {
    const key = row.key;
    const isCustom = key.startsWith('_cat_');
    const isHidden = !!row.dimmed;
    const isProtected = PROTECTED_CATEGORIES.has(key);
    const showHideToggle = !isCustom && !isProtected;
    const showDelete = isCustom;
    const hoverCls = active ? 'hover:bg-zinc-700' : 'hover:bg-zinc-300';
    // Inner actions are spans (role=button), NOT <button>s — they live inside
    // the row's own <button> and nested buttons are invalid HTML.
    const actionCls = (extra: string) => `p-0.5 rounded transition-colors cursor-pointer select-none ${extra} ${locked ? 'opacity-30 cursor-not-allowed pointer-events-none' : ''}`;
    return (
      <>
        <span
          role="button"
          tabIndex={-1}
          aria-disabled={locked}
          onClick={(e) => {
            e.stopPropagation();
            if (locked) return;
            if (isCustom) {
              const cat = project.customCategories.find(c => c.key === key);
              setEditCatKey(key); setNewCatName(cat?.label || row.label); setNewCatIcon(cat?.icon || 'Tag'); setNewCatMultiValue(cat?.multiValue ?? true); setShowEditCustom(true);
            } else {
              setEditCatKey(key); setNewCatName(row.label); setNewCatIcon('');
              setShowEditBuiltin(true);
            }
          }}
          className={actionCls(hoverCls)}
        >
          <Pencil style={{ width: sizes.iconSm, height: sizes.iconSm }} className="text-zinc-400" />
        </span>
        {showHideToggle && !isHidden && (
          <span
            role="button"
            tabIndex={-1}
            aria-disabled={locked}
            onClick={async (e) => {
              e.stopPropagation();
              if (locked) return;
              const ok = await dialog.confirm({ title: `Hide "${row.label}"?`, message: 'Category will be hidden from all views.', danger: true, suppressKey: 'lemon_schedule_dnwa_hide_category' });
              if (ok) {
                dispatch({ type: 'HIDE_CATEGORY', payload: key });
                if (category === key) switchCategory('cast');
              }
            }}
            className={actionCls(hoverCls)}
          >
            <EyeOff style={{ width: sizes.iconSm, height: sizes.iconSm }} className="text-zinc-400" />
          </span>
        )}
        {showHideToggle && isHidden && (
          <span
            role="button"
            tabIndex={-1}
            aria-disabled={locked}
            onClick={(e) => {
              e.stopPropagation();
              if (locked) return;
              dispatch({ type: 'SHOW_CATEGORY', payload: key });
            }}
            className={actionCls(hoverCls)}
            title="Unhide category"
          >
            <Eye style={{ width: sizes.iconSm, height: sizes.iconSm }} className="text-zinc-400" />
          </span>
        )}
        {showDelete && (
          <span
            role="button"
            tabIndex={-1}
            aria-disabled={locked}
            onClick={async (e) => {
              e.stopPropagation();
              if (locked) return;
              if (pendingDiffRef.current) return; // a merge confirmation owns the commit
              const ok = await dialog.confirm({ title: `Delete "${row.label}"?`, message: 'Category and all its data will be permanently deleted.', danger: true, suppressKey: 'lemon_schedule_dnwa_delete_category' });
              if (ok) {
                dispatch({ type: 'DELETE_CUSTOM_CATEGORY', payload: key });
                if (category === key) switchCategory('cast');
              }
            }}
            className={actionCls(active ? 'hover:bg-red-900/50' : 'hover:bg-red-100')}
          >
            <Trash2 style={{ width: sizes.iconSm, height: sizes.iconSm }} className="text-red-400" />
          </span>
        )}
      </>
    );
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {headerTarget ? createPortal(headerContent, headerTarget) : null}
      <SidebarNav
        title="Categories"
        rows={allCategoryKeys.map(({ key, isCustom, isHidden }) => ({
          key,
          label: isCustom
            ? project.customCategories.find(c => c.key === key)?.label || key
            : getLabel(key, ELEMENT_CATEGORIES.find(c => c.key === key)?.label || key, project.categoryLabels),
          icon: isCustom ? getCustomIcon(project.customCategories.find(c => c.key === key)?.icon || 'Tag') : CAT_ICONS[key],
          dimmed: isHidden,
          italic: !isCustom && !!project.categoryLabels?.[key],
          count: countTotal(key),
        }))}
        activeKey={category}
        onSelect={switchCategory}
        onAdd={() => { setShowAddCustom(true); setNewCatName(''); setNewCatIcon('Tag'); }}
        addLabel="Add Custom"
        addDisabled={locked}
        renderRowActions={renderRowActions}
      />

      <div className="flex-1 flex flex-col h-full bg-zinc-100 overflow-hidden">
        {!headerTarget && actionBar}
        <div className="flex flex-col h-full px-4 py-4 gap-3">

          {/* Table card */}
          <div className="flex-1 overflow-hidden rounded-xl bg-white border border-zinc-200/80 shadow-sm min-h-0">
            <div ref={scrollRef} className="h-full overflow-auto tab-scroll pb-10">
              <table className="w-full manager-table">
                <thead>
                  <tr className="bg-zinc-50">
                    {isCast && <th style={sizes.header} className={`sticky top-0 left-0 z-30 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-left w-24 min-w-24 ${tableScrolled ? 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.12)]' : ''}`}>Board ID</th>}
                    <th style={sizes.header} className={`sticky top-0 ${isCast ? 'left-24' : 'left-0'} z-30 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-left min-w-[140px] max-w-52 ${tableScrolled ? 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.12)]' : ''}`}>Name</th>
                    <th style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-center min-w-14`}>Occ</th>
                    <th style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-left min-w-24`}>Start Date</th>
                    <th style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-left min-w-24`}>Finish Date</th>
                    <th style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-center min-w-14`}>Total Days</th>
                    {dayTypes.map(t => (
                      <th key={t.key} title={t.label} style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-center min-w-14`}>{t.label}</th>
                    ))}
                    <th style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-center w-12`} title="Crew linked to this element">Crew</th>
                    <th style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-center w-12`}>Events</th>
                    <th style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 ${MT_HEADER} text-center w-12`} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => {
                      const stats = dayStats.get(r.key);
                      return (
                    <tr key={r.key} data-presence-anchor={`elements:${r.key}`} className={`group transition-colors ${ri % 2 === 0 ? 'bg-white' : 'bg-zinc-50/30'} hover:bg-zinc-100`}>
                      {isCast && (
                        <td style={sizes.cellSmall} className={`sticky left-0 z-10 ${MT_CELL_SMALL} ${ri % 2 === 0 ? 'bg-white' : 'bg-zinc-50'} group-hover:bg-zinc-100 ${tableScrolled ? 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.12)]' : ''}`}>
                          <div className="flex items-center gap-1">
                            <div className="flex-1 min-w-0">
                              {renderInput(r.key, 'id', r.id, v => buf.updateRow(r.key, 'id', v), true, false, true)}
                            </div>
                            <button
                              onClick={() => dispatch({ type: 'TOGGLE_ELEMENT_LOCK', payload: { category, id: r.key } })}
                              disabled={locked}
                              title={lockedIds.has(r.key) ? 'Unlock Board ID — Auto-ID may renumber it' : 'Lock Board ID — Auto-ID never changes it'}
                              className="p-1 rounded-md shrink-0 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                              {lockedIds.has(r.key)
                                ? <Lock style={{ width: sizes.icon, height: sizes.icon }} className="text-zinc-700 hover:text-red-500" />
                                : <LockOpen style={{ width: sizes.icon, height: sizes.icon }} className="text-zinc-400 hover:text-zinc-800" />}
                            </button>
                          </div>
                        </td>
                      )}
                      <td style={sizes.cellSmall} className={`sticky ${isCast ? 'left-24' : 'left-0'} z-10 ${MT_CELL_SMALL} ${ri % 2 === 0 ? 'bg-white' : 'bg-zinc-50'} group-hover:bg-zinc-100 ${tableScrolled ? 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.12)]' : ''}`}>{renderInput(r.key, 'name', r.name, v => buf.updateRow(r.key, 'name', v), false, isCast || isSet, false, true)}</td>
                      <td style={sizes.cellSmall} className={`${MT_CELL_SMALL} text-center text-zinc-400 font-medium`}>{r.occ}</td>
                      <td style={sizes.cellSmall} className={`${MT_CELL_SMALL} text-zinc-400`}>{stats?.startDate ? formatDateShort(stats.startDate) : ''}</td>
                      <td style={sizes.cellSmall} className={`${MT_CELL_SMALL} text-zinc-400`}>{stats?.finishDate ? formatDateShort(stats.finishDate) : ''}</td>
                      <td style={sizes.cellSmall} className={`${MT_CELL_SMALL} text-center text-zinc-400 font-medium`}>{stats?.totalDays ?? 0}</td>
                      {dayTypes.map(t => (
                        <td key={t.key} title={t.label} style={sizes.cellSmall} className={`${MT_CELL_SMALL} text-center text-zinc-400 font-medium`}>{t.key === 'work' ? (stats?.workDays ?? 0) : (stats?.statusCounts[t.key] ?? 0)}</td>
                      ))}
                      <td style={sizes.cellSmall} className={`${MT_CELL_SMALL} text-center whitespace-nowrap`}>
                        <button
                          onClick={() => setCrewTarget({ id: r.id, name: r.name })}
                          title={`Linked crew — crew linked to ${r.name || r.id}`}
                          className="p-1.5 rounded-md hover:bg-blue-50 transition-colors opacity-40 hover:opacity-100 align-middle"
                        >
                          <Users style={{ width: sizes.icon, height: sizes.icon }} className="text-blue-500" />
                        </button>
                      </td>
                      <td style={sizes.cellSmall} className={`${MT_CELL_SMALL} text-center whitespace-nowrap`}>
                        <button
                          onClick={() => setEventsTarget({ key: r.key, id: r.id, name: r.name })}
                          title={`Events — dates, rules and violations for ${r.name || r.id}`}
                          className="p-1.5 rounded-md hover:bg-blue-50 transition-colors opacity-40 hover:opacity-100 align-middle"
                        >
                          <CalendarDays style={{ width: sizes.icon, height: sizes.icon }} className="text-blue-500" />
                        </button>
                      </td>
                      <td style={sizes.cellSmall} className={`${MT_CELL_SMALL} text-center whitespace-nowrap`}>
                        <button onClick={() => buf.deleteRow(r.key)} disabled={locked} className="p-1.5 rounded-md hover:bg-red-50 transition-colors opacity-40 hover:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed align-middle">
                          <Trash2 style={{ width: sizes.icon, height: sizes.icon }} className="text-red-400" />
                        </button>
                      </td>
                    </tr>
                      );
                    })}
                </tbody>
              </table>

              <button onClick={buf.addNew} disabled={locked} style={sizes.add} className={`${MT_ADD}`}>
                <Plus className="w-3.5 h-3.5" />
                <span>Add {getLabel(category, 'element', project.categoryLabels)}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Merge confirmation dialog */}
        {mergeDialog && (
          <MergeRowsModal
            title="Merge Elements"
            intro="The following elements now share a name. Merging collapses each set into a single element and updates every scene that references them."
            groups={[{
              label: mergeDialog.label,
              merges: mergeDialog.merges.map(m => ({
                sourceNames: m.sourceNames,
                targetName: m.targetName,
                summary: `${m.sceneNumbers.length} ${m.sceneNumbers.length === 1 ? 'scene' : 'scenes'}`,
                detailLines: m.sceneNumbers.length > 0 ? [`Scenes: ${m.sceneNumbers.join(', ')}`] : undefined,
              })),
            }]}
            onCancel={() => {
              pendingDiffRef.current = null;
              setMergeDialog(null);
              buf.revertUncommitted();
            }}
            onConfirm={() => {
              const pending = pendingDiffRef.current;
              pendingDiffRef.current = null;
              setMergeDialog(null);
              if (pending) {
                // The diff is resolved either way — a merge that dispatches
                // nothing (a duplicate name carrying no new details) still
                // absorbs its local-only row.
                applyDiff(pending.cat, pending.diff);
                buf.settleCommit();
              }
            }}
          />
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

        {showLinks && (
          <LinkManagerModal
            initialAnchorCategory={category}
            onClose={() => setShowLinks(false)}
          />
        )}
        {eventsTarget && (
          <ElementEventsModal
            category={category}
            rowKey={eventsTarget.key}
            rowId={eventsTarget.id}
            rowName={eventsTarget.name}
            onClose={() => setEventsTarget(null)}
          />
        )}
        {crewTarget && (
          <ElementCrewLinksModal
            category={category}
            elementKey={isCast ? crewTarget.id : crewTarget.name}
            elementName={crewTarget.name || crewTarget.id}
            onClose={() => setCrewTarget(null)}
          />
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
