import { RibbonRow, RibbonDesign, CustomCategoryDef } from '../types';
import { formatDuration } from './utils';
import type { FieldDef } from './ribbonUtils';

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
  notes: 'Need breakfast props - call crafty.',
  backgroundActors: '20 BG',
  stunts: 'Stunt double: JOHN',
  vehicles: '2× police car',
  props: 'Frying pan, phone, mug',
  wardrobe: 'Casual: JOHN, Biz: MARY',
  makeup: 'Prosthetic scar: JOHN',
  sfx: 'Gunshot (off-screen)',
  vfx: 'Window replacement',
  sound: 'Dialogue cleanup',
  music: 'Track 5 - Morning Montage',
  animalsAndWranglers: '1× cat (orange tabby)',
  weapons: 'Prop knife (rubber)',
  greenery: 'Fake potted plants ×3',
  artDept: '1950s kitchen calendar, curtains',
};

export const INT_EXT: Record<string, string> = { INT: 'INT', EXT: 'EXT', 'INT/EXT': 'INT/EXT' };
export const DAY_NIGHT: Record<string, string> = { DAY: 'DAY', NIGHT: 'NIGHT', MORNING: 'MORNING', EVENING: 'EVENING' };

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

export function renderCellText(scene: Record<string, any> | null, cell: { field?: string; textContent?: string; prefix?: string; suffix?: string }): string {
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
  return [10.22, 5.01, 6.18, 7.57, 40.59, 9.62, 20.85];
}

export function getDefaultRibbonRows(): RibbonRow[] {
  return [
    {
      id: `row-${cid()}`,
      name: 'Row 1',
      cells: [
        { id: cid(), field: 'sceneNumber', prefix: 'Scene:', align: 'left', verticalAlign: 'middle', truncation: false },
        { id: cid(), field: 'callTime', align: 'center', verticalAlign: 'middle', truncation: false },
        { id: cid(), field: 'duration', align: 'center', verticalAlign: 'middle', wrap: true },
        { id: cid(), field: 'intExt', align: 'left' },
        { id: cid(), field: 'set', align: 'left', verticalAlign: 'middle' },
        { id: cid(), field: 'cast', align: 'left', verticalAlign: 'top', wrap: true },
        { id: cid(), field: 'notes', align: 'left', verticalAlign: 'top' },
      ],
    },
    {
      id: `row-${cid()}`,
      name: 'Row 2',
      cells: [
        { id: cid(), field: 'pageCount', suffix: 'pgs', align: 'left', verticalAlign: 'top', truncation: false },
        { id: cid(), field: 'callTime', align: 'center', verticalAlign: 'middle', truncation: false },
        { id: cid(), field: 'duration', align: 'center', verticalAlign: 'middle', wrap: true },
        { id: cid(), field: 'dayNight', align: 'left' },
        { id: cid(), field: 'description', align: 'left', verticalAlign: 'top' },
        { id: cid(), field: 'cast', align: 'left', verticalAlign: 'top', wrap: true },
        { id: cid(), field: 'notes', align: 'left', verticalAlign: 'top' },
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
    cellPaddingH: 3,
    edgePadding: 3,
    textSize: 14,
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
