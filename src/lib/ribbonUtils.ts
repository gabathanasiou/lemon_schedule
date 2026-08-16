import React from 'react';
import { RibbonCell } from '../types';
import type { CellBorders } from './persist';
import { getFieldValue, getFieldValueFromSample } from './ribbonDefaults';

export interface FieldDef {
  key: string;
  label: string;
  defaultWidth: number;
  align: 'left' | 'center' | 'right';
  category: string;
  defaultPrefix?: string;
  defaultSuffix?: string;
  defaultWrap?: boolean;
  defaultTruncation?: boolean;
}

export const ALL_FIELDS: FieldDef[] = [
  { key: 'sceneNumber', label: 'Scene #',   defaultWidth: 8, align: 'center', category: 'Scene Info', defaultPrefix: 'Sc', defaultTruncation: false },
  { key: 'callTime',    label: 'Call Time',  defaultWidth: 7, align: 'left',   category: 'Shooting' },
  { key: 'duration',    label: 'Duration',   defaultWidth: 7, align: 'left',   category: 'Shooting' },
  { key: 'intExt',      label: 'I/E',        defaultWidth: 9.74, align: 'left',   category: 'Shooting' },
  { key: 'set',         label: 'Set',        defaultWidth: 28, align: 'left',   category: 'Shooting' },
  { key: 'dayNight',    label: 'D/N',        defaultWidth: 9, align: 'left',   category: 'Shooting' },
  { key: 'cast',        label: 'Cast',       defaultWidth: 16.05,align: 'left',   category: 'Cast & Talent', defaultPrefix: 'Cast', defaultWrap: true },
  { key: 'pageCount',   label: 'Pages',      defaultWidth: 11, align: 'left',   category: 'Scene Info', defaultSuffix: 'pgs' },
  { key: 'sheetNumber',  label: 'Sheet #',    defaultWidth: 8, align: 'center', category: 'Scene Info', defaultPrefix: 'Sheet' },
  { key: 'description', label: 'Synopsis',   defaultWidth: 81.38,align: 'left',   category: 'Scene Info', defaultPrefix: 'Desc' },
  { key: 'scriptDay',   label: 'Script Day', defaultWidth: 11.46,align: 'left',   category: 'Production', defaultPrefix: 'SD' },
  { key: 'notes',       label: 'Notes',      defaultWidth: 22.92,align: 'left',   category: 'Production', defaultPrefix: 'Nt' },
  { key: 'backgroundActors', label: 'Background Actors', defaultWidth: 17.19,align: 'left', category: 'Cast & Talent', defaultPrefix: 'BG' },
  { key: 'stunts',      label: 'Stunts',     defaultWidth: 17.19,align: 'left',   category: 'Cast & Talent', defaultPrefix: 'St' },
  { key: 'vehicles',    label: 'Vehicles',   defaultWidth: 17.19,align: 'left',   category: 'Breakdown', defaultPrefix: 'Veh' },
  { key: 'props',       label: 'Props',      defaultWidth: 17.19,align: 'left',   category: 'Breakdown', defaultPrefix: 'Pr' },
  { key: 'wardrobe',    label: 'Wardrobe',   defaultWidth: 17.19,align: 'left',   category: 'Breakdown', defaultPrefix: 'Ward' },
  { key: 'makeup',      label: 'Makeup',     defaultWidth: 17.19,align: 'left',   category: 'Breakdown', defaultPrefix: 'M/U' },
  { key: 'sfx',         label: 'SFX',        defaultWidth: 17.19,align: 'left',   category: 'VFX & Audio' },
  { key: 'vfx',         label: 'VFX',        defaultWidth: 17.19,align: 'left',   category: 'VFX & Audio' },
  { key: 'sound',       label: 'Sound',      defaultWidth: 17.19,align: 'left',   category: 'VFX & Audio', defaultPrefix: 'Snd' },
  { key: 'music',       label: 'Music',      defaultWidth: 17.19,align: 'left',   category: 'VFX & Audio', defaultPrefix: 'Mus' },
  { key: 'animalsAndWranglers', label: 'Animals & Wranglers', defaultWidth: 17.19,align: 'left', category: 'Misc', defaultPrefix: 'Anim' },
  { key: 'weapons',     label: 'Weapons',    defaultWidth: 17.19,align: 'left',   category: 'Misc', defaultPrefix: 'Wpn' },
  { key: 'greenery',    label: 'Greenery',   defaultWidth: 17.19,align: 'left',   category: 'Misc', defaultPrefix: 'Grn' },
  { key: 'artDept',     label: 'Art Dept',   defaultWidth: 17.19,align: 'left',   category: 'Misc', defaultPrefix: 'Art' },
  { key: 'text',        label: 'Text',        defaultWidth: 28.65,align: 'left',   category: 'Special' },
];

export const FIELD_MAP = Object.fromEntries(ALL_FIELDS.map(f => [f.key, f])) as Record<string, FieldDef>;
export const CATEGORIES = [...new Set(ALL_FIELDS.map(f => f.category))];

export function getAlign(cell?: RibbonCell): React.CSSProperties['textAlign'] {
  if (cell?.align) return cell.align;
  return (FIELD_MAP[cell?.field || '']?.align as React.CSSProperties['textAlign']) || 'left';
}

