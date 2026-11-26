/**
 * Image block placement (roadmap 366) — the pure half of the Photoshop-style
 * 3×3 anchor grid.
 *
 * - X = where the percent-width box sits in the content column (and therefore
 *   which edge stays fixed while resizing: left, both, right).
 * - Y = the content anchor inside an explicit-height box (`object-position`):
 *   Cover picks the crop, Contain moves the letterboxed image. With auto height
 *   there is no box to anchor inside, so it is not applied.
 */

export type ImageAlign = 'left' | 'center' | 'right';
export type ImageAnchorY = 'top' | 'center' | 'bottom';

export const IMAGE_ALIGNS: readonly ImageAlign[] = ['left', 'center', 'right'];
export const IMAGE_ANCHOR_ROWS: readonly ImageAnchorY[] = ['top', 'center', 'bottom'];

/** CSS `object-position` for the selected anchor. */
export function imageObjectPosition(align: ImageAlign = 'left', anchorY: ImageAnchorY = 'center'): string {
  return `${align} ${anchorY}`;
}

/** The wrapper's auto-margin recipe for the box alignment. */
export function imageAlignStyle(align: ImageAlign = 'left'): { marginLeft: 'auto' | 0; marginRight: 'auto' | 0 } {
  if (align === 'right') return { marginLeft: 'auto', marginRight: 0 };
  if (align === 'center') return { marginLeft: 'auto', marginRight: 'auto' };
  return { marginLeft: 0, marginRight: 0 };
}

/**
 * Where the single resize handle lives for a given alignment, and how the
 * pointer delta maps to the width:
 * - left: handle bottom-right, dx as-is;
 * - right: handle bottom-left, dx inverted (the right edge is the anchor);
 * - center: handle bottom-right, dx doubled (the box grows both ways, so the
 *   dragged edge must move by the pointer delta).
 */
export function resizeHandleMode(align: ImageAlign = 'left'): {
  side: 'left' | 'right';
  flipX: boolean;
  scaleX: number;
} {
  if (align === 'right') return { side: 'left', flipX: true, scaleX: 1 };
  if (align === 'center') return { side: 'right', flipX: false, scaleX: 2 };
  return { side: 'right', flipX: false, scaleX: 1 };
}
