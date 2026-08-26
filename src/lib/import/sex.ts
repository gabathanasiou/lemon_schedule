import {
  CustomCategoryDef,
  Project,
  ProjectElement,
  Scene,
  ScheduleRow,
} from '../../types';
import { formatPageCount, generateUUID } from '../utils';
import { makeBlankProject } from '../../store/reducer';
import {
  categoryNameToKey,
  normalizeCharacterName,
  parseSceneHeading,
} from './shared';

/**
 * SEX (Scheduling EXport, "SSI*") — the interchange format for Movie Magic
 * Scheduling 5/6/10, EP Scheduling, Gorilla, Final Draft Tagger and
 * Screenwriter (roadmap item 41). Binary, null-delimited; reference parser
 * `tools/sex_probe.py`, golden `e2e/fixtures/lair-v10.expected.json`.
 *
 * Layout (verified on a native MMS 6 export):
 *   "SSI*" + 10 header bytes (version bytes; the FINAL-DRAFT-neutral zero-fill
 *   is what every MMS version accepts — `exportSex` writes that) +
 *   null-terminated category labels (double-null ends) +
 *   records: "#\0\0\0" u16LE length (counts type+payload) u16LE type, payload:
 *     1 = scene header:  counter byte, script start page (ASCII), \t, scene
 *                        number, \t, slugline, \t, \0
 *     2 = element:       u16LE scene idx, u8 category flag (index into the
 *                        category list), text, \0
 *     3 = page metadata: u16LE scene idx, u16LE 0, u16LE length in eighths
 *
 * SEX carries NO schedule data (no day breaks / strip order) — scenes import
 * into the Boneyard (no sections invented) and export writes the same
 * breakdown shape back out. NEW-PROJECT-ONLY (user decision, same as .msd).
 */

const SEX_MAGIC = 'SSI*';
const RECORD_MARKER = new Uint8Array([0x23, 0, 0, 0]); // '#'

/** Category label → Lemon category key. Unknown/absent → custom category. */
const SEX_CATEGORY_MAP: Record<string, string> = {
  'Cast Members': 'cast',
  'Extras': 'backgroundActors',
  'Stunts': 'stunts',
  'Vehicles': 'vehicles',
  'Props': 'props',
  'Special Effects': 'sfx',
  'Costumes': 'wardrobe',
  'Makeup': 'makeup',
  'Livestock': 'animalsAndWranglers',
  'Animal Handler': 'animalsAndWranglers',
  'Music': 'music',
  'Sound': 'sound',
  'Set Dressing': 'setDressing',
  'Greenery': 'greenery',
  'Optical FX': 'sfx',
  'Mechanical FX': 'sfx',
  'Notes': 'notes',
};

/** Categories whose refs are scene FIELDS (never element categories). */
const SCENE_FIELD_KEYS = new Set(['notes', 'setDressing']);

/** The 21 standard MMS category labels, in the canonical file order — the
 *  flag byte of every element is an index into this list. */
const EXPORT_CATEGORIES = [
  'Cast Members', 'Extras', 'Stunts', 'Vehicles', 'Props', 'Special Effects',
  'Costumes', 'Makeup', 'Livestock', 'Animal Handler', 'Music', 'Sound',
  'Set Dressing', 'Greenery', 'Special Equipment', 'Security',
  'Additional Labor', 'Optical FX', 'Mechanical FX', 'Miscellaneous', 'Notes',
];

/** Lemon category key → SEX export label (first canonical match). */
const CATEGORY_TO_SEX_LABEL: Record<string, string> = {
  'cast': 'Cast Members',
  'backgroundActors': 'Extras',
  'stunts': 'Stunts',
  'vehicles': 'Vehicles',
  'props': 'Props',
  'sfx': 'Special Effects',
  'wardrobe': 'Costumes',
  'makeup': 'Makeup',
  'animalsAndWranglers': 'Animal Handler',
  'music': 'Music',
  'sound': 'Sound',
  'setDressing': 'Set Dressing',
  'greenery': 'Greenery',
  'notes': 'Notes',
};

interface ParsedScene {
  sceneNumber: string;
  scriptPageNumbers?: string;
  slugline: string;
  pgEighths: number;
  cast: string[];
  fields: Record<string, string[]>;
}

interface ParsedSex {
  categories: string[];
  scenes: ParsedScene[];
}

// ------------------------------------------------------------------ import

export function parseSex(buffer: ArrayBuffer, fallbackTitle?: string): Project {
  const bytes = new Uint8Array(buffer);
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 8));
  if (!head.startsWith(SEX_MAGIC)) {
    throw new Error('Not a Scheduling Exchange (.sex) file — missing SSI* header.');
  }
  const parsed = parseRecords(bytes);
  return buildProject(parsed, fallbackTitle);
}

