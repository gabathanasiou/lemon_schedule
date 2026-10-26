import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useProject, PROTECTED_CATEGORIES } from '../store';
import { useDialog } from './Dialog';
import { Trash2, Plus, Pencil, Eye, EyeOff, Check, Link2, Lock, LockOpen, PanelRight } from 'lucide-react';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon, getLabel, getFieldItems } from '../lib/categories';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import { loadCategoryElements, elementKey, countOccurrences, boardIdOf, compareBoardIds, isDuplicateBoardId, nextBoardId } from '../lib/elements';
import { CAST_DETAIL_FIELDS, castDetailsOf, useCastDetailsOpen, type CastDetailKey, type CastDetails } from '../lib/castDetails';
import { computeElementDayStats } from '../lib/elementDayStats';
import { getDayTypes } from '../lib/dayTypes';
import { formatDateShort } from '../lib/utils';
import { useRowBuffer, type CommitResult } from '../lib/rowBuffer';
import { searchManagerRecords, type ManagerSearchHit, type ManagerSearchRecord } from '../lib/managerSearch';
import { useScrolledLeft } from '../lib/useScrolledLeft';
import { useFollowView } from '../lib/supabase/useFollowView';
import { AddCustomCategoryModal, EditCustomCategoryModal, EditBuiltinLabelModal } from './elements/CategoryModals';
import { MergeRowsModal } from './elements/MergeRowsModal';
import { LinkManagerModal } from './elements/LinkManagerModal';
import { ElementViewModal } from './elements/ElementViewModal';
import { MT_INPUT, MT_HEADER, MT_CELL_SMALL, MT_ADD, useManagerTableSizes } from '../lib/managerTable';
import Button from './Button';
import SidebarNav, { SidebarNavRow } from './SidebarNav';

type LocalRow = {
  key: string;
  id: string;
  name: string;
  /** Board ID as displayed/edited — cast's `id`, every other category's
   *  `boardId` label (roadmap 257). */
  boardId: string;
  occ: number;
} & Record<CastDetailKey, string>;

interface MergeInfo {
  sourceNames: string[];
  targetName: string;
  sceneNumbers: string[];
}

