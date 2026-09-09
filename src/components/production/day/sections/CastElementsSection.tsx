import React from 'react';
import { Users } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import type { DayElementEntry } from '../../../../lib/dayView';
import { getLabel } from '../../../../lib/categories';

const TH = 'text-[10px] font-semibold text-zinc-500 uppercase tracking-wider text-left px-2 py-1.5 whitespace-nowrap';
const TD = 'px-2 py-1 align-middle';

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
    <div className="rounded-lg border border-zinc-200 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50">
            <th className={TH}>Name</th>
            <th className={`${TH} w-20 text-right`}>Scene</th>
            <th className={`${TH} w-16 text-right`}>Call</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(group => (
            <React.Fragment key={group.category}>
              <tr className="bg-zinc-100/70">
                <td colSpan={3} className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
                  {categoryLabel(group.category)} <span className="text-zinc-400">({group.entries.length})</span>
                </td>
              </tr>
              {group.entries.map(entry => (
                <tr key={`${group.category}-${entry.key}`} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                  <td className={`${TD} text-xs text-zinc-800`}>{entry.boardId ? `${entry.boardId}. ${entry.name}` : entry.name}</td>
                  <td className={`${TD} text-xs text-zinc-500 text-right tabular-nums`}>{entry.firstScene}</td>
                  <td className={`${TD} text-xs text-zinc-800 text-right tabular-nums`}>{entry.firstCallTime || '—'}</td>
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
