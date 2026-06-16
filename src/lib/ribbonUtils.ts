import React from 'react';
import { Scene, RibbonCell, RibbonRow, RibbonDesign, CustomCategoryDef, SceneColorEntry, SceneColorPalette, IntExt, DayNight } from '../types';
import { formatDuration } from './utils';

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

export function getRibbonCellBaseStyle(cell: RibbonCell, cellPadding?: number): React.CSSProperties {
  return {
    flex: `0 0 ${cell.width}%`,
    minWidth: 0,
    padding: `${cellPadding ?? 6}px`,
    overflow: cell.wrap ? 'visible' : 'hidden',
    textOverflow: cell.wrap ? undefined : 'ellipsis',
    whiteSpace: cell.wrap ? 'normal' : 'nowrap',
    wordBreak: cell.wrap ? 'break-word' : undefined,
    textAlign: getAlign(cell),
    textTransform: cell.field === 'set' ? 'uppercase' : 'none',
    fontWeight: cell.field === 'sceneNumber' ? 700 : 500,
    fontSize: '8pt',
    lineHeight: 1.1,
    fontFamily: 'Helvetica, sans-serif',
  };
}

export function getNoteBreakPad(cellPadding: number, ribbonRowCount: number): number {
  return cellPadding * ribbonRowCount + 6 * (ribbonRowCount - 1);
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

export function normalizeCells(cells: RibbonCell[]): RibbonCell[] {
  if (cells.length === 0) return cells;
  const sum = cells.reduce((s, c) => s + c.width, 0);
  if (Math.abs(sum - 100) < 0.01) return cells;
  const scale = 100 / sum;
  return cells.map(c => ({ ...c, width: Math.max(MIN_PCT, Math.round(c.width * scale * 100) / 100) }));
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

function mkRow(name: string, keys: string[]): RibbonRow {
  return {
    id: `row-${cid()}`,
    name,
    cells: keys.map(k => {
      const f = FIELD_MAP[k];
      return { id: cid(), field: k, width: f?.defaultWidth || 10, prefix: f?.defaultPrefix, suffix: f?.defaultSuffix, align: f?.align, wrap: f?.defaultWrap };
    }),
  };
}

export function getDefaultRibbonRows(): RibbonRow[] {
  return [
    {
      id: `row-${cid()}`,
      name: 'Row 1',
      cells: [
        { id: cid(), field: 'sceneNumber', width: 7.56, prefix: 'Sc', align: 'left' },
        { id: cid(), field: 'callTime', width: 6.46, align: 'center' },
        { id: cid(), field: 'duration', width: 7.68, align: 'center' },
        { id: cid(), field: 'intExt', width: 6.33, align: 'left' },
        { id: cid(), field: 'set', width: 39.29, align: 'left' },
        { id: cid(), field: 'cast', width: 23.02, prefix: 'Cast', align: 'left', wrap: true },
        { id: cid(), field: 'pageCount', width: 9.65, suffix: 'pgs', align: 'right' },
      ],
    },
    {
      id: `row-${cid()}`,
      name: 'Row 2',
      cells: [
        { id: cid(), field: '', width: 21.72 },
        { id: cid(), field: 'dayNight', width: 6.26, align: 'left' },
        { id: cid(), field: 'description', width: 72.02, align: 'left' },
      ],
    },
  ];
}

export function getDefaultRibbonDesign(): RibbonDesign {
  return {
    id: `d${Date.now()}`,
    name: 'Default',
    rows: getDefaultRibbonRows(),
    createdAt: Date.now(),
    cellPadding: 3,
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
