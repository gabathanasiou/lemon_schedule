import React from 'react';
import { Clapperboard } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { formatDuration } from '../../../../lib/utils';

const HEAD = 'text-[10px] font-semibold text-zinc-500 uppercase tracking-wider text-left px-2 py-1';

const ScenesSection: React.FC<DaySectionProps> = ({ day, actions }) => {
  if (day.scenes.length === 0) {
    return <p className="text-xs text-zinc-400">No scenes scheduled on this day.</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-zinc-200">
            <th className={HEAD}>Scene</th>
            <th className={HEAD}>Set</th>
            <th className={HEAD}>Description</th>
            <th className={`${HEAD} text-right`}>Pages</th>
            <th className={`${HEAD} text-right`}>Dur</th>
            <th className={`${HEAD} text-right`}>Call</th>
          </tr>
        </thead>
        <tbody>
          {day.scenes.map(entry => (
            <tr
              key={entry.row.id}
              onClick={() => entry.scene && actions.openScene?.(entry.scene.id)}
              className="border-b border-zinc-100 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <td className="px-2 py-1 text-xs font-semibold text-zinc-800 whitespace-nowrap">{entry.scene?.sceneNumber || '—'}</td>
              <td className="px-2 py-1 text-xs text-zinc-600 whitespace-nowrap">{entry.scene?.intExt} {entry.scene?.set || ''}</td>
              <td className="px-2 py-1 text-xs text-zinc-600 max-w-[28rem] truncate">{entry.scene?.description || ''}</td>
              <td className="px-2 py-1 text-xs text-zinc-500 text-right whitespace-nowrap">{entry.scene?.pageCount || ''}</td>
              <td className="px-2 py-1 text-xs text-zinc-500 text-right whitespace-nowrap">{formatDuration(entry.row.estimatedDuration || 0)}</td>
              <td className="px-2 py-1 text-xs text-zinc-800 text-right whitespace-nowrap">{entry.callTime || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const ScenesIcon = Clapperboard;

export default ScenesSection;
