import React from 'react';
import { Scene, RibbonCell, RibbonRow, RibbonDesign, CustomCategoryDef, SceneColorEntry, SceneColorPalette, IntExt, DayNight } from '../types';
import { formatDuration } from './utils';
import type { CellBorders } from './persist';

export interface MergeGroup {
  colIndex: number;
  rowIndex: number;
  field: string;
  span: number;
  direction: 'h' | 'v';
}

export function computeMergeGroups(rows: RibbonRow[]): MergeGroup[] {
  if (rows.length < 2 && rows.every(r => r.cells.length < 2)) return [];

  const horizontal: MergeGroup[] = [];
  const hOccupied = new Set<string>();

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    let runStart = -1;
    let runField = '';
    for (let ci = 0; ci < row.cells.length; ci++) {
      const field = row.cells[ci]?.field || '';
      if (field && field === runField) continue;
      if (runStart >= 0 && ci - runStart >= 2) {
        horizontal.push({ colIndex: runStart, rowIndex: ri, field: runField, span: ci - runStart, direction: 'h' });
        for (let cj = runStart; cj < ci; cj++) hOccupied.add(row.cells[cj].id);
      }
      runStart = field ? ci : -1;
      runField = field;
    }
    if (runStart >= 0 && row.cells.length - runStart >= 2) {
      horizontal.push({ colIndex: runStart, rowIndex: ri, field: runField, span: row.cells.length - runStart, direction: 'h' });
      for (let cj = runStart; cj < row.cells.length; cj++) hOccupied.add(row.cells[cj].id);
    }
  }

  const vertical: MergeGroup[] = [];
  const maxCols = Math.max(...rows.map(r => r.cells.length));
  for (let ci = 0; ci < maxCols; ci++) {
    let runStart = -1;
    let runField = '';
    for (let ri = 0; ri < rows.length; ri++) {
      const cell = rows[ri].cells[ci];
      const field = cell?.field || '';
      const blocked = hOccupied.has(cell?.id || '');
      if (field && !blocked && field === runField) continue;
      if (runStart >= 0 && ri - runStart >= 2) {
        vertical.push({ colIndex: ci, rowIndex: runStart, field: runField, span: ri - runStart, direction: 'v' });
      }
      runStart = (field && !blocked) ? ri : -1;
      runField = (field && !blocked) ? field : '';
    }
    if (runStart >= 0 && rows.length - runStart >= 2) {
      vertical.push({ colIndex: ci, rowIndex: runStart, field: runField, span: rows.length - runStart, direction: 'v' });
    }
  }

  return [...horizontal, ...vertical];
}

export function getMergeLookup(rows: RibbonRow[]): Map<string, { group: MergeGroup; isLead: boolean }> {
  const groups = computeMergeGroups(rows);
  const map = new Map<string, { group: MergeGroup; isLead: boolean }>();
  for (const g of groups) {
    if (g.direction === 'v') {
      const leadCell = rows[g.rowIndex]?.cells[g.colIndex];
      if (leadCell) map.set(leadCell.id, { group: g, isLead: true });
      for (let ri = g.rowIndex + 1; ri < g.rowIndex + g.span; ri++) {
        const cell = rows[ri]?.cells[g.colIndex];
        if (cell) map.set(cell.id, { group: g, isLead: false });
      }
    } else {
      const leadCell = rows[g.rowIndex]?.cells[g.colIndex];
      if (leadCell) map.set(leadCell.id, { group: g, isLead: true });
      for (let ci = g.colIndex + 1; ci < g.colIndex + g.span; ci++) {
        const cell = rows[g.rowIndex]?.cells[ci];
        if (cell) map.set(cell.id, { group: g, isLead: false });
      }
    }
  }
  return map;
}

