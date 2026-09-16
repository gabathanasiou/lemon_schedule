import React, { useCallback, useMemo } from 'react';
import { Clock } from 'lucide-react';
import type { GridCell } from '@glideapps/glide-data-grid';
import type { DayMeta, DayCrewSlot, Project } from '../../../types';
import type { DayView } from '../../../lib/dayView';
import type { DayCrewGroup } from '../../../lib/dayCrew';
import { resolveSlotCall, setSlotCall, setSlotNoCall, slotsForDay } from '../../../lib/dayCrew';
import InlineGlideTable, { type InlineGlideColumn, type InlineGlideEdit } from '../../InlineGlideTable';
import { ContextMenuItem } from '../../ContextMenu';
import { createDayTimesTheme } from '../../../lib/glideTheme';
import { seededTextCell, textCell } from '../../../lib/glideCells';

/**
 * Crew Glide (items 112/146): the day's crew as department-grouped
 * `Name | Role | Call` tables. A blank cell falls back to the department
 * pre-call (resolved against the day call), then the day call; the RESOLVED
 * time shows (amber only when a slot override is stored). Editing the call
 * writes the SLOT's override (`daybreakMeta.crewSlots`) so the call stays put
 * when the person is switched. One write path, shared by the Day Manager Crew
 * section and the call-sheet Crew Table block, so they can never drift.
 */
const CALL_KEYS = new Set(['call']);

export interface CrewTableGlideProps {
  day: DayView;
  project: Project;
  patchMeta: (patch: Partial<DayMeta>) => void;
  readOnly?: boolean;
  /** Header right-click → "Edit Call Time Stages…" (department precalls,
   *  usual crew) opens the settings modal owned by the composition root. */
  onEditCallTimesSettings?: () => void;
}

interface GroupProps {
  group: DayCrewGroup;
  /** The day's FULL effective slot list — commits patch this, not just the group. */
  allSlots: DayCrewSlot[];
  dayCall: string;
  patchMeta: (patch: Partial<DayMeta>) => void;
  readOnly?: boolean;
  project: Project;
  onEditCallTimesSettings?: () => void;
}

