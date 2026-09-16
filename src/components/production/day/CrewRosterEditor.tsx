import React, { useCallback, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { GridCell } from '@glideapps/glide-data-grid';
import type { DayCrewSlot, DayMeta, Project } from '../../../types';
import {
  addSlot as addSlotToList,
  assignSlotPerson,
  groupSlotsByDept,
  peopleForRole,
  removeSlot as removeSlotFromList,
  resolveSlotCall,
  rolesForDept,
  setSlotCall,
  setSlotNoCall,
} from '../../../lib/dayCrew';
import { resolveCrewCall } from '../../../lib/callTimes';
import InlineGlideTable, { type InlineGlideColumn, type InlineGlideEdit, type InlineGlideRowAction } from '../../InlineGlideTable';
import { seededTextCell, textCell } from '../../../lib/glideCells';
import { createDayTimesTheme } from '../../../lib/glideTheme';
import TimeField from '../../TimeField';
import Checkbox from '../../Checkbox';
import Button from '../../Button';
import DropdownMenu from '../../DropdownMenu';
import DropdownItem from '../../DropdownItem';
import type { GlideColumnEditor } from '../../../lib/glideEditor';

/**
 * Item 146 — the shared crew roster editor. Renders a day's (or the project
 * template's) slots as one `InlineGlideTable` per department:
 *   Role (read-only) · Person (single-select dropdown) · Call (empty = no call).
 * The department header carries the include/exclude toggle and the department
 * pre-call anchor. Pure props-in / patch-out: the Day Crew section writes
 * `daybreakMeta`, the Call Times "Crew template" tab writes `crewTemplate`.
 */
export interface CrewRosterEditorProps {
  /** The working slot list (day or template). */
  slots: DayCrewSlot[];
  /** Effective excluded departments (day override → template). */
  excludedDepts: string[];
  /** Effective department pre-call expressions (day override → template). */
  effectivePrecalls: Record<string, string>;
  /** Project default pre-calls (placeholders). */
  templatePrecalls: Record<string, string>;
  /** The day's general call ('' in the template editor → raw expressions). */
  dayCall: string;
  project: Project;
  readOnly?: boolean;
  onSlotsChange: (slots: DayCrewSlot[]) => void;
  onExcludedChange: (depts: string[]) => void;
  onDeptPrecallChange: (dept: string, expr: string) => void;
  /** Opens the shared Add Crew Member modal for a department (role preselected). */
  onAddCrewMember?: (role?: string) => void;
  /** Fires when an unknown person name is committed in a slot — the host opens
   *  the Add Crew Member modal (role + name + slot prefilled). */
  onCreatePerson?: (roleKey: string, name: string, slotId: string) => void;
  /** DOM data attribute for tests. */
  dataAttr?: string;
  className?: string;
}

interface DeptTableProps {
  dept: string;
  slots: DayCrewSlot[];
  excluded: boolean;
  precall: string;
  templatePrecall: string;
  dayCall: string;
  project: Project;
  readOnly?: boolean;
  allSlots: DayCrewSlot[];
  onSlotsChange: (slots: DayCrewSlot[]) => void;
  onExcludedChange: (depts: string[]) => void;
  onDeptPrecallChange: (dept: string, expr: string) => void;
  excludedDepts: string[];
  onCreatePerson?: (roleKey: string, name: string, slotId: string) => void;
}

const COLUMNS: InlineGlideColumn[] = [
  { key: 'role', label: 'Role', width: 150 },
  { key: 'person', label: 'Person', width: 170 },
  { key: 'call', label: 'Call', width: 90, align: 'center' },
];

/** Person-dropdown item that opens the Add Crew Member modal. */
const ADD_NEW_SENTINEL = '__add_new_crew__';

const DeptTable: React.FC<DeptTableProps> = ({
  dept, slots, excluded, precall, templatePrecall, dayCall, project, readOnly,
  allSlots, onSlotsChange, onExcludedChange, onDeptPrecallChange, excludedDepts, onCreatePerson,
}) => {
  const crewRoles = project.crewRoles || [];

  const rows = useMemo(
    () => slots.map(slot => {
      const roleLabel = crewRoles.find(r => r.key === slot.role)?.label || slot.role;
      const person = slot.personId
        ? Object.values(project.crew || {}).flat().find(p => p.id === slot.personId)
        : undefined;
      return {
        key: slot.id,
        slotId: slot.id,
        roleKey: slot.role,
        personId: slot.personId || '',
        person: person?.name || '',
        role: roleLabel,
        isOverride: slot.callTime ? 'true' : '',
        isNoCall: slot.noCall ? 'true' : '',
        call: slot.callTime || '',
        precall,
        resolved: resolveSlotCall(slot, precall, dayCall),
      };
    }),
    [slots, precall, dayCall, crewRoles, project.crew],
  );

  const getEditor = useCallback((row: number, colKey: string): GlideColumnEditor | undefined | null => {
    const r = rows[row];
    if (!r) return undefined;
    if (colKey === 'person') {
      const people = peopleForRole(project, r.roleKey);
      // Name-keyed (like every other entity dropdown in the app): the value is
      // the person's NAME so the editor displays it, resolved to an id on commit.
      return {
        kind: 'entity',
        mode: 'single',
        displayMode: 'name',
        items: [
          ...people.map(p => ({ id: p.name, name: p.name })),
          { id: ADD_NEW_SENTINEL, name: ADD_NEW_SENTINEL },
        ],
        placeholder: 'Select…',
        keepAlphabetical: true,
        renderItem: (item: { id: string; name: string }) => (
          item.id === ADD_NEW_SENTINEL
            ? <span className="text-emerald-600">Add new crew member…</span>
            : <span className="truncate">{item.name}</span>
        ),
        onCreateItem: onCreatePerson ? (val: string) => onCreatePerson(r.roleKey, val, r.slotId) : undefined,
      };
    }
    return undefined;
  }, [rows, project, onCreatePerson]);

  const getCellContent = useCallback((col: InlineGlideColumn, row: Record<string, string>): GridCell => {
    if (col.key === 'role') {
      return textCell(row.role, { readonly: true, allowOverlay: false, cursor: 'default', themeOverride: { textDark: '#52525b' } });
    }
    if (col.key === 'person') {
      // Seed with the current name so the dropdown opens on it (like Set cells);
      // EntityDropdown single selects it all, so typing replaces.
      return textCell(row.person, {
        displayData: `${row.person || '—'}  ▾`,
        readonly: !!readOnly,
        cursor: 'pointer',
      });
    }
    // call — the editor seeds the row's OWN override (empty when none) so a
    // double-click never shows the department pre-call; the display shows the
    // resolved call. A literal "-" means no call; empty restores the default.
    const noCall = row.isNoCall === 'true';
    const overridden = row.isOverride === 'true';
    return seededTextCell(noCall ? '' : row.call, {
      displayData: noCall ? '—' : row.resolved,
      readonly: !!readOnly,
      align: 'center',
      themeOverride: overridden ? { textDark: '#b45309' } : undefined,
    });
  }, [readOnly]);

  const onCommit = useCallback((edits: InlineGlideEdit[]) => {
    let next = allSlots;
    let changed = false;
    for (const edit of edits) {
      const r = rows[edit.row];
      if (!r) continue;
      if (edit.colKey === 'person') {
        const value = edit.value.trim();
        // "Add new crew member…" opens the modal for this role + slot.
        if (value === ADD_NEW_SENTINEL) {
          onCreatePerson?.(r.roleKey, '', r.slotId);
          continue;
        }
        // The editor opens on the current name; an unchanged/blank commit keeps it.
        if (!value || value === r.person) continue;
        const person = peopleForRole(project, r.roleKey).find(p => p.name === value);
        if (!person) continue;
        next = assignSlotPerson(next, r.slotId, person.id);
        changed = true;
        continue;
      }
      if (edit.colKey === 'call') {
        const value = edit.value.trim();
        // A literal "-" = no call.
        if (value === '-') {
          if (r.isNoCall === 'true') continue;
          next = setSlotNoCall(next, r.slotId, true);
          changed = true;
          continue;
        }
        if (value === r.call) continue;
        // Empty (delete / clear) restores the default (dept call / day call).
        if (value === '') {
          if (!r.call && r.isNoCall !== 'true') continue;
          next = setSlotCall(next, r.slotId, '');
          changed = true;
          continue;
        }
        next = setSlotCall(next, r.slotId, value);
        changed = true;
      }
    }
    if (changed) onSlotsChange(next);
  }, [allSlots, rows, onSlotsChange, project, onCreatePerson]);

  const toggleExcluded = (included: boolean) => {
    onExcludedChange(included ? excludedDepts.filter(d => d !== dept) : [...excludedDepts, dept]);
  };

  const usedPersonIds = useMemo(() => new Set(allSlots.map(s => s.personId).filter(Boolean) as string[]), [allSlots]);
  // Only this department's roles.
  const deptRoles = useMemo(() => rolesForDept(project, dept), [project, dept]);
  const [addOpen, setAddOpen] = useState(false);
  const addSlotFor = (roleKey: string, personId?: string) => {
    onSlotsChange(addSlotToList(allSlots, roleKey, personId));
  };
  const rowActions = useCallback((row: number): InlineGlideRowAction[] => {
    const r = rows[row];
    if (!r) return [];
    return [{ key: 'remove', title: 'Remove from this day', icon: 'trash', onClick: () => onSlotsChange(removeSlotFromList(allSlots, r.slotId)) }];
  }, [rows, allSlots, onSlotsChange]);
  // Role on the left, available person on the right (role repeated when it
  // has several available people). A role with none offers "add new".
  const addMenuItems = useMemo(() => {
    const rows: { key: string; role: string; personId?: string; label: string; subtitle: string }[] = [];
    for (const role of deptRoles) {
      const available = peopleForRole(project, role.key).filter(p => !usedPersonIds.has(p.id));
      if (available.length > 0) {
        for (const p of available) rows.push({ key: `${role.key}:${p.id}`, role: role.key, personId: p.id, label: role.label, subtitle: p.name });
      } else {
        rows.push({ key: `${role.key}:empty`, role: role.key, label: role.label, subtitle: 'add new' });
      }
    }
    return rows;
  }, [deptRoles, project, usedPersonIds]);

  return (
    <div className={`rounded-lg border border-zinc-200 overflow-hidden bg-white ${excluded ? 'opacity-60' : ''}`} data-crew-dept={dept}>
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-50 border-b border-zinc-200">
        <Checkbox checked={!excluded} onChange={toggleExcluded} variant="plain" disabled={readOnly} />
        <span className="text-[11px] font-semibold text-zinc-700">{dept}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400">Pre-call</span>
          <TimeField
            value={precall}
            onChange={v => onDeptPrecallChange(dept, v)}
            readOnly={readOnly}
            placeholder="-"
            className="w-24 rounded border border-zinc-300 px-1"
          />
          {dayCall && precall && <span className="text-[11px] text-zinc-400">{resolveCrewCall(null, precall, dayCall)}</span>}
        </span>
      </div>

      {rows.length > 0 && (
        <InlineGlideTable
          dataAttr="data-crew-roster-glide"
          columns={COLUMNS}
          rows={rows}
          getCellContent={getCellContent}
          onCommit={onCommit}
          editableKeys={new Set(['person', 'call'])}
          readOnly={readOnly}
          createTheme={createDayTimesTheme}
          getEditor={getEditor}
          rowActions={rowActions}
        />
      )}

      <div className="px-2 py-1.5 border-t border-zinc-100 flex items-center gap-2">
        <DropdownMenu
          theme="light"
          width="w-72"
          open={addOpen}
          onOpenChange={setAddOpen}
          trigger={
            <Button variant="subtle" disabled={readOnly || addMenuItems.length === 0}>
              <Plus className="w-3 h-3" /> Add role
            </Button>
          }
        >
          {addMenuItems.map(item => (
            <DropdownItem
              key={item.key}
              trailing={<span className="opacity-70">{item.subtitle}</span>}
              onClick={() => { setAddOpen(false); addSlotFor(item.role, item.personId); }}
            >
              {item.label}
            </DropdownItem>
          ))}
        </DropdownMenu>
      </div>
    </div>
  );
};

export const CrewRosterEditor: React.FC<CrewRosterEditorProps> = ({
  slots, excludedDepts, effectivePrecalls, templatePrecalls, dayCall, project,
  readOnly, onSlotsChange, onExcludedChange, onDeptPrecallChange, onAddCrewMember,
  onCreatePerson,
  dataAttr, className = '',
}) => {
  const meta: DayMeta = useMemo(
    () => ({ crewSlots: slots, excludedCrewDepts: excludedDepts, departmentPrecalls: effectivePrecalls }),
    [slots, excludedDepts, effectivePrecalls],
  );
  const groups = useMemo(
    () => groupSlotsByDept(project, meta, slots, dayCall),
    [project, meta, slots, dayCall],
  );

  if (groups.length === 0) {
    return (
      <div className={className} {...(dataAttr ? { [dataAttr]: '' } : {})}>
        <p className="text-xs text-zinc-400">No crew roles yet — add a role in the Crew Manager or a crew member below.</p>
        {onAddCrewMember && (
          <Button variant="subtle" className="mt-2" disabled={readOnly} onClick={() => onAddCrewMember()}>
            <Plus className="w-3 h-3" /> New crew member…
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`} {...(dataAttr ? { [dataAttr]: '' } : {})}>
      {groups.map(g => (
        <DeptTable
          key={g.dept}
          dept={g.dept}
          slots={g.slots}
          excluded={g.excluded}
          precall={g.precall}
          templatePrecall={templatePrecalls[g.dept] || ''}
          dayCall={dayCall}
          project={project}
          readOnly={readOnly}
          allSlots={slots}
          onSlotsChange={onSlotsChange}
          onExcludedChange={onExcludedChange}
          onDeptPrecallChange={onDeptPrecallChange}
          excludedDepts={excludedDepts}
          onCreatePerson={onCreatePerson}
        />
      ))}
    </div>
  );
};

export default CrewRosterEditor;