export function mergeSiblingIds(cellId: string, rows: RibbonRow[]): string[] {
  const groups = computeMergeGroups(rows);
  for (const g of groups) {
    if (g.direction === 'v') {
      for (let ri = g.rowIndex; ri < g.rowIndex + g.span; ri++) {
        if (rows[ri]?.cells[g.colIndex]?.id === cellId) {
          const ids: string[] = [];
          for (let ri2 = g.rowIndex; ri2 < g.rowIndex + g.span; ri2++) {
            const c = rows[ri2]?.cells[g.colIndex];
            if (c) ids.push(c.id);
          }
          return ids;
        }
      }
    } else {
      for (let ci = g.colIndex; ci < g.colIndex + g.span; ci++) {
        if (rows[g.rowIndex]?.cells[ci]?.id === cellId) {
          const ids: string[] = [];
          for (let ci2 = g.colIndex; ci2 < g.colIndex + g.span; ci2++) {
            const c = rows[g.rowIndex]?.cells[ci2];
            if (c) ids.push(c.id);
          }
          return ids;
        }
      }
    }
  }
  return [cellId];
}

export const INT_EXT_OPTIONS: IntExt[] = ['INT', 'EXT', 'INT/EXT'];
export const DAY_NIGHT_OPTIONS: DayNight[] = ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'DAWN', 'DUSK'];

const SCENE_COLOR_FALLBACKS: Record<string, { background: string; color: string }> = {
  'INT|DAY':    { background: '#ffffff', color: '#000000' },
  'EXT|DAY':    { background: '#d7da50', color: '#000000' },
  'INT/EXT|DAY':   { background: '#00af2f', color: '#000000' },
  'INT|NIGHT':  { background: '#41a31a', color: '#ffffff' },
  'EXT|NIGHT':  { background: '#005c93', color: '#ffffff' },
  'INT/EXT|NIGHT': { background: '#00af2f', color: '#000000' },
  'INT|MORNING':  { background: '#ff9ca2', color: '#000000' },
  'EXT|MORNING':  { background: '#ff9ca2', color: '#000000' },
  'INT/EXT|MORNING': { background: '#00af2f', color: '#000000' },
  'INT|EVENING':  { background: '#ff9d25', color: '#000000' },
  'EXT|EVENING':  { background: '#ff9d25', color: '#000000' },
  'INT/EXT|EVENING': { background: '#00af2f', color: '#000000' },
  'INT|DAWN':   { background: '#ffffff', color: '#18181b' },
  'EXT|DAWN':   { background: '#ffffff', color: '#18181b' },
  'INT/EXT|DAWN':  { background: '#ffffff', color: '#18181b' },
  'INT|DUSK':   { background: '#ffffff', color: '#18181b' },
  'EXT|DUSK':   { background: '#ffffff', color: '#18181b' },
  'INT/EXT|DUSK':  { background: '#ffffff', color: '#18181b' },
};

const DEFAULT_FALLBACK = { background: '#ffffff', color: '#18181b' };

export function resolveSceneColor(intExt: string, dayNight: string, colorEntries?: SceneColorEntry[]): { background: string; color: string } {
  const ie = intExt.toUpperCase();
  const dn = dayNight.toUpperCase();
  if (colorEntries) {
    const match = colorEntries.find(e => e.intExt.toUpperCase() === ie && e.dayNight.toUpperCase() === dn);
    if (match) return { background: match.background, color: match.text };
  }
  return SCENE_COLOR_FALLBACKS[`${ie}|${dn}`] || DEFAULT_FALLBACK;
}

export function sceneStyle(scene?: Scene | null, colorEntries?: SceneColorEntry[]): React.CSSProperties {
  if (!scene) return DEFAULT_FALLBACK;
  return resolveSceneColor(scene.intExt || '', scene.dayNight || '', colorEntries);
}

export function getDefaultSceneColors(): SceneColorEntry[] {
  const entries: SceneColorEntry[] = [];
  for (const ie of INT_EXT_OPTIONS) {
    for (const dn of DAY_NIGHT_OPTIONS) {
      const key = `${ie}|${dn}`;
      const fb = SCENE_COLOR_FALLBACKS[key] || DEFAULT_FALLBACK;
      entries.push({ intExt: ie, dayNight: dn, background: fb.background, text: fb.color });
    }
  }
  return entries;
}

