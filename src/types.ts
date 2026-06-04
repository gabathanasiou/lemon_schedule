export type IntExt = 'INT' | 'EXT' | 'INT/EXT';
export type DayNight = 'DAY' | 'NIGHT' | 'MORNING' | 'EVENING' | 'DAWN' | 'DUSK';
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
}

export interface ShootDayMeta {
  shootDay: number;
  unitCall: string; // HH:mm
  date: string; // e.g. "SATURDAY 6TH JUNE 2026"
  order?: number;
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

export type ProjectRule =
  | { id: string; type: 'MAX_HOURS'; castId: string; maxHours: number; days?: number[] }
  | { id: string; type: 'DATE_RESTRICTION'; castId: string; date: string }

export interface RuleViolation {
  ruleId: string;
  ruleType: 'MAX_HOURS' | 'DATE_RESTRICTION';
  castId: string;
  message: string;
  shootDay?: number;
  sceneId?: string;
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
  rules: ProjectRule[];
}
