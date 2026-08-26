import { inflateRaw } from 'pako';
import {
  CastMember,
  Project,
  ProjectElement,
  SceneColorEntry,
  ScheduleRow,
  Scene,
} from '../../types';
import { formatPageCount, generateUUID } from '../utils';
import { makeBlankProject } from '../../store/reducer';
import { FDX_CATEGORY_MAP, categoryNameToKey, normalizeCharacterName } from './shared';

/**
 * EPSF (.msd) — legacy Movie Magic Scheduling 5/6 "Movie Schedule Data" —
 * parser (roadmap item 40). Verified against `tools/msd_probe.py` (the
 * reference parser; golden: e2e/fixtures/wonderful-life.expected.json).
 *
 * Format: an "EPSF FILE" banner header (version records) followed by
 * "EPSF SECTION" banner-delimited sections. A data section = 34-byte header
 * + RAW DEFLATE of a UTF-8 XML manager document; image sections (cast
 * photos/stills, raw JFIF/PNG/BMP) are skipped.
 *
 * NEW-PROJECT-ONLY (user decision): the parser builds a COMPLETE `Project`
 * consumed by `importProjectFromData` — no ImportResult/commitImport
 * involvement. Boards map to versions; day breaks to DAYBREAK rows; banners
 * to NOTE rows; undated strips to the Boneyard; calendars materialize into
 * per-version productionStart + nonShootDates.
 */

const SECTION_MARKER = '/********* EPSF SECTION *********/';
const FILE_MARKER = '/********* EPSF FILE ********/';
const SECTION_HEADER_LEN = 34;

/** MSD-only category mapping on top of the FDX map: MMS models Set as an
 *  element category; Lemon's `set` category is the sets registry. */
const MSD_CATEGORY_MAP: Record<string, string | null> = {
  ...FDX_CATEGORY_MAP,
  'Set': 'set',
};

/** MMS system categories kept as Lemon custom categories (user decision). */
const CUSTOM_CATEGORY_LABELS = new Set(['Set Dressing', 'Sequence', 'Unit']);

/** Categories whose refs are scene FIELDS, never element categories. */
const SCENE_FIELD_KEYS = new Set(['notes', 'scriptDay', 'set', 'description', 'location']);

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------- container

export function parseMsd(buffer: ArrayBuffer, fallbackTitle?: string): Project {
  const bytes = new Uint8Array(buffer);
  const parts = splitSections(bytes);
  if (parts.length < 2) throw new Error('Not an EPSF (.msd) file — missing sections.');
  const head = new TextDecoder('latin1').decode(parts[0]);
  if (!head.includes(FILE_MARKER)) throw new Error('Not an EPSF (.msd) file.');

  const docs: Document[] = [];
  for (let i = 1; i < parts.length; i++) {
    const text = inflateAt34(parts[i]);
    if (!text) continue;
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (!doc.documentElement) continue;
    if (doc.getElementsByTagName('parsererror').length > 0) continue;
    docs.push(doc);
  }
  return buildProject(docs, fallbackTitle);
}

export async function parseMsdFile(file: File, fallbackTitle?: string): Promise<Project> {
  return parseMsd(await file.arrayBuffer(), fallbackTitle);
}

function splitSections(bytes: Uint8Array): Uint8Array[] {
  const marker = new TextEncoder().encode(SECTION_MARKER);
  const parts: Uint8Array[] = [];
  let start = 0;
  let i = 0;
  while (i <= bytes.length - marker.length) {
    let j = 0;
    while (j < marker.length && bytes[i + j] === marker[j]) j++;
    if (j === marker.length) {
      parts.push(bytes.slice(start, i));
      start = i + marker.length;
      i += marker.length;
    } else {
      i++;
    }
  }
  parts.push(bytes.slice(start));
  return parts;
}

/** Raw inflate starting at byte 34 (small offset probe for other MMS
 *  versions). Only returns text that looks like an XML document. */
