import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useProject, useIsCloudProject } from '../store';
import { useDialog } from '../components/Dialog';
import { generateUUID } from './utils';
import { Plus, Trash2, UserPlus, Pencil, Save, Undo2, Check } from 'lucide-react';
import SidebarNav, { SidebarNavRow } from '../components/SidebarNav';
import { useRowBuffer } from './rowBuffer';
import { useScrolledLeft } from './useScrolledLeft';
import { LabelModal } from '../components/elements/CategoryModals';
import { MergeRowsModal } from '../components/elements/MergeRowsModal';
import DropdownMenu from '../components/DropdownMenu';
import DropdownItem from '../components/DropdownItem';
import Button from '../components/Button';
import { setPendingTab } from './unsavedGuard';
import { MT_INPUT, MT_HEADER, MT_CELL, MT_ADD, useManagerTableSizes } from './managerTable';
import type { CrewRole, Project } from '../types';

// ---- Generic buffered database manager --------------------------------------
//
// One manager engine (sidebar of categories + buffered table + merge-on-save
// + sort + undo) shared by every database (crew, locations, future DBs).
// Database-specific behavior lives in a config; this shell owns the buffer,
// the save/merge pipeline and the chrome.

export interface ManagerRow extends Record<string, string> {
  key: string;
  id: string;
}

export interface ManagerFieldDef {
  key: string;
  label: string;
  width?: string;
  /** Omit for a plain text input; supply for richer editors (e.g. the address LocationPickerModal). */
  render?: (row: ManagerRow, update: (field: string, val: string) => void, readOnly: boolean, ctx: { project: Project }) => React.ReactNode;
}

export interface ManagerSavePlan {
  updates: { id: string; updates: Record<string, string> }[];
  adds: ManagerRow[];
  removes: string[];
  merges: { sourceNames: string[]; targetName: string }[];
  /** Buffered row keys absorbed by merges (new rows with no store id). */
  dropKeys: string[];
}

export interface ManagerSortMode {
  key: string;
  label: string;
  comparator: (a: ManagerRow, b: ManagerRow) => number;
}

export interface ManagerShellConfig {
  title: string;
  nounSingular: string;
  nounPlural: string;
  addNoun: string;
  categorySingular: string;
  categoryPlural: string;
  sidebarTitle: string;
  addScopeLabel: string;
  renameScopeLabel: string;
  mergeTitle: string;
  mergeIntro: string;
  mergeSummary: string;
  /** First field is the merge identity (name). */
  fields: ManagerFieldDef[];
  mergeableFields: string[];
  /** Same-name rows merge on save (crew). Set false when identical names are
   *  legitimately distinct records (locations) — no merge dialog, no absorb. */
  canMerge?: boolean;
  categories(project: Project): CrewRole[];
  /** Optional section header per category (e.g. crew departments). */
  categoryGroup?(category: CrewRole): string | undefined;
  /** Optional section (department) picker for the add-category modal. */
  categoryGroupOptions?: string[];
  addCategory(dispatch: (action: any) => void, label: string, categories: CrewRole[], group?: string): string | null;
  renameCategory(dispatch: (action: any) => void, key: string, label: string): void;
  deleteCategoryConfirm(category: CrewRole, itemCount: number): { title: string; message: string; suppressKey: string };
  deleteCategory(dispatch: (action: any) => void, key: string): void;
  loadRows(project: Project, categoryKey: string): ManagerRow[];
  makeBlankRow(): ManagerRow;
  commitPlan(dispatch: (action: any) => void, plan: ManagerSavePlan, categoryKey: string, project: Project): void;
  sortModes: ManagerSortMode[];
}

const cellInputCls = MT_INPUT;

/** Name-keyed buffered diff (mirrors the crew manager's merge semantics):
 *  rows ending on the same name merge into one record; mergeable fields prefer
 *  non-empty values; blanked/removed rows delete to the database trash.
 *  `canMerge` (default true) switches the merge machinery off entirely — e.g.
 *  locations: same-named rows are distinct records and always save as-is. */
