import React from 'react';
import { FloatingTooltip } from './FloatingTooltip';

/**
 * "X is moving this" hint (roadmap 235): the soft lock refuses a right-click
 * (and other MOVE/REMOVE gestures) on an item a peer is currently dragging —
 * instead of a menu, this small chip appears at the click point for a moment.
 * The hint state + auto-hide timer live in `useStripboardContextMenu`.
 */
export function HeldItemHint({ hint }: { hint: { x: number; y: number; name: string } | null }) {
  if (!hint) return null;
  return (
    <FloatingTooltip open anchor={{ x: hint.x, y: hint.y }} followPointer={false}>
      <div className="bg-[var(--ui-panel-bg)] text-[color:var(--ui-text-strong)] text-[11px] rounded shadow-xl whitespace-nowrap leading-relaxed px-2.5 py-1.5">
        {hint.name} is moving this
      </div>
    </FloatingTooltip>
  );
}
