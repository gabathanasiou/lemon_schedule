import React from 'react';
import { Users } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import type { DayElementEntry } from '../../../../lib/dayView';
import { getLabel } from '../../../../lib/categories';
import { DAY_ALIGN, DAY_GROUP_ROW, DAY_TABLE, DAY_TABLE_WRAP, DAY_TD, DAY_TH } from '../tableStyles';

const CastElementsSection: React.FC<DaySectionProps> = ({ day, project }) => {
  const categoryLabel = (key: string) => getLabel(key, key, project.categoryLabels);
  const usedCategories = Object.keys(day.elements).filter(k => (day.elements[k] || []).length > 0);
  if (day.cast.length === 0 && usedCategories.length === 0) {
    return <p className="text-xs text-zinc-400">No cast or elements on this day.</p>;
  }

  const rows: { category: string; entries: DayElementEntry[] }[] = [];
  if (day.cast.length > 0) rows.push({ category: 'cast', entries: day.cast });
  for (const cat of usedCategories) rows.push({ category: cat, entries: day.elements[cat] || [] });

  return (
    <div className={DAY_TABLE_WRAP}>
      <table className={DAY_TABLE}>
        <thead>
          <tr className="border-b border-zinc-200">
            <th className={`${DAY_TH} ${DAY_ALIGN.left}`}>Name</th>
            <th className={`${DAY_TH} ${DAY_ALIGN.right} w-20`}>Scene</th>
            <th className={`${DAY_TH} ${DAY_ALIGN.right} w-16`}>Call</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(group => (
            <React.Fragment key={group.category}>
              <tr className={DAY_GROUP_ROW}>
                <td colSpan={3} className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {categoryLabel(group.category)} <span className="text-zinc-400">({group.entries.length})</span>
                </td>
              </tr>
              {group.entries.map(entry => (
                <tr key={`${group.category}-${entry.key}`} className="even:bg-zinc-50/60 hover:bg-zinc-100">
                  <td className={`${DAY_TD} ${DAY_ALIGN.left} text-xs text-zinc-800`}>{entry.boardId ? `${entry.boardId}. ${entry.name}` : entry.name}</td>
                  <td className={`${DAY_TD} ${DAY_ALIGN.right} text-xs text-zinc-500 tabular-nums`}>{entry.firstScene}</td>
                  <td className={`${DAY_TD} ${DAY_ALIGN.right} text-xs text-zinc-800 tabular-nums`}>{entry.firstCallTime || '—'}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const CastElementsIcon = Users;

export default CastElementsSection;
