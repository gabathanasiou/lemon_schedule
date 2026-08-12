import React, { useMemo, useState } from 'react';
import { useProject } from '../store';
import { useDialog } from './Dialog';
import { generateUUID, formatDateShort } from '../lib/utils';
import { useDaybreakSections } from '../lib/useDaybreakSections';
import { CrewPerson } from '../types';
import PageToolbar from './PageToolbar';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import { PopoutPlaceholder } from './PopoutWindow';
import { ChevronDown, Plus, ArrowUp, ArrowDown, Trash2, UserPlus, Settings2 } from 'lucide-react';

export type ProductionSubTab = 'details' | 'crew';

const KEY_POSITIONS: { key: string; label: string }[] = [
  { key: 'director', label: 'Director' },
  { key: 'producer', label: 'Producer' },
  { key: 'lineProducer', label: 'Line Producer' },
  { key: 'firstAD', label: '1st AD' },
  { key: 'upm', label: 'UPM' },
];

const DETAIL_FIELDS: { key: string; label: string }[] = [
  { key: 'company', label: 'Production Company' },
  { key: 'studio', label: 'Studio / Backlot' },
  { key: 'productionOffice', label: 'Production Office' },
  { key: 'address', label: 'Address' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
];

const inputCls = 'flex-1 min-w-0 bg-white border border-zinc-300 rounded px-2 py-1 text-xs text-zinc-800 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400 disabled:opacity-50';
const sectionTitleCls = 'text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2';

// Controlled click-to-toggle menu (light theme)
const Menu: React.FC<{ trigger: React.ReactNode; width?: string; children: React.ReactNode }> = ({ trigger, width, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onClose={() => setOpen(false)} onOpenChange={setOpen} trigger={trigger} width={width} theme="light">
      {children}
    </DropdownMenu>
  );
};

// Commit-on-blur input (CellInput contract: never per-keystroke)
const CommitInput: React.FC<{ value: string; onCommit: (v: string) => void; readOnly?: boolean; placeholder?: string; className?: string }> = ({ value, onCommit, readOnly, placeholder, className }) => {
  const [draft, setDraft] = useState(value);
  const [active, setActive] = useState(false);
  const commit = () => {
    setActive(false);
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      value={active ? draft : value}
      placeholder={placeholder}
      disabled={readOnly}
      className={className || inputCls}
      onChange={e => { setDraft(e.target.value); setActive(true); }}
      onFocus={e => { setDraft(value); setActive(true); e.target.select(); }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(value); (e.target as HTMLInputElement).blur(); } }}
    />
  );
};

interface ProductionTabProps {
  subTab: ProductionSubTab;
  onSubTabChange: (t: ProductionSubTab) => void;
  poppedOutSubTabs: Set<string>;
  onToggleSubPopout: (id: string) => void;
  onCloseSubPopout: (id: string) => void;
  shiftHeld?: boolean;
}