function inflateAt34(section: Uint8Array, probeFrom = SECTION_HEADER_LEN - 6, probeTo = SECTION_HEADER_LEN + 8): string | null {
  const max = Math.min(section.length, probeTo + 1);
  for (let off = Math.max(0, probeFrom); off < max; off++) {
    try {
      const out = inflateRaw(section.subarray(off));
      const text = new TextDecoder().decode(out);
      if (text.trimStart().startsWith('<')) {
        return text;
      }
    } catch {
      // not a deflate stream at this offset — keep probing
    }
  }
  return null;
}

// ---------------------------------------------------------------- XML model

type CatKind = 'builtin' | 'custom' | 'field' | 'cast';

interface SheetModel {
  bdsid: string;
  sceneNumber: string;
  sheetNumber: string;
  scriptPageNumbers: string;
  intExt: string;
  dayNight: string;
  set: string;
  location: string;
  description: string;
  scriptDay: string;
  numScriptPages: string;
  estimateMinutes: number | null;
  sequence: string;
  unit: string;
  comments: string;
  castRefs: string[];
  fieldRefs: Record<string, string[]>;
  elemRefs: Record<string, string[]>;
  sceneId: string;
}

interface MappedCategory {
  kind: CatKind;
  key: string;
}

function mappedCategories(categoriesDoc: Document): Record<string, MappedCategory> {
  const out: Record<string, MappedCategory> = {};
  for (const cat of categoriesDoc.getElementsByTagName('Category')) {
    const label = cat.getAttribute('Name');
    if (!label) continue;
    const key = MSD_CATEGORY_MAP[label];
    if (CUSTOM_CATEGORY_LABELS.has(label)) {
      out[label] = { kind: 'custom', key: categoryNameToKey(label) };
    } else if (key !== null && SCENE_FIELD_KEYS.has(key)) {
      out[label] = { kind: 'field', key };
    } else if (label === 'Cast Members') {
      out[label] = { kind: 'cast', key: 'cast' };
    } else if (key === null) {
      out[label] = { kind: 'custom', key: categoryNameToKey(label) };
    } else {
      out[label] = { kind: 'builtin', key };
    }
  }
  return out;
}

function collectSheets(breakdownDoc: Document, catMap: Record<string, MappedCategory>): SheetModel[] {
  const sheets: SheetModel[] = [];
  for (const el of breakdownDoc.getElementsByTagName('BreakdownSheet')) {
    const attr = (n: string) => el.getAttribute(n) || '';
    const castRefs: string[] = [];
    const fieldRefs: Record<string, string[]> = {};
    const elemRefs: Record<string, string[]> = {};
    for (const ref of el.getElementsByTagName('ElementRef')) {
      const catLabel = ref.getAttribute('CategoryName') || '';
      const elemName = ref.getAttribute('ElementName') || '';
      if (!catLabel || !elemName) continue;
      const mapped = catMap[catLabel];
      if (!mapped) continue;
      if (mapped.kind === 'cast') {
        castRefs.push(normalizeCharacterName(elemName));
      } else if (mapped.kind === 'field') {
        (fieldRefs[mapped.key] ||= []).push(elemName);
      } else {
        (elemRefs[mapped.key] ||= []).push(elemName);
      }
    }
    sheets.push({
      bdsid: attr('BDSID'),
      sceneNumber: attr('Scenes'),
      sheetNumber: attr('SheetNumber'),
      scriptPageNumbers: attr('ScriptPageNumbers'),
      intExt: (attr('IE') || 'INT').toUpperCase().replace(/\s+/g, ''),
      dayNight: attr('DN') || 'DAY',
      set: (attr('Set') || fieldRefs.set?.join(' ') || '').toUpperCase().trim(),
      location: attr('Location'),
      description: attr('Synopsis'),
      scriptDay: attr('ScriptDay'),
      numScriptPages: attr('NumScriptPages'),
      estimateMinutes: parseEstimateMinutes(attr('EstimateTimeB'), attr('EstimateTimeA')),
      sequence: attr('Sequence'),
      unit: attr('Unit'),
      comments: attr('Comments'),
      castRefs,
      fieldRefs,
      elemRefs,
      sceneId: generateUUID(),
    });
  }
  return sheets;
}