const CrewGroupTable: React.FC<GroupProps> = ({ group, allSlots, dayCall, patchMeta, readOnly, project, onEditCallTimesSettings }) => {
  const crewRoles = project.crewRoles || [];

  const rows = useMemo(
    () => group.slots.flatMap(slot => {
      if (!slot.personId) return [];
      const person = Object.values(project.crew || {}).flat().find(p => p.id === slot.personId);
      if (!person) return [];
      const roleLabel = crewRoles.find(r => r.key === slot.role)?.label || slot.role;
      const resolved = resolveSlotCall(slot, group.precall, dayCall);
      return [{
        key: slot.id,
        slotId: slot.id,
        name: person.name,
        role: roleLabel,
        isOverride: slot.callTime ? 'true' : '',
        isNoCall: slot.noCall ? 'true' : '',
        call: slot.callTime || '',
        precall: group.precall,
        resolved,
      }];
    }),
    [group.slots, group.precall, dayCall, crewRoles, project.crew],
  );

  const columns: InlineGlideColumn[] = useMemo(() => [
    { key: 'name', label: 'Name', width: 140 },
    { key: 'role', label: 'Role', width: 110 },
    { key: 'call', label: 'Call', width: 90, align: 'center' },
  ], []);

  const getCellContent = useCallback((col: InlineGlideColumn, row: Record<string, string>): GridCell => {
    if (col.key === 'call') {
      const noCall = row.isNoCall === 'true';
      const overridden = row.isOverride === 'true';
      // Seed the editor with the row's OWN override (empty when none) so a
      // double-click never shows the department pre-call. Display = resolved.
      return seededTextCell(noCall ? '' : row.call, {
        displayData: noCall ? '—' : row.resolved,
        readonly: !!readOnly,
        align: 'center',
        themeOverride: overridden ? { textDark: '#b45309' } : undefined,
      });
    }
    if (col.key === 'role') {
      return textCell(row.role, { readonly: true, allowOverlay: false, cursor: 'default', themeOverride: { textDark: '#71717a' } });
    }
    return textCell(row.name, { readonly: true, allowOverlay: false, cursor: 'default', themeOverride: { textDark: '#52525b' } });
  }, [readOnly]);

  const onCommit = useCallback((edits: InlineGlideEdit[]) => {
    let slots = allSlots;
    let changed = false;
    for (const edit of edits) {
      const row = rows[edit.row];
      if (!row) continue;
      const value = edit.value.trim();
      if (value === '-') {
        if (row.isNoCall === 'true') continue;
        slots = setSlotNoCall(slots, row.slotId, true);
        changed = true;
        continue;
      }
      if (value === row.call) continue;
      if (value === '') {
        if (!row.call && row.isNoCall !== 'true') continue;
        slots = setSlotCall(slots, row.slotId, '');
        changed = true;
        continue;
      }
      slots = setSlotCall(slots, row.slotId, value);
      changed = true;
    }
    if (changed) patchMeta({ crewSlots: slots });
  }, [allSlots, rows, patchMeta]);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-200 overflow-hidden bg-white" data-crew-dept={group.dept}>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 border-b border-zinc-200">
        <span className="text-[11px] font-semibold text-zinc-700">{group.dept}</span>
        {group.deptCall && <span className="text-[11px] text-zinc-400">{group.deptCall}</span>}
      </div>
      <InlineGlideTable
        dataAttr="data-crew-table-glide"
        columns={columns}
        rows={rows}
        getCellContent={getCellContent}
        onCommit={onCommit}
        editableKeys={CALL_KEYS}
        readOnly={readOnly}
        createTheme={createDayTimesTheme}
        rowTooltip={(_row, i) => {
          const r = rows[i];
          if (!r) return null;
          return (
            <div className="w-56 rounded overflow-hidden shadow-xl border border-zinc-700 bg-zinc-900 text-white">
              <div className="px-2 py-1 text-[10px] font-semibold bg-zinc-800 text-zinc-200">{r.name}</div>
              <div className="px-2.5 py-1.5 space-y-0.5">
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-zinc-400">{r.role}</span>
                  {group.dept && <span className="text-zinc-500">· {group.dept}</span>}
                  {r.isOverride === 'true' && <span className="font-semibold text-amber-400">OVERRIDE</span>}
                  {r.isNoCall === 'true' && <span className="font-semibold text-zinc-500">NO CALL</span>}
                </div>
                <div className="text-[11px]"><span className="text-zinc-400">CALL </span><span className="font-semibold">{r.resolved || '—'}</span></div>
              </div>
            </div>
          );
        }}
        headerMenuItems={onEditCallTimesSettings ? close => (
          <ContextMenuItem
            onClick={() => { close(); onEditCallTimesSettings(); }}
            icon={<Clock className="w-3.5 h-3.5" />}
          >
            Edit Call Time Stages…
          </ContextMenuItem>
        ) : undefined}
      />
    </div>
  );
};

const CrewTableGlide: React.FC<CrewTableGlideProps> = ({ day, project, patchMeta, readOnly, onEditCallTimesSettings }) => {
  // The day's FULL effective slots — every group commits against this list so a
  // group edit never drops another department's slots.
  const effective = useMemo(() => day.meta.crewSlots ?? slotsForDay(project, day.meta), [day.meta, project]);
  const groups = useMemo(
    () => day.crewGroups.filter(g => !g.excluded && g.slots.some(s => s.personId)),
    [day.crewGroups],
  );

  if (groups.length === 0) {
    return <p className="px-2 py-3 text-xs text-zinc-400">No crew on this day.</p>;
  }

  return (
    <div className="space-y-2" data-crew-table-grouped>
      {groups.map(g => (
        <CrewGroupTable
          key={g.dept}
          group={g}
          allSlots={effective}
          dayCall={day.callTime}
          patchMeta={patchMeta}
          readOnly={readOnly}
          project={project}
          onEditCallTimesSettings={onEditCallTimesSettings}
        />
      ))}
    </div>
  );
};

export default CrewTableGlide;