export async function parseSexFile(file: File, fallbackTitle?: string): Promise<Project> {
  return parseSex(await file.arrayBuffer(), fallbackTitle);
}

function parseRecords(bytes: Uint8Array): ParsedSex {
  // Category list starts at the first uppercase ASCII letter after the header.
  let pos = 4;
  while (pos < Math.min(bytes.length, 200) && !(bytes[pos] >= 0x41 && bytes[pos] <= 0x5a)) {
    pos++;
  }
  const categories: string[] = [];
  while (pos < bytes.length && bytes[pos] !== 0) {
    const end = bytes.indexOf(0, pos);
    if (end === -1) break;
    const label = new TextDecoder('latin1').decode(bytes.subarray(pos, end));
    if (label && label !== '#') categories.push(label);
    pos = end + 1;
  }
  // double-null terminates the category list
  while (pos < bytes.length && bytes[pos] === 0) pos++;

  const scenes: ParsedScene[] = [];
  const elementsByScene = new Map<number, [number, string][]>();
  while (pos + 6 < bytes.length && bytes[pos] === RECORD_MARKER[0]
    && bytes[pos + 1] === 0 && bytes[pos + 2] === 0 && bytes[pos + 3] === 0) {
    const recLen = bytes[pos + 4] | (bytes[pos + 5] << 8);
    const recType = bytes[pos + 6] | (bytes[pos + 7] << 8);
    const payload = bytes.subarray(pos + 8, pos + 6 + recLen);
    if (recType === 1) {
      let cursor = 1; // skip the leading counter byte
      let j = cursor;
      while (j < payload.length && payload[j] !== 0x09) j++;
      const scriptPage = new TextDecoder('latin1').decode(payload.subarray(cursor, j));
      cursor = j + 1;
      j = cursor;
      while (j < payload.length && payload[j] !== 0x09) j++;
      const sceneNum = new TextDecoder('latin1').decode(payload.subarray(cursor, j));
      cursor = j + 1;
      let slugEnd = cursor;
      while (slugEnd < payload.length && payload[slugEnd] !== 0x09) slugEnd++;
      const slugline = new TextDecoder('latin1')
        .decode(payload.subarray(cursor, slugEnd)).trim();
      scenes.push({
        sceneNumber: sceneNum,
        scriptPageNumbers: scriptPage || undefined,
        slugline,
        pgEighths: 0,
        cast: [],
        fields: {},
      });
    } else if (recType === 2) {
      const sidx = payload[0] | (payload[1] << 8);
      const flag = payload[2];
      let textEnd = 3;
      while (textEnd < payload.length && payload[textEnd] !== 0) textEnd++;
      const text = new TextDecoder('latin1').decode(payload.subarray(3, textEnd));
      const list = elementsByScene.get(sidx) || [];
      list.push([flag, text]);
      elementsByScene.set(sidx, list);
    } else if (recType === 3) {
      const sidx = payload[0] | (payload[1] << 8);
      const eighths = payload[4] | (payload[5] << 8);
      const scene = scenes[sidx - 1];
      if (scene) scene.pgEighths = eighths;
    }
    pos += 6 + recLen;
  }

  for (const [sidx, els] of elementsByScene) {
    const scene = scenes[sidx - 1];
    if (!scene) continue;
    for (const [flag, raw] of els) {
      const label = categories[flag];
      const key = label === undefined ? undefined
        : SEX_CATEGORY_MAP[label] ?? categoryNameToKey(label);
      if (label === 'Cast Members' || key === 'cast') {
        const name = normalizeCharacterName(raw);
        if (name && !scene.cast.includes(name)) scene.cast.push(name);
        continue;
      }
      if (!key) continue;
      if (SCENE_FIELD_KEYS.has(key)) {
        (scene.fields[key] ||= []).push(raw.trim());
      } else {
        (scene.fields[key] ||= []).push(raw.trim());
      }
    }
  }
  for (const s of scenes) {
    for (const [k, v] of Object.entries(s.fields)) s.fields[k] = v.filter(x => x);
  }
  return { categories, scenes };
}