/** MMS script-page eighths: last char = eighths ("12" = 1 2/8 → 1, 0.25). */
function parseEighths(value: string): { pages: number; decimal: number } | null {
  if (!value || !/^\d+$/.test(value)) return null;
  let eighths = parseInt(value[value.length - 1], 10);
  let pages = parseInt(value.slice(0, -1) || '0', 10);
  if (eighths >= 8) {
    pages += 1;
    eighths -= 8;
  }
  return { pages, decimal: eighths / 8 };
}

/** EstimateTimeB = hours, EstimateTimeA = minutes ("3:00" = 3h). */
function parseEstimateMinutes(b: string, a: string): number | null {
  if (!b && !a) return null;
  if ((b && !/^\d+$/.test(b)) || (a && !/^\d+$/.test(a))) return null;
  return parseInt(b || '0', 10) * 60 + parseInt(a || '0', 10);
}

/** MMS dates are MM/DD/YYYY (US). Returns ISO or null. */
function parseMmddyyyy(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || '');
  if (!m) return null;
  const utc = Date.UTC(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
  const d = new Date(utc);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function uniq(xs: string[]): string[] {
  const seen = new Set<string>();
  return xs.filter(x => {
    if (seen.has(x)) return false;
    seen.add(x);
    return true;
  });
}

// ------------------------------------------------------------------- build

function buildProject(docs: Document[], fallbackTitle?: string): Project {
  const docFor = (tag: string) => docs.find(d => d.documentElement.tagName === tag);
  const productionDoc = docFor('ProductionInfo');
  const categoriesDoc = docFor('CategoryMgr');
  const elementsDoc = docFor('ElementMgr');
  const breakdownDoc = docFor('BreakdownSheetMgr');
  const stripboardDoc = docFor('StripBoardMgr');
  const calendarsDoc = docFor('CalendarMgr');
  if (!categoriesDoc || !elementsDoc || !breakdownDoc || !stripboardDoc) {
    throw new Error('Unrecognized .msd file — missing core schedule sections.');
  }

  const pictureTitle = productionDoc?.getElementsByTagName('Property') 
    ? Array.from(productionDoc.getElementsByTagName('Property'))
        .find(p => p.getAttribute('Name') === 'PictureTitle')?.getAttribute('Value') || undefined
    : undefined;
  const project = makeBlankProject(pictureTitle || fallbackTitle || 'Imported Schedule');

  // MMS ProductionInfo props → Lemon crew roster (builtin role keys from
  // DEFAULT_CREW_ROLES; one person per named role).
  const CREW_MAP: Record<string, string> = {
    Director: 'director',
    Producer: 'producer',
    Upm: 'upm',
    AsstDirector: 'firstAD',
    ArtDirector: 'artDirector',
    SetDresser: 'setDecorator',
  };
  const propValue = (name: string) =>
    productionDoc ? Array.from(productionDoc.getElementsByTagName('Property'))
      .find(p => p.getAttribute('Name') === name)?.getAttribute('Value') || undefined : undefined;
  for (const [propName, roleKey] of Object.entries(CREW_MAP)) {
    const name = propValue(propName)?.trim();
    if (!name) continue;
    project.crew = {
      ...(project.crew || {}),
      [roleKey]: [...(project.crew?.[roleKey] || []), { id: generateUUID(), name }],
    };
  }
  const company = propValue('Company');
  if (company) project.productionInfo = { ...project.productionInfo, company };

  // --- strip colors (MMS ColorSettings) -----------------------------------
  // The ColorGrid is MMS's strip color matrix (columns INT/EXT/INT-EXT,
  // rows Day/Night/Morning/Evening, per-cell Fg/Bg) — identical vocabulary to
  // Lemon's palette. StripColorPreferences carry the selected-strip (Hilite),
  // day-break strip (DayStrip) and banner (Banner) colors.
  const colorsDoc = docFor('ColorSettings');
  if (colorsDoc) {
    const rgb = (v: string | null): string | undefined => {
      if (!v) return undefined;
      const p = v.split(',').map(s => parseInt(s.trim(), 10));
      if (p.length !== 3 || p.some(n => isNaN(n))) return undefined;
      return '#' + p.map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('');
    };
    const colLabels = new Map<number, string>();
    const rowLabels = new Map<number, string>();
    for (const col of colorsDoc.getElementsByTagName('ColumnLabel')) {
      const n = col.getAttribute('ColumnNumber');
      const name = col.getAttribute('Name');
      if (n !== null && name) colLabels.set(parseInt(n, 10), name.toUpperCase());
    }
    for (const row of colorsDoc.getElementsByTagName('RowLabel')) {
      const n = row.getAttribute('RowNumber');
      const name = row.getAttribute('Name');
      if (n !== null && name) rowLabels.set(parseInt(n, 10), name.toUpperCase());
    }
    const cells: SceneColorEntry[] = [];
    for (const cell of colorsDoc.getElementsByTagName('ColorGridCell')) {
      const r = cell.getAttribute('RowNumber');
      const c = cell.getAttribute('ColumnNumber');
      if (r === null || c === null) continue;
      const ie = colLabels.get(parseInt(c, 10));
      const dn = rowLabels.get(parseInt(r, 10));
      if (!ie || !dn || ie === 'OTHER' || dn === 'OTHER') continue; // no Lemon slot
      const background = rgb(cell.getAttribute('Bg'));
      const text = rgb(cell.getAttribute('Fg'));
      if (!background || !text) continue;
      cells.push({ intExt: ie, dayNight: dn, background, text });
    }
    if (cells.length > 0) project.colorPalette.sceneColors = cells;
    for (const pref of colorsDoc.getElementsByTagName('StripColorPreference')) {
      const name = pref.getAttribute('Name');
      const background = rgb(pref.getAttribute('Bg'));
      const text = rgb(pref.getAttribute('Fg'));
      if (!name || !background || !text) continue;
      if (name === 'Hilite') {
        project.colorPalette.selectedStripBg = background;
        project.colorPalette.selectedStripText = text;
      } else if (name === 'DayStrip') {
        project.colorPalette.dayHeaderBg = background;
        project.colorPalette.dayHeaderText = text;
      } else if (name === 'Banner') {
        project.colorPalette.noteBg = background;
        project.colorPalette.noteText = text;
      }
    }
  }

  // Cast ids are sequential integers per project (user decision — readable
  // ids, no UUID noise in the imported breakdown).
  const castNameToId = new Map<string, string>();
  let castSeq = 0;
  const castIdFor = (name: string): string => {
    let id = castNameToId.get(name);
    if (!id) {
      id = String(++castSeq);
      castNameToId.set(name, id);
    }
    return id;
  };

  const catMap = mappedCategories(categoriesDoc);

  // --- cast roster: Board IDs follow MMS's ElementMgr order ----------------
  // MMS numbers cast by registry position (George is 1, Mary 2, …). Build the
  // roster in that order and PRE-ASSIGN ids so scene building below picks
  // them up regardless of sheet iteration. Sheet-only names (absent from the
  // registry) append in first-appearance order.
  const castOrder: string[] = [];
  const castSeen = new Set<string>();
  for (const el of elementsDoc.getElementsByTagName('Element')) {
    const name = el.getAttribute('Name');
    const catLabel = el.getAttribute('CategoryName');
    if (!name || catLabel !== 'Cast Members') continue;
    const normalized = normalizeCharacterName(name);
    if (normalized && !castSeen.has(normalized)) {
      castSeen.add(normalized);
      castOrder.push(normalized);
    }
  }
  for (const name of castOrder) castIdFor(name);

  // --- scenes (sheet order = MMS sheet numbers = script order) -------------
  const sheets = collectSheets(breakdownDoc, catMap);
  const sceneIdByBdsid = new Map(sheets.filter(s => s.bdsid).map(s => [s.bdsid, s.sceneId]));
  const estimateById = new Map<string, number>(
    sheets.filter(s => s.estimateMinutes !== null).map(s => [s.sceneId, s.estimateMinutes!]),
  );
  // MMS numbers breakdown sheets by script order (scene 18 lives on sheet 19).
  // Sort by SheetNumber so the imported breakdown mirrors MMS: sheet 1 is the
  // first scene and row positions equal the sheets' numbers.
  sheets.sort((a, b) => {
    const na = parseInt(a.sheetNumber, 10);
    const nb = parseInt(b.sheetNumber, 10);
    return (isNaN(na) ? Infinity : na) - (isNaN(nb) ? Infinity : nb);
  });

  const scenes: Scene[] = sheets.map(sheet => {
    const pg = parseEighths(sheet.numScriptPages);
    const totalPages = pg ? pg.pages + pg.decimal : 0;
    const castIds = sheet.castRefs.map(name => castIdFor(name)).filter(Boolean);
    const notes = uniq([...(sheet.comments ? [sheet.comments] : []), ...(sheet.fieldRefs.notes || [])])
      .filter(n => n.trim()).join(' ');
    const scene: any = {
      id: sheet.sceneId,
      sceneNumber: sheet.sceneNumber,
      ...(sheet.sheetNumber ? { sheetNumber: sheet.sheetNumber } : {}),
      scriptPageNumbers: sheet.scriptPageNumbers || undefined,
      pageCount: formatPageCount(totalPages),
      pageCountDecimal: totalPages,
      scriptDay: sheet.scriptDay,
      intExt: sheet.intExt || 'INT',
      set: sheet.set || 'UNKNOWN',
      dayNight: sheet.dayNight,
      description: sheet.description,
      cast: castIds.join(', '),
      notes,
      backgroundActors: (sheet.elemRefs.backgroundActors || []).join(', '),
      stunts: (sheet.elemRefs.stunts || []).join(', '),
      vehicles: (sheet.elemRefs.vehicles || []).join(', '),
      props: (sheet.elemRefs.props || []).join(', '),
      wardrobe: (sheet.elemRefs.wardrobe || []).join(', '),
      makeup: (sheet.elemRefs.makeup || []).join(', '),
      sfx: (sheet.elemRefs.sfx || []).join(', '),
      vfx: (sheet.elemRefs.vfx || []).join(', '),
      sound: (sheet.elemRefs.sound || []).join(', '),
      music: (sheet.elemRefs.music || []).join(', '),
      animalsAndWranglers: (sheet.elemRefs.animalsAndWranglers || []).join(', '),
      weapons: (sheet.elemRefs.weapons || []).join(', '),
      greenery: (sheet.elemRefs.greenery || []).join(', '),
      artDept: (sheet.elemRefs.artDept || []).join(', '),
      location: sheet.location,
      sequence: sheet.sequence || (sheet.elemRefs.sequence || []).join(', '),
      unit: sheet.unit || (sheet.elemRefs.unit || []).join(', '),
    };
    for (const [key, items] of Object.entries(sheet.elemRefs)) {
      if (!(key in scene)) scene[key] = items.join(', ');
    }
    return scene as Scene;
  });
  project.scenes = scenes;

  // --- cast + elements registry ------------------------------------------
  // Cast: Board IDs pre-assigned above in ElementMgr roster order; sheets'
  // first-appearance fills registry-missing names.
  for (const sheet of sheets) {
    for (const name of sheet.castRefs) {
      if (!castSeen.has(name)) {
        castSeen.add(name);
        castOrder.push(name);
        castIdFor(name);
      }
    }
  }
  const castMembers: CastMember[] = castOrder.map(name => ({ id: castIdFor(name), name }));
  project.castMembers = castMembers;

  const registry: Record<string, ProjectElement[]> = {};
  const register = (key: string, name: string, id = name) => {
    if (!registry[key]) registry[key] = [];
    if (!registry[key].some(e => e.id === id)) registry[key].push({ id, name });
  };
  for (const el of elementsDoc.getElementsByTagName('Element')) {
    const name = el.getAttribute('Name');
    const catLabel = el.getAttribute('CategoryName');
    if (!name || !catLabel) continue;
    const mapped = catMap[catLabel];
    if (!mapped) continue;
    if (mapped.kind === 'field') {
      if (mapped.key === 'set') register('set', name);
    } else if (mapped.kind === 'builtin' || mapped.kind === 'custom') {
      register(mapped.key, name);
    }
  }
  // Cast is NOT mirrored into breakdownElements (Lemon's `castMembers` is the
  // single source; `migrateLegacyCastMirror` strips any mirror on LOAD).
  project.breakdownElements = registry;

  project.customCategories = Object.entries(registry)
    .filter(([key]) => {
      const label = Object.entries(catMap).find(([, v]) => v.kind === 'custom' && v.key === key)?.[0];
      return !!label;
    })
    .map(([key]) => ({ key, label: labelForCustomKey(catMap, key), icon: 'Tag' as const }));

  // --- calendars -----------------------------------------------------------
  const calendars = parseCalendars(calendarsDoc);

  // --- versions (one per stripboard) ---------------------------------------
  const activeBoardName = readActiveBoard(stripboardDoc);
  const rowsByBoard = buildVersionRows(stripboardDoc, sceneIdByBdsid, estimateById);
  const now = Date.now();
  project.versions = rowsByBoard.map(([boardName, boardRows]) => {
    const cal = calendars.get(boardAttrCalendar(stripboardDoc, boardName));
    const version: any = {
      id: generateUUID(),
      name: boardName,
      createdAt: now,
      updatedAt: now,
      rows: boardRows,
      productionStart: cal?.productionStart || undefined,
      nonShootDates: cal?.nonShootDates || [],
    };
    if (boardName === activeBoardName) project.activeVersionId = version.id;
    return version;
  });
  project.activeVersionId = project.activeVersionId || project.versions[0]?.id;

  return project;
}

function labelForCustomKey(catMap: Record<string, MappedCategory>, key: string): string {
  return Object.entries(catMap).find(([, v]) => v.kind === 'custom' && v.key === key)?.[0] || key;
}

// ------------------------------------------------------------------ boards

function readActiveBoard(stripboardDoc: Document): string | undefined {
  for (const prop of stripboardDoc.getElementsByTagName('Property')) {
    if (prop.getAttribute('Name') === 'ActiveStripBoard') {
      return prop.getAttribute('Value') || undefined;
    }
  }
  return undefined;
}

function boardAttrCalendar(stripboardDoc: Document, boardName: string): string | undefined {
  for (const board of stripboardDoc.getElementsByTagName('StripBoard')) {
    if (board.getAttribute('Name') === boardName) {
      return board.getAttribute('CalendarName') || undefined;
    }
  }
  return undefined;
}

function buildVersionRows(
  stripboardDoc: Document,
  sceneIdByBdsid: Map<string, string>,
  estimateById: Map<string, number>,
): [string, ScheduleRow[]][] {
  const out: [string, ScheduleRow[]][] = [];
  for (const board of stripboardDoc.getElementsByTagName('StripBoard')) {
    const boardName = board.getAttribute('Name');
    if (!boardName) continue;
    const rows: ScheduleRow[] = [];
    let order = 0;
    // The pinned DAYBREAK anchors section 0; the first ScheduleDay lands in
    // section 1 with no preceding break row (canonical layout:
    // [pinned] [day 1] [break] [day 2] [break] ... — N days = N-1 breaks).
    rows.push({
      id: generateUUID(),
      type: 'DAYBREAK',
      containerId: 1,
      order: order++,
      daybreakLabel: 'DAYBREAK',
      daybreakCallTime: '08:00',
      pinned: true,
    });
    const sceneRow = (bdsid: string, containerId: number | null) => {
      const sceneId = sceneIdByBdsid.get(bdsid);
      if (!sceneId) return;
      rows.push({
        id: generateUUID(),
        type: 'SCENE',
        containerId,
        order: order++,
        sceneId,
        estimatedDuration: estimateById.get(sceneId),
      });
    };
    const scheduled = board.getElementsByTagName('ScheduledStrips')[0];
    let dayIdx = 0;
    if (scheduled) {
      for (const child of Array.from(scheduled.children)) {
        if (child.tagName === 'ScheduleDay') {
          if (dayIdx > 0) {
            rows.push({
              id: generateUUID(),
              type: 'DAYBREAK',
              containerId: 1,
              order: order++,
              daybreakLabel: '',
              daybreakCallTime: '08:00',
            });
          }
          dayIdx++;
          for (const item of Array.from(child.children)) {
            if (item.tagName === 'BDSStrip' && item.getAttribute('BDSID')) {
              sceneRow(item.getAttribute('BDSID')!, 1);
            } else if (item.tagName === 'BannerStrip') {
              rows.push({
                id: generateUUID(),
                type: 'NOTE',
                containerId: 1,
                order: order++,
                noteText: item.getAttribute('Text') || '',
              });
            }
          }
        } else if (child.tagName === 'RemainingScheduledStrips') {
          for (const strip of Array.from(child.children)) {
            if (strip.tagName === 'BDSStrip' && strip.getAttribute('BDSID')) {
              sceneRow(strip.getAttribute('BDSID')!, null);
            }
          }
        }
      }
    }
    for (const unscheduled of Array.from(board.getElementsByTagName('UnscheduledStrips'))) {
      for (const strip of Array.from(unscheduled.children)) {
        if (strip.tagName === 'BDSStrip' && strip.getAttribute('BDSID')) {
          sceneRow(strip.getAttribute('BDSID')!, null);
        }
      }
    }
    out.push([boardName, rows]);
  }
  return out;
}

// ----------------------------------------------------------------- calendar

interface CalModel {
  productionStart?: string;
  nonShootDates: { date: string; status: string }[];
}

function parseCalendars(calendarsDoc: Document | undefined): Map<string, CalModel> {
  const out = new Map<string, CalModel>();
  if (!calendarsDoc) return out;
  for (const cal of calendarsDoc.getElementsByTagName('Calendar')) {
    const name = cal.getAttribute('Name');
    if (!name) continue;
    let prodStart: string | null = null;
    let prodEnd: string | null = null;
    for (const sd of cal.getElementsByTagName('ScheduleDate')) {
      const iso = parseMmddyyyy(sd.getAttribute('Date') || '');
      const dateName = sd.getAttribute('Name');
      if (dateName === 'ProductionStartDate') prodStart = iso;
      if ((dateName === 'ProductionEndDate' || dateName === 'ProductionWrapDate') && iso) prodEnd = iso;
    }
    const daysOff: Record<string, boolean> = {};
    for (const doEl of cal.getElementsByTagName('DaysOff')) {
      for (const day of WEEKDAYS) daysOff[day] = doEl.getAttribute(day) === '1';
    }
    const specials: { date: string; holiday: boolean; travel: boolean; off: boolean }[] = [];
    for (const sp of cal.getElementsByTagName('SpecialDay')) {
      const iso = parseMmddyyyy(sp.getAttribute('Date') || '');
      if (!iso) continue;
      specials.push({
        date: iso,
        holiday: sp.getAttribute('Holiday') === '1',
        travel: sp.getAttribute('CompanyTravel') === '1',
        off: sp.getAttribute('Off') === '1',
      });
    }
    out.set(name, materializeCalendar(prodStart, prodEnd, daysOff, specials));
  }
  return out;
}

/** Materialize the weekly pattern + special days into explicit dates bounded
 *  to the production window (off/weekends/holidays → `holiday` = "Day Off";
 *  company travel → `travel`). */
function materializeCalendar(
  prodStart: string | null,
  prodEnd: string | null,
  daysOff: Record<string, boolean>,
  specials: { date: string; holiday: boolean; travel: boolean; off: boolean }[],
): CalModel {
  if (!prodStart) return { nonShootDates: [] };
  const lo = new Date(prodStart + 'T00:00:00Z');
  const hi = prodEnd ? new Date(prodEnd + 'T00:00:00Z') : lo;
  const day = 86400000;
  const status: Record<string, string> = {};
  const skirt = (d: Date) => lo.getTime() - 30 * day <= d.getTime() && d.getTime() <= hi.getTime() + 30 * day;
  for (const sp of specials) {
    const d = new Date(sp.date + 'T00:00:00Z');
    if (!skirt(d)) continue;
    if (sp.holiday || sp.off) status[sp.date] = 'holiday';
    else if (sp.travel) status[sp.date] = 'travel';
  }
  if (Object.values(daysOff).some(v => v)) {
    for (let t = lo.getTime(); t <= hi.getTime(); t += day) {
      const d = new Date(t);
      const weekday = WEEKDAYS[d.getUTCDay()];
      if (daysOff[weekday]) {
        const iso = d.toISOString().slice(0, 10);
        if (!status[iso]) status[iso] = 'holiday';
      }
    }
  }
  return {
    productionStart: prodStart,
    nonShootDates: Object.entries(status)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, s]) => ({ date, status: s })),
  };
}