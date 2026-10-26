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
  resolveSlotReportToId,
  rolesForDept,
  setSlotCall,
  setSlotNoCall,
  setSlotReportToId,
} from '../../../lib/dayCrew';
import { crewRoleGroup } from '../../../lib/crewCatalog';
import { resolveCrewCall } from '../../../lib/callTimes';
import { locationLabelById } from '../../../lib/locations';
import { ADD_LOCATION_SENTINEL, locationOptions } from '../../../lib/locationOptions';
import type { PickedLocation } from '../../../lib/places';
import InlineGlideTable, { type InlineGlideColumn, type InlineGlideEdit, type InlineGlideRowAction } from '../../InlineGlideTable';
import { seededTextCell, textCell } from '../../../lib/glideCells';
import { createDayTimesTheme } from '../../../lib/glideTheme';
import TimeField from '../../TimeField';
import Checkbox from '../../Checkbox';
import Button from '../../Button';
import DropdownMenu from '../../DropdownMenu';
import DropdownItem from '../../DropdownItem';
import GroupedSelect from './GroupedSelect';
import { useLocationPicker } from '../../location/useLocationPicker';
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
  /** Call-sheet host only: append read-only Phone / Email columns (mirrors the
   *  static crewTable block's fixed columns, item 156). */
  contacts?: boolean;
  /** Item 156: effective "Report to" LOCATION id for everyone (day → template). */
  reportToId?: string;
  /** Item 156: effective per-department "Report to" location ids (day → template). */
  deptReportTo?: Record<string, string>;
  /** Item 156: writes the everyone default (day meta / crew template).
   *  Omitted = no input (read-only boards). */
  onReportToChange?: (locationId: string) => void;
  /** Item 156: writes one department's default. Omitted = no input. */
  onDeptReportToChange?: (dept: string, locationId: string) => void;
  /** Item 156: creates a Locations-DB entry from the map picker and returns its
   *  id — the host owns the dispatch (`ADD_LOCATION`). */
  onCreateLocation?: (picked: PickedLocation, type: string) => string;
  /** DOM data attribute for tests. */
  dataAttr?: string;
  /** Peer-selection scope PREFIX (roadmap 234) — the host names the logical
   *  grid (`day:3:crew`, `callsheet:3:crew`); each department's table gets
   *  `${prefix}:${dept}`. Omitted = out of presence (e.g. template editing in
   *  a modal). */
  presenceScopePrefix?: string;
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
  contacts?: boolean;
  /** Item 156: everyone default location id for this board (resolved fallback). */
  dayReportToId: string;
  /** Item 156: this department's effective default location id. */
  deptReportToId: string;
  onDeptReportToChange?: (dept: string, locationId: string) => void;
  /** Item 156: opens the shared location picker for a target ('' prefill = none). */
  onNewLocation: (target: NewLocationTarget, address?: string) => void;
  /** Peer-selection scope for this department's grid (roadmap 234). */
  presenceScope?: string;
}

/** Where a newly created location should be assigned. */
type NewLocationTarget = { kind: 'all' } | { kind: 'dept'; dept: string } | { kind: 'slot'; slotId: string };

const COLUMNS: InlineGlideColumn[] = [
  { key: 'role', label: 'Role', width: 150 },
  { key: 'person', label: 'Person', width: 170 },
  { key: 'reportTo', label: 'Report To', width: 150 },
  { key: 'call', label: 'Call', width: 90, align: 'center' },
];

/** Contact columns appended in the call-sheet crew table (item 156 parity). */
const CONTACT_COLUMNS: InlineGlideColumn[] = [
  { key: 'phone', label: 'Phone', width: 110 },
  { key: 'email', label: 'Email', width: 150 },
];

/** Person-dropdown item that opens the Add Crew Member modal. */
const ADD_NEW_SENTINEL = '__add_new_crew__';

/** Stable empty map — default for boards with no department report-to values. */
const EMPTY_DEPT_REPORT_TO: Record<string, string> = {};

