/**
 * Image block resize math (roadmap 214) — pure so the pointer handler stays a
 * thin DOM shell and the clamps are unit-testable.
 *
 * Width is persisted as a PERCENT of the report content width, so the size
 * survives a page-geometry change (roadmap 160). Height stays px and is only
 * stored when the user has stretched the image freely (Shift); an aspect-locked
 * drag on a natural-height image leaves it unset (the browser keeps the ratio).
 */

export const IMAGE_MIN_WIDTH_PCT = 5;
/** The image box can never be wider than the content column. */
export const IMAGE_MAX_WIDTH_PCT = 100;
export const IMAGE_MIN_HEIGHT_PX = 20;
export const IMAGE_MAX_HEIGHT_PX = 3000;

export interface ImageResizeStart {
  /** Current persisted width percent (100 when unset). */
  widthPct: number;
  /** Current persisted explicit height, undefined = natural aspect ratio. */
  heightPx?: number;
  /** Rendered (layout px, not screen px) width at drag start. */
  startWidthPx: number;
  /** Rendered (layout px) height at drag start — also the natural height basis. */
  startHeightPx: number;
  /** Content width of the image's containing block, in layout px. */
  containerWidth: number;
}

export interface ImageResizeDelta {
  /** Pointer delta in LAYOUT px (screen delta ÷ the canvas zoom). */
  dx: number;
  dy: number;
  /** Shift = free stretch; otherwise the aspect ratio is locked. */
  free: boolean;
}

export interface ImageResizeResult {
  widthPct: number;
  /** undefined = natural height (clear any explicit height). */
  heightPx?: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export function resizeImageBlock(start: ImageResizeStart, delta: ImageResizeDelta): ImageResizeResult {
  const baseWidth = start.containerWidth > 0 ? start.containerWidth : 1;
  const widthPct = clamp(
    start.widthPct + (delta.dx / baseWidth) * 100,
    IMAGE_MIN_WIDTH_PCT,
    IMAGE_MAX_WIDTH_PCT,
  );

  if (delta.free) {
    // Free stretch: both axes move independently. A natural-height image gains
    // an explicit height the moment it is freely stretched.
    return {
      widthPct: round1(widthPct),
      heightPx: Math.round(clamp(start.startHeightPx + delta.dy, IMAGE_MIN_HEIGHT_PX, IMAGE_MAX_HEIGHT_PX)),
    };
  }

  // Aspect lock: a natural-height image keeps its ratio for free; an explicit
  // box scales its height by the same factor as the width.
  if (start.heightPx == null) return { widthPct: round1(widthPct) };
  const factor = start.widthPct > 0 ? widthPct / start.widthPct : 1;
  return {
    widthPct: round1(widthPct),
    heightPx: Math.round(clamp(start.heightPx * factor, IMAGE_MIN_HEIGHT_PX, IMAGE_MAX_HEIGHT_PX)),
  };
}
