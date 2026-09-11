import React from 'react';
import type { DayView } from '../../../lib/dayView';
import type { Project } from '../../../types';
import { sceneStyle, getFallbackStripColors } from '../../../lib/sceneColors';

/**
 * Row-hover tooltip for the call-time grids (item 115): a compact "mini ribbon"
 * naming the element's FIRST scene of the day — heading (INT. SET — NIGHT),
 * first turnover, the element's category and whether its call is overridden.
 * Shared by `DayTimesGlide` via `InlineGlideTable`'s `rowTooltip` seam.
 */
export interface FirstSceneTooltipProps {
  project: Project;
  day: DayView;
  /** 1-based index into `day.scenes`. */
  firstScene: number;
  /** The element's first call time for the day (resolved). */
  callTime: string;
  /** Display name — e.g. "1. GEORGE". */
  title: string;
  /** Category label — e.g. "Cast", "Props". */
  categoryLabel?: string;
  /** True when this element's call time is manually overridden. */
  overridden?: boolean;
}

const FirstSceneTooltip: React.FC<FirstSceneTooltipProps> = ({ project, day, firstScene, callTime, title, categoryLabel, overridden }) => {
  const scene = day.scenes[firstScene - 1]?.scene;
  const style = scene
    ? sceneStyle(scene, project.colorPalette?.sceneColors, getFallbackStripColors(project.colorPalette), project.colorPalette?.colorRules)
    : undefined;

  return (
    <div data-testid="first-scene-tooltip" className="w-64 rounded overflow-hidden shadow-xl border border-zinc-700 bg-zinc-900 text-white">
      {scene && (
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide" style={{ background: style?.background, color: style?.color }}>
          {scene.sceneNumber ? `${scene.sceneNumber}. ` : ''}{[scene.intExt, scene.set].filter(Boolean).join('. ')}{scene.dayNight ? ` — ${scene.dayNight}` : ''}
        </div>
      )}
      <div className="px-2.5 py-1.5 space-y-0.5">
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-zinc-400">{title}</span>
          {categoryLabel && <span className="text-zinc-500">· {categoryLabel}</span>}
          {overridden && <span className="font-semibold text-amber-400">OVERRIDE</span>}
        </div>
        <div className="text-[11px]">
          <span className="text-zinc-400">FIRST TURNOVER </span>
          <span className="font-semibold">{callTime || '—'}</span>
        </div>
        {scene?.description && <div className="text-[10px] leading-snug text-zinc-400 line-clamp-3">{scene.description}</div>}
      </div>
    </div>
  );
};

export default FirstSceneTooltip;
