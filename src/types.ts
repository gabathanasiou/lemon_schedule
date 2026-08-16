export type IntExt = string;
export type DayNight = string;
export type RowType = 'SCENE' | 'BREAK' | 'NOTE' | 'DAYBREAK';

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
}

export interface ScheduleRow {
  id: string;
  type: RowType;
  containerId: number | null;
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

  // DAYBREAK specific
  daybreakLabel?: string;
  daybreakCallTime?: string;
  daybreakDate?: string;

  pinned?: boolean;
}

export interface NonShootDate {
  date: string; // YYYY-MM-DD
  status?: 'hold' | 'travel' | 'holiday';
  castIds?: string;
  /** Category → element keys traveling that day (cast = IDs, other categories = names; `'*'` = whole category). */
  travel?: Record<string, string[]>;
  /** Category → element keys on hold that day (cast = IDs, other categories = names; `'*'` = whole category). */
  hold?: Record<string, string[]>;
}

export interface ScheduleVersion {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  rows: ScheduleRow[];
  nonShootDates?: NonShootDate[];
  productionStart?: string;
  legacy?: boolean;
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

export interface ColorRuleTrashItem {
  rule: ColorRule;
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
  detail?: string;
  containerId?: number;
  sceneId?: string;
  sceneIds?: string[];
}

export interface SceneColorEntry {
  intExt: string;
  dayNight: string;
  background: string;
  text: string;
}

export interface ColorRuleCondition {
  category: string;
  elementId: string;
}

export type ColorOverride =
  | { type: 'single'; background: string; text: string }
  | { type: 'matrix'; sceneColors: SceneColorEntry[] };

export interface ColorRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: ColorRuleCondition[];
  override: ColorOverride;
}