export default function ProductionTab({ subTab, onSubTabChange, poppedOutSubTabs, onToggleSubPopout, onCloseSubPopout, shiftHeld }: ProductionTabProps) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const dialog = useDialog();
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const { productionSections } = useDaybreakSections();
  const wrapDate = useMemo(() => {
    const last = productionSections[productionSections.length - 1];
    return last ? formatDateShort(last.date) : '';
  }, [productionSections]);

  const crewRoles = project.crewRoles || [];
  const crew = project.crew || {};
  const productionInfo = project.productionInfo || {};

  const roleLabel = (key: string) => crewRoles.find(r => r.key === key)?.label || key;
  const allPeople = useMemo(() => {
    const out: { person: CrewPerson; role: string }[] = [];
    for (const role of crewRoles) {
      for (const p of crew[role.key] || []) out.push({ person: p, role: role.key });
    }
    return out;
  }, [crew, crewRoles]);

  const [addingName, setAddingName] = useState<{ role: string } | null>(null);
  const [newRoleName, setNewRoleName] = useState<string | null>(null);
  const [renamingRole, setRenamingRole] = useState<string | null>(null);

  const commitInfo = (patch: Record<string, string>) => dispatch({ type: 'SET_PRODUCTION_INFO', payload: patch });

  const addPersonToRole = (role: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({ type: 'ADD_CREW_PERSON', payload: { role, person: { id: generateUUID(), name: trimmed } } });
  };

  const movePersonToRole = (person: CrewPerson, fromRole: string, toRole: string) => {
    if (fromRole === toRole) return;
    dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: fromRole, id: person.id, updates: {}, toRole } });
  };

  const addRole = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '') || generateUUID().slice(0, 8);
    if (crewRoles.some(r => r.key === key)) return;
    dispatch({ type: 'ADD_CREW_ROLE', payload: { role: { key, label: trimmed } } });
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
    if (ok) dispatch({ type: 'DELETE_CREW_ROLE', payload: key });
  };

  const nonEmptyRoles = crewRoles.filter(r => (crew[r.key] || []).length > 0);

  const subTabLabels: Record<string, string> = { details: 'Project Details', crew: 'Crew' };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <PageToolbar
        theme="light"
        tabs={[
          { id: 'details', label: 'Project Details' },
          { id: 'crew', label: 'Crew' },
        ]}
        activeTab={subTab}
        onChange={onSubTabChange}
        onPopout={onToggleSubPopout}
        shiftHeld={shiftHeld}
      />
      {poppedOutSubTabs.has(subTab) ? (
        <PopoutPlaceholder title={subTabLabels[subTab]} onBringBack={() => onCloseSubPopout(subTab)} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-6 space-y-8">
            {subTab === 'details' ? (
              <>
                <section>
                  <h2 className={sectionTitleCls}>Project Details</h2>
                  <div className="flex flex-col gap-3">
                    {DETAIL_FIELDS.map(f => (
                      <label key={f.key} className="flex items-center gap-3 text-xs text-zinc-500">
                        <span className="w-40 shrink-0 text-right">{f.label}</span>
                        <CommitInput
                          value={String(productionInfo[f.key as keyof typeof productionInfo] ?? '')}
                          onCommit={v => commitInfo({ [f.key]: v })}
                          readOnly={readOnly}
                          placeholder={f.label}
                        />
                      </label>
                    ))}
                  </div>
                </section>

                <section>
                  <h2 className={sectionTitleCls}>Dates</h2>
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center gap-3 text-xs text-zinc-500">
                      <span className="w-40 shrink-0 text-right">Production Start</span>
                      <CommitInput
                        value={activeVersion?.productionStart || ''}
                        onCommit={v => activeVersion && dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, productionStart: v } })}
                        readOnly={readOnly}
                        placeholder="YYYY-MM-DD"
                      />
                    </label>
                    <label className="flex items-center gap-3 text-xs text-zinc-500">
                      <span className="w-40 shrink-0 text-right">Wrap Date</span>
                      <span className="flex-1 px-2 py-1 text-xs text-zinc-400">{wrapDate || '—'}</span>
                    </label>
                  </div>
                </section>

                <section>
                  <h2 className={sectionTitleCls}>Key Positions</h2>
                  <div className="flex flex-col gap-2">
                    {KEY_POSITIONS.map(kp => {
                      const people = crew[kp.key] || [];
                      const candidates = allPeople.filter(a => a.role !== kp.key);
                      return (
                        <div key={kp.key} className="flex items-center gap-3 rounded border border-zinc-200 px-3 py-2">
                          <span className="w-40 shrink-0 text-xs font-medium text-zinc-600">{kp.label}</span>
                          <span className="flex-1 text-xs text-zinc-700">
                            {people.length > 0 ? people.map(p => p.name).join(', ') : <span className="text-zinc-400">— unassigned —</span>}
                          </span>
                          {!readOnly && (
                            <Menu
                              trigger={
                                <button className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded px-2 py-1">
                                  <UserPlus className="w-3.5 h-3.5" /> Assign
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              }
                            >
                              {candidates.map(a => (
                                <DropdownItem key={a.person.id} onClick={() => movePersonToRole(a.person, a.role, kp.key)}>
                                  {a.person.name} <span className="text-zinc-500">({roleLabel(a.role)})</span>
                                </DropdownItem>
                              ))}
                              {candidates.length > 0 && <DropdownDivider />}
                              <DropdownItem onClick={() => setAddingName({ role: kp.key })} icon={<Plus className="w-3.5 h-3.5" />}>
                                Add new person…
                              </DropdownItem>
                            </Menu>
                          )}
                          {addingName?.role === kp.key && (
                            <CommitInput
                              value=""
                              onCommit={v => { addPersonToRole(kp.key, v); setAddingName(null); }}
                              readOnly={readOnly}
                              placeholder="Name"
                              className="w-40 bg-white border border-zinc-300 rounded px-2 py-1 text-xs text-zinc-800 outline-none"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            ) : (
              <>
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className={sectionTitleCls + ' mb-0'}>Crew</h2>
                    <div className="flex items-center gap-2">
                      {newRoleName !== null ? (
                        <CommitInput
                          value=""
                          onCommit={v => { addRole(v); setNewRoleName(null); }}
                          placeholder="New role name"
                          className="w-44 bg-white border border-zinc-300 rounded px-2 py-1 text-xs text-zinc-800 outline-none"
                        />
                      ) : (
                        <Menu
                          trigger={
                            <button className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded px-2 py-1">
                              <Settings2 className="w-3.5 h-3.5" /> Manage Roles
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          }
                        >
                          <DropdownItem onClick={() => setNewRoleName('')} icon={<Plus className="w-3.5 h-3.5" />}>
                            Add role…
                          </DropdownItem>
                          <DropdownDivider />
                          {crewRoles.map(r => (
                            <div key={r.key} className="px-2 py-1">
                              {renamingRole === r.key ? (
                                <CommitInput
                                  value={r.label}
                                  onCommit={v => { dispatch({ type: 'RENAME_CREW_ROLE', payload: { key: r.key, label: v } }); setRenamingRole(null); }}
                                  className="w-44 bg-white border border-zinc-300 rounded px-2 py-1 text-xs text-zinc-800 outline-none"
                                />
                              ) : (
                                <div className="flex items-center gap-2 text-xs text-zinc-600">
                                  <span className="flex-1 truncate">{r.label}{r.builtin ? '' : ' · custom'}</span>
                                  <button className="text-zinc-400 hover:text-zinc-700" onClick={() => setRenamingRole(r.key)}>Rename</button>
                                  <button className="text-red-400 hover:text-red-600" onClick={() => void deleteRole(r.key)}>
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </Menu>
                      )}
                      <Menu
                        trigger={
                          <button className="flex items-center gap-1 text-xs bg-zinc-900 text-white rounded px-2.5 py-1 hover:bg-zinc-700">
                            <Plus className="w-3.5 h-3.5" /> Add Member
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        }
                      >
                        {crewRoles.map(r => (
                          <DropdownItem key={r.key} onClick={() => setAddingName({ role: r.key })}>
                            {r.label}
                          </DropdownItem>
                        ))}
                      </Menu>
                    </div>
                  </div>
                  {addingName && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-zinc-500">Add to {roleLabel(addingName.role)}:</span>
                      <CommitInput
                        value=""
                        onCommit={v => { addPersonToRole(addingName.role, v); setAddingName(null); }}
                        placeholder="Name"
                        className="w-56 bg-white border border-zinc-300 rounded px-2 py-1 text-xs text-zinc-800 outline-none"
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-4">
                    {nonEmptyRoles.length === 0 && (
                      <div className="text-xs text-zinc-400 py-8 text-center border border-dashed border-zinc-300 rounded">
                        No crew yet — add members using the buttons above.
                      </div>
                    )}
                    {nonEmptyRoles.map(role => {
                      const people = crew[role.key] || [];
                      return (
                        <div key={role.key} className="border border-zinc-200 rounded overflow-hidden">
                          <div className="flex items-center justify-between bg-zinc-50 border-b border-zinc-200 px-3 py-1.5">
                            <span className="text-xs font-semibold text-zinc-700">
                              {role.label} <span className="text-zinc-400 font-normal">({people.length})</span>
                            </span>
                            {!readOnly && (
                              <button
                                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700"
                                onClick={() => setAddingName({ role: role.key })}
                              >
                                <Plus className="w-3 h-3" /> Add
                              </button>
                            )}
                          </div>
                          {people.map((p, i) => (
                            <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-100 last:border-b-0">
                              <span className="w-32 shrink-0"><CommitInput value={p.name} onCommit={v => dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: role.key, id: p.id, updates: { name: v } } })} readOnly={readOnly} placeholder="Name" /></span>
                              <span className="w-36 shrink-0"><CommitInput value={p.phone || ''} onCommit={v => dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: role.key, id: p.id, updates: { phone: v } } })} readOnly={readOnly} placeholder="Phone" /></span>
                              <span className="flex-1 min-w-0"><CommitInput value={p.email || ''} onCommit={v => dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: role.key, id: p.id, updates: { email: v } } })} readOnly={readOnly} placeholder="Email" /></span>
                              {!readOnly && (
                                <span className="flex items-center gap-0.5 shrink-0">
                                  <button disabled={i === 0} onClick={() => dispatch({ type: 'REORDER_CREW_PERSON', payload: { role: role.key, id: p.id, dir: -1 } })} className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 p-0.5"><ArrowUp className="w-3 h-3" /></button>
                                  <button disabled={i === people.length - 1} onClick={() => dispatch({ type: 'REORDER_CREW_PERSON', payload: { role: role.key, id: p.id, dir: 1 } })} className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 p-0.5"><ArrowDown className="w-3 h-3" /></button>
                                  <button onClick={() => dispatch({ type: 'DELETE_CREW_PERSON', payload: { role: role.key, id: p.id } })} className="text-red-400 hover:text-red-600 p-0.5"><Trash2 className="w-3 h-3" /></button>
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
