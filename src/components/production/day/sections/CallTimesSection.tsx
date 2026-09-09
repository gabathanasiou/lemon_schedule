import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { getCallTimeSettings } from '../../../../lib/callTimes';
import { CAT_ICONS, getCustomIcon, getLabel } from '../../../../lib/categories';
import type { DayElementEntry } from '../../../../lib/dayView';
import DayTimesGlide from '../DayTimesGlide';
import { DAY_ALIGN, DAY_TABLE, DAY_TABLE_WRAP, DAY_TD, DAY_TH } from '../tableStyles';

/**
 * Call Times (item 99/101/107): the single per-category element view on a day.
 * Categories WITH configured call stages render one Day Times Glide grid (ID |
 * Character | SWF | <stage columns>) — editable, the same stage chain the
 * call sheet prints. Categories WITHOUT stages still list their elements as a
 * read-only table (ID | Name | SWF | Scene | Call) so no breakdown category
 * disappears (roadmap 107): the SWF cell carries the element's DOOD-style
 * start/work/finish letter for the day, Scene + Call are its first appearance.
 */
const CallTimesSection: React.FC<DaySectionProps> = ({ day, project, patchMeta, readOnly }) => {
  const settings = useMemo(() => getCallTimeSettings(project), [project]);

  const presentCategories = useMemo(() => {
    const cats: string[] = [];
    if (day.cast.length) cats.push('cast');
    for (const k of Object.keys(day.elements)) if ((day.elements[k] || []).length) cats.push(k);
    return cats;
  }, [day]);

  const categoryLabel = (key: string) => getLabel(key, key, project.categoryLabels);
  const iconFor = (key: string) => {
    const custom = (project.customCategories || []).find(c => c.key === key);
    if (custom?.icon) return getCustomIcon(custom.icon);
    return CAT_ICONS[key] || Clock;
  };

  if (presentCategories.length === 0) {
    return <p className="text-xs text-zinc-400">No elements on this day.</p>;
  }

  const entryName = (e: DayElementEntry) => (e.boardId ? `${e.boardId}. ${e.name}` : e.name);
  const swfTone = (letter: string) => {
    if (!letter) return '';
    if (letter.includes('S') || letter.includes('F')) return 'bg-zinc-100 text-zinc-500';
    return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
  };

  return (
    <div className="space-y-4">
      {presentCategories.map(category => {
        const Icon = iconFor(category);
        const stageKeys = settings.categoryStages[category] || [];
        const stageDefs = settings.stages.filter(s => stageKeys.includes(s.key));
        const entries: DayElementEntry[] = category === 'cast' ? day.cast : (day.elements[category] || []);
        return (
          <div key={category} className="rounded-lg border border-zinc-200 overflow-hidden bg-white">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 border-b border-zinc-200">
              <Icon className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-[11px] font-semibold text-zinc-700">{categoryLabel(category)}</span>
              <span className="text-[10px] text-zinc-400">{entries.length}</span>
              {stageDefs.length > 0
                ? <span className="ml-auto text-[10px] text-zinc-400">7:30 · 730 · -1h</span>
                : <span className="ml-auto text-[10px] text-zinc-400">no call stages — DOOD + first scene</span>}
            </div>
            {stageDefs.length > 0 ? (
              <DayTimesGlide
                day={day}
                category={category}
                patchMeta={patchMeta}
                project={project}
                readOnly={readOnly}
              />
            ) : (
              <div className={DAY_TABLE_WRAP}>
                <table className={DAY_TABLE}>
                  <thead>
                    <tr className="border-b border-zinc-200">
                      <th className={`${DAY_TH} ${DAY_ALIGN.left} w-16`}>ID</th>
                      <th className={`${DAY_TH} ${DAY_ALIGN.left}`}>Name</th>
                      <th className={`${DAY_TH} ${DAY_ALIGN.center} w-16`} title="DOOD: S first work day · W in between · F last · combos">SWF</th>
                      <th className={`${DAY_TH} ${DAY_ALIGN.right} w-16`}>Scene</th>
                      <th className={`${DAY_TH} ${DAY_ALIGN.right} w-20`}>Call</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(entry => (
                      <tr key={entry.key} className="even:bg-zinc-50/60">
                        <td className={`${DAY_TD} ${DAY_ALIGN.left} text-xs text-zinc-400 tabular-nums`}>{entry.boardId || ''}</td>
                        <td className={`${DAY_TD} ${DAY_ALIGN.left} text-xs text-zinc-800`}>{entryName(entry)}</td>
                        <td className={`${DAY_TD} ${DAY_ALIGN.center}`}>
                          <span className={`inline-block min-w-7 px-1 py-0.5 rounded text-[10px] font-semibold text-center tabular-nums ${swfTone(entry.dood)}`}>
                            {entry.dood || '—'}
                          </span>
                        </td>
                        <td className={`${DAY_TD} ${DAY_ALIGN.right} text-xs text-zinc-500 tabular-nums`}>{entry.firstScene}</td>
                        <td className={`${DAY_TD} ${DAY_ALIGN.right} text-xs text-zinc-700 tabular-nums`}>{entry.firstCallTime || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-zinc-400">
        Categories with call stages show the editable chain (override a cell to pin it — amber). Categories without
        stages list each element with its DOOD start/work/finish letter and first scene + call time.
      </p>
    </div>
  );
};

export const CallTimesIcon = Clock;

export default CallTimesSection;
