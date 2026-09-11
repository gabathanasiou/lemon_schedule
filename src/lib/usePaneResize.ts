import { useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCurrentDocument } from './popoutTarget';

/**
 * Shared pane-resize drag session (roadmap 132). One implementation for every
 * resizable pane: pointer capture, the correct document in a pop-out window,
 * body `touch-action` lock for the gesture, and a clamped width. The handle may
 * sit on the pane's RIGHT edge (dragging right grows it) or LEFT edge (dragging
 * left grows it — the right-docked preview pane).
 */
export function usePaneResize({ width, min, max, edge, onChange }: {
  width: number;
  min: number;
  max: number;
  edge: 'left' | 'right';
  onChange: (w: number) => void;
}): (e: ReactPointerEvent<HTMLElement>) => void {
  const doc = useCurrentDocument();
  return useCallback((e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const d = doc || window.document;
    const startX = e.clientX;
    const startW = width;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.touchAction = 'none';
    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const delta = edge === 'left' ? startX - ev.clientX : ev.clientX - startX;
      onChange(Math.max(min, Math.min(max, startW + delta)));
    };
    const onUp = () => {
      d.removeEventListener('pointermove', onMove);
      d.removeEventListener('pointerup', onUp);
      document.body.style.touchAction = prevTouchAction;
    };
    d.addEventListener('pointermove', onMove);
    d.addEventListener('pointerup', onUp);
  }, [doc, width, min, max, edge, onChange]);
}
