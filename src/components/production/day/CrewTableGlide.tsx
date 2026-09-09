import React, { useCallback, useMemo } from 'react';
import { Clock } from 'lucide-react';
import type { GridCell } from '@glideapps/glide-data-grid';
import type { DayMeta, Project } from '../../../types';
import type { DayView } from '../../../lib/dayView';
import InlineGlideTable, { type InlineGlideColumn, type InlineGlideEdit } from '../../InlineGlideTable';
import { ContextMenuItem } from '../../ContextMenu';
import { createDayTimesTheme } from '../../../lib/glideTheme';
import { textCell } from '../../../lib/glideCells';
import { setCrewCall } from '../../../lib/dayMeta';
import { resolveCrewCall } from '../../../lib/callTimes';
import { crewDepartmentOf } from '../../../lib/crewCatalog';

/**
 * Crew Glide (item 112, extracted from the Day Manager's Crew section): the
 * day's crew in a compact `Name | Role | Call` grid. A blank cell falls back to
 * the department precall, then the day's general call; the RESOLVED time shows
 * (amber only when an override is stored). One write path — `setCrewCall` into
 * `daybreakMeta.crewCalls` — shared by the Crew section and the call-sheet
 * Crew Table block, so they can never drift.
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

const CrewTableGlide: React.FC<CrewTableGlideProps> = ({ day, project, patchMeta, readOnly, onEditCallTimesSettings }) => {
  const crewRoles = project.crewRoles || [];
  const template = project.crewTemplate || {};
  const dayCall = day.callTime || '';

  const rows = useMemo(() => day.crew.map(entry => {
    const roleLabel = crewRoles.find(r => r.key === entry.role)?.label || entry.role;
    const dept = crewDepartmentOf(entry.role);
    const precall = dept ? template.departmentPrecalls?.[dept] : '';
    const override = day.meta.crewCalls?.find(c => c.personId === entry.person.id)?.callTime || '';
    return {
      key: entry.person.id,
      name: entry.person.name,
      role: roleLabel,
      isOverride: override ? 'true' : '',
      call: override,
      resolved: resolveCrewCall(override, precall, dayCall),
    };
  }), [day.crew, day.meta.crewCalls, crewRoles, template.departmentPrecalls, dayCall]);

  const columns: InlineGlideColumn[] = useMemo(() => [
    { key: 'name', label: 'Name', width: 120 },
    { key: 'role', label: 'Role', width: 90 },
    { key: 'call', label: 'Call', width: 90, align: 'center' },
  ], []);

  const getCellContent = useCallback((col: InlineGlideColumn, row: Record<string, string>): GridCell => {
    if (col.key === 'call') {
      const overridden = row.isOverride === 'true';
      return textCell(row.call, {
        displayData: row.resolved,
        readonly: !!readOnly,
        align: 'center',
        themeOverride: overridden ? { textDark: '#b45309' } : { textDark: '#71717a' },
      });
    }
    if (col.key === 'role') {
      return textCell(row.role, { readonly: true, allowOverlay: false, cursor: 'default', themeOverride: { textDark: '#71717a' } });
    }
    return textCell(row.name, { readonly: true, allowOverlay: false, cursor: 'default', themeOverride: { textDark: '#52525b' } });
  }, [readOnly]);

  const onCommit = useCallback((edits: InlineGlideEdit[]) => {
    let calls = day.meta.crewCalls;
    for (const edit of edits) {
      const entry = day.crew[edit.row];
      if (!entry) continue;
      calls = setCrewCall(calls, entry.person.id, edit.value);
    }
    patchMeta({ crewCalls: calls });
  }, [day.crew, day.meta.crewCalls, patchMeta]);

  return (
    <InlineGlideTable
      dataAttr="data-crew-table-glide"
      columns={columns}
      rows={rows}
      getCellContent={getCellContent}
      onCommit={onCommit}
      editableKeys={CALL_KEYS}
      readOnly={readOnly}
      createTheme={createDayTimesTheme}
      headerMenuItems={onEditCallTimesSettings ? close => (
        <ContextMenuItem
          onClick={() => { close(); onEditCallTimesSettings(); }}
          icon={<Clock className="w-3.5 h-3.5" />}
        >
          Edit Call Time Stages…
        </ContextMenuItem>
      ) : undefined}
    />
  );
};

export default CrewTableGlide;
