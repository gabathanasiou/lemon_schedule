import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { getCallTimeSettings } from '../../../../lib/callTimes';
import { CAT_ICONS, getCustomIcon, getLabel } from '../../../../lib/categories';
import DayTimesGlide from '../DayTimesGlide';

/**
 * Call Times (item 99/101): one embedded Day Times Glide grid per element
 * category present on the day (Cast first, then the rest), matching the old
 * per-category table layout. Every cell writes `daybreakMeta.elementCalls`
 * through the shared `setElementCall` path, so this card and Copy-from-day
 * stay in sync.
 */
const CallTimesSection: React.FC<DaySectionProps> = ({ day, project, patchMeta, readOnly }) => {
  const settings = useMemo(() => getCallTimeSettings(project), [project]);

  const presentCategories = useMemo(() => {
    const cats: string[] = [];
    if (day.cast.length) cats.push('cast');
    for (const k of Object.keys(day.elements)) if ((day.elements[k] || []).length) cats.push(k);
    return cats.filter(c => (settings.categoryStages[c] || []).length > 0);
  }, [day, settings]);

  const categoryLabel = (key: string) => getLabel(key, key, project.categoryLabels);
  const iconFor = (key: string) => {
    const custom = (project.customCategories || []).find(c => c.key === key);
    if (custom?.icon) return getCustomIcon(custom.icon);
    return CAT_ICONS[key] || Clock;
  };

  if (presentCategories.length === 0) {
    return <p className="text-xs text-zinc-400">No elements on this day.</p>;
  }

  return (
    <div className="space-y-4">
      {presentCategories.map(category => {
        const Icon = iconFor(category);
        const entries = category === 'cast' ? day.cast : (day.elements[category] || []);
        return (
          <div key={category} className="rounded-lg border border-zinc-200 overflow-hidden bg-white">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 border-b border-zinc-200">
              <Icon className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-[11px] font-semibold text-zinc-700">{categoryLabel(category)}</span>
              <span className="text-[10px] text-zinc-400">{entries.length}</span>
              <span className="ml-auto text-[10px] text-zinc-400">7:30 · 730 · -1h</span>
            </div>
            <DayTimesGlide
              day={day}
              category={category}
              patchMeta={patchMeta}
              project={project}
              readOnly={readOnly}
            />
          </div>
        );
      })}
      <p className="text-[11px] text-zinc-400">
        Calculated from Call Times settings · override a cell to pin it (amber).
      </p>
    </div>
  );
};

export const CallTimesIcon = Clock;

export default CallTimesSection;