interface CategoryDiff {
  renames: { oldName: string; newName: string }[];
  removes: { id: string; name: string; toTrash: boolean }[];
  adds: { key: string; id: string; name: string; boardId: string }[];
  /** Board ID edits on surviving rows (kept separate from name merges). */
  boardIds: { id: string; name: string; boardId: string }[];
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
      key: elementKey(e), id: e.id, name: e.name, boardId: boardIdOf(e, cat),
      occ: counts.get((cat === 'cast' ? e.id : e.name).toLowerCase()) || 0,
      ...castDetailsOf(cat === 'cast' ? (e as unknown as CastDetails) : null),
    }));
    if (cat === 'cast') {
      rows.sort((a, b) => compareBoardIds(a.boardId, b.boardId) || a.id.localeCompare(b.id));
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
  const [viewTarget, setViewTarget] = useState<{ key: string } | null>(null);

  const [sortMode, setSortMode] = useState<'id' | 'name' | 'occurrences'>(isCast ? 'id' : 'name');
  /** Cast performer/booking columns are hidden by default (roadmap 157). */
  const [castDetailsOpen, setCastDetailsOpen] = useCastDetailsOpen();

  useEffect(() => {
    setSortMode(isCast ? 'id' : 'name');
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  // The commit flow is manager-specific (diff + merge confirmation); the hook
  // calls it on every finished field edit (blur / Enter / Tab).
  const commitRef = useRef<(cat: string, current: LocalRow[]) => CommitResult>(() => ({ status: 'none' }));

  const buf = useRowBuffer<LocalRow>({
    projectId: project.id,
    scope: category,
    loadRows,
    makeBlankRow: () => ({ key: String(Date.now()), id: '', name: '', boardId: '', occ: 0, ...castDetailsOf(null) }),
    fieldsPerRow: c => (c === 'cast' ? ['id', 'name', ...CAST_DETAIL_FIELDS.map(f => f.key)] : ['boardId', 'name']),
    reloadDeps: [project.breakdownElements, project.scenes, project.castMembers],
    commit: (cat, current) => commitRef.current(cat, current),
    hasPendingConfirmation: () => pendingDiffRef.current !== null,
    hasContent: r => !!(r.name.trim() || r.id.trim()),
  });
  const { rows } = buf;

  /** Board ID shown/edited in the first column: cast's id, else `boardId`. */
  const boardIdValue = (r: LocalRow) => (isCast ? r.id : r.boardId);
  const boardIdField = (): 'id' | 'boardId' => (isCast ? 'id' : 'boardId');

  // Roadmap 257: duplicate numbers are rejected on commit (the edit does not
  // land; the cell reverts and flashes). Numbers stay unique per category.
  const [rejectedKey, setRejectedKey] = useState<string | null>(null);
  const rejectTimer = useRef<number | null>(null);
  const flashReject = useCallback((key: string) => {
    setRejectedKey(key);
    if (rejectTimer.current != null) window.clearTimeout(rejectTimer.current);
    rejectTimer.current = window.setTimeout(() => setRejectedKey(null), 800);
  }, []);
  useEffect(() => () => {
    if (rejectTimer.current != null) window.clearTimeout(rejectTimer.current);
  }, []);

  /** Blur guard for the Board ID cell — false = rejected (cell already reverted). */
  const guardBoardId = (row: LocalRow): boolean => {
    const value = boardIdValue(row).trim();
    if (!value) return true;
    const elems = loadCategoryElements(project, category);
    if (!isDuplicateBoardId(elems, category, value, row.key)) return true;
    const storedEl = elems.find(e => elementKey(e) === row.key);
    flashReject(row.key);
    buf.updateRow(row.key, boardIdField(), storedEl ? boardIdOf(storedEl, category) : '');
    return false;
  };


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

  const sortByIdFn = () => buf.sortRows((a, b) => compareBoardIds(boardIdValue(a), boardIdValue(b)));
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
  function computeCategoryDiff(cat: string, snap: LocalRow[], current: LocalRow[]): CategoryDiff {
    const snapByKey = new Map<string, LocalRow>(snap.map(r => [r.key, r]));
    const snapByName = new Map<string, LocalRow>(snap.map(r => [r.name.trim().toLowerCase(), r]));

    const renames: { oldName: string; newName: string }[] = [];
    const removes: { id: string; name: string; toTrash: boolean }[] = [];
    const adds: { key: string; id: string; name: string; boardId: string }[] = [];
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
      // Only a collision THIS commit caused (or joined) asks to merge: a name
      // must have changed, or a new row must have joined the name. A plain
      // Board-ID edit or Auto-ID never hijacks a pre-existing case-variant
      // pair (car / CAR) into a merge dialog (roadmap 250/257).
      const nameChanged = group.some(r => {
        const s = snapByKey.get(r.key);
        if (!s) return true;
        // Exact comparison: a case-only rename (FISHING BOAT → fishing boat)
        // still needs the merge confirmation.
        return s.name.trim() !== (r.name || r.id).trim();
      });
      if (!nameChanged) continue;
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
    const boardIds: { id: string; name: string; boardId: string }[] = [];
    for (const r of current) {
      if (handled.has(r.key)) continue;
      const s = snapByKey.get(r.key);
      const name = (r.name || r.id).trim().toLowerCase();
      if (s) {
        if (!name) {
          removes.push({ id: s.id, name: s.name, toTrash: true });
          continue;
        }
        // Board IDs are labels independent of the name merge below; keep the
        // edit on the stable element id. `name` rides along so the update can
        // materialize a scene-derived (never-stored) element.
        if ((r.boardId || '') !== (s.boardId || '')) {
          boardIds.push({ id: s.id, name: r.name || s.name, boardId: r.boardId });
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
        else if (r.name.trim()) adds.push({ key: r.key, id: r.name.trim(), name: r.name.trim(), boardId: r.boardId });
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

    return { renames, removes, adds, boardIds, merges };
  }

  /** Dispatch one finished edit set (renames/removes/adds + Board ID edits) as ONE batch. */
  function applyDiff(cat: string, d: CategoryDiff): CommitResult {
    const hasMerge = d.renames.length > 0 || d.removes.length > 0 || d.adds.length > 0;
    if (!hasMerge && d.boardIds.length === 0) return { status: 'none' };
    dispatch({ type: 'BATCH_START' });
    // Board-ID edits go FIRST by stable element id: a merge below can remove a
    // source row, and that row's number must die with it.
    for (const u of d.boardIds) {
      dispatch({ type: 'UPDATE_ELEMENT', payload: { category: cat, id: u.id, updates: { name: u.name, boardId: u.boardId } } });
    }
    if (hasMerge) {
      dispatch({
        type: 'MERGE_ELEMENTS',
        payload: { category: cat, renames: d.renames, removes: d.removes, adds: d.adds.map(a => ({ id: a.id, name: a.name, boardId: a.boardId })) },
      });
    }
    dispatch({ type: 'BATCH_COMMIT' });
    return { status: 'committed' };
  }

  /** One finished field edit: diff against store truth; a same-name collision
   *  hands over to the merge confirmation. */
  const commitCategory = useCallback((cat: string, current: LocalRow[]): CommitResult => {
    const snap = loadRows(cat);
    if (cat === 'cast') return commitCast(snap, current);
    const d = computeCategoryDiff(cat, snap, current);
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
    /** Cast details as a payload patch — all keys, blanks included, so clearing
     *  a field persists (the reducer merges). */
    const castPayload = (row: LocalRow) => ({ id: row.id, name: row.name, ...castDetailsOf(row) });
    const detailPatch = (row: LocalRow) => {
      const out: Record<string, string> = {};
      for (const f of CAST_DETAIL_FIELDS) {
        const v = (row[f.key] || '').trim();
        if (v) out[f.key] = v;
      }
      return out;
    };
    const detailsChanged = (a: LocalRow, b: LocalRow) =>
      CAST_DETAIL_FIELDS.some(f => (a[f.key] || '') !== (b[f.key] || ''));
    const hasDetails = (row: LocalRow) => CAST_DETAIL_FIELDS.some(f => !!(row[f.key] || '').trim());
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
          if (hasDetails(row)) {
            const resolvedId = row.id.trim() || match.id;
            run(() => dispatch({ type: 'UPDATE_CAST_MEMBER', payload: castPayload({ ...row, id: resolvedId }) }));
          }
          snapMap.delete(match.key);
        } else if (row.name.trim() || row.id.trim()) {
          const id = row.id.trim() || allocateId();
          run(() => dispatch({ type: 'ADD_ELEMENT', payload: { category: 'cast', element: { id, name: row.name, ...detailPatch(row) } } }));
        }
      } else {
        if (orig.id !== row.id || orig.name !== row.name) {
          run(() => dispatch({ type: 'UPDATE_ELEMENT', payload: { category: 'cast', id: orig.id, updates: { id: row.id, name: row.name } } }));
        }
        if (detailsChanged(orig, row)) {
          run(() => dispatch({ type: 'UPDATE_CAST_MEMBER', payload: castPayload(row) }));
        }
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

  interface RenderInputOpts {
    numeric?: boolean;
    upper?: boolean;
    centered?: boolean;
    wrap?: boolean;
    /** Mark the input as the row's Board ID cell (stable e2e hook). */
    boardId?: boolean;
    /** Cast detail key (roadmap 157) — stable e2e hook. */
    detail?: string;
    /** Return false to reject the edit on blur (the caller has already reverted). */
    guardBlur?: () => boolean;
  }

  const renderInput = (key: string, field: string, val: string, onChange: (v: string) => void, opts: RenderInputOpts = {}) => {
    const { numeric, upper, centered, wrap } = opts;
    const handleKey = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
      // Tab moves to the next field/cell (committing this one on the blur);
      // with nowhere to go it falls through to the browser's Tab — focus
      // leaves the table and the field still commits.
      if (e.key === 'Tab' && buf.focusNext(key, field)) e.preventDefault();
    };
    const commitBlur = () => {
      if (opts.guardBlur && !opts.guardBlur()) return;
      buf.commitEdit();
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
          onBlur={commitBlur}
          style={sizes.input}
          className={`${MT_INPUT} [field-sizing:content] resize-none overflow-hidden leading-snug align-middle ${centered ? 'text-center' : ''}`}
        />
      );
    }
    return (
      <input
        ref={el => buf.registerInput(key, field, el)}
        type="text"
        data-manager-board-id={opts.boardId ? key : undefined}
        data-manager-cast-detail={opts.detail}
        value={val}
        readOnly={locked}
        onChange={e => onChange(transform(e.target.value))}
        onKeyDown={handleKey}
        onFocus={() => buf.noteFocus(key, field)}
        onBlur={commitBlur}
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
  const [pendingSearchJump, setPendingSearchJump] = useState<{ categoryKey: string; rowKeys: string[] } | null>(null);
  const [flashKeys, setFlashKeys] = useState<ReadonlySet<string>>(new Set());

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

  const categoryLabelOf = useCallback((key: string, isCustom: boolean) => (
    isCustom
      ? project.customCategories.find(c => c.key === key)?.label || key
      : getLabel(key, ELEMENT_CATEGORIES.find(c => c.key === key)?.label || key, project.categoryLabels)
  ), [project.customCategories, project.categoryLabels]);

  /** Roadmap 172 — every element in every category, with its searchable fields. */
  const searchRecords = useMemo<ManagerSearchRecord[]>(() => {
    const out: ManagerSearchRecord[] = [];
    const castById = new Map((project.castMembers || []).map(m => [m.id, m]));
    for (const { key, isCustom } of allCategoryKeys) {
      const categoryLabel = categoryLabelOf(key, isCustom);
      for (const r of loadRows(key)) {
        // `loadCategoryElements` trims cast to id/name — read the performer
        // details from the cast member itself.
        const details = key === 'cast' ? (castById.get(r.id) as any) : null;
        const fields = [
          { key: 'boardId', label: 'Board ID', value: r.boardId || '' },
          { key: 'name', label: 'Name', value: r.name || '' },
          ...(key === 'cast'
            ? CAST_DETAIL_FIELDS.map(f => ({ key: f.key, label: f.label, value: String(details?.[f.key] || r[f.key] || '') }))
            : []),
        ];
        out.push({
          categoryKey: key,
          categoryLabel,
          rowKey: r.key,
          label: r.name || r.id || r.key,
          fields,
        });
      }
    }
    return out;
  }, [allCategoryKeys, categoryLabelOf, project]);

  const deepSearch = useCallback((query: string) => searchManagerRecords(searchRecords, query), [searchRecords]);

  const jumpToSearchHit = useCallback((hit: ManagerSearchHit, query: string) => {
    const rowKeys = searchManagerRecords(searchRecords, query)
      .filter(h => h.categoryKey === hit.categoryKey)
      .map(h => h.rowKey);
    setPendingSearchJump({ categoryKey: hit.categoryKey, rowKeys });
    switchCategory(hit.categoryKey);
  }, [searchRecords, switchCategory]);

  // Scroll only the first match into view; flash every matching row.
  useEffect(() => {
    if (!pendingSearchJump || category !== pendingSearchJump.categoryKey) return;
    const container = scrollRef.current;
    if (!container) return;
    const trs = Array.from(container.querySelectorAll<HTMLElement>('[data-manager-row]'));
    const els = pendingSearchJump.rowKeys
      .map(key => trs.find(el => el.dataset.managerRow === key))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;
    els[0].scrollIntoView({ block: 'center' });
    setFlashKeys(new Set(pendingSearchJump.rowKeys));
    setPendingSearchJump(null);
  }, [pendingSearchJump, category, rows]);

  useEffect(() => {
    if (flashKeys.size === 0) return;
    const t = setTimeout(() => setFlashKeys(new Set()), 1400);
    return () => clearTimeout(t);
  }, [flashKeys]);

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
        <DropdownItem onClick={() => applySort('id')} icon={sortMode === 'id' ? <Check className="w-3.5 h-3.5" /> : undefined}>
          By Board ID
        </DropdownItem>
        <DropdownItem onClick={() => applySort('name')} icon={sortMode === 'name' ? <Check className="w-3.5 h-3.5" /> : undefined}>
          By Name
        </DropdownItem>
        <DropdownItem onClick={() => applySort('occurrences')} icon={sortMode === 'occurrences' ? <Check className="w-3.5 h-3.5" /> : undefined}>
          By Occurrences
        </DropdownItem>
      </DropdownMenu>
      {isCast && (
        <Button
          onClick={() => setCastDetailsOpen(!castDetailsOpen)}
          title="Show performer and booking details for every cast member"
          data-presence-anchor="toolbar:elements:cast-details"
        >
          {castDetailsOpen ? 'Hide details' : 'Details'}
        </Button>
      )}
      <Button
        onClick={async () => {
          const ok = await dialog.confirm({
            title: `Auto-ID ${getLabel(category, 'elements', project.categoryLabels)}?`,
            message: 'Auto-ID assigns sequential Board IDs (continuing after the highest existing one) to elements with an empty Board ID. Locked Board IDs are never changed.',
            suppressKey: 'lemon_schedule_dnwa_auto_id',
          });
          if (!ok) return;
          buf.applyRows(prev => {
            const used = prev.map(r => (isCast ? r.id : r.boardId)).filter(Boolean);
            return prev.map(r => {
              const value = isCast ? r.id : r.boardId;
              if (value.trim() || lockedIds.has(r.key)) return r;
              const id = nextBoardId(used);
              used.push(id);
              return { ...r, [isCast ? 'id' : 'boardId']: id };
            });
          });
        }}
        disabled={locked}
      >
        Auto-ID
      </Button>
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
          label: categoryLabelOf(key, isCustom),
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
        deepSearch={deepSearch}
        onSearchSelect={jumpToSearchHit}
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
                    <th style={sizes.header} className={`sticky top-0 left-0 z-30 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-left w-24 min-w-24 ${tableScrolled ? 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.12)]' : ''}`}>Board ID</th>
                    <th style={sizes.header} className={`sticky top-0 left-24 z-30 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-left min-w-[140px] max-w-52 ${tableScrolled ? 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.12)]' : ''}`}>Name</th>
                    {isCast && castDetailsOpen && CAST_DETAIL_FIELDS.map(f => (
                      <th key={f.key} style={{ ...sizes.header, minWidth: f.width, width: f.width }} className={`sticky top-0 z-10 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-left`}>{f.label}</th>
                    ))}
                    <th style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-center min-w-14`}>Occ</th>
                    <th style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-left min-w-24`}>Start Date</th>
                    <th style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-left min-w-24`}>Finish Date</th>
                    <th style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-center min-w-14`}>Total Days</th>
                    {dayTypes.map(t => (
                      <th key={t.key} title={t.label} style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-center min-w-14`}>{t.label}</th>
                    ))}
                    <th style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-center w-12`} title="Element view — properties, crew links and events">View</th>
                    <th style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 ${MT_HEADER} text-center w-12`} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => {
                      const stats = dayStats.get(r.key);
                      return (
                    <tr
                      key={r.key}
                      data-presence-anchor={`elements:${r.key}`}
                      data-manager-row={r.key}
                      style={flashKeys.has(r.key) ? { backgroundColor: '#fee2e2' } : undefined}
                      className={`group transition-colors ${ri % 2 === 0 ? 'bg-white' : 'bg-zinc-50/30'} hover:bg-zinc-100`}
                    >
                      <td style={sizes.cellSmall} className={`sticky left-0 z-10 ${MT_CELL_SMALL} ${rejectedKey === r.key ? 'bg-red-100' : ri % 2 === 0 ? 'bg-white' : 'bg-zinc-50'} group-hover:bg-zinc-100 ${tableScrolled ? 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.12)]' : ''}`}>
                        <div className="flex items-center gap-1">
                          <div className="flex-1 min-w-0">
                            {renderInput(r.key, boardIdField(), boardIdValue(r), v => buf.updateRow(r.key, boardIdField(), v), {
                              numeric: true,
                              centered: true,
                              boardId: true,
                              guardBlur: () => guardBoardId(r),
                            })}
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
                      <td style={sizes.cellSmall} className={`sticky left-24 z-10 ${MT_CELL_SMALL} ${ri % 2 === 0 ? 'bg-white' : 'bg-zinc-50'} group-hover:bg-zinc-100 ${tableScrolled ? 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.12)]' : ''}`}>{renderInput(r.key, 'name', r.name, v => buf.updateRow(r.key, 'name', v), { upper: isCast || isSet, wrap: true })}</td>
                      {isCast && castDetailsOpen && CAST_DETAIL_FIELDS.map(f => (
                        <td key={f.key} style={{ ...sizes.cellSmall, minWidth: f.width }} className={`${MT_CELL_SMALL} ${ri % 2 === 0 ? 'bg-white' : 'bg-zinc-50'} group-hover:bg-zinc-100`}>
                          {renderInput(r.key, f.key, r[f.key], v => buf.updateRow(r.key, f.key, v), { detail: f.key })}
                        </td>
                      ))}
                      <td style={sizes.cellSmall} className={`${MT_CELL_SMALL} text-center text-zinc-400 font-medium`}>{r.occ}</td>
                      <td style={sizes.cellSmall} className={`${MT_CELL_SMALL} text-zinc-400`}>{stats?.startDate ? formatDateShort(stats.startDate) : ''}</td>
                      <td style={sizes.cellSmall} className={`${MT_CELL_SMALL} text-zinc-400`}>{stats?.finishDate ? formatDateShort(stats.finishDate) : ''}</td>
                      <td style={sizes.cellSmall} className={`${MT_CELL_SMALL} text-center text-zinc-400 font-medium`}>{stats?.totalDays ?? 0}</td>
                      {dayTypes.map(t => (
                        <td key={t.key} title={t.label} style={sizes.cellSmall} className={`${MT_CELL_SMALL} text-center text-zinc-400 font-medium`}>{t.key === 'work' ? (stats?.workDays ?? 0) : (stats?.statusCounts[t.key] ?? 0)}</td>
                      ))}
                      <td style={sizes.cellSmall} className={`${MT_CELL_SMALL} text-center whitespace-nowrap`}>
                        <button
                          onClick={() => setViewTarget({ key: r.key })}
                          title={`Element view — properties, crew links and events for ${r.name || r.id}`}
                          className="p-1.5 rounded-md hover:bg-blue-50 transition-colors opacity-40 hover:opacity-100 align-middle"
                        >
                          <PanelRight style={{ width: sizes.icon, height: sizes.icon }} className="text-blue-500" />
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
        {viewTarget && (
          <ElementViewModal
            category={category}
            rowKey={viewTarget.key}
            onClose={() => setViewTarget(null)}
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
