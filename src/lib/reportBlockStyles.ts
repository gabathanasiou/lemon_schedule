import type { ReportBlock, ReportBlockStyle } from '../types';
import { REPORT_BORDER_COLOR } from './reportLook';
import { generateUUID } from './utils';

/**
 * Block-surface presets (roadmap 372) — fill + outline + padding for text,
 * field and title blocks. Presets are COPIED onto the block (`blockStylePatch`),
 * never linked: editing a preset never silently restyles existing blocks.
 */

/** Normalized surface — the values a preset stores/applies. */
export interface BlockSurface {
  background: string;
  border: boolean;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  paddingV: number;
  paddingH: number;
}

export const BUILTIN_BLOCK_STYLES: readonly ReportBlockStyle[] = [
  {
    id: 'builtin-black-bar',
    name: 'Black bar',
    background: '#000000',
    border: false,
    borderColor: REPORT_BORDER_COLOR,
    borderWidth: 1,
    borderRadius: 0,
    paddingV: 2,
    paddingH: 6,
  },
  {
    id: 'builtin-callout',
    name: 'Callout',
    background: '#f4f4f5',
    border: true,
    borderColor: '#a1a1aa',
    borderWidth: 1,
    borderRadius: 4,
    paddingV: 6,
    paddingH: 8,
  },
  {
    id: 'builtin-card',
    name: 'Card',
    background: '#ffffff',
    border: true,
    borderColor: REPORT_BORDER_COLOR,
    borderWidth: 1,
    borderRadius: 8,
    paddingV: 8,
    paddingH: 10,
  },
];

const styleSurface = (s: Pick<ReportBlockStyle, 'background' | 'border' | 'borderColor' | 'borderWidth' | 'borderRadius' | 'paddingV' | 'paddingH'>): BlockSurface => ({
  background: s.background ?? '',
  border: s.border ?? false,
  borderColor: s.borderColor ?? REPORT_BORDER_COLOR,
  borderWidth: s.borderWidth ?? 1,
  borderRadius: s.borderRadius ?? 0,
  paddingV: s.paddingV ?? 2,
  paddingH: s.paddingH ?? 4,
});

export function blockSurfaceOf(b: ReportBlock): BlockSurface {
  return styleSurface({
    background: b.background,
    border: b.border,
    borderColor: b.borderColor,
    borderWidth: b.borderWidth,
    borderRadius: b.borderRadius,
    paddingV: b.paddingV,
    paddingH: b.paddingH,
  });
}

/** Does the block's current surface equal this preset's? */
export function blockStyleMatches(b: ReportBlock, s: ReportBlockStyle): boolean {
  const a = blockSurfaceOf(b);
  const c = styleSurface(s);
  if (a.background !== c.background) return false;
  if (a.border !== c.border) return false;
  if (a.border && (a.borderColor !== c.borderColor || a.borderWidth !== c.borderWidth)) return false;
  return a.borderRadius === c.borderRadius && a.paddingV === c.paddingV && a.paddingH === c.paddingH;
}

/** The one patch that applies a preset (background undefined clears the fill). */
export function blockStylePatch(s: ReportBlockStyle): Partial<ReportBlock> {
  const surface = styleSurface(s);
  return {
    background: surface.background || undefined,
    border: surface.border,
    borderColor: surface.borderColor,
    borderWidth: surface.borderWidth,
    borderRadius: surface.borderRadius,
    paddingV: surface.paddingV,
    paddingH: surface.paddingH,
  };
}

/** Snapshot the block's current surface as a new named user preset. */
export function blockStyleFromBlock(name: string, b: ReportBlock): ReportBlockStyle {
  const surface = blockSurfaceOf(b);
  return {
    id: generateUUID(),
    name,
    background: surface.background || undefined,
    border: surface.border,
    borderColor: surface.borderColor,
    borderWidth: surface.borderWidth,
    borderRadius: surface.borderRadius,
    paddingV: surface.paddingV,
    paddingH: surface.paddingH,
  };
}
