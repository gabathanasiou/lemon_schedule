import { MIN_PCT } from './ribbonDefaults';

/**
 * Pure column-width math for the shared resize dragger (roadmap 367). The
 * persisted design must always be safe: no negative/non-finite widths, the
 * row keeps its total, and no pair can be pushed through the floor even when
 * the design already carries sub-floor widths.
 */

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Drag the boundary between `ci` and `ci + 1` — the pair keeps its total. */
export function resizeAdjacentWidths(
  sizes: readonly number[],
  ci: number,
  deltaPct: number,
  minPct: number = MIN_PCT,
): number[] {
  if (ci < 0 || ci + 1 >= sizes.length) return [...sizes];
  const curA = sizes[ci];
  const curB = sizes[ci + 1];
  const total = curA + curB;
  if (!Number.isFinite(total) || total <= 0) return [...sizes];
  // A pair already below 2× the floor can't honour it without inventing a
  // negative side — split what exists instead (the drag freezes, never breaks).
  const floor = Math.min(minPct, total / 2);
  const newA = Math.max(floor, Math.min(total - floor, curA + deltaPct));
  const out = [...sizes];
  out[ci] = round2(newA);
  out[ci + 1] = round2(total - newA);
  return out;
}

/**
 * Shift drag: grow/shrink the boundary while scaling every column to its right
 * proportionally. Floors are enforced, then the whole row is normalized back to
 * its original total so a clamped tail can never overflow the page.
 */
export function scaleRightWidths(
  sizes: readonly number[],
  ci: number,
  deltaPct: number,
  minPct: number = MIN_PCT,
): number[] {
  if (ci < 0 || ci + 1 >= sizes.length) return [...sizes];
  const curA = sizes[ci];
  const right = sizes.slice(ci + 1);
  const rightSum = right.reduce((s, w) => s + w, 0);
  const total = curA + rightSum;
  if (!Number.isFinite(total) || total <= 0 || !(rightSum > 0)) return [...sizes];
  const maxA = curA + rightSum - minPct * right.length;
  // Already below the floors: fall back to the pair rule’s safe split.
  if (maxA < minPct) return resizeAdjacentWidths(sizes, ci, deltaPct, minPct);
  const newA = Math.max(minPct, Math.min(maxA, curA + deltaPct));
  const remaining = total - newA;
  const scale = remaining / rightSum;
  const out = [newA, ...right.map(w => Math.max(minPct, w * scale))];
  // Floor clamping can leave the right side heavier than `remaining`; normalize
  // the WHOLE row to its original total, keeping every value positive.
  const sum = out.reduce((s, w) => s + w, 0);
  if (sum > 0) {
    const k = total / sum;
    for (let i = 0; i < out.length; i++) out[i] = round2(out[i] * k);
  }
  // Rounding can drift by a hundredth; put it on the widest column so the
  // persisted row still sums exactly to its total.
  const rounded = out.reduce((s, w) => s + w, 0);
  const diff = round2(total - rounded);
  if (diff !== 0) {
    const maxIdx = out.indexOf(Math.max(...out));
    out[maxIdx] = round2(out[maxIdx] + diff);
  }
  return out;
}