function buildProject(parsed: ParsedSex, fallbackTitle?: string): Project {
  const project = makeBlankProject(fallbackTitle || 'Imported SEX Schedule');
  const seen = new Set<string>();
  const names = parsed.scenes.flatMap(s => s.cast);
  const castOrder: string[] = [];
  for (const name of names) {
    if (name && !seen.has(name)) {
      seen.add(name);
      castOrder.push(name);
    }
  }
  const castIdByIndex = new Map(castOrder.map((name, i) => [name, String(i + 1)]));

  const registry: Record<string, ProjectElement[]> = {};
  const register = (key: string, name: string) => {
    if (!registry[key]) registry[key] = [];
    if (!registry[key].some(e => e.name === name)) {
      registry[key].push({ id: name, name });
    }
  };

  const scenes: Scene[] = parsed.scenes.map(s => {
    const totalPages = s.pgEighths / 8;
    const castIds = s.cast.map(name => castIdByIndex.get(name)).filter(Boolean);
    const heading = parseSceneHeading(s.slugline, 'DAY');
    const scene: any = {
      id: generateUUID(),
      sceneNumber: s.sceneNumber,
      ...(s.scriptPageNumbers ? { scriptPageNumbers: s.scriptPageNumbers } : {}),
      pageCount: formatPageCount(totalPages),
      pageCountDecimal: totalPages,
      scriptDay: '',
      intExt: heading?.intExt || 'INT',
      set: heading?.set ?? '',
      dayNight: heading?.dayNight || 'DAY',
      description: '',
      cast: castIds.join(', '),
      notes: (s.fields.notes || []).join(' '),
      backgroundActors: (s.fields.backgroundActors || []).join(', '),
      stunts: (s.fields.stunts || []).join(', '),
      vehicles: (s.fields.vehicles || []).join(', '),
      props: (s.fields.props || []).join(', '),
      wardrobe: (s.fields.wardrobe || []).join(', '),
      makeup: (s.fields.makeup || []).join(', '),
      sfx: (s.fields.sfx || []).join(', '),
      vfx: (s.fields.vfx || []).join(', '),
      sound: (s.fields.sound || []).join(', '),
      music: (s.fields.music || []).join(', '),
      animalsAndWranglers: (s.fields.animalsAndWranglers || []).join(', '),
      weapons: (s.fields.weapons || []).join(', '),
      greenery: (s.fields.greenery || []).join(', '),
      artDept: (s.fields.artDept || []).join(', '),
      location: '',
      sequence: '',
      unit: '',
    };
    for (const [key, items] of Object.entries(s.fields)) {
      if (!(key in scene)) scene[key] = items.join(', ');
    }
    for (const [key, items] of Object.entries(s.fields)) {
      for (const item of items) {
        if (key === 'cast') continue;
        for (const part of item.split(',')) {
          const t = part.trim();
          if (t) register(key, t);
        }
      }
    }
    return scene as Scene;
  });
  project.scenes = scenes;
  project.castMembers = castOrder.map((name, i) => ({ id: String(i + 1), name }));
  const catMapLabels = new Map<string, string>();
  for (const label of parsed.categories) {
    const key = SEX_CATEGORY_MAP[label] ?? categoryNameToKey(label);
    catMapLabels.set(key, label);
  }
  project.breakdownElements = registry;
  const customCategories: CustomCategoryDef[] = [];
  for (const [key, elements] of Object.entries(registry)) {
    const label = catMapLabels.get(key);
    if (label && !SEX_CATEGORY_MAP[label]) {
      customCategories.push({ key, label, icon: 'Tag' });
    }
  }
  project.customCategories = customCategories;

  // Breakdown-only: scenes land in the Boneyard, no sections invented.
  const rows: ScheduleRow[] = [];
  let order = 0;
  rows.push({
    id: generateUUID(),
    type: 'DAYBREAK',
    containerId: 1,
    order: order++,
    daybreakLabel: 'DAYBREAK',
    daybreakCallTime: '08:00',
    pinned: true,
  });
  for (const s of scenes) {
    rows.push({
      id: generateUUID(),
      type: 'SCENE',
      containerId: null,
      order: order++,
      sceneId: s.id,
    });
  }
  const now = Date.now();
  project.versions = [{
    id: generateUUID(),
    name: 'v01',
    createdAt: now,
    updatedAt: now,
    rows,
    nonShootDates: [],
  }];
  project.activeVersionId = project.versions[0].id;
  return project;
}

// ------------------------------------------------------------------ export

/** The canonical category list used for EXPORT: the standard MMS 21 plus the
 *  project's custom category labels (appended — MMS auto-creates them). */
function exportCategories(project: Project): string[] {
  const labels = [...EXPORT_CATEGORIES];
  for (const c of project.customCategories || []) {
    if (!labels.includes(c.label)) labels.push(c.label);
  }
  return labels;
}

function categoryLabelFor(project: Project, key: string): string | undefined {
  const fixed = CATEGORY_TO_SEX_LABEL[key];
  if (fixed) return fixed;
  const custom = (project.customCategories || []).find(c => c.key === key);
  return custom?.label;
}