const DeptTable: React.FC<DeptTableProps> = ({
  dept, slots, excluded, precall, templatePrecall, dayCall, project, readOnly,
  allSlots, onSlotsChange, onExcludedChange, onDeptPrecallChange, excludedDepts, onCreatePerson, contacts,
  dayReportToId, deptReportToId, onDeptReportToChange, onNewLocation,
  presenceScope,
}) => {
  const crewRoles = project.crewRoles || [];
  const locationItems = useMemo(() => locationOptions(project), [project]);

  const columns = useMemo<InlineGlideColumn[]>(
    () => (contacts ? [...COLUMNS, ...CONTACT_COLUMNS] : COLUMNS),
    [contacts],
  );

  const rows = useMemo(
    () => slots.map(slot => {
      const roleLabel = crewRoles.find(r => r.key === slot.role)?.label || slot.role;
      const person = slot.personId
        ? Object.values(project.crew || {}).flat().find(p => p.id === slot.personId)
        : undefined;
      const resolvedReportToId = resolveSlotReportToId(slot, deptReportToId, dayReportToId);
      return {
        key: slot.id,
        slotId: slot.id,
        roleKey: slot.role,
        personId: slot.personId || '',
        person: person?.name || '',
        phone: person?.phone || '',
        email: person?.email || '',
        role: roleLabel,
        reportToId: slot.reportToId || '',
        reportTo: locationLabelById(project, resolvedReportToId),
        isOverride: slot.callTime ? 'true' : '',
        isNoCall: slot.noCall ? 'true' : '',
        call: slot.callTime || '',
        precall,
        resolved: resolveSlotCall(slot, precall, dayCall),
      };
    }),
    [slots, precall, dayCall, crewRoles, project, deptReportToId, dayReportToId],
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
    // Touch call cells open the shared time keypad (roadmap 301 sweep).
    if (colKey === 'call') return { kind: 'time', align: 'center' };
    if (colKey === 'reportTo') {
      // Locations DB, id-keyed (a rename moves the printed name with it). The
      // trailing action row opens the shared map picker; typed unmatched text
      // prefills that picker's address instead of storing a free-text value.
      return {
        kind: 'entity',
        mode: 'single',
        displayMode: 'id',
        items: locationItems,
        placeholder: 'Select…',
        // The list is pre-ordered (action row first, DB grouped by type):
        // never sort it alphabetically — that would split the group headers.
        sortItems: list => list,
        // Typing a type ("set", "unit base") lists that whole group.
        searchFields: ['name', 'group'],
        renderItem: item => (
          item.id === ADD_LOCATION_SENTINEL
            ? <span className="text-emerald-600">Add new location…</span>
            : <span className="truncate">{item.name}</span>
        ),
        onCreateItem: (val: string) => onNewLocation({ kind: 'slot', slotId: r.slotId }, val),
      };
    }
    return undefined;
  }, [rows, project, onCreatePerson, onNewLocation, locationItems]);

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
    if (col.key === 'phone' || col.key === 'email') {
      return textCell(row[col.key], { readonly: true, allowOverlay: false, cursor: 'default', themeOverride: { textDark: '#71717a' } });
    }
    if (col.key === 'reportTo') {
      // The editor seeds with the resolved location NAME (the entity panel is
      // id-keyed, so a pick still commits the exact location id). Amber = the
      // row carries its own override.
      return seededTextCell(row.reportTo, {
        displayData: row.reportTo,
        readonly: !!readOnly,
        themeOverride: row.reportToId ? { textDark: '#b45309' } : undefined,
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
      if (edit.colKey === 'reportTo') {
        const value = edit.value.trim();
        // "Add new location…" opens the map picker for this slot.
        if (value === ADD_LOCATION_SENTINEL) {
          onNewLocation({ kind: 'slot', slotId: r.slotId });
          continue;
        }
        // A pick commits the exact location id; a typed/Enter-committed name
        // maps back to the Locations DB (never store free text). Anything
        // unknown was already routed to the picker through onCreateItem.
        const byId = value ? project.locations?.find(l => l.id === value) : undefined;
        const byName = value ? project.locations?.find(l => locationLabelById(project, l.id) === value) : undefined;
        const id = byId?.id ?? byName?.id ?? '';
        if (id === r.reportToId) continue;
        next = setSlotReportToId(next, r.slotId, id);
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
  }, [allSlots, rows, onSlotsChange, project, onCreatePerson, onNewLocation]);

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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 bg-zinc-50 border-b border-zinc-200">
        <Checkbox checked={!excluded} onChange={toggleExcluded} variant="plain" disabled={readOnly} />
        <span className="text-[11px] font-semibold text-zinc-700">{dept}</span>
        <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          {onDeptReportToChange && (
            <span className="flex items-center gap-1.5" data-crew-dept-report-to>
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">Report to</span>
              <GroupedSelect
                className="w-44"
                items={locationItems}
                mode="single"
                selectedIds={deptReportToId ? [deptReportToId] : []}
                disabled={readOnly}
                placeholder="—"
                onChange={ids => {
                  const id = ids[0] || '';
                  if (id === ADD_LOCATION_SENTINEL) { onNewLocation({ kind: 'dept', dept }); return; }
                  onDeptReportToChange(dept, id);
                }}
              />
            </span>
          )}
          <span className="flex items-center gap-1.5">
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
        </span>
      </div>

      {rows.length > 0 && (
        <InlineGlideTable
          dataAttr="data-crew-roster-glide"
          presenceScope={presenceScope}
          columns={columns}
          rows={rows}
          getCellContent={getCellContent}
          onCommit={onCommit}
          editableKeys={new Set(['person', 'reportTo', 'call'])}
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

export interface CrewAddRoleMenuProps {
  project: Project;
  /** The working slot list (day or template). */
  slots: DayCrewSlot[];
  onSlotsChange: (slots: DayCrewSlot[]) => void;
  readOnly?: boolean;
  className?: string;
}

/**
 * Roadmap 218 — the one "Add role…" menu (hosted by the Day Crew section
 * header next to "Apply template" and by the Call Times modal's Crew template
 * tab). The per-card "Add role" menus only exist inside a rendered card, so a
 * department absent from the WORKING list (a stored template/day that predates
 * a roster role) can never gain a slot — this adds any role to the working
 * list, auto-filling its first unused roster person (the slot's Person
 * dropdown handles swaps / new people).
 */
export const CrewAddRoleMenu: React.FC<CrewAddRoleMenuProps> = ({ project, slots, onSlotsChange, readOnly, className = '' }) => {
  const allRoles = useMemo(() => project.crewRoles || [], [project.crewRoles]);
  const [open, setOpen] = useState(false);

  const addRoleSlot = useCallback((roleKey: string) => {
    const used = new Set(slots.map(s => s.personId).filter(Boolean) as string[]);
    onSlotsChange(addSlotToList(slots, roleKey, peopleForRole(project, roleKey).find(p => !used.has(p.id))?.id));
  }, [project, slots, onSlotsChange]);

  if (readOnly || allRoles.length === 0) return null;

  return (
    <div className={`flex items-center ${className}`} data-crew-add-role>
      <DropdownMenu
        open={open}
        onOpenChange={setOpen}
        theme="light"
        width="w-72"
        searchable
        searchPlaceholder="Search roles…"
        trigger={
          <Button variant="subtle">
            <Plus className="w-3 h-3" /> Add role…
          </Button>
        }
      >
        {allRoles.map(r => (
          <DropdownItem
            key={r.key}
            trailing={<span className="opacity-70">{crewRoleGroup(r)}</span>}
            onClick={() => { setOpen(false); addRoleSlot(r.key); }}
          >
            {r.label}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </div>
  );
};

export const CrewRosterEditor: React.FC<CrewRosterEditorProps> = ({
  slots, excludedDepts, effectivePrecalls, templatePrecalls, dayCall, project,
  readOnly, onSlotsChange, onExcludedChange, onDeptPrecallChange, onAddCrewMember,
  onCreatePerson, contacts, reportToId = '', deptReportTo = EMPTY_DEPT_REPORT_TO,
  onReportToChange, onDeptReportToChange, onCreateLocation,
  dataAttr, presenceScopePrefix, className = '',
}) => {
  const meta: DayMeta = useMemo(
    () => ({ crewSlots: slots, excludedCrewDepts: excludedDepts, departmentPrecalls: effectivePrecalls, reportToId, departmentReportTo: deptReportTo }),
    [slots, excludedDepts, effectivePrecalls, reportToId, deptReportTo],
  );
  const groups = useMemo(
    () => groupSlotsByDept(project, meta, slots, dayCall),
    [project, meta, slots, dayCall],
  );
  const allRoles = useMemo(() => project.crewRoles || [], [project.crewRoles]);
  const locationItems = useMemo(() => locationOptions(project), [project]);
  // The shared map picker (one hook for every host): the confirm creates the
  // Locations-DB entry and assigns it to the pending board target.
  const { open: openLocationPicker, node: locationPickerNode } = useLocationPicker<NewLocationTarget>(project, (target, picked, type) => {
    if (!onCreateLocation) return;
    const id = onCreateLocation(picked, type);
    if (!id) return;
    if (target.kind === 'all') onReportToChange?.(id);
    else if (target.kind === 'dept') onDeptReportToChange?.(target.dept, id);
    else onSlotsChange(setSlotReportToId(slots, target.slotId, id));
  });
  const requestNewLocation = useCallback((target: NewLocationTarget, address?: string) => {
    openLocationPicker(target, { initial: address ? { address } : null });
  }, [openLocationPicker]);

  if (groups.length === 0 && allRoles.length === 0) {
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
      {onReportToChange && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5" data-crew-report-to>
          <span className="text-[11px] font-semibold text-zinc-700">Report to</span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-400">all crew</span>
          <GroupedSelect
            className="ml-auto w-56"
            items={locationItems}
            mode="single"
            selectedIds={reportToId ? [reportToId] : []}
            disabled={readOnly}
            placeholder="—"
            onChange={ids => {
              const id = ids[0] || '';
              if (id === ADD_LOCATION_SENTINEL) { requestNewLocation({ kind: 'all' }); return; }
              onReportToChange(id);
            }}
          />
        </div>
      )}
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
          contacts={contacts}
          dayReportToId={reportToId}
          deptReportToId={g.reportToId}
          onDeptReportToChange={onDeptReportToChange}
          onNewLocation={requestNewLocation}
          presenceScope={presenceScopePrefix ? `${presenceScopePrefix}:${g.dept}` : undefined}
        />
      ))}
      {locationPickerNode}
    </div>
  );
};

export default CrewRosterEditor;