export const DEFAULT_COLOR_PALETTE: SceneColorPalette = {
  sceneColors: getDefaultSceneColors(),
  selectedStripBg: '#b20000',
  selectedStripText: '#ffffff',
  dayHeaderBg: '#000000',
  dayHeaderText: '#ffffff',
  noteBg: '#3f0000',
  noteText: '#ffffff',
};

export function getSelectedStripColors(palette?: SceneColorPalette): { background: string; color: string } {
  return palette ? { background: palette.selectedStripBg, color: palette.selectedStripText } : { background: '#b20000', color: '#ffffff' };
}

export function getDayHeaderColors(palette?: SceneColorPalette): { background: string; color: string } {
  return palette ? { background: palette.dayHeaderBg, color: palette.dayHeaderText } : { background: '#000000', color: '#ffffff' };
}

export function getNoteBannerColors(palette?: SceneColorPalette): { background: string; color: string } {
  return palette ? { background: palette.noteBg, color: palette.noteText } : { background: '#3f0000', color: '#ffffff' };
}

export interface FieldDef {
  key: string;
  label: string;
  defaultWidth: number;
  align: 'left' | 'center' | 'right';
  category: string;
  defaultPrefix?: string;
  defaultSuffix?: string;
  defaultWrap?: boolean;
}

