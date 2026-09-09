import React, { useCallback, useMemo } from 'react';
import { UsersRound } from 'lucide-react';
import type { GridCell } from '@glideapps/glide-data-grid';
import type { DaySectionProps } from '../daySectionTypes';
import GroupedSelect, { GroupedSelectItem } from '../GroupedSelect';
import InlineGlideTable, { type InlineGlideColumn, type InlineGlideEdit } from '../../../InlineGlideTable';
import { createDayTimesTheme } from '../../../../lib/glideTheme';
import { textCell } from '../../../../lib/glideCells';
import { setCrewCall } from '../../../../lib/dayMeta';
import { resolveCrewCall } from '../../../../lib/callTimes';
import { crewDepartmentOf } from '../../../../lib/crewCatalog';

/**
 * Crew (item 99/101/106): attach the day's crew, then set per-person call-time
 * overrides in the same inline Glide grid the Call Times section uses. A blank
 * cell falls back to the department precall, then to the day's general call
 * (roadmap 106) — the grid reads as "override, precall, or the day call" and
 * shows the RESOLVED time, amber only when an override is stored.
 */
const CALL_KEYS = new Set(['call']);

const CrewSection: React.FC<DaySectionProps> = ({ day, project, patchMeta, readOnly }) => {
  const crewRoles = project.crewRoles || [];
  const crew = project.crew || {};
  const template = project.crewTemplate || {};
  const explicit = day.meta.crewIds || [];
  const dayCall = day.callTime || '';

  const items: GroupedSelectItem[] = useMemo(() => {
    const out: GroupedSelectItem[] = [];
    for (const role of crewRoles) {
      for (const p of crew[role.key] || []) out.push({ id: p.id, name: p.name, group: role.label });
    }
    return out;
  }, [crewRoles, crew]);

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
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 w-24 shrink-0">Day crew</span>
        <GroupedSelect
          className="flex-1 min-w-0"
          items={items}
          mode="multi"
          selectedIds={explicit}
          disabled={readOnly}
          placeholder="Full roster"
          onChange={ids => patchMeta({ crewIds: ids.length ? ids : undefined })}
        />
        {!readOnly && template.crewIds && template.crewIds.length > 0 && (
          <button type="button" onClick={() => patchMeta({ crewIds: template.crewIds })} className="text-xs font-medium text-zinc-600 hover:text-zinc-900 shrink-0">Use usual crew</button>
        )}
      </div>

      {day.crew.length === 0 ? (
        <p className="text-xs text-zinc-400">No crew attached and no roster yet.</p>
      ) : (
        <div className="rounded-lg border border-zinc-200 overflow-hidden bg-white" data-crew-calls>
          <InlineGlideTable
            columns={columns}
            rows={rows}
            getCellContent={getCellContent}
            onCommit={onCommit}
            editableKeys={CALL_KEYS}
            readOnly={readOnly}
            createTheme={createDayTimesTheme}
          />
        </div>
      )}
    </div>
  );
};

export const CrewIcon = UsersRound;

export default CrewSection;