export function getRibbonCellBaseStyle(cell: RibbonCell, cellPaddingV?: number, cellPaddingH?: number, span = 1): React.CSSProperties {
  const va = cell.verticalAlign;
  const multiRow = span > 1;
  const cpv = cellPaddingV ?? 6;
  const cph = cellPaddingH ?? 6;
  return {
    minWidth: 0,
    padding: multiRow ? `0px ${cph}px` : `${cpv}px ${cph}px`,
    overflow: multiRow || cell.wrap ? 'visible' : 'hidden',
    textAlign: getAlign(cell),
    display: 'flex',
    flexDirection: 'column',
    justifyContent: va === 'top' ? 'flex-start' : va === 'bottom' ? 'flex-end' : 'center',
    alignSelf: 'stretch',
    textTransform: cell.field === 'set' ? 'uppercase' : 'none',
    fontWeight: cell.field === 'sceneNumber' ? 700 : 500,
    fontSize: '8pt',
    lineHeight: multiRow ? `calc(8pt * 1.1 + ${cpv * 2}px)` : 1.1,
    fontFamily: 'Helvetica, sans-serif',
  };
}

export function getRibbonTextWrapStyle(cell: RibbonCell, span = 1, _cellPadding?: number): React.CSSProperties {
  if (cell.overflowVisible) {
    return {
      whiteSpace: 'nowrap',
      overflow: 'visible',
    };
  }
  if (cell.truncation === false) {
    return {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
    };
  }
  if (cell.wrap) {
    return {
      whiteSpace: 'normal',
      overflow: 'visible',
      overflowWrap: 'break-word',
    };
  }
  if (span > 1) {
    return {
      display: '-webkit-box',
      WebkitLineClamp: span,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
      whiteSpace: 'normal',
      overflowWrap: 'break-word',
    } as React.CSSProperties;
  }
  return {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}

export function formatCellText(prefix: string | undefined, value: string | undefined, suffix: string | undefined): string {
  const p = prefix || '';
  const v = value || '';
  const s = suffix || '';
  return `${p}${p && v ? ' ' : ''}${v}${s && v ? ' ' : ''}${s}`;
}

/** The sample strip trio (INT DAY / EXT DAY / INT NIGHT) used by the ribbon
 *  designer's live preview, the print-dialog dummy, and the reports ribbon
 *  block's empty-schedule preview. One source of truth. */
export const PREVIEW_SAMPLES = [
  { intExt: 'INT', dayNight: 'DAY', sceneNumber: '5' },
  { intExt: 'EXT', dayNight: 'DAY', sceneNumber: '12' },
  { intExt: 'INT', dayNight: 'NIGHT', sceneNumber: '20A' },
];

export interface RibbonSampleOptions {
  /** Enable sample-value / field-label fallbacks (designer canvas + preview). */
  sample?: boolean;
  /** Custom category labels (key → label) for the italic label fallback. */
  customFieldLabels?: Record<string, string>;
}

export interface RibbonDisplayValue {
  /** Final display text — affixes applied when a real/sample value exists. */
  text: string;
  /** True when the text is a real (or static-text/sample) value — normal
   *  weight, full opacity. False = the italic, dimmed field-label fallback. */
  isValue: boolean;
}

/** One source for ribbon cell display text (LivePreview pattern): real value
 *  → sample value (`getFieldValueFromSample`, sample sceneNumber included) →
 *  field label (`FIELD_MAP`/`customFieldLabels`) in italic + reduced opacity.
 *  Affixes only apply when a value exists (real or sample). Static text cells
 *  render their textContent. Print never enables `sample`. */
export function ribbonCellDisplayValue(
  cell: RibbonCell,
  scene: Record<string, any> | null,
  opts?: RibbonSampleOptions,
): RibbonDisplayValue {
  if (!cell.field) {
    const t = cell.textContent || '';
    return { text: t, isValue: !!t };
  }
  const real = scene ? getFieldValue(cell.field, scene) : '';
  if (real) return { text: formatCellText(cell.prefix, real, cell.suffix), isValue: true };
  if (opts?.sample) {
    const sampleVal = getFieldValueFromSample(cell.field);
    if (sampleVal) return { text: formatCellText(cell.prefix, sampleVal, cell.suffix), isValue: true };
    const label = FIELD_MAP[cell.field]?.label || opts.customFieldLabels?.[cell.field] || '';
    if (label) return { text: label, isValue: false };
  }
  return { text: '', isValue: false };
}

export function getCellBorderProps(borders: CellBorders | undefined, textColor: string, isLastInRow: boolean, isLastRow: boolean): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (!borders || borders === 'none') return style;
  if ((borders === 'vertical' || borders === 'both') && !isLastInRow) {
    style.borderRight = `1px solid ${textColor}`;
  }
  if ((borders === 'horizontal' || borders === 'both') && !isLastRow) {
    style.borderBottom = `1px solid ${textColor}`;
  }
  return style;
}

export function getNoteBreakPad(cellPaddingV: number, ribbonRowCount: number): number {
  return cellPaddingV * ribbonRowCount + 6 * (ribbonRowCount - 1);
}

// ── Re-exports (split modules) ──
export type { MergeGroup } from './mergeGroups';
export { computeMergeGroups, getMergeLookup, mergeSiblingIds } from './mergeGroups';
export {
  INT_EXT_OPTIONS, DAY_NIGHT_OPTIONS,
  getIntExtOptions, getDayNightOptions,
  sceneMatchesRule, resolveSceneColor, sceneStyle, getDefaultSceneColors,
  DEFAULT_COLOR_PALETTE, getFallbackStripColors, getSelectedStripColors,
  getDayHeaderColors, getDayFooterColors, getNoteBannerColors,
} from './sceneColors';
export {
  SAMPLE, INT_EXT, DAY_NIGHT, MIN_PCT, cid,
  getFieldValue, getFieldValueFromSample, renderCellText, normalizeColWidths,
  getDefaultColWidths, getDefaultRibbonRows, getDefaultRibbonDesign, getCustomFieldDefs,
} from './ribbonDefaults';