export function computeManagerDiff(snap: ManagerRow[], current: ManagerRow[], identityField: string, mergeableFields: string[], canMerge = true): ManagerSavePlan {
  const snapByKey = new Map<string, ManagerRow>(snap.map(r => [r.key, r]));
  const snapByIdentity = canMerge
    ? new Map<string, ManagerRow>(snap.map(r => [r[identityField].trim().toLowerCase(), r]))
    : null;

  const updates: ManagerSavePlan['updates'] = [];
  const adds: ManagerRow[] = [];
  const removes: string[] = [];
  const merges: ManagerSavePlan['merges'] = [];
  const dropKeys: string[] = [];
  const handled = new Set<string>();

  if (canMerge) {
  const groups = new Map<string, ManagerRow[]>();
  for (const r of current) {
    const name = r[identityField].trim().toLowerCase();
    if (!name) continue;
    const g = groups.get(name);
    if (g) g.push(r);
    else groups.set(name, [r]);
  }

  for (const [name, group] of groups) {
    if (group.length <= 1) continue;
    const target = group.find(r => snapByKey.get(r.key)?.name.trim().toLowerCase() === name)
      || group.find(r => snapByKey.has(r.key))
      || group[0];
    const merged: Record<string, string> = {};
    for (const f of mergeableFields) merged[f] = target[f] || '';
    const sourceNames: string[] = [];
    for (const r of group) {
      if (r.key === target.key) continue;
      const s = snapByKey.get(r.key);
      if (s) {
        removes.push(s.id);
        sourceNames.push(s[identityField]);
      } else {
        sourceNames.push(r[identityField]);
        dropKeys.push(r.key);
      }
      for (const f of mergeableFields) if (!merged[f] && r[f]) merged[f] = r[f];
      handled.add(r.key);
    }
    handled.add(target.key);
    const tSnap = snapByKey.get(target.key);
    if (tSnap) {
      const u: Record<string, string> = {};
      if (tSnap[identityField] !== target[identityField].trim()) u[identityField] = target[identityField].trim();
      for (const f of mergeableFields) if ((tSnap[f] || '') !== (merged[f] || '')) u[f] = merged[f] || '';
      if (Object.keys(u).length > 0) updates.push({ id: tSnap.id, updates: u });
    } else {
      adds.push({ ...target, [identityField]: target[identityField].trim(), ...merged });
    }
    merges.push({ sourceNames, targetName: target[identityField].trim() });
  }
  }

  for (const r of current) {
    if (handled.has(r.key)) continue;
    const s = snapByKey.get(r.key);
    const name = r[identityField].trim().toLowerCase();
    if (s) {
      if (!name) {
        removes.push(s.id);
        continue;
      }
      const u: Record<string, string> = {};
      if (s[identityField] !== r[identityField].trim()) u[identityField] = r[identityField].trim();
      for (const f of mergeableFields) if ((s[f] || '') !== (r[f] || '')) u[f] = r[f] || '';
      if (Object.keys(u).length > 0) updates.push({ id: s.id, updates: u });
    } else if (name) {
      if (!canMerge || !snapByIdentity) {
        adds.push({ ...r, [identityField]: r[identityField].trim() });
        continue;
      }
      const match = snapByIdentity.get(name);
      if (match) {
        // New row duplicates an existing record's name → absorb its details.
        const u: Record<string, string> = {};
        for (const f of mergeableFields) if (!(match[f] || '') && r[f]) u[f] = r[f];
        if (Object.keys(u).length > 0) updates.push({ id: match.id, updates: u });
        merges.push({ sourceNames: [r[identityField].trim()], targetName: match[identityField] });
        dropKeys.push(r.key);
      } else {
        adds.push({ ...r, [identityField]: r[identityField].trim() });
      }
    }
  }

  for (const s of snap) {
    if (!current.some(r => r.key === s.key)) removes.push(s.id);
  }

  return { updates, adds, removes, merges, dropKeys };
}

