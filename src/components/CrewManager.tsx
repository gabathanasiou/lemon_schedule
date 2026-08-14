import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useProject, useIsCloudProject } from '../store';
import { useDialog } from './Dialog';
import { CrewPerson } from '../types';
import { generateUUID } from '../lib/utils';
import { Plus, Trash2, UserPlus, Pencil, Save, Undo2, Check } from 'lucide-react';
import SidebarNav, { SidebarNavRow } from './SidebarNav';
import { useRowBuffer } from '../lib/rowBuffer';
import { LabelModal } from './elements/CategoryModals';
import { MergeRowsModal } from './elements/MergeRowsModal';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import { setPendingTab } from '../lib/unsavedGuard';

interface CrewRow {
  key: string;
  id: string;
  name: string;
  phone: string;
  email: string;
}

interface CrewMergeInfo {
  sourceNames: string[];
  targetName: string;
}

interface CrewDiff {
  updates: { id: string; updates: Partial<CrewPerson> }[];
  adds: CrewPerson[];
  removes: string[];
  merges: CrewMergeInfo[];
  /** Buffered row keys absorbed by merges (new rows with no store id). */
  dropKeys: string[];
}

const cellInputCls = 'w-full bg-white border border-zinc-200 rounded-md px-2 py-1 text-xs text-zinc-800 outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow';

