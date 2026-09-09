import React from 'react';
import { Clapperboard } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { formatDuration } from '../../../../lib/utils';
import { getFieldItems } from '../../../../lib/categories';
import { sceneStyle, getFallbackStripColors } from '../../../../lib/sceneColors';

const TH = 'text-[10px] font-semibold text-zinc-500 uppercase tracking-wider text-left px-2 py-1.5 whitespace-nowrap';
const TD = 'px-2 py-1 align-middle';

const ScenesSection: React.FC<DaySectionProps> = ({ day, project, actions }) => {
  if (day.scenes.length === 0) {
    return <p className="text-xs text-zinc-400">No scenes scheduled on this day.</p>;
  }

  return (
    <div className="rounded-lg border border-zinc-200 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50">
            <th className={`${TH} w-16`}>Scene</th>
            <th className={TH}>Set</th>
            <th className={TH}>Description</th>
            <th className={TH}>Cast</th>
            <th className={`${TH} w-12 text-right`}>Pages</th>
            <th className={`${TH} w-14 text-right`}>Dur</th>
            <th className={`${TH} w-14 text-right`}>Call</th>
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
                className="border-b border-zinc-100 last:border-0 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <td className={TD}>
                  <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold" style={color}>
                    {scene?.sceneNumber || '—'}
                  </span>
                </td>
                <td className={`${TD} text-xs text-zinc-600 whitespace-nowrap`}>{scene?.intExt} {scene?.set || ''}</td>
                <td className={`${TD} text-xs text-zinc-600 max-w-[26rem] truncate`}>{scene?.description || ''}</td>
                <td className={`${TD} text-[11px] text-zinc-500 max-w-[18rem] truncate`}>{castIds.join(', ')}</td>
                <td className={`${TD} text-xs text-zinc-500 text-right whitespace-nowrap`}>{scene?.pageCount || ''}</td>
                <td className={`${TD} text-xs text-zinc-500 text-right whitespace-nowrap`}>{formatDuration(entry.row.estimatedDuration || 0)}</td>
                <td className={`${TD} text-xs text-zinc-800 text-right whitespace-nowrap`}>{entry.callTime || '—'}</td>
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
