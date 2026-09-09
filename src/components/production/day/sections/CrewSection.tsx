import React, { useMemo } from 'react';
import { UsersRound } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import GroupedSelect, { GroupedSelectItem } from '../GroupedSelect';
import TimeField from '../../../TimeField';
import type { DayCrewCall } from '../../../../types';

const CrewSection: React.FC<DaySectionProps> = ({ day, project, patchMeta, readOnly }) => {
  const crewRoles = project.crewRoles || [];
  const crew = project.crew || {};

  const items: GroupedSelectItem[] = useMemo(() => {
    const out: GroupedSelectItem[] = [];
    for (const role of crewRoles) {
      for (const p of crew[role.key] || []) out.push({ id: p.id, name: p.name, group: role.label });
    }
    return out;
  }, [crewRoles, crew]);

  const template = project.crewTemplate || {};
  const explicit = day.meta.crewIds || [];

  const setCall = (personId: string, raw: string) => {
    const calls: DayCrewCall[] = [...(day.meta.crewCalls || [])];
    const idx = calls.findIndex(c => c.personId === personId);
    const value = raw.trim();
    if (idx >= 0) {
      if (value) calls[idx] = { ...calls[idx], callTime: value };
      else {
        const next = { ...calls[idx] };
        delete next.callTime;
        if (!next.note) calls.splice(idx, 1);
        else calls[idx] = next;
      }
    } else if (value) {
      calls.push({ personId, callTime: value });
    }
    patchMeta({ crewCalls: calls.length ? calls : undefined });
  };

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
        <div className="rounded-lg border border-zinc-200 overflow-hidden">
          {day.crew.map(entry => {
            const roleLabel = crewRoles.find(r => r.key === entry.role)?.label || entry.role;
            const precall = template.departmentPrecalls?.[roleLabel];
            return (
              <div key={entry.person.id} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-zinc-100 last:border-0">
                <span className="text-xs text-zinc-800 truncate w-44 shrink-0">{entry.person.name}</span>
                <span className="text-[10px] text-zinc-400 truncate flex-1">{roleLabel}{precall ? ` · precall ${precall}` : ''}</span>
                <TimeField
                  value={day.meta.crewCalls?.find(c => c.personId === entry.person.id)?.callTime || ''}
                  resolvedTime={entry.callTime}
                  onChange={raw => setCall(entry.person.id, raw)}
                  onReset={() => setCall(entry.person.id, '')}
                  readOnly={readOnly}
                  placeholder={precall || 'call'}
                  className="w-28"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const CrewIcon = UsersRound;

export default CrewSection;
