import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useProject } from '../store';
import { generateUUID, formatDateShort, DATE_FORMAT_OPTIONS } from '../lib/utils';
import { useDaybreakSections } from '../lib/useDaybreakSections';
import { CrewPerson } from '../types';
import PageToolbar from './PageToolbar';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import { PopoutPlaceholder } from './PopoutWindow';
import { ChevronDown, Plus, UserPlus } from 'lucide-react';
import { CommitInput } from './CommitInput';
import { CrewManager } from './CrewManager';
import { CrewGlideTab } from './CrewGlideTab';
import { useDialog } from './Dialog';
import { requestUnsavedSave } from '../lib/unsavedGuard';

export type ProductionSubTab = 'details' | 'crew' | 'crewGlide';

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

interface ProductionTabProps {
  subTab: ProductionSubTab;
  onSubTabChange: (t: ProductionSubTab) => void;
  poppedOutSubTabs: Set<string>;
  onToggleSubPopout: (id: string) => void;
  onCloseSubPopout: (id: string) => void;
  shiftHeld?: boolean;
  headerTarget?: HTMLElement | null;
}

export default function ProductionTab({ subTab, onSubTabChange, poppedOutSubTabs, onToggleSubPopout, onCloseSubPopout, shiftHeld, headerTarget }: ProductionTabProps) {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const dialog = useDialog();
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const portalTargetRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

  // Sub-tab switches/popouts that would unmount the crew manager go through
  // the unsaved-changes guard so the prompt fires before leaving.
  const requestSubTabChange = useCallback((id: string) => {
    void requestUnsavedSave(dialog, () => onSubTabChange(id as ProductionSubTab));
  }, [dialog, onSubTabChange]);

  const requestSubTabPopout = useCallback((id: string) => {
    void requestUnsavedSave(dialog, () => onToggleSubPopout(id));
  }, [dialog, onToggleSubPopout]);

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

  const subTabLabels: Record<string, string> = { details: 'Project Details', crew: 'Crew', crewGlide: 'Crew Glide' };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <PageToolbar
        theme="light"
        tabs={[
          { id: 'details', label: 'Project Details' },
          { id: 'crew', label: 'Crew' },
          { id: 'crewGlide', label: 'Crew Glide' },
        ]}
        activeTab={subTab}
        onChange={requestSubTabChange}
        onPopout={requestSubTabPopout}
        shiftHeld={shiftHeld}
        rightContent={
          <div ref={el => { portalTargetRef.current = el; setPortalTarget(el); }} className="flex items-center gap-2" />
        }
      />
      {poppedOutSubTabs.has(subTab) ? (
        <PopoutPlaceholder title={subTabLabels[subTab]} onBringBack={() => onCloseSubPopout(subTab)} />
      ) : subTab === 'details' ? (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-6 space-y-8">
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
                <label className="flex items-center gap-3 text-xs text-zinc-500">
                  <span className="w-40 shrink-0 text-right">Report Date Format</span>
                  <select
                    className="flex-1 min-w-0 bg-white border border-zinc-300 rounded px-2 py-1 text-xs text-zinc-800 outline-none focus:border-zinc-500 disabled:opacity-50"
                    disabled={readOnly}
                    value={productionInfo.dateFormat || 'short'}
                    onChange={e => commitInfo({ dateFormat: e.target.value })}
                  >
                    {DATE_FORMAT_OPTIONS.map(o => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
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
          </div>
        </div>
      ) : subTab === 'crew' ? (
        <CrewManager headerTarget={headerTarget ?? portalTarget} />
      ) : (
        <CrewGlideTab headerTarget={headerTarget ?? portalTarget} />
      )}
    </div>
  );
}
