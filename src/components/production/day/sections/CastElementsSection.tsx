import React from 'react';
import { Users } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import type { DayElementEntry } from '../../../../lib/dayView';
import { getLabel } from '../../../../lib/categories';

const Row: React.FC<{ entry: DayElementEntry }> = ({ entry }) => (
  <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-100 transition-colors">
    <span className="text-xs text-zinc-800 truncate flex-1 min-w-0">{entry.name}</span>
    <span className="text-[10px] text-zinc-400 shrink-0">Scene {entry.firstScene}</span>
    <span className="text-xs text-zinc-600 tabular-nums w-12 text-right shrink-0">{entry.firstCallTime || '—'}</span>
  </div>
);

const CastElementsSection: React.FC<DaySectionProps> = ({ day, project }) => {
  const categoryLabel = (key: string) => getLabel(key, key, project.categoryLabels);
  const usedCategories = Object.keys(day.elements).filter(k => (day.elements[k] || []).length > 0);
  if (day.cast.length === 0 && usedCategories.length === 0) {
    return <p className="text-xs text-zinc-400">No cast or elements on this day.</p>;
  }
  return (
    <div className="space-y-3">
      {day.cast.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 mb-1">Cast</div>
          {day.cast.map(e => <Row key={e.key} entry={e} />)}
        </div>
      )}
      {usedCategories.map(cat => (
        <div key={cat}>
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 mb-1">{categoryLabel(cat)}</div>
          {(day.elements[cat] || []).map(e => <Row key={e.key} entry={e} />)}
        </div>
      ))}
    </div>
  );
};

export const CastElementsIcon = Users;

export default CastElementsSection;