export const DatabaseManagerView: React.FC<{
  config: ManagerShellConfig;
  headerTarget?: HTMLElement | null;
  initialCategory?: string | null;
  onCategoryChange?: (key: string) => void;
}> = ({ config, headerTarget, initialCategory, onCategoryChange }) => {
  const { state, dispatch, readOnly } = useProject();
  const isCloud = useIsCloudProject();
  const dialog = useDialog();
  const project = state.present;
  const sizes = useManagerTableSizes();

  const categories = config.categories(project);

  const [categoryKey, setCategoryKey] = useState(() => {
    if (initialCategory && categories.some(c => c.key === initialCategory)) return initialCategory;
    return categories[0]?.key || '';
  });
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryGroup, setNewCategoryGroup] = useState('Other');
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortMode, setSortMode] = useState(config.sortModes[0]?.key || '');

  const categoryLabel = (key: string) => categories.find(c => c.key === key)?.label || key;

  const [mergeDialog, setMergeDialog] = useState<{ labels: { label: string; merges: ManagerSavePlan['merges'] }[] } | null>(null);
  const pendingDiffsRef = React.useRef<Record<string, ManagerSavePlan> | null>(null);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const tableScrolled = useScrolledLeft(scrollRef);

  const doSaveRef = React.useRef<() => void>(() => {});

  const buf = useRowBuffer<ManagerRow>({
    projectId: project.id,
    scope: categoryKey,
    loadRows: (scope: string) => config.loadRows(project, scope),
    makeBlankRow: () => config.makeBlankRow(),
    fieldsPerRow: () => config.fields.map(f => f.key),
    reloadDeps: [project],
    onSave: () => doSaveRef.current(),
    hasPendingConfirmation: () => pendingDiffsRef.current !== null,
  });
  const { rows, hasChanges, doSave, doRevert } = buf;

  useEffect(() => {
    if (!categories.some(c => c.key === categoryKey)) {
      const next = categories[0]?.key || '';
      setCategoryKey(next);
      buf.switchScope(next);
      onCategoryChange?.(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, categoryKey]);

  const category = categories.find(c => c.key === categoryKey);

  const switchCategory = (newKey: string) => {
    buf.switchScope(newKey);
    setCategoryKey(newKey);
    onCategoryChange?.(newKey);
  };

  const addCategory = (label: string): string | null => {
    const key = config.addCategory(dispatch, label, categories, newCategoryGroup);
    if (key) onCategoryChange?.(key);
    return key;
  };

  const deleteCategory = async (key: string) => {
    const itemCount = (buf.cachedRows(key) || config.loadRows(project, key)).length;
    const cat = categories.find(c => c.key === key) || { key, label: key };
    const conf = config.deleteCategoryConfirm(cat, itemCount);
    const ok = await dialog.confirm({ ...conf });
    if (ok) {
      config.deleteCategory(dispatch, key);
      if (categoryKey === key) {
        const next = categories.filter(c => c.key !== key)[0];
        const nextKey = next?.key || '';
        setCategoryKey(nextKey);
        buf.switchScope(nextKey);
        onCategoryChange?.(nextKey);
      }
    }
  };

  function commitSaves(diffs: Record<string, ManagerSavePlan>) {
    let willDispatch = false;
    for (const scope of buf.bufferedScopes()) {
      const d = diffs[scope];
      if (d && (d.updates.length > 0 || d.adds.length > 0 || d.removes.length > 0)) willDispatch = true;
    }
    if (willDispatch) {
      dispatch({ type: 'BATCH_START' });
      for (const scope of buf.bufferedScopes()) {
        const d = diffs[scope];
        if (!d) continue;
        config.commitPlan(dispatch, d, scope, project);
      }
      dispatch({ type: 'BATCH_COMMIT' });
    }
    for (const scope of buf.bufferedScopes()) {
      const d = diffs[scope];
      if (d && d.dropKeys.length > 0) buf.commitDroppedRows(scope, d.dropKeys);
    }
    pendingDiffsRef.current = null;
    setMergeDialog(null);
    buf.commitSaved();
  }

  const save = () => {
    const diffs: Record<string, ManagerSavePlan> = {};
    const dialogLabels: { label: string; merges: ManagerSavePlan['merges'] }[] = [];
    const identityField = config.fields[0]?.key || 'name';
    for (const scope of buf.bufferedScopes()) {
      const d = computeManagerDiff(buf.cachedSnapshot(scope) || [], buf.cachedRows(scope) || [], identityField, config.mergeableFields, config.canMerge);
      diffs[scope] = d;
      if (d.merges.length > 0) dialogLabels.push({ label: categoryLabel(scope), merges: d.merges });
    }
    if (dialogLabels.length > 0) {
      pendingDiffsRef.current = diffs;
      setMergeDialog({ labels: dialogLabels });
      return;
    }
    commitSaves(diffs);
  };
  doSaveRef.current = save;

  const sidebarRows: SidebarNavRow[] = useMemo(() =>
    categories.map(c => ({ key: c.key, label: c.label, count: countTotal(c.key), group: config.categoryGroup?.(c) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, project, rows, categoryKey]
  );

  function countTotal(key: string): number {
    const r = buf.cachedRows(key);
    if (r) return r.length;
    return config.loadRows(project, key).length;
  }

  const renderRowActions = (row: SidebarNavRow, active: boolean) => (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setRenamingKey(row.key); setRenameDraft(row.label); }}
        disabled={readOnly}
        title={`Rename ${config.categorySingular}`}
        className={`p-0.5 rounded transition-colors ${active ? 'hover:bg-zinc-700' : 'hover:bg-zinc-300'} disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        <Pencil style={{ width: sizes.iconSm, height: sizes.iconSm }} className="text-zinc-400" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); void deleteCategory(row.key); }}
        disabled={readOnly}
        title={`Delete ${config.categorySingular}`}
        className={`p-0.5 rounded transition-colors ${active ? 'hover:bg-red-900/50' : 'hover:bg-red-100'} disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        <Trash2 style={{ width: sizes.iconSm, height: sizes.iconSm }} className="text-red-400" />
      </button>
    </>
  );

  const renderInput = (key: string, field: string, val: string, onChange: (v: string) => void, placeholder?: string, wrap = false) => {
    const handleKey = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
      if (e.key === 'Tab') {
        e.preventDefault();
        buf.focusNext(key, field);
      }
    };
    // The identity/name field wraps to a second line on long names (auto-sized
    // textarea, same `field-sizing: content` pattern as the day-modal notes).
    if (wrap) {
      return (
        <textarea
          ref={el => buf.registerInput(key, field, el)}
          rows={1}
          data-manager-name=""
          value={val}
          placeholder={placeholder}
          readOnly={readOnly}
          onChange={e => onChange(e.target.value.replace(/\n/g, ' '))}
          onKeyDown={handleKey}
          onFocus={buf.noteFocusStart}
          onBlur={buf.noteFocusEnd}
          style={sizes.input}
          className={`${cellInputCls} [field-sizing:content] resize-none overflow-hidden leading-snug align-middle`}
        />
      );
    }
    return (
      <input
        ref={el => buf.registerInput(key, field, el)}
        type="text"
        value={val}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKey}
        onFocus={buf.noteFocusStart}
        onBlur={buf.noteFocusEnd}
        style={sizes.input}
        className={cellInputCls}
      />
    );
  };

  const applySort = (mode: ManagerSortMode) => {
    setSortMode(mode.key);
    setShowSortMenu(false);
    buf.sortRows(mode.comparator);
  };

  const defaultInput = (field: ManagerFieldDef, r: ManagerRow, update: (f: string, v: string) => void, ro: boolean, wrap = false) =>
    renderInput(r.key, field.key, r[field.key] || '', v => update(field.key, v), field.label, wrap);

  const revertButton = hasChanges ? (
    <Button variant="subtle" onClick={doRevert} disabled={readOnly}>
      <Undo2 className="w-3 h-3" /> Revert
    </Button>
  ) : null;

  const saveButton = (
    <Button variant="primary" cloud={isCloud} onClick={doSave} disabled={readOnly || !hasChanges}>
      <Save className="w-3 h-3" /> {hasChanges ? 'Save' : 'Saved'}
    </Button>
  );

  const addButton = (
    <Button variant="primary" cloud={isCloud} onClick={buf.addNew} disabled={!category || readOnly}>
      <UserPlus className="w-3.5 h-3.5" /> Add {config.addNoun}
    </Button>
  );

  const headerContent = (
    <>
      {revertButton}
      {saveButton}
      <div className="w-px h-4 bg-zinc-300 mx-1.5" />
      <DropdownMenu open={showSortMenu} onOpenChange={setShowSortMenu} width="w-40" theme="light"
        trigger={
          <Button>Sort ▾</Button>
        }
      >
        {config.sortModes.map(mode => (
          <DropdownItem key={mode.key} onClick={() => applySort(mode)} icon={sortMode === mode.key ? <Check className="w-3.5 h-3.5" /> : undefined}>
            {mode.label}
          </DropdownItem>
        ))}
      </DropdownMenu>
      {addButton}
    </>
  );

  const topBar = (
    <div className="flex items-center justify-end px-4 py-2.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm shrink-0">
      <div className="flex items-center gap-1.5">
        {revertButton}
        {saveButton}
        {addButton}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {headerTarget ? createPortal(headerContent, headerTarget) : null}
      <SidebarNav
        title={config.sidebarTitle}
        rows={sidebarRows}
        activeKey={categoryKey}
        onSelect={switchCategory}
        onAdd={() => { setNewCategoryName(''); setNewCategoryGroup('Other'); setShowAddCategory(true); }}
        addLabel={config.addScopeLabel}
        addDisabled={readOnly}
        renderRowActions={renderRowActions}
      />

      <div className="flex-1 flex flex-col h-full bg-zinc-100 overflow-hidden">
        {!headerTarget && topBar}
        <div className={`flex-1 flex flex-col h-full px-4 py-4 gap-3`}>
          <div className="flex-1 overflow-hidden rounded-xl bg-white border border-zinc-200/80 shadow-sm min-h-0">
            <div ref={scrollRef} className="h-full overflow-auto tab-scroll pb-10">
              {category && rows.length === 0 && (
                <div className="text-xs text-zinc-400 py-8 text-center">
                  No {config.nounPlural} in this {config.categorySingular} yet.
                </div>
              )}
              {rows.length > 0 && (
                <table className="w-full manager-table">
                  <thead>
                    <tr className="bg-zinc-50">
                      {config.fields.map((f, fi) => (
                        <th key={f.key} style={sizes.header} className={`sticky top-0 ${fi === 0 ? `left-0 z-30 ${tableScrolled ? 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.12)]' : ''}` : 'z-10'} bg-zinc-50 border-r border-zinc-200 ${MT_HEADER} text-left ${f.width || ''}`}>{f.label}</th>
                      ))}
                      <th style={sizes.header} className={`sticky top-0 z-10 bg-zinc-50 ${MT_HEADER} text-center w-12`} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, ri) => (
                      <tr key={r.key} className={`group transition-colors ${ri % 2 === 0 ? 'bg-white' : 'bg-zinc-50/30'} hover:bg-zinc-100`}>
                        {config.fields.map((f, fi) => (
                          <td key={f.key} style={sizes.cell} className={`${fi === 0 ? `sticky left-0 z-10 ${ri % 2 === 0 ? 'bg-white' : 'bg-zinc-50'} group-hover:bg-zinc-100 ${tableScrolled ? 'shadow-[4px_0_6px_-2px_rgba(0,0,0,0.12)]' : ''}` : ''} ${MT_CELL}`}>
                            {f.render
                              ? f.render(r, (field, val) => buf.updateRow(r.key, field, val), readOnly, { project })
                              : defaultInput(f, r, (field, val) => buf.updateRow(r.key, field, val), readOnly, fi === 0)}
                          </td>
                        ))}
                        <td style={sizes.cell} className={`${MT_CELL} text-center`}>
                          <button title={`Delete ${config.nounSingular}`} onClick={() => buf.deleteRow(r.key)} disabled={readOnly} className="p-1 rounded-md hover:bg-red-50 transition-colors opacity-40 hover:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed">
                            <Trash2 style={{ width: sizes.icon, height: sizes.icon }} className="text-red-400" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <button
                onClick={buf.addNew}
                disabled={!category || readOnly}
                style={sizes.add}
                className={`${MT_ADD}`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{category ? `Add ${category.label}` : `Add ${config.addNoun}`}</span>
              </button>
            </div>
          </div>
        </div>

        {mergeDialog && (
          <MergeRowsModal
            title={config.mergeTitle}
            intro={config.mergeIntro}
            groups={mergeDialog.labels.map(g => ({
              label: g.label,
              merges: g.merges.map(m => ({ sourceNames: m.sourceNames, targetName: m.targetName, summary: config.mergeSummary })),
            }))}
            onCancel={() => { setMergeDialog(null); pendingDiffsRef.current = null; setPendingTab(null); }}
            onConfirm={() => commitSaves(pendingDiffsRef.current || {})}
          />
        )}

        <LabelModal
          title={config.addScopeLabel}
          submitLabel="Create"
          open={showAddCategory}
          onClose={() => setShowAddCategory(false)}
          name={newCategoryName}
          onNameChange={setNewCategoryName}
          group={newCategoryGroup}
          groupOptions={config.categoryGroupOptions}
          onGroupChange={setNewCategoryGroup}
          onSubmit={() => {
            const key = addCategory(newCategoryName);
            setShowAddCategory(false);
            if (key) switchCategory(key);
          }}
        />
        <LabelModal
          title={config.renameScopeLabel}
          open={renamingKey !== null}
          onClose={() => setRenamingKey(null)}
          name={renameDraft}
          onNameChange={setRenameDraft}
          onSubmit={() => {
            if (renamingKey && renameDraft.trim()) {
              config.renameCategory(dispatch, renamingKey, renameDraft.trim());
            }
            setRenamingKey(null);
          }}
        />
      </div>
    </div>
  );
};

export { cellInputCls };
