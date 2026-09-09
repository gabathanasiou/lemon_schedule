import React from 'react';
import { Clapperboard } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { formatDuration } from '../../../../lib/utils';
import { getFieldItems } from '../../../../lib/categories';
import { sceneStyle, getFallbackStripColors } from '../../../../lib/sceneColors';
import { DAY_ALIGN, DAY_TABLE, DAY_TABLE_WRAP, DAY_TD, DAY_TH } from '../tableStyles';

const ScenesSection: React.FC<DaySectionProps> = ({ day, project, actions }) => {
  if (day.scenes.length === 0) {
    return <p className="text-xs text-zinc-400">No scenes scheduled on this day.</p>;
  }

  return (
    <div className={DAY_TABLE_WRAP}>
      <table className={DAY_TABLE}>
        <thead>
          <tr className="border-b border-zinc-200">
            <th className={`${DAY_TH} ${DAY_ALIGN.left} w-16`}>Scene</th>
            <th className={`${DAY_TH} ${DAY_ALIGN.left}`}>Set</th>
            <th className={`${DAY_TH} ${DAY_ALIGN.left}`}>Description</th>
            <th className={`${DAY_TH} ${DAY_ALIGN.left}`}>Cast</th>
            <th className={`${DAY_TH} ${DAY_ALIGN.right} w-12`}>Pages</th>
            <th className={`${DAY_TH} ${DAY_ALIGN.right} w-14`}>Dur</th>
            <th className={`${DAY_TH} ${DAY_ALIGN.right} w-14`}>Call</th>
          </tr>
        </thead>
        <tbody>
          {day.scenes.map(entry => {
            const scene = entry.scene;
            const castIds = getFieldItems('cast', scene?.cast || '');
            const color = sceneStyle(scene, project.colorPalette?.sceneColors, getFallbackStripColors(project.colorPalette), project.colorPalette?.colorRules);
            return (
              <tr
                key={entry.row.id}
                onClick={() => scene && actions.openScene?.(scene.id)}
                className="even:bg-zinc-50/60 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <td className={`${DAY_TD} ${DAY_ALIGN.left}`}>
                  <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold" style={color}>
                    {scene?.sceneNumber || '—'}
                  </span>
                </td>
                <td className={`${DAY_TD} ${DAY_ALIGN.left} text-xs text-zinc-600 whitespace-nowrap`}>{scene?.intExt} {scene?.set || ''}</td>
                <td className={`${DAY_TD} ${DAY_ALIGN.left} text-xs text-zinc-600 max-w-[26rem] truncate`}>{scene?.description || ''}</td>
                <td className={`${DAY_TD} ${DAY_ALIGN.left} text-[11px] text-zinc-500 max-w-[18rem] truncate`}>{castIds.join(', ')}</td>
                <td className={`${DAY_TD} ${DAY_ALIGN.right} text-xs text-zinc-500 whitespace-nowrap`}>{scene?.pageCount || ''}</td>
                <td className={`${DAY_TD} ${DAY_ALIGN.right} text-xs text-zinc-500 whitespace-nowrap`}>{formatDuration(entry.row.estimatedDuration || 0)}</td>
                <td className={`${DAY_TD} ${DAY_ALIGN.right} text-xs text-zinc-800 whitespace-nowrap`}>{entry.callTime || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export const ScenesIcon = Clapperboard;

export default ScenesSection;
