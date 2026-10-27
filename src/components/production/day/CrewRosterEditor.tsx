import React, { useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import type { GridCell } from '@glideapps/glide-data-grid';
import type { DayCrewSlot, DayMeta, Project } from '../../../types';
import {
  addSlot as addSlotToList,
  assignSlotPerson,
  departmentOrder,
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
import { createDayTimesTheme, dayTimesCellColors } from '../../../lib/glideTheme';
import { SearchMenu, useKitTheme } from '@gabriel/ui-kit';
import type { SearchMenuGroup, SearchMenuItem } from '@gabriel/ui-kit';
import TimeField from '../../TimeField';
import Checkbox from '../../Checkbox';
import Button from '../../Button';
import { LocationSearchMenu } from '../../location/LocationSearchMenu';
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
  const gridMode = useKitTheme()?.mode ?? 'light';
  const cellColors = useMemo(() => dayTimesCellColors(gridMode), [gridMode]);
  const createTheme = useMemo(() => (fontSize: number) => createDayTimesTheme(fontSize, gridMode), [gridMode]);
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
            ? <span className="text-[color:var(--ui-accent-soft-text)]">Add new crew member…</span>
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
      return textCell(row.role, { readonly: true, allowOverlay: false, cursor: 'default', themeOverride: { textDark: cellColors.muted } });
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
      return textCell(row[col.key], { readonly: true, allowOverlay: false, cursor: 'default', themeOverride: { textDark: cellColors.faint } });
    }
    if (col.key === 'reportTo') {
      // The editor seeds with the resolved location NAME (the entity panel is
      // id-keyed, so a pick still commits the exact location id). Amber = the
      // row carries its own override.
      return seededTextCell(row.reportTo, {
        displayData: row.reportTo,
        readonly: !!readOnly,
        themeOverride: row.reportToId ? { textDark: cellColors.override } : undefined,
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
      themeOverride: overridden ? { textDark: cellColors.override } : undefined,
    });
  }, [readOnly, cellColors]);

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
  const addSlotFor = (roleKey: string, personId?: string) => {
    onSlotsChange(addSlotToList(allSlots, roleKey, personId));
  };
  const rowActions = useCallback((row: number): InlineGlideRowAction[] => {
    const r = rows[row];
    if (!r) return [];
    return [{ key: 'remove', title: 'Remove from this day', icon: 'trash', onClick: () => onSlotsChange(removeSlotFromList(allSlots, r.slotId)) }];
  }, [rows, allSlots, onSlotsChange]);
  /** Add-role catalogue (roadmap 318): the department's roles are the
   *  categories, their available people the records. Categories never add on
   *  click; pick a person — or "Add new person…" — to add the slot. The
   *  per-department menu shows every role open (a few per department) with
   *  plain role headers; the header menu is the long accordion across
   *  departments. */
  const addRoleMenu = useMemo(() => {
    const groups: SearchMenuGroup[] = [];
    const items: SearchMenuItem[] = [];
    for (const role of deptRoles) {
      const available = peopleForRole(project, role.key).filter(p => !usedPersonIds.has(p.id));
      groups.push({ key: role.key, label: role.label, count: available.length });
      if (available.length === 0) {
        items.push({ id: `${role.key}::__new__`, label: 'Add new person…', group: role.key, keywords: role.label });
      } else {
        for (const p of available) {
          items.push({ id: `${role.key}::${p.id}`, label: p.name, group: role.key, keywords: role.label });
        }
      }
    }
    return { groups, items };
  }, [deptRoles, project, usedPersonIds]);
  const addRoleFromItem = (item: SearchMenuItem) => {
    const [roleKey, personPart] = item.id.split('::');
    addSlotFor(roleKey, personPart && personPart !== '__new__' ? personPart : undefined);
  };

  return (
    <div className={`rounded-lg border border-[color:var(--ui-border)] overflow-hidden bg-[var(--ui-panel-bg)] ${excluded ? 'opacity-60' : ''}`} data-crew-dept={dept}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 bg-[var(--ui-card-bg)] border-b border-[color:var(--ui-border)]">
        <Checkbox checked={!excluded} onChange={toggleExcluded} variant="plain" disabled={readOnly} />
        <span className="text-[11px] font-semibold text-[color:var(--ui-text)]">{dept}</span>
        <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          {onDeptReportToChange && (
            <span className="flex items-center gap-1.5" data-crew-dept-report-to>
              <span className="text-[10px] uppercase tracking-wider text-[color:var(--ui-text-faint)]">Report to</span>
              <LocationSearchMenu
                items={locationItems}
                value={deptReportToId}
                onSelect={id => onDeptReportToChange?.(dept, id)}
                onClear={() => onDeptReportToChange?.(dept, '')}
                onAddNew={query => onNewLocation({ kind: 'dept', dept }, query)}
                readOnly={readOnly}
                placeholder="—"
                browse="accordion"
                collapsedWidth={176}
                expandedWidth={240}
                panelWidth={320}
                theme={gridMode}
              />
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[color:var(--ui-text-faint)]">Pre-call</span>
            <TimeField
              value={precall}
              onChange={v => onDeptPrecallChange(dept, v)}
              readOnly={readOnly}
              placeholder="-"
              boxed
              className="w-24"
            />
            {dayCall && precall && <span className="text-[11px] text-[color:var(--ui-text-faint)]">{resolveCrewCall(null, precall, dayCall)}</span>}
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
          createTheme={createTheme}
          getEditor={getEditor}
          rowActions={rowActions}
        />
      )}

      <div className="px-2 py-1.5 border-t border-[color:var(--ui-border)] flex items-center gap-2">
        {addRoleMenu.items.length > 0 ? (
          <SearchMenu
            mode="expandable"
            theme={gridMode}
            items={addRoleMenu.items}
            groups={addRoleMenu.groups}
            triggerLabel="Add role"
            triggerIcon={<Plus className="w-3.5 h-3.5" />}
            placeholder="Search roles or people…"
            onSelect={addRoleFromItem}
            browseExpanded
            collapsedWidth={110}
            expandedWidth={240}
            panelWidth={340}
            emptyHint="Try a role, department or person."
          />
        ) : (
          <Button variant="subtle" disabled>
            <Plus className="w-3 h-3" /> Add role
          </Button>
        )}
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
  const ambient = useKitTheme();

  const addRoleSlot = useCallback((roleKey: string) => {
    const used = new Set(slots.map(s => s.personId).filter(Boolean) as string[]);
    onSlotsChange(addSlotToList(slots, roleKey, peopleForRole(project, roleKey).find(p => !used.has(p.id))?.id));
  }, [project, slots, onSlotsChange]);

  /** Every role as one catalogue (roadmap 318): departments are the
   *  categories, so a role in a department with no card stays reachable. */
  const addRoleMenu = useMemo(() => {
    const counts = new Map<string, number>();
    const items: SearchMenuItem[] = allRoles.map(role => {
      const group = crewRoleGroup(role);
      counts.set(group, (counts.get(group) || 0) + 1);
      return { id: role.key, label: role.label, group, keywords: group };
    });
    const groups: SearchMenuGroup[] = departmentOrder(project)
      .filter(dept => counts.has(dept))
      .map(dept => ({ key: dept, label: dept, count: counts.get(dept) }));
    return { groups, items };
  }, [allRoles, project]);

  if (readOnly || allRoles.length === 0) return null;

  return (
    <div className={`flex items-center ${className}`} data-crew-add-role>
      <SearchMenu
        mode="expandable"
        theme={ambient?.mode ?? 'light'}
        items={addRoleMenu.items}
        groups={addRoleMenu.groups}
        triggerLabel="Add role…"
        triggerIcon={<Plus className="w-3.5 h-3.5" />}
        placeholder="Search roles…"
        onSelect={item => addRoleSlot(item.id)}
        expandableGroups
        groupExpandMode="single"
        collapsedWidth={110}
        expandedWidth={240}
        panelWidth={320}
        emptyHint="Try a role or department."
      />
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
  const ambientTheme = useKitTheme()?.mode ?? 'light';
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
        <p className="text-xs text-[color:var(--ui-text-faint)]">No crew roles yet — add a role in the Crew Manager or a crew member below.</p>
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-card-band)] px-2.5 py-1.5" data-crew-report-to>
          <span className="text-[11px] font-semibold text-[color:var(--ui-text)]">Report to</span>
          <span className="text-[10px] uppercase tracking-wider text-[color:var(--ui-text-faint)]">all crew</span>
          <LocationSearchMenu
            className="ml-auto"
            items={locationItems}
            value={reportToId}
            onSelect={onReportToChange}
            onClear={() => onReportToChange('')}
            onAddNew={query => requestNewLocation({ kind: 'all' }, query)}
            readOnly={readOnly}
            placeholder="—"
            browse="accordion"
            collapsedWidth={224}
            expandedWidth={280}
            panelWidth={320}
            theme={ambientTheme}
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