export const ALL_FIELDS: FieldDef[] = [
  { key: 'sceneNumber', label: 'Scene #',   defaultWidth: 8, align: 'center', category: 'Scene Info', defaultPrefix: 'Sc' },
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

export function getAlign(cell?: RibbonCell): string {
  if (cell?.align) return cell.align;
  return FIELD_MAP[cell?.field || '']?.align || 'left';
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
  const multiRow = span > 1;
  if (multiRow && !cell.wrap) {
    return {
      display: '-webkit-box',
      WebkitLineClamp: span,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
      whiteSpace: 'normal',
      overflowWrap: 'break-word',
    } as React.CSSProperties;
  }
  if (cell.wrap) {
    return {
      display: 'block',
      whiteSpace: 'normal',
      overflow: 'visible',
      overflowWrap: 'break-word',
    };
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

export const SAMPLE: Record<string, string> = {
  sceneNumber: '5',
  callTime: '08:00',
  duration: '150',
  intExt: 'INT',
  set: 'KITCHEN',
  dayNight: 'DAY',
  cast: '1, 2, 4',
  pageCount: '2 3/8',
  sheetNumber: '1',
  description: 'John makes breakfast while arguing with Mary about the party.',
  scriptDay: '3',
  notes: 'Need breakfast props — call crafty.',
  backgroundActors: '20 BG',
  stunts: 'Stunt double: JOHN',
  vehicles: '2× police car',
  props: 'Frying pan, phone, mug',
  wardrobe: 'Casual: JOHN, Biz: MARY',
  makeup: 'Prosthetic scar: JOHN',
  sfx: 'Gunshot (off-screen)',
  vfx: 'Window replacement',
  sound: 'Dialogue cleanup',
  music: 'Track 5 — Morning Montage',
  animalsAndWranglers: '1× cat (orange tabby)',
  weapons: 'Prop knife (rubber)',
  greenery: 'Fake potted plants ×3',
  artDept: '1950s kitchen calendar, curtains',
};

export const INT_EXT: Record<string, string> = { INT: 'INT', EXT: 'EXT', 'INT/EXT': 'INT/EXT' };
export const DAY_NIGHT: Record<string, string> = { DAY: 'DAY', NIGHT: 'NIGHT', MORNING: 'MORNING', EVENING: 'EVENING', DAWN: 'DAWN', DUSK: 'DUSK' };

export const MIN_PCT = 2.5;

export function cid(): string {
  return `c${Math.random().toString(36).slice(2, 7)}`;
}

export function getFieldValue(field: string, scene: Record<string, any>): string {
  if (!field || !scene) return '';
  if (field === 'duration') {
    const v = scene.estimatedDuration;
    return v === 0 ? '↑' : v ? formatDuration(v) : '';
  }
  if (field === 'callTime') {
    return scene.computedCallTime || '';
  }
  if (field === 'intExt') return INT_EXT[scene.intExt] || scene.intExt || '';
  if (field === 'dayNight') return DAY_NIGHT[scene.dayNight] || scene.dayNight || '';
  if (field === 'pageCount') {
    const v = scene.pageCount;
    return v || '';
  }
  const v = scene[field];
  return v !== undefined && v !== null ? String(v) : '';
}

export function getFieldValueFromSample(field: string): string {
  if (!field) return '';
  const v = SAMPLE[field];
  if (field === 'duration') return v ? formatDuration(Number(v)) : '';
  if (field === 'intExt') return INT_EXT[v] || v || '';
  if (field === 'dayNight') return DAY_NIGHT[v] || v || '';
  if (field === 'pageCount') return v || '';
  return v || '';
}

export function renderCellText(scene: Record<string, any> | null, cell: RibbonCell): string {
  if (!cell.field && cell.textContent) return cell.textContent || '';
  if (!cell.field) return '';
  const val = scene ? getFieldValue(cell.field, scene) : getFieldValueFromSample(cell.field);
  return `${cell.prefix || ''}${val}${cell.suffix || ''}`;
}

export function normalizeColWidths(widths: number[]): number[] {
  if (widths.length === 0) return widths;
  const sum = widths.reduce((s, w) => s + w, 0);
  if (Math.abs(sum - 100) < 0.01) return widths;
  const scale = 100 / sum;
  const scaled = widths.map(w => Math.round(w * scale * 100) / 100);
  const diff = Math.round((100 - scaled.reduce((s, w) => s + w, 0)) * 100) / 100;
  if (diff !== 0) {
    const maxIdx = scaled.indexOf(Math.max(...scaled));
    scaled[maxIdx] = Math.round((scaled[maxIdx] + diff) * 100) / 100;
  }
  return scaled;
}

export function getDefaultColWidths(): number[] {
  return [7.78, 6.53, 8.4, 7.84, 45.15, 15.22, 9.11];
}

export function getDefaultRibbonRows(): RibbonRow[] {
  return [
    {
      id: `row-${cid()}`,
      name: 'Row 1',
      cells: [
        { id: cid(), field: 'sceneNumber', prefix: 'Scene:', align: 'center' },
        { id: cid(), field: 'callTime', align: 'center', verticalAlign: 'middle' },
        { id: cid(), field: 'duration', align: 'center', verticalAlign: 'middle' },
        { id: cid(), field: 'intExt', align: 'left' },
        { id: cid(), field: 'set', align: 'left', verticalAlign: 'middle' },
        { id: cid(), field: 'cast', align: 'left', verticalAlign: 'top' },
        { id: cid(), field: 'pageCount', suffix: 'pgs', align: 'left', verticalAlign: 'top', wrap: true },
      ],
    },
    {
      id: `row-${cid()}`,
      name: 'Row 2',
      cells: [
        { id: cid(), field: 'sceneNumber', prefix: 'Scene:', align: 'center' },
        { id: cid(), field: 'callTime', align: 'center', verticalAlign: 'middle' },
        { id: cid(), field: 'duration', align: 'center', verticalAlign: 'middle' },
        { id: cid(), field: 'dayNight', align: 'left' },
        { id: cid(), field: 'description', align: 'left', verticalAlign: 'top' },
        { id: cid(), field: 'cast', align: 'left', verticalAlign: 'top' },
        { id: cid(), field: 'pageCount', suffix: 'pgs', align: 'left', verticalAlign: 'top', wrap: true },
      ],
    },
  ];
}

export function getDefaultRibbonDesign(): RibbonDesign {
  return {
    id: `d${Date.now()}`,
    name: 'Default',
    colWidths: getDefaultColWidths(),
    rows: getDefaultRibbonRows(),
    createdAt: Date.now(),
    cellPaddingV: 3,
    cellPaddingH: 20,
    edgePadding: 3,
  };
}

export function getCustomFieldDefs(customCategories: CustomCategoryDef[]): FieldDef[] {
  return customCategories.map(c => ({
    key: c.key,
    label: c.label,
    defaultWidth: 17.19,
    align: 'left' as const,
    category: 'Custom',
  }));
}
