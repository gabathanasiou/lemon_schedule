import React, { useMemo } from 'react';
import { UsersRound } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import GroupedSelect, { GroupedSelectItem } from '../GroupedSelect';
import CrewTableGlide from '../CrewTableGlide';

/**
 * Crew (item 99/101/106): attach the day's crew, then set per-person call-time
 * overrides in the same inline Glide grid the Call Times section uses. The grid
 * itself is `CrewTableGlide` — the shared surface the call-sheet Crew Table
 * report block also renders (item 112).
 */
const CrewSection: React.FC<DaySectionProps> = ({ day, project, patchMeta, readOnly, actions }) => {
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
          <CrewTableGlide day={day} project={project} patchMeta={patchMeta} readOnly={readOnly} onEditCallTimesSettings={actions.openCallTimesSettings} />
        </div>
      )}
    </div>
  );
};

export const CrewIcon = UsersRound;

export default CrewSection;