/** Serialize a Project as a SEX file. Pure download — no state change.
 *  Header uses the Final-Draft-neutral zero-fill so MMS 5/6/10 all accept it. */
export function exportSex(project: Project): Uint8Array {
  const categories = exportCategories(project);
  const labelToFlag = new Map(categories.map((l, i) => [l, i]));
  const out: number[] = [];
  const push = (...bytes: number[]) => out.push(...bytes);
  const pushStr = (s: string) => {
    for (const b of new TextEncoder().encode(s)) push(b);
    push(0);
  };

  // header: SSI* + 10 zero bytes (neutral form)
  push(0x53, 0x53, 0x49, 0x2a);
  for (let i = 0; i < 10; i++) push(0);
  for (const label of categories) pushStr(label);
  push(0, 0);

  const byId = new Map((project.castMembers || []).map(m => [m.id, m]));
  const splitNames = (value: string | undefined) =>
    (value || '').split(',').map(x => x.trim()).filter(Boolean);

const SCENE_FIELD_ORDER = [
  'cast', 'backgroundActors', 'stunts', 'vehicles', 'props', 'sfx',
  'wardrobe', 'makeup', 'animalsAndWranglers', 'music', 'sound',
  'setDressing', 'greenery', 'weapons', 'vfx', 'artDept', 'notes',
];

const BUILTIN_KEYS = new Set([
  'id', 'sceneNumber', 'scriptPageNumbers', 'pageCount', 'pageCountDecimal',
  'scriptDay', 'intExt', 'set', 'dayNight', 'description', 'notes', 'cast',
  'location',
]);

  let counter = 0;
  let sceneIdx = 0;
  project.scenes.forEach(scene => {
    sceneIdx++;
    counter = (counter + 1) & 0xff;
    const total = scene.pageCountDecimal || 0;
    const eighths = Math.min(0xffff, Math.round(total * 8));
    const scriptPage = scene.scriptPageNumbers
      ? scene.scriptPageNumbers.replace(/[^\d]/g, '') || '0'
      : String(Math.floor(total));
    const slugline = `${scene.intExt || 'INT'}. ${scene.set || ''} - ${scene.dayNight || 'DAY'}`;

    // type 1: scene header
    const t1Payload = [
      counter,
      ...new TextEncoder().encode(scriptPage),
      0x09,
      ...new TextEncoder().encode(scene.sceneNumber),
      0x09,
      ...new TextEncoder().encode(slugline),
      0x09,
      0,
    ];
    push(...RECORD_MARKER);
    push((2 + t1Payload.length) & 0xff, (2 + t1Payload.length) >> 8);
    push(1, 0);
    push(...t1Payload);

    // type 3: page metadata (eighths)
    const t3Payload = [sceneIdx & 0xff, sceneIdx >> 8, 0, 0, eighths & 0xff, eighths >> 8];
    push(...RECORD_MARKER);
    push(8, 0, 3, 0);
    push(...t3Payload);

    // type 2: elements (cast first, then category fields in canonical order)
    const items: [number, string][] = [];
    const seenKeys = new Set<string>();
    const add = (label: string | undefined, name: string) => {
      if (!label) return;
      const flag = labelToFlag.get(label);
      if (flag === undefined || seenKeys.has(name)) return;
      items.push([flag, name]);
    };
    for (const idStr of splitNames(scene.cast)) {
      const m = byId.get(idStr);
      if (m) add(categoryLabelFor(project, 'cast'), m.name);
    }
    for (const key of SCENE_FIELD_ORDER) {
      if (key === 'cast' || key === 'notes') continue;
      const label = categoryLabelFor(project, key);
      for (const name of splitNames((scene as any)[key] as string)) {
        add(label, name);
      }
    }
    for (const [key, values] of Object.entries(scene).filter(([k]) =>
      !SCENE_FIELD_ORDER.includes(k) && !BUILTIN_KEYS.has(k))) {
      const label = categoryLabelFor(project, key);
      for (const name of splitNames(values as string)) add(label, name);
    }
    if ((scene.notes || '').trim()) {
      add(categoryLabelFor(project, 'notes'), scene.notes.trim());
    }
    for (const [flag, name] of items) {
      const t2Payload = [
        sceneIdx & 0xff, sceneIdx >> 8, flag,
        ...new TextEncoder().encode(name), 0,
      ];
      push(...RECORD_MARKER);
      const len = 2 + 3 + name.length + 1;
      push(len & 0xff, len >> 8, 2, 0);
      push(...t2Payload);
    }
  });
  return new Uint8Array(out);
}

export function exportSexFile(project: Project, title: string): void {
  const bytes = exportSex(project);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^\w\- ]+/g, '').trim() || 'schedule'}.sex`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}