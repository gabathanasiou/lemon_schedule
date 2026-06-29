export type IntExt = '' | 'INT' | 'EXT' | 'INT/EXT';
export type DayNight = '' | 'DAY' | 'NIGHT' | 'MORNING' | 'EVENING' | 'DAWN' | 'DUSK';
export type RowType = 'SCENE' | 'BREAK' | 'NOTE';

export interface Scene {
  id: string;
  ghostOf?: string;
  sceneNumber: string;
  pageCount: string;
  pageCountDecimal: number;
  scriptDay: string;
  intExt: IntExt;
  set: string;
  dayNight: DayNight;
  description: string;
  cast: string;
  notes: string;
  backgroundActors: string;
  stunts: string;
  vehicles: string;
  props: string;
  wardrobe: string;
  makeup: string;
  sfx: string;
  vfx: string;
  sound: string;
  music: string;
  animalsAndWranglers: string;
  weapons: string;
  greenery: string;
  artDept: string;
  shootDay: number | null;
}

export interface ScheduleRow {
  id: string;
  type: RowType;
  shootDay: number;
  order: number;
  
  // SCENE specific
  sceneId?: string;
  estimatedDuration?: number; // minutes
  descriptionOverride?: string; // If edited purely on schedule
  
  // BREAK specific
  breakLabel?: string;
  breakDuration?: number; // minutes
  isTimed?: boolean;
  
  // NOTE specific
  noteText?: string;
  noteColor?: string;
  noteTextColor?: string;
}

export interface ShootDayMeta {
  shootDay: number;
  unitCall: string; // HH:mm
  date: string; // e.g. "SATURDAY 6TH JUNE 2026"
  order?: number;
  status?: 'work' | 'hold' | 'travel' | 'holiday';
  castIds?: string;
}

export interface ScheduleVersion {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  rows: ScheduleRow[];
  dayMeta: Record<number, ShootDayMeta>; // key is shootDay
}

export interface TrashItem {
  scene: Scene;
  deletedAt: number;
  versionName: string;
}

export interface VersionTrashItem {
  version: ScheduleVersion;
  deletedAt: number;
}

export interface RuleTrashItem {
  rule: ProjectRule;
  deletedAt: number;
}

export interface RibbonTrashItem {
  design: RibbonDesign;
  deletedAt: number;
}

export type ProjectRule =
  | { id: string; type: 'MAX_HOURS'; castId: string; maxHours: number; dates?: string[] }
  | { id: string; type: 'DATE_RESTRICTION'; castId: string; dates: string[] }
  | { id: string; type: 'TIME_WINDOW'; castId: string; dates: string[]; windowStart?: string; windowEnd?: string }
  | { id: string; type: 'CAST_CONFLICT'; castIds: string[]; conflictCastIds: string[] }
  | { id: string; type: 'CAST_SCENE_FLAG'; castIds: string[] }

export interface RuleViolation {
  ruleId: string;
  ruleType: 'MAX_HOURS' | 'DATE_RESTRICTION' | 'TIME_WINDOW' | 'CAST_CONFLICT' | 'CAST_SCENE_FLAG';
  castId?: string;
  message: string;
  shootDay?: number;
  sceneId?: string;
  sceneIds?: string[];
}

export interface SceneColorEntry {
  intExt: string;
  dayNight: string;
  background: string;
  text: string;
}

export interface SceneColorPalette {
  sceneColors: SceneColorEntry[];
  selectedStripBg: string;
  selectedStripText: string;
  dayHeaderBg: string;
  dayHeaderText: string;
  noteBg: string;
  noteText: string;
}

export interface CastMember {
  id: string;
  name: string;
}

export interface ProjectElement {
  id: string;
  name: string;
}

export interface CustomCategoryDef {
  key: string;
  label: string;
  icon: string;
  multiValue?: boolean;
}

export interface ElementTrashItem {
  category: string;
  element: ProjectElement;
  deletedAt: number;
}

export interface CategoryTrashItem {
  category: CustomCategoryDef;
  elements: ProjectElement[];
  sceneValues: Record<string, string>;
  deletedAt: number;
}

// Legacy single-row ribbon column (kept for migration)
export interface SceneRibbonColumn {
  key: string;
  width: number;
}

export const SCENE_RIBBON_DEFAULTS: SceneRibbonColumn[] = [
  { key: 'sceneNumber', width: 40 },
  { key: 'duration', width: 40 },
  { key: 'intExt', width: 40 },
  { key: 'set', width: 200 },
  { key: 'dayNight', width: 75 },
  { key: 'cast', width: 50 },
  { key: 'pageCount', width: 50 },
];

// Multi-row ribbon design (new)
export interface RibbonCell {
  id: string;
  field: string;          // 'sceneNumber' | 'set' | 'cast' | '' for spacer | 'text'
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  wrap?: boolean;
  prefix?: string;
  suffix?: string;
  textContent?: string;   // for 'text' type static cells
}

export interface RibbonRow {
  id: string;
  name: string;
  cells: RibbonCell[];
}

export interface RibbonDesign {
  id: string;
  name: string;
  colWidths: number[];    // global column widths shared by all rows (percentages summing to 100)
  rows: RibbonRow[];
  createdAt: number;
  cellPadding?: number;
  edgePadding?: number;
}

export interface Project {
  id: string;
  title: string;
  draftNumber: string;
  scenes: Scene[];
  versions: ScheduleVersion[];
  activeVersionId: string;
  trash: TrashItem[];
  versionTrash: VersionTrashItem[];
  rulesTrash: RuleTrashItem[];
  ribbonTrash: RibbonTrashItem[];
  rules: ProjectRule[];
  castMembers: CastMember[];
  customCategories: CustomCategoryDef[];
  hiddenCategories: string[];
  categoryLabels: Record<string, string>;
  elementsTrash: ElementTrashItem[];
  categoryTrash: CategoryTrashItem[];
  breakdownElements: Record<string, ProjectElement[]>;
  sceneRibbon: SceneRibbonColumn[];
  ribbonDesigns: RibbonDesign[];
  activeRibbonId: string;
  colorPalette?: SceneColorPalette;
}