export function CrewManager({ headerTarget, initialRole, onRoleChange }: { headerTarget?: HTMLElement | null; initialRole?: string | null; onRoleChange?: (role: string) => void }) {
  const { state, dispatch, readOnly } = useProject();
  const isCloud = useIsCloudProject();
  const dialog = useDialog();
  const project = state.present;

  const crewRoles = project.crewRoles || [];
  const crew = project.crew || {};

  const [roleKey, setRoleKey] = useState(() => {
    if (initialRole && crewRoles.some(r => r.key === initialRole)) return initialRole;
    return crewRoles[0]?.key || '';
  });
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortMode, setSortMode] = useState<'name' | 'phone'>('name');

  const roleLabel = (key: string) => crewRoles.find(r => r.key === key)?.label || key;

  function loadRows(role: string): CrewRow[] {
    return (crew[role] || []).map(p => ({
      key: p.id, id: p.id, name: p.name, phone: p.phone || '', email: p.email || '',
    }));
  }

  const [mergeDialog, setMergeDialog] = useState<{ roles: { label: string; merges: CrewMergeInfo[] }[] } | null>(null);
  const pendingDiffsRef = React.useRef<Record<string, CrewDiff> | null>(null);

  const doSaveRef = React.useRef<() => void>(() => {});

  const buf = useRowBuffer<CrewRow>({
    projectId: project.id,
    scope: roleKey,
    loadRows,
    makeBlankRow: () => ({ key: String(Date.now()), id: '', name: '', phone: '', email: '' }),
    fieldsPerRow: () => ['name', 'phone', 'email'],
    reloadDeps: [crew, crewRoles],
    onSave: () => doSaveRef.current(),
    hasPendingConfirmation: () => pendingDiffsRef.current !== null,
  });
  const { rows, hasChanges, doSave, doRevert } = buf;

  useEffect(() => {
    if (!crewRoles.some(r => r.key === roleKey)) {
      const next = crewRoles[0]?.key || '';
      setRoleKey(next);
      buf.switchScope(next);
      onRoleChange?.(next);
    }
  }, [crewRoles, roleKey, buf.switchScope, onRoleChange]);

  const role = crewRoles.find(r => r.key === roleKey);

  const switchRole = (newKey: string) => {
    buf.switchScope(newKey);
    setRoleKey(newKey);
    onRoleChange?.(newKey);
  };

  const addRole = (label: string): string | null => {
    const trimmed = label.trim();
    if (!trimmed) return null;
    const key = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '') || generateUUID().slice(0, 8);
    if (crewRoles.some(r => r.key === key)) return null;
    dispatch({ type: 'ADD_CREW_ROLE', payload: { role: { key, label: trimmed } } });
    return key;
  };

  const deleteRole = async (key: string) => {
    const peopleCount = (crew[key] || []).length;
    const ok = await dialog.confirm({
      title: `Delete "${roleLabel(key)}"?`,
      message: peopleCount > 0
        ? `This role has ${peopleCount} person${peopleCount !== 1 ? 's' : ''}. Removing it also removes them from the crew.`
        : 'This role will be removed from the catalog.',
      danger: true,
      suppressKey: 'lemon_schedule_dnwa_delete_crew_role',
    });
    if (ok) {
      dispatch({ type: 'DELETE_CREW_ROLE', payload: key });
      if (roleKey === key) {
        const next = crewRoles.filter(r => r.key !== key)[0];
        const nextKey = next?.key || '';
        setRoleKey(nextKey);
        buf.switchScope(nextKey);
        onRoleChange?.(nextKey);
      }
    }
  };

  /**
   * Diffs the buffered rows against the loaded snapshot for one role.
   * Merge semantics (per role, name-keyed):
   * - rows that end up with the same name collapse into one person; contact
   *   fields prefer non-empty values (sources fill the target's blanks)
   * - renamed rows just update in place (crew is not referenced elsewhere)
   * - blanked rows and removed rows are deleted to the crew trash
   */
  function computeCrewDiff(role: string): CrewDiff {
    const snap = buf.cachedSnapshot(role) || [];
    const current = buf.cachedRows(role) || [];
    const snapByKey = new Map<string, CrewRow>(snap.map(r => [r.key, r]));
    const snapByName = new Map<string, CrewRow>(snap.map(r => [r.name.trim().toLowerCase(), r]));

    const updates: { id: string; updates: Partial<CrewPerson> }[] = [];
    const adds: CrewPerson[] = [];
    const removes: string[] = [];
    const merges: CrewMergeInfo[] = [];
    const dropKeys: string[] = [];
    const handled = new Set<string>();

    const groups = new Map<string, CrewRow[]>();
    for (const r of current) {
      const name = r.name.trim().toLowerCase();
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
      let phone = target.phone;
      let email = target.email;
      const sourceNames: string[] = [];
      for (const r of group) {
        if (r.key === target.key) continue;
        const s = snapByKey.get(r.key);
        if (s) {
          removes.push(s.id);
          sourceNames.push(s.name);
        } else {
          sourceNames.push(r.name);
          dropKeys.push(r.key);
        }
        if (!phone && r.phone) phone = r.phone;
        if (!email && r.email) email = r.email;
        handled.add(r.key);
      }
      handled.add(target.key);
      const tSnap = snapByKey.get(target.key);
      if (tSnap) {
        const u: Partial<CrewPerson> = {};
        if (tSnap.name !== target.name) u.name = target.name;
        if ((tSnap.phone || '') !== (phone || '')) u.phone = phone;
        if ((tSnap.email || '') !== (email || '')) u.email = email;
        if (Object.keys(u).length > 0) updates.push({ id: tSnap.id, updates: u });
      } else {
        adds.push({ id: generateUUID(), name: target.name.trim(), phone: phone || '', email: email || '' });
      }
      merges.push({ sourceNames, targetName: target.name.trim() });
    }

    for (const r of current) {
      if (handled.has(r.key)) continue;
      const s = snapByKey.get(r.key);
      const name = r.name.trim().toLowerCase();
      if (s) {
        if (!name) {
          removes.push(s.id);
          continue;
        }
        const u: Partial<CrewPerson> = {};
        if (s.name !== r.name.trim()) u.name = r.name.trim();
        if ((s.phone || '') !== (r.phone || '')) u.phone = r.phone;
        if ((s.email || '') !== (r.email || '')) u.email = r.email;
        if (Object.keys(u).length > 0) updates.push({ id: s.id, updates: u });
      } else if (name) {
        const match = snapByName.get(name);
        if (match) {
          // New row duplicates an existing person's name → absorb its contacts.
          const u: Partial<CrewPerson> = {};
          if (!(match.phone || '') && r.phone) u.phone = r.phone;
          if (!(match.email || '') && r.email) u.email = r.email;
          if (Object.keys(u).length > 0) updates.push({ id: match.id, updates: u });
          merges.push({ sourceNames: [r.name.trim()], targetName: match.name });
          dropKeys.push(r.key);
        } else {
          adds.push({ id: generateUUID(), name: r.name.trim(), phone: r.phone || '', email: r.email || '' });
        }
      }
    }

    for (const s of snap) {
      if (!current.some(r => r.key === s.key)) removes.push(s.id);
    }

    return { updates, adds, removes, merges, dropKeys };
  }

  function commitCrewSaves(diffs: Record<string, CrewDiff>) {
    let willDispatch = false;
    for (const role of buf.bufferedScopes()) {
      const d = diffs[role];
      if (d && (d.updates.length > 0 || d.adds.length > 0 || d.removes.length > 0)) willDispatch = true;
    }
    if (willDispatch) {
      dispatch({ type: 'BATCH_START' });
      for (const role of buf.bufferedScopes()) {
        const d = diffs[role];
        if (!d) continue;
        for (const id of d.removes) dispatch({ type: 'DELETE_CREW_PERSON', payload: { role, id } });
        for (const person of d.adds) dispatch({ type: 'ADD_CREW_PERSON', payload: { role, person } });
        for (const u of d.updates) dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role, id: u.id, updates: u.updates } });
      }
      dispatch({ type: 'BATCH_COMMIT' });
    }
    // Rows absorbed by merges (new rows with no store id) must leave the buffer.
    for (const role of buf.bufferedScopes()) {
      const d = diffs[role];
      if (d && d.dropKeys.length > 0) buf.commitDroppedRows(role, d.dropKeys);
    }
    pendingDiffsRef.current = null;
    setMergeDialog(null);
    buf.commitSaved();
  }

  const save = () => {
    const diffs: Record<string, CrewDiff> = {};
    const dialogRoles: { label: string; merges: CrewMergeInfo[] }[] = [];
    for (const role of buf.bufferedScopes()) {
      const d = computeCrewDiff(role);
      diffs[role] = d;
      if (d.merges.length > 0) {
        dialogRoles.push({ label: roleLabel(role), merges: d.merges });
      }
    }
    if (dialogRoles.length > 0) {
      pendingDiffsRef.current = diffs;
      setMergeDialog({ roles: dialogRoles });
      return;
    }
    commitCrewSaves(diffs);
  };
  doSaveRef.current = save;

  const roleRows: SidebarNavRow[] = useMemo(() =>
    crewRoles.map(r => ({ key: r.key, label: r.label, count: countTotal(r.key) })),
    [crewRoles, crew, rows, roleKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function countTotal(role: string): number {
    const r = buf.cachedRows(role);
    if (r) return r.length;
    return (crew[role] || []).length;
  }

  const renderRowActions = (row: SidebarNavRow, active: boolean) => (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setRenamingKey(row.key); setRenameDraft(row.label); }}
        disabled={readOnly}
        title="Rename role"
        className={`p-0.5 rounded transition-colors ${active ? 'hover:bg-zinc-700' : 'hover:bg-zinc-300'} disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        <Pencil className="w-3 h-3 text-zinc-400" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); void deleteRole(row.key); }}
        disabled={readOnly}
        title="Delete role"
        className={`p-0.5 rounded transition-colors ${active ? 'hover:bg-red-900/50' : 'hover:bg-red-100'} disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        <Trash2 className="w-3 h-3 text-red-400" />
      </button>
    </>
  );

  const renderInput = (key: string, field: string, val: string, onChange: (v: string) => void, placeholder?: string) => {
    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
      if (e.key === 'Tab') {
        e.preventDefault();
        buf.focusNext(key, field);
      }
    };
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
        className={cellInputCls}
      />
    );
  };

  const sortByNameFn = () => buf.sortRows((a, b) => (a.name || a.id).toLowerCase().localeCompare((b.name || b.id).toLowerCase()));
  const sortByPhoneFn = () => buf.sortRows((a, b) => (a.phone || a.name).toLowerCase().localeCompare((b.phone || b.name).toLowerCase()));

  const applySort = (mode: 'name' | 'phone') => {
    setSortMode(mode);
    setShowSortMenu(false);
    if (mode === 'name') sortByNameFn();
    else sortByPhoneFn();
  };

  const headerContent = (
    <>
      <span className="text-xs font-semibold text-zinc-700 mr-2">{role ? role.label : 'Crew'}</span>
      {hasChanges && (
        <button onClick={doRevert} disabled={readOnly} className="bg-white border border-zinc-300 px-2.5 py-1 text-zinc-500 rounded text-[11px] hover:bg-zinc-50 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
          <Undo2 className="w-3 h-3" /> Revert
        </button>
      )}
      <button onClick={doSave} disabled={readOnly} className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 ${hasChanges ? (isCloud ? 'bg-blue-950 text-white hover:bg-blue-900' : 'bg-zinc-900 text-white hover:bg-zinc-800') : 'bg-zinc-100 text-zinc-400'} disabled:opacity-40 disabled:cursor-not-allowed`}>
        <Save className="w-3 h-3" /> {hasChanges ? 'Save' : 'Saved'}
      </button>
      <div className="w-px h-4 bg-zinc-300 mx-1.5" />
      <span className="text-[11px] text-zinc-500 font-medium">
        {rows.length} {rows.length === 1 ? 'member' : 'members'}
      </span>
      <DropdownMenu open={showSortMenu} onClose={() => setShowSortMenu(false)} width="w-40" theme="light"
        trigger={
          <button onClick={() => setShowSortMenu(p => !p)} className="bg-white border border-zinc-300 px-2 py-1 text-zinc-600 rounded text-[11px] font-medium hover:bg-zinc-50 transition-colors">
            Sort ▾
          </button>
        }
      >
        <DropdownItem onClick={() => applySort('name')} icon={sortMode === 'name' ? <Check className="w-3.5 h-3.5" /> : undefined}>
          By Name
        </DropdownItem>
        <DropdownItem onClick={() => applySort('phone')} icon={sortMode === 'phone' ? <Check className="w-3.5 h-3.5" /> : undefined}>
          By Phone
        </DropdownItem>
      </DropdownMenu>
      <button
        onClick={buf.addNew}
        disabled={!role || readOnly}
        className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 ${isCloud ? 'bg-blue-950 text-white hover:bg-blue-900' : 'bg-zinc-900 text-white hover:bg-zinc-800'} disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <UserPlus className="w-3.5 h-3.5" /> Add Member
      </button>
    </>
  );

  const topBar = (
    <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white border border-zinc-200/80 shadow-sm shrink-0">
      <span className="text-xs font-semibold text-zinc-800">{role ? role.label : 'Crew'}</span>
      <div className="flex items-center gap-1.5">
        {hasChanges && (
          <button onClick={doRevert} disabled={readOnly} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-zinc-500 hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Undo2 className="w-3 h-3" /> Revert
          </button>
        )}
        <button onClick={doSave} disabled={readOnly} className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold transition-all shadow-sm ${hasChanges ? 'bg-zinc-900 text-white hover:bg-zinc-800' : 'bg-zinc-100 text-zinc-400'}`}>
          <Save className="w-3 h-3" /> {hasChanges ? 'Save Changes' : 'Saved'}
        </button>
        <button
          onClick={buf.addNew}
          disabled={!role || readOnly}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <UserPlus className="w-3.5 h-3.5" /> Add Member
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {headerTarget ? createPortal(headerContent, headerTarget) : null}
      <SidebarNav
        title="Roles"
        rows={roleRows}
        activeKey={roleKey}
        onSelect={switchRole}
        onAdd={() => { setNewRoleName(''); setShowAddRole(true); }}
        addLabel="Add Role"
        addDisabled={readOnly}
        renderRowActions={renderRowActions}
      />

      <div className="flex-1 flex flex-col h-full bg-zinc-100 overflow-hidden">
        {!headerTarget && topBar}
        <div className="flex flex-col h-full px-4 py-4 gap-3">
          <div className="flex-1 overflow-hidden rounded-xl bg-white border border-zinc-200/80 shadow-sm min-h-0">
            <div className="h-full overflow-auto tab-scroll pb-10">
              {role && rows.length === 0 && (
                <div className="text-xs text-zinc-400 py-8 text-center border-b border-zinc-100">
                  No members in this role yet.
                </div>
              )}
              {rows.length > 0 && (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200">
                      <th className="sticky top-0 z-10 bg-zinc-50 px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-44">Name</th>
                      <th className="sticky top-0 z-10 bg-zinc-50 px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-36">Phone</th>
                      <th className="sticky top-0 z-10 bg-zinc-50 px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Email</th>
                      <th className="sticky top-0 z-10 bg-zinc-50 px-3 py-2 text-center w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, ri) => (
                      <tr key={r.key} className={`border-b border-zinc-100 transition-colors ${ri % 2 === 0 ? 'bg-white' : 'bg-zinc-50/30'} hover:bg-blue-50/20`}>
                        <td className="px-3 py-1">{renderInput(r.key, 'name', r.name, v => buf.updateRow(r.key, 'name', v), 'Name')}</td>
                        <td className="px-3 py-1">{renderInput(r.key, 'phone', r.phone, v => buf.updateRow(r.key, 'phone', v), 'Phone')}</td>
                        <td className="px-3 py-1">{renderInput(r.key, 'email', r.email, v => buf.updateRow(r.key, 'email', v), 'Email')}</td>
                        <td className="px-3 py-1 text-center">
                          <button title="Delete member" onClick={() => buf.deleteRow(r.key)} disabled={readOnly} className="p-1 rounded-md hover:bg-red-50 transition-colors opacity-40 hover:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed">
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <button
                onClick={buf.addNew}
                disabled={!role || readOnly}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition-colors w-full disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{role ? `Add ${role.label}` : 'Add Member'}</span>
              </button>
            </div>
          </div>
        </div>

        {mergeDialog && (
          <MergeRowsModal
            title="Merge Members"
            intro="The following crew members now share a name within this role. Saving will merge each set into a single member and combine their contact details."
            groups={mergeDialog.roles.map(r => ({
              label: r.label,
              merges: r.merges.map(m => ({ sourceNames: m.sourceNames, targetName: m.targetName, summary: 'contacts combined' })),
            }))}
            onCancel={() => { setMergeDialog(null); pendingDiffsRef.current = null; setPendingTab(null); }}
            onConfirm={() => commitCrewSaves(pendingDiffsRef.current || {})}
          />
        )}

        <LabelModal
          title="Add Role"
          submitLabel="Create"
          open={showAddRole}
          onClose={() => setShowAddRole(false)}
          name={newRoleName}
          onNameChange={setNewRoleName}
          onSubmit={() => {
            const key = addRole(newRoleName);
            setShowAddRole(false);
            if (key) switchRole(key);
          }}
        />
        <LabelModal
          title="Rename Role"
          open={renamingKey !== null}
          onClose={() => setRenamingKey(null)}
          name={renameDraft}
          onNameChange={setRenameDraft}
          onSubmit={() => {
            if (renamingKey && renameDraft.trim()) {
              dispatch({ type: 'RENAME_CREW_ROLE', payload: { key: renamingKey, label: renameDraft.trim() } });
            }
            setRenamingKey(null);
          }}
        />
      </div>
    </div>
  );
}
