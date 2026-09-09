import React, { useCallback, useMemo } from 'react';
import { UsersRound } from 'lucide-react';
import type { GridCell } from '@glideapps/glide-data-grid';
import type { DaySectionProps } from '../daySectionTypes';
import GroupedSelect, { GroupedSelectItem } from '../GroupedSelect';
import InlineGlideTable, { type InlineGlideColumn, type InlineGlideEdit } from '../../../InlineGlideTable';
import { createDayTimesTheme } from '../../../../lib/glideTheme';
import { textCell } from '../../../../lib/glideCells';
import { setCrewCall } from '../../../../lib/dayMeta';

/**
 * Crew (item 99/101): attach the day's crew, then set per-person call-time
 * overrides in the same inline Glide grid the Call Times section uses. A blank
 * cell falls back to the department precall (shown muted), so the grid reads as
 * "override or default" at a glance.
 */
const CALL_KEYS = new Set(['call']);

const CrewSection: React.FC<DaySectionProps> = ({ day, project, patchMeta, readOnly }) => {
  const crewRoles = project.crewRoles || [];
  const crew = project.crew || {};
  const template = project.crewTemplate || {};
  const explicit = day.meta.crewIds || [];

  const items: GroupedSelectItem[] = useMemo(() => {
    const out: GroupedSelectItem[] = [];
    for (const role of crewRoles) {
      for (const p of crew[role.key] || []) out.push({ id: p.id, name: p.name, group: role.label });
    }
    return out;
  }, [crewRoles, crew]);

  const rows = useMemo(() => day.crew.map(entry => {
    const roleLabel = crewRoles.find(r => r.key === entry.role)?.label || entry.role;
    const precall = template.departmentPrecalls?.[roleLabel] || '';
    const override = day.meta.crewCalls?.find(c => c.personId === entry.person.id)?.callTime || '';
    return { key: entry.person.id, name: entry.person.name, role: roleLabel, precall, call: override };
  }), [day.crew, day.meta.crewCalls, crewRoles, template.departmentPrecalls]);

  const columns: InlineGlideColumn[] = useMemo(() => [
    { key: 'name', label: 'Name', width: 240 },
    { key: 'role', label: 'Role', width: 180 },
    { key: 'call', label: 'Call', width: 120, align: 'center' },
  ], []);

  const getCellContent = useCallback((col: InlineGlideColumn, row: Record<string, string>): GridCell => {
    if (col.key === 'call') {
      const raw = row.call || '';
      return textCell(raw, {
        displayData: raw || row.precall || '',
        readonly: !!readOnly,
        align: 'center',
        themeOverride: raw ? { textDark: '#b45309' } : { textDark: '#a1a1aa' },
      });
    }
    if (col.key === 'role') {
      return textCell(row.role, { readonly: true, allowOverlay: false, cursor: 'default', themeOverride: { bgCell: '#fafafa', textDark: '#71717a' } });
    }
    return textCell(row.name, { readonly: true, allowOverlay: false, cursor: 'default', themeOverride: { bgCell: '#fafafa' } });
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