export interface SceneColorPalette {
  intExtOptions: string[];
  dayNightOptions: string[];
  sceneColors: SceneColorEntry[];
  colorRules?: ColorRule[];
  selectedStripBg: string;
  selectedStripText: string;
  dayHeaderBg: string;
  dayHeaderText: string;
  dayFooterBg: string;
  dayFooterText: string;
  noteBg: string;
  noteText: string;
  fallbackStripBg?: string;
  fallbackStripText?: string;
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

export interface CrewTrashItem {
  person: CrewPerson;
  role: string;
  roleLabel: string;
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
  truncation?: boolean;   // false = disable text truncation (show full content)
  overflowVisible?: boolean; // text overflows cell bounds without wrapping
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
  cellPaddingV?: number;
  cellPaddingH?: number;
  edgePadding?: number;
}

// ---- Reports Designer -------------------------------------------------------

export interface CrewPerson {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

export interface CrewRole {
  key: string;
  label: string;
  builtin?: boolean;
}

export interface ProjectLocationNearby {
  /** Location DB id of the nearest hospital / police station (links, not text). */
  hospitalId?: string;
  policeId?: string;
}

export interface ProjectLocation {
  /** Stable uuid — scenes/days will reference locations by this id later. */
  id: string;
  name: string;
  /** Key into `project.locationTypes` (label-based, like crew roles). */
  type: string;
  address?: string;
  /** Human geocode label (e.g. Nominatim display_name). */
  place?: string;
  lat?: number;
  lng?: number;
  contactName?: string;
  phone?: string;
  email?: string;
  notes?: string;
  /** Nearest-facility references into the same locations DB. */
  nearby?: ProjectLocationNearby;
}

export interface LocationTrashItem {
  location: ProjectLocation;
  deletedAt: number;
}

export interface ProductionInfo {
  company?: string;
  studio?: string;
  productionOffice?: string;
  address?: string;
  phone?: string;
  email?: string;
  startDate?: string;
  wrapDate?: string;   // auto-computed from last section date (read-only display)
  dateFormat?: string; // global report date format (Production tab) — source of truth
  timezone?: string;   // IANA id (e.g. 'Europe/London'); empty = browser default
}

export type ReportCollection =
  | 'scenes' | 'days' | 'cast' | 'elements' | 'categories' | 'crew' | 'violationTypes'
  | 'scenesOfDay' | 'scenesOfElement' | 'scenesOfCast' | 'daysOfCast' | 'elementsOfCategory' | 'elementsOfScene';

export type EmptyBehavior = 'show' | 'hideText' | 'hideBlock';
export type RepeatAxis = 'rows' | 'columns';

export interface ReportTableColumn {
  id: string;
  field: string;
  width: number;        // %, sums to 100
  align?: 'left' | 'center' | 'right';
  bold?: boolean;       // per-column cell style
  italic?: boolean;
  skipEmpty?: boolean;  // hide rows where this column's cell is empty
}

export interface ReportTableRow {
  id: string;
  cells: { id: string; field: string; align?: 'left' | 'center' | 'right' }[];
}

export interface ReportColumn {
  id: string;
  width: number;        // %, sums to 100
  blocks: ReportBlock[];
}

export interface ReportBlock {
  id: string;
  type: 'text' | 'field' | 'repeat' | 'table' | 'columns' | 'ribbon' | 'pageBreak' | 'spacer' | 'image' | 'map' | 'link' | 'callSheetEdit';
  // text / field
  text?: string;                 // static text; may contain {{key}} tokens
  url?: string;                  // link block: href (may contain {{key}} tokens)
  field?: string;                // empty = "Select field…" state
  prefix?: string;
  suffix?: string;
  itemPrefix?: string;           // per-item affixes for multi-value attributes
  itemSuffix?: string;
  itemSeparator?: string;
  dayFormat?: 'dayNumDate' | 'dayNum' | 'date'; // day-list display mode (Work/Hold/Travel Days)
  emptyBehavior?: EmptyBehavior;
  // repeat
  collection?: ReportCollection;
  category?: string;             // for 'elements' / 'elementsOfScene'
  skipEmptyCategories?: boolean; // for 'categories' — on unless explicitly off
  excludedCategories?: string[]; // for 'categories' — categories to omit
  counterStart?: number;         // 0 or 1 — where the Document Counter starts
  scopedToParent?: boolean;      // nested repeats/tables: only items in the parent's context — on unless explicitly off
  children?: ReportBlock[];
  gap?: number;                  // pt between repeated items
  // table (repeat + table shape)
  repeatAxis?: RepeatAxis;
  colWidths?: number[];          // rows-mode, % summing to 100
  tableRows?: ReportTableRow[];  // rows-mode: multiple design rows per item
  showHeader?: boolean;
  showBorders?: boolean;          // table cell borders — on unless explicitly off
  skipEmptyRows?: boolean;        // hide items whose cells are all/partly empty
  headerField?: string;          // columns-mode: item identity row
  axis?: 'columns' | 'rows';     // attributes as columns (default) or rows (matrix)
  columns?: ReportTableColumn[]; // simple column defs (field/align/width) — canonical table model
  // columns (Notion-style)
  cols?: ReportColumn[];
  // ribbon
  ribbonId?: string;
  ribbonCallTimes?: boolean;  // show call-time cells in strips + daybreak CALL/end time — off unless explicitly on
  ribbonDurations?: boolean;  // show duration cells in strips + footer shoot/break — off unless explicitly on
  ribbonNotes?: boolean;      // show NOTE rows — on unless explicitly off
  ribbonBreaks?: boolean;     // show BREAK rows — off unless explicitly on
  ribbonDayBreaks?: boolean;  // daybreak halves (START OF DAY / End of Day) — off unless explicitly on
  ribbonHeaders?: boolean;    // legacy alias of ribbonDayBreaks (read-only fallback)
  // style
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  paddingV?: number;
  paddingH?: number;
  textStyle?: string;              // id of a project.reportTextStyles entry (linked style)
  /** Background fill (hex) for text/field blocks — auto text color follows
   *  the background's relative luminance (roadmap 28). */
  background?: string;
  /** Full-box 1px border for text/field blocks (default off). */
  border?: boolean;
  // spacer
  height?: number;
  spacerStyle?: 'none' | 'black' | 'line' | 'dotted';
  spacerThickness?: number;      // px; line style only
  // image
  imageDataUrl?: string;         // attached image (data URL, embedded in the design)
  imageHeight?: number;          // px; unset = natural aspect ratio at container width
  imageFit?: 'contain' | 'cover' | 'fill'; // only meaningful with imageHeight
  // map
  mapLat?: number;
  mapLng?: number;
  mapPlace?: string;             // full display string (reverse-geocoded)
  mapAddress?: string;           // structured parts — drive the address bar format
  mapCity?: string;
  mapPostcode?: string;
  mapCountry?: string;
  mapHeight?: number;            // px
  mapZoom?: number;
  mapOpenLink?: 'none' | 'google' | 'apple' | 'citymapper'; // "open in maps" link
  mapInheritLocation?: boolean;  // resolve via getReportLocation(ctx, item) instead of own pin
}

export interface ReportDesign {
  id: string;
  name: string;
  createdAt: number;
  page: 'portrait' | 'landscape';
  blocks: ReportBlock[];
  header?: ReportBlock[];        // rendered at the top of every page
  footer?: ReportBlock[];        // rendered at the bottom of every page
  headerSkipFirst?: boolean;     // hide the header on page 1
  footerSkipFirst?: boolean;     // hide the footer on page 1
}

/** Named text style (Word/Pages-like): blocks link to one via `textStyle`. */
export interface ReportTextStyle {
  id: string;
  name: string;
  fontSize: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface ReportTrashItem {
  design: ReportDesign;
  deletedAt: number;
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
  colorRulesTrash: ColorRuleTrashItem[];
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
  // Reports Designer + Production Info
  productionInfo?: ProductionInfo;
  crewRoles?: CrewRole[];
  crew?: Record<string, CrewPerson[]>;
  crewTrash?: CrewTrashItem[];
  locationTypes?: CrewRole[];
  locations?: ProjectLocation[];
  locationsTrash?: LocationTrashItem[];
  reportDesigns?: ReportDesign[];
  activeReportId?: string;
  reportTrash?: ReportTrashItem[];
  reportTextStyles?: ReportTextStyle[];
}
