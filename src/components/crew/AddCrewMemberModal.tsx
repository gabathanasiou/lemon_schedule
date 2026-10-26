import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UserPlus, ChevronDown } from 'lucide-react';
import { useProject } from '../../store';
import { crewRoleGroup, CREW_DEPARTMENT_NAMES } from '../../lib/crewCatalog';
import { generateUUID } from '../../lib/utils';
import { DD_TOKEN_TRIGGER_CLASS } from '../../lib/dropdown';
import type { CrewRole } from '../../types';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import { LabelModal } from '../elements/CategoryModals';

/**
 * Item 146 — the shared Add Crew Member modal (name / phone / email + role).
 * One create path, reachable from the Crew Manager, a day crew slot and the
 * Crew template editor. Saves immediately (one batch = one undo entry).
 */
export interface AddCrewMemberModalProps {
  onClose: () => void;
  /** Preselect a role (e.g. a day slot's role). */
  defaultRole?: string;
  /** Preselect the name (e.g. a freshly typed slot name). */
  defaultName?: string;
  /** Fires after the person is created (and any new role) — e.g. to assign the
   *  new person to the slot that opened the modal. */
  onCreated?: (personId: string, roleKey: string) => void;
}

const INPUT = 'w-full mt-1 px-3 py-2 bg-[var(--ui-input-bg)] border border-[color:var(--ui-input-border)] rounded-md text-xs text-[color:var(--ui-input-text)] placeholder:text-[color:var(--ui-text-faint)] outline-none focus:border-[color:var(--ui-input-focus-border)]';
const LABEL = 'text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider';

function slugifyRole(label: string, existing: Set<string>): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'role';
  let key = base;
  let n = 2;
  while (existing.has(key)) key = `${base}${n++}`;
  return key;
}

export const AddCrewMemberModal: React.FC<AddCrewMemberModalProps> = ({ onClose, defaultRole, defaultName, onCreated }) => {
  const { state, dispatch, locked } = useProject();
  const project = state.present;
  const crewRoles = useMemo(() => project.crewRoles || [], [project.crewRoles]);

  const [name, setName] = useState(defaultName || '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState(defaultRole || crewRoles[0]?.key || '');
  const [roleOpen, setRoleOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState<CrewRole | null>(null);
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleGroup, setNewRoleGroup] = useState('Other');
  const nameRef = useRef<HTMLInputElement>(null);

  // The kit modal's focus scope runs its own autofocus on mount — focus the
  // name box after it settles so typing can start immediately.
  useEffect(() => {
    const t = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!roleKey && crewRoles[0]) setRoleKey(crewRoles[0].key);
  }, [crewRoles, roleKey]);

  const allRoles = useMemo(
    () => (pendingRole ? [...crewRoles, pendingRole] : crewRoles),
    [crewRoles, pendingRole],
  );
  const selectedRoleLabel = allRoles.find(r => r.key === roleKey)?.label || '';

  const canSave = !locked && name.trim().length > 0 && !!roleKey;

  const submitNewRole = () => {
    const label = newRoleName.trim();
    if (!label) return;
    const key = slugifyRole(label, new Set(crewRoles.map(r => r.key)));
    const role: CrewRole = { key, label };
    if (newRoleGroup && newRoleGroup !== 'Other') role.department = newRoleGroup;
    setPendingRole(role);
    setRoleKey(key);
    setNewRoleOpen(false);
    setNewRoleName('');
  };

  const save = () => {
    if (!canSave) return;
    const person = { id: generateUUID(), name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined };
    dispatch({ type: 'BATCH_START' });
    if (pendingRole && pendingRole.key === roleKey) {
      dispatch({ type: 'ADD_CREW_ROLE', payload: { role: pendingRole } });
    }
    dispatch({ type: 'ADD_CREW_PERSON', payload: { role: roleKey, person } });
    dispatch({ type: 'BATCH_COMMIT' });
    onCreated?.(person.id, roleKey);
    onClose();
  };

  return (
    <>
      <Modal open onClose={onClose} title="Add Crew Member" icon={<UserPlus className="w-4 h-4" />} width="max-w-md"
        footer={
          <ModalFooter>
            <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
            <ModalFooterButton onClick={save} disabled={!canSave}>Add member</ModalFooterButton>
          </ModalFooter>
        }
      >
        <div className="p-6 space-y-4">
          <div>
            <label className={LABEL}>Name</label>
            <input
              ref={nameRef}
              className={`${INPUT} uppercase`}
              value={name}
              autoFocus
              onChange={e => setName(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter' && canSave) { e.preventDefault(); save(); } }}
              placeholder="Full name"
            />
          </div>
          <div>
            <label className={LABEL}>Role</label>
            <DropdownMenu
              open={roleOpen}
              onOpenChange={setRoleOpen}
              searchable
              searchPlaceholder="Search roles…"
              width="w-72"
              trigger={
                <button type="button" disabled={locked} className={`mt-1 w-full justify-between text-xs ${DD_TOKEN_TRIGGER_CLASS}`}>
                  <span className={selectedRoleLabel ? '' : 'text-[color:var(--ui-text-faint)]'}>{selectedRoleLabel || 'Select a role…'}</span>
                  <ChevronDown className="w-3 h-3 shrink-0 text-[color:var(--ui-text-faint)]" />
                </button>
              }
            >
              {allRoles.map(r => (
                <DropdownItem
                  key={r.key}
                  selected={roleKey === r.key}
                  trailing={<span className="opacity-70">{crewRoleGroup(r)}</span>}
                  onClick={() => { setRoleKey(r.key); setRoleOpen(false); }}
                >
                  {r.label}
                </DropdownItem>
              ))}
            </DropdownMenu>
            <button
              type="button"
              disabled={locked}
              onClick={() => setNewRoleOpen(true)}
              className="mt-1 text-[11px] text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-text)] disabled:opacity-40"
            >
              + New role…
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Phone</label>
              <input className={INPUT} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className={LABEL}>Email</label>
              <input className={INPUT} value={email} onChange={e => setEmail(e.target.value)} placeholder="Optional" />
            </div>
          </div>
        </div>
      </Modal>

      <LabelModal
        title="New Role"
        submitLabel="Create"
        open={newRoleOpen}
        onClose={() => setNewRoleOpen(false)}
        name={newRoleName}
        onNameChange={setNewRoleName}
        group={newRoleGroup}
        groupOptions={CREW_DEPARTMENT_NAMES}
        onGroupChange={setNewRoleGroup}
        onSubmit={submitNewRole}
      />
    </>
  );
};

export default AddCrewMemberModal;
