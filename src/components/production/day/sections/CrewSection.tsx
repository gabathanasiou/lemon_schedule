import React, { useCallback, useMemo } from 'react';
import { AlertTriangle, UsersRound } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import CrewRosterEditor from '../CrewRosterEditor';
import { excludedDeptsForDay, slotsForDay } from '../../../../lib/dayCrew';
import { crewLinkWarnings, crewNameMap, targetLabelForLink } from '../../../../lib/crewLinks';
import Button from '../../../Button';

/**
 * Crew (item 146): the day's crew roster as department blocks — one slot per
 * role, a person dropdown, a call box that survives switching the person, a
 * department include toggle and pre-call anchor, and Add role / Add crew
 * member. Writes `daybreakMeta.crewSlots` / `excludedCrewDepts` /
 * `departmentPrecalls`; the effective list derives from the project template
 * until the day is customized.
 */
const CrewSection: React.FC<DaySectionProps> = ({ day, project, patchMeta, readOnly, actions }) => {
  const template = project.crewTemplate || {};

  const slots = useMemo(() => day.meta.crewSlots ?? slotsForDay(project, day.meta), [day.meta, project]);
  const excluded = useMemo(() => excludedDeptsForDay(project, day.meta), [day.meta, project]);
  const effectivePrecalls = useMemo(
    () => ({ ...(template.departmentPrecalls || {}), ...(day.meta.departmentPrecalls || {}) }),
    [template.departmentPrecalls, day.meta.departmentPrecalls],
  );

  const setDeptPrecall = useCallback((dept: string, expr: string) => {
    const next = { ...(day.meta.departmentPrecalls || {}) };
    const value = expr.trim();
    if (value) next[dept] = value; else delete next[dept];
    patchMeta({ departmentPrecalls: Object.keys(next).length ? next : undefined });
  }, [day.meta.departmentPrecalls, patchMeta]);

  const applyTemplate = useCallback(() => {
    patchMeta({ crewSlots: undefined, excludedCrewDepts: undefined, departmentPrecalls: undefined });
  }, [patchMeta]);

  const hasCustomization = !!(day.meta.crewSlots || day.meta.excludedCrewDepts || day.meta.departmentPrecalls);

  const warnings = useMemo(() => {
    const dayCrewIds = new Set(day.crew.map(c => c.person.id));
    const nameById = crewNameMap(project);
    return crewLinkWarnings({
      links: project.crewLinks,
      dayCrewIds,
      crewName: id => nameById.get(id),
      targetLabel: link => targetLabelForLink(project, link),
      isElementOnDay: (cat, key) => {
        const list = cat === 'cast' ? day.cast : (day.elements[cat] || []);
        return list.some(e => e.key.toLowerCase() === key.toLowerCase());
      },
    });
  }, [day, project]);

  return (
    <div className="space-y-3" data-crew-section data-crew-calls>
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 flex-1">
          {day.crew.length > 0 ? `${day.crew.length} crew across ${day.crewGroups.filter(g => !g.excluded).length} departments` : 'No crew assigned'}
        </span>
        {!readOnly && hasCustomization && (
          <Button variant="subtle" onClick={applyTemplate} title="Reset this day to the project crew template">
            Apply template
          </Button>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="space-y-1" data-crew-link-warnings>
          {warnings.map((w, i) => (
            <div key={`${w.personId}-${w.category}-${w.targetKey}-${i}`} className="flex items-start gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      <CrewRosterEditor
        dataAttr="data-crew-roster"
        slots={slots}
        excludedDepts={excluded}
        effectivePrecalls={effectivePrecalls}
        templatePrecalls={template.departmentPrecalls || {}}
        dayCall={day.callTime}
        project={project}
        readOnly={readOnly}
        onSlotsChange={next => patchMeta({ crewSlots: next })}
        onExcludedChange={next => patchMeta({ excludedCrewDepts: next.length ? next : undefined })}
        onDeptPrecallChange={setDeptPrecall}
        onAddCrewMember={() => actions.openAddCrewMember?.()}
        onCreatePerson={(role, name, slotId) => actions.openAddCrewMember?.({ role, name, slotId })}
      />
    </div>
  );
};

export const CrewIcon = UsersRound;

export default CrewSection;
