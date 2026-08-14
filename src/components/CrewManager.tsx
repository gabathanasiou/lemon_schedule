import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useProject, useIsCloudProject } from '../store';
import { useDialog } from './Dialog';
import { generateUUID } from '../lib/utils';
import { Plus, Trash2, ArrowUp, ArrowDown, UserPlus, Pencil } from 'lucide-react';
import SidebarNav, { SidebarNavRow } from './SidebarNav';
import { CommitInput } from './CommitInput';
import { LabelModal } from './elements/CategoryModals';

const cellInputCls = 'w-full bg-white border border-zinc-200 rounded-md px-2 py-1 text-xs text-zinc-800 outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow';

interface PendingPerson {
  key: string;
  name: string;
  phone: string;
  email: string;
}

export function CrewManager({ headerTarget }: { headerTarget?: HTMLElement | null }) {
  const { state, dispatch, readOnly } = useProject();
  const isCloud = useIsCloudProject();
  const dialog = useDialog();
  const project = state.present;

  const crewRoles = project.crewRoles || [];
  const crew = project.crew || {};

  const [roleKey, setRoleKey] = useState(crewRoles[0]?.key || '');
  const [pendings, setPendings] = useState<PendingPerson[]>([]);
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    if (!crewRoles.some(r => r.key === roleKey)) setRoleKey(crewRoles[0]?.key || '');
  }, [crewRoles, roleKey]);

  // Pending (uncommitted) rows are discarded when the selected role changes.
  useEffect(() => {
    setPendings([]);
  }, [roleKey]);

  const role = crewRoles.find(r => r.key === roleKey);
  const people = role ? crew[role.key] || [] : [];

  const addPerson = (name: string, phone: string, email: string) => {
    dispatch({ type: 'ADD_CREW_PERSON', payload: { role: role!.key, person: { id: generateUUID(), name, phone, email } } });
  };

  const appendPending = () => {
    if (!role || readOnly) return;
    setPendings(prev => [...prev, { key: `new-${Date.now()}-${prev.length}`, name: '', phone: '', email: '' }]);
  };

  const commitPendingName = (pending: PendingPerson, name: string) => {
    const trimmed = name.trim();
    setPendings(prev => prev.filter(p => p.key !== pending.key));
    if (trimmed) addPerson(trimmed, pending.phone, pending.email);
  };

  const updatePending = (key: string, patch: Partial<Pick<PendingPerson, 'name' | 'phone' | 'email'>>) => {
    setPendings(prev => prev.map(p => (p.key === key ? { ...p, ...patch } : p)));
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
    const label = crewRoles.find(r => r.key === key)?.label || key;
    const ok = await dialog.confirm({
      title: `Delete "${label}"?`,
      message: peopleCount > 0
        ? `This role has ${peopleCount} person${peopleCount !== 1 ? 's' : ''}. Removing it also removes them from the crew.`
        : 'This role will be removed from the catalog.',
      danger: true,
      suppressKey: 'lemon_schedule_dnwa_delete_crew_role',
    });
    if (ok) dispatch({ type: 'DELETE_CREW_ROLE', payload: key });
  };

  const roleRows: SidebarNavRow[] = useMemo(() =>
    crewRoles.map(r => ({ key: r.key, label: r.label, count: (crew[r.key] || []).length })),
    [crewRoles, crew]
  );

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

  const headerContent = (
    <>
      <span className="text-xs font-semibold text-zinc-700 mr-2">{role ? role.label : 'Crew'}</span>
      <span className="text-[11px] text-zinc-500 font-medium">
        {people.length} {people.length === 1 ? 'member' : 'members'}
      </span>
      <div className="w-px h-4 bg-zinc-300 mx-1.5" />
      <button
        onClick={appendPending}
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
      <button
        onClick={appendPending}
        disabled={!role || readOnly}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <UserPlus className="w-3.5 h-3.5" /> Add Member
      </button>
    </div>
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {headerTarget ? createPortal(headerContent, headerTarget) : null}
      <SidebarNav
        title="Roles"
        rows={roleRows}
        activeKey={roleKey}
        onSelect={setRoleKey}
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
              {role && people.length === 0 && pendings.length === 0 && (
                <div className="text-xs text-zinc-400 py-8 text-center border-b border-zinc-100">
                  No members in this role yet.
                </div>
              )}
              {(people.length > 0 || pendings.length > 0) && (
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
                    {people.map((p, i) => (
                      <tr key={p.id} className={`border-b border-zinc-100 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-zinc-50/30'} hover:bg-blue-50/20`}>
                        <td className="px-3 py-1">
                          <CommitInput value={p.name} onCommit={v => dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: role.key, id: p.id, updates: { name: v } } })} readOnly={readOnly} placeholder="Name" className={cellInputCls} />
                        </td>
                        <td className="px-3 py-1">
                          <CommitInput value={p.phone || ''} onCommit={v => dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: role.key, id: p.id, updates: { phone: v } } })} readOnly={readOnly} placeholder="Phone" className={cellInputCls} />
                        </td>
                        <td className="px-3 py-1">
                          <CommitInput value={p.email || ''} onCommit={v => dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: role.key, id: p.id, updates: { email: v } } })} readOnly={readOnly} placeholder="Email" className={cellInputCls} />
                        </td>
                        <td className="px-3 py-1 text-center">
                          <span className="flex items-center justify-center gap-0.5">
                            <button title="Move up" disabled={i === 0} onClick={() => dispatch({ type: 'REORDER_CREW_PERSON', payload: { role: role.key, id: p.id, dir: -1 } })} className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 p-0.5"><ArrowUp className="w-3 h-3" /></button>
                            <button title="Move down" disabled={i === people.length - 1} onClick={() => dispatch({ type: 'REORDER_CREW_PERSON', payload: { role: role.key, id: p.id, dir: 1 } })} className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 p-0.5"><ArrowDown className="w-3 h-3" /></button>
                            <button title="Delete member" onClick={() => dispatch({ type: 'DELETE_CREW_PERSON', payload: { role: role.key, id: p.id } })} className="p-1 rounded-md hover:bg-red-50 transition-colors opacity-40 hover:opacity-100"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                          </span>
                        </td>
                      </tr>
                    ))}
                    {pendings.map((pending, pi) => (
                      <tr key={pending.key} className={`border-b border-zinc-100 transition-colors ${(people.length + pi) % 2 === 0 ? 'bg-white' : 'bg-zinc-50/30'} hover:bg-blue-50/20`}>
                        <td className="px-3 py-1">
                          <CommitInput value={pending.name} autoFocus onEscape={() => setPendings(prev => prev.filter(p => p.key !== pending.key))} onCommit={v => commitPendingName(pending, v)} placeholder="Name" className={cellInputCls} />
                        </td>
                        <td className="px-3 py-1">
                          <CommitInput value={pending.phone} onCommit={v => updatePending(pending.key, { phone: v })} placeholder="Phone" className={cellInputCls} />
                        </td>
                        <td className="px-3 py-1">
                          <CommitInput value={pending.email} onCommit={v => updatePending(pending.key, { email: v })} placeholder="Email" className={cellInputCls} />
                        </td>
                        <td className="px-3 py-1" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <button
                onClick={appendPending}
                disabled={!role || readOnly}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition-colors w-full disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{role ? `Add ${role.label}` : 'Add Member'}</span>
              </button>
            </div>
          </div>
        </div>

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
            if (key) setRoleKey(key);
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
