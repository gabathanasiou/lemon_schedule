import { diffWords } from 'diff';
import type { Change } from 'diff';
import type { CustomCategoryDef, Scene, SceneFieldSnapshot, ScriptDocument } from '../../types';
import { ELEMENT_CATEGORIES, getFieldItems } from '../categories';
import { formatPageCount } from '../utils';
import { normalizeSceneNumber, scriptSceneOf } from '../script';
import type { ParsedScene } from './shared';

/**
 * Script version diff (roadmap 38) — pure module, no store/UI deps.
 *
 * Matches the incoming screenplay's scenes against the current saved scenes
 * with three escalating signals (scene number → heading → content similarity),
 * aligned order-aware (Needleman-Wunsch) so a mid-list insert never cascades
 * wrong matches, then diffs the matched pairs per field. The UI (ImportDialog)
 * and `commitScriptDiff` consume the result; nothing here mutates state.
 */

// Scene fields that are simple equality comparisons.
const VALUE_FIELDS = ['intExt', 'set', 'dayNight', 'scriptDay', 'location', 'notes'] as const;
// `set` is compared via the heading; cast/elements are item-set diffs.
const IGNORED_CATEGORIES = new Set(['cast', 'set', 'scriptDay', 'description']);

export interface ScriptSceneView {
  sceneNumber: string;
  intExt: string;
  set: string;
  dayNight: string;
  /** Undefined when the source carried no page count (CSV/Fountain/FDX w/o
   *  `<SceneProperties>`) — never diffed or summed as 0. */
  pageCountDecimal?: number;
  scriptDay: string;
  location: string;
  notes: string;
  description: string;
  /** Cast member NAMES (old scenes resolve ids → names via the caller's map). */
  cast: string[];
  /** category key → element NAMES. */
  elements: Record<string, string[]>;
  bodyText: string;
  tokens: Set<string>;
}

export type DiffStatus = 'unchanged' | 'modified' | 'added' | 'removed';

export interface SceneFieldDiff {
  key: string;
  kind: 'value' | 'items' | 'body';
  before: string;
  after: string;
  added: string[];
  removed: string[];
  wordChanges?: Change[];
  /** Value at the last accepted import (roadmap 38), present only when it
   *  differs from `before` — i.e. the user hand-edited this field since that
   *  import. The review shows it as "was: …" so taking the script is explicit. */
  baseline?: string;
  /** True when `baseline` is present (an in-app edit vs the incoming change). */
  conflict?: boolean;
}

export interface SceneDiffEntry {
  status: DiffStatus;
  /** Display number: the incoming scene's for paired/added, the old one's for removed. */
  sceneNumber: string;
  oldScene?: Scene;
  newScene?: ParsedScene;
  fields: SceneFieldDiff[];
  similarity: number;
  /** Added scene that appears to be a split fragment of this old scene number. */
  splitOf?: string;
  /** Removed scene that appears to have merged into this paired scene number. */
  mergedInto?: string;
}

export interface ScriptDiffResult {
  entries: SceneDiffEntry[];
  summary: { unchanged: number; modified: number; added: number; removed: number };
  pageDelta: number;
  /** Cast names that appear to have been renamed (old disappears everywhere,
   *  new appears in a near-identical set of scenes) — applied as a rename of
   *  the SAME cast member id, never an add + orphan. */
  castRenames: { from: string; to: string }[];
}

/** Below this Jaccard similarity a number/heading-less pair is not matched. */
export const MATCH_SIMILARITY_THRESHOLD = 0.5;

function normalizeSet(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function headingSignature(v: ScriptSceneView): string {
  return `${v.intExt}|${normalizeSet(v.set)}|${v.dayNight}`;
}

function tokenize(parts: string[]): Set<string> {
  const set = new Set<string>();
  for (const part of parts) {
    for (const raw of part.toLowerCase().split(/[^a-z0-9']+/)) {
      const t = raw.trim();
      if (t.length > 1) set.add(t);
    }
  }
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** All body text of the scene with this number in the retained document. */
export function sceneBodyText(doc: ScriptDocument | undefined, sceneNumber: string): string {
  const scene = scriptSceneOf(doc, sceneNumber);
  if (!scene) return '';
  return scene.blocks.filter(([type]) => type !== 'page_break').map(([, text]) => text).filter(Boolean).join('\n');
}

function buildView(
  base: Omit<ScriptSceneView, 'tokens'>,
): ScriptSceneView {
  const tokens = tokenize([
    base.bodyText,
    base.cast.join(' '),
    ...Object.values(base.elements).flat(),
    base.location,
  ]);
  return { ...base, tokens };
}

export function sceneToView(
  scene: Scene,
  castNameById: Map<string, string>,
  customCategories: CustomCategoryDef[],
  bodyText: string,
): ScriptSceneView {
  const categoryKeys = [
    ...ELEMENT_CATEGORIES.map(c => c.key),
    ...customCategories.map(c => c.key),
  ];
  const elements: Record<string, string[]> = {};
  for (const key of categoryKeys) {
    if (IGNORED_CATEGORIES.has(key)) continue;
    const items = getFieldItems(key, ((scene as any)[key] as string) || '');
    if (items.length) elements[key] = items;
  }
  const cast = getFieldItems('cast', scene.cast || '').map(id => castNameById.get(id) || id);
  return buildView({
    sceneNumber: scene.sceneNumber,
    intExt: scene.intExt || '',
    set: scene.set || '',
    dayNight: scene.dayNight || '',
    pageCountDecimal: scene.pageCountDecimal || undefined,
    scriptDay: scene.scriptDay || '',
    location: scene.location || '',
    notes: scene.notes || '',
    description: scene.description || '',
    cast,
    elements,
    bodyText: bodyText || scene.description || '',
  });
}

export function parsedToView(
  parsed: ParsedScene,
  customCategories: CustomCategoryDef[],
  bodyText: string,
): ScriptSceneView {
  const categoryKeys = [
    ...ELEMENT_CATEGORIES.map(c => c.key),
    ...customCategories.map(c => c.key),
  ];
  const elements: Record<string, string[]> = {};
  for (const key of categoryKeys) {
    if (IGNORED_CATEGORIES.has(key)) continue;
    const val = parsed.taggedElements[key];
    if (val && val.length) elements[key] = [...val];
  }
  const cast = parsed.characters.length
    ? [...parsed.characters]
    : (parsed.rawCast || '').split(',').map(x => x.trim()).filter(Boolean);
  const notes = (parsed.taggedElements.notes || []).join(', ');
  const location = (parsed.taggedElements.location || []).join(', ');
  const scriptDay = (parsed.taggedElements.scriptDay || []).join(', ');
  return buildView({
    sceneNumber: parsed.sceneNumber,
    intExt: parsed.intExt || '',
    set: parsed.set || '',
    dayNight: parsed.dayNight || '',
    pageCountDecimal: parsed.pageCountDecimal,
    scriptDay,
    location,
    notes,
    description: parsed.description || '',
    cast,
    elements,
    bodyText: bodyText || parsed.description || '',
  });
}

function matchScore(a: ScriptSceneView, b: ScriptSceneView): number {
  const na = normalizeSceneNumber(a.sceneNumber);
  const nb = normalizeSceneNumber(b.sceneNumber);
  if (na && na === nb) return 3;
  if (normalizeSet(a.set) && headingSignature(a) === headingSignature(b)) return 2;
  const sim = jaccard(a.tokens, b.tokens);
  return sim >= MATCH_SIMILARITY_THRESHOLD ? 1 + sim : 0;
}

export function similarity(a: ScriptSceneView, b: ScriptSceneView): number {
  return jaccard(a.tokens, b.tokens);
}

function diffItems(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const b = new Set(before);
  const a = new Set(after);
  return {
    added: after.filter(x => !b.has(x)),
    removed: before.filter(x => !a.has(x)),
  };
}

/** Normalize a value field for comparison so case/punctuation drift (INT vs
 *  int, "CORRIDOR -" vs "CORRIDOR") never reads as a change. `set` gets the
 *  stronger heading normalization; the display still shows the raw strings. */
function normalizeValue(key: string, value: string): string {
  const v = value || '';
  if (key === 'set') return normalizeSet(v);
  if (key === 'intExt' || key === 'dayNight') return v.trim().toUpperCase().replace(/\s+/g, ' ');
  return v;
}

function compareValue(key: string, before: string, after: string): SceneFieldDiff | null {
  if (normalizeValue(key, before) === normalizeValue(key, after)) return null;
  return { key, kind: 'value', before, after, added: [], removed: [] };
}

function compareItems(key: string, before: string[], after: string[]): SceneFieldDiff | null {
  const { added, removed } = diffItems(before, after);
  if (added.length === 0 && removed.length === 0) return null;
  return { key, kind: 'items', before: before.join(', '), after: after.join(', '), added, removed };
}

function compareBody(before: string, after: string): SceneFieldDiff | null {
  if (before === after) return null;
  const wordChanges = diffWords(before, after);
  return { key: 'body', kind: 'body', before, after, added: [], removed: [], wordChanges };
}

/** Build a comparable view from a stored baseline field snapshot, so a live
 *  scene and its "last imported" reference use the SAME comparison logic. */
function snapshotToView(snap: SceneFieldSnapshot, castNameById: Map<string, string>, customCategories: CustomCategoryDef[]): ScriptSceneView {
  const categoryKeys = [
    ...ELEMENT_CATEGORIES.map(c => c.key),
    ...customCategories.map(c => c.key),
  ];
  const elements: Record<string, string[]> = {};
  for (const key of categoryKeys) {
    if (IGNORED_CATEGORIES.has(key)) continue;
    const items = getFieldItems(key, snap.fields[key] || '');
    if (items.length) elements[key] = items;
  }
  const cast = getFieldItems('cast', snap.fields.cast || '').map(id => castNameById.get(id) || id);
  return buildView({
    sceneNumber: snap.sceneNumber,
    intExt: snap.fields.intExt || '',
    set: snap.fields.set || '',
    dayNight: snap.fields.dayNight || '',
    pageCountDecimal: snap.pageCountDecimal,
    scriptDay: snap.fields.scriptDay || '',
    location: snap.fields.location || '',
    notes: snap.fields.notes || '',
    description: snap.fields.description || '',
    cast,
    elements,
    bodyText: '',
  });
}

function baselineValueFor(key: string, base: ScriptSceneView): string {
  if (key === 'pageCount') return base.pageCountDecimal != null ? formatPageCount(base.pageCountDecimal) : '';
  if (key === 'cast') return base.cast.join(', ');
  if (base.elements[key]) return base.elements[key].join(', ');
  return (base as any)[key] ?? '';
}

function baselineItemsFor(key: string, base: ScriptSceneView): string[] {
  if (key === 'cast') return base.cast;
  return base.elements[key] || [];
}

/** Mark a changed field when the CURRENT value already differs from the last
 *  imported value — the user edited it in-app, and the incoming script also
 *  changes it. `baseline` carries the "was: …" value (roadmap 38). */
function annotateConflicts(fields: SceneFieldDiff[], current: ScriptSceneView, base: ScriptSceneView | undefined): void {
  if (!base) return;
  for (const f of fields) {
    if (f.kind === 'body') continue;
    if (f.kind === 'value') {
      const was = baselineValueFor(f.key, base);
      if (normalizeValue(f.key, was) !== normalizeValue(f.key, f.before)) {
        f.baseline = was;
        f.conflict = true;
      }
    } else {
      const was = baselineItemsFor(f.key, base);
      const now = f.key === 'cast' ? current.cast : (current.elements[f.key] || []);
      const { added, removed } = diffItems(was, now);
      if (added.length || removed.length) {
        f.baseline = was.join(', ');
        f.conflict = true;
      }
    }
  }
}

function diffPair(a: ScriptSceneView, b: ScriptSceneView, baseline?: ScriptSceneView): SceneFieldDiff[] {
  const fields: SceneFieldDiff[] = [];
  // The scene number is diffable too (a renumbered-but-matched scene).
  if (normalizeSceneNumber(a.sceneNumber) !== normalizeSceneNumber(b.sceneNumber)) {
    fields.push({ key: 'sceneNumber', kind: 'value', before: a.sceneNumber, after: b.sceneNumber, added: [], removed: [] });
  }
  for (const key of VALUE_FIELDS) {
    const v = compareValue(key, (a as any)[key], (b as any)[key]);
    if (v) fields.push(v);
  }
  const page = a.pageCountDecimal != null && b.pageCountDecimal != null && a.pageCountDecimal !== b.pageCountDecimal
    ? compareValue('pageCount', formatPageCount(a.pageCountDecimal), formatPageCount(b.pageCountDecimal))
    : null;
  if (page) fields.push(page);

  const castDiff = compareItems('cast', a.cast, b.cast);
  if (castDiff) fields.push(castDiff);

  const elementKeys = new Set([...Object.keys(a.elements), ...Object.keys(b.elements)]);
  for (const key of elementKeys) {
    const d = compareItems(key, a.elements[key] || [], b.elements[key] || []);
    if (d) fields.push(d);
  }

  const body = compareBody(a.bodyText, b.bodyText);
  if (body) fields.push(body);

  annotateConflicts(fields, a, baseline);
  return fields;
}

export function diffScripts(
  oldScenes: Scene[],
  newScenes: ParsedScene[],
  opts: {
    castNameById: Map<string, string>;
    customCategories?: CustomCategoryDef[];
    oldBody?: ScriptDocument;
    newBody?: ScriptDocument;
    /** Scene-field snapshot from the last accepted import (roadmap 38) — marks
     *  fields the user edited in-app before the incoming script changes them. */
    baselineScenes?: SceneFieldSnapshot[];
  },
): ScriptDiffResult {
  const customCategories = opts.customCategories || [];
  const oldViews = oldScenes.map(s => sceneToView(s, opts.castNameById, customCategories, sceneBodyText(opts.oldBody, s.sceneNumber)));
  const newViews = newScenes.map(s => parsedToView(s, customCategories, sceneBodyText(opts.newBody, s.sceneNumber)));
  const baselineViews = new Map<string, ScriptSceneView>();
  for (const snap of opts.baselineScenes || []) {
    baselineViews.set(normalizeSceneNumber(snap.sceneNumber), snapshotToView(snap, opts.castNameById, customCategories));
  }

  const m = oldViews.length;
  const n = newViews.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const s = matchScore(oldViews[i - 1], newViews[j - 1]);
      dp[i][j] = Math.max(dp[i - 1][j - 1] + s, dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const entries: SceneDiffEntry[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const s = matchScore(oldViews[i - 1], newViews[j - 1]);
      if (s > 0 && dp[i][j] === dp[i - 1][j - 1] + s) {
        entries.push(buildPair(oldViews[i - 1], newViews[j - 1], oldScenes[i - 1], newScenes[j - 1], s, baselineViews.get(normalizeSceneNumber(oldScenes[i - 1].sceneNumber))));
        i--; j--;
        continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j]) {
      entries.push(buildRemoved(oldViews[i - 1], oldScenes[i - 1]));
      i--;
      continue;
    }
    if (j > 0 && dp[i][j] === dp[i][j - 1]) {
      entries.push(buildAdded(newViews[j - 1], newScenes[j - 1]));
      j--;
      continue;
    }
    if (i > 0 && j > 0) {
      entries.push(buildPair(oldViews[i - 1], newViews[j - 1], oldScenes[i - 1], newScenes[j - 1], 0, baselineViews.get(normalizeSceneNumber(oldScenes[i - 1].sceneNumber))));
      i--; j--;
    } else if (i > 0) {
      entries.push(buildRemoved(oldViews[i - 1], oldScenes[i - 1]));
      i--;
    } else {
      entries.push(buildAdded(newViews[j - 1], newScenes[j - 1]));
      j--;
    }
  }
  entries.reverse();

  tagSplitMerge(entries, oldViews, newViews);

  const summary = { unchanged: 0, modified: 0, added: 0, removed: 0 };
  for (const e of entries) summary[e.status]++;
  // Page delta only when the incoming screenplay carries page counts for every
  // scene (CSV/Fountain have none — don't report a bogus negative delta).
  const hasPageCounts = newViews.length > 0 && newViews.every(v => v.pageCountDecimal != null);
  const oldPages = oldViews.reduce((sum, v) => sum + (v.pageCountDecimal ?? 0), 0);
  const newPages = newViews.reduce((sum, v) => sum + (v.pageCountDecimal ?? 0), 0);

  return {
    entries,
    summary,
    pageDelta: hasPageCounts ? newPages - oldPages : 0,
    castRenames: detectCastRenames(oldViews, newViews),
  };
}

/** Detect global character renames: an old name that no longer appears, paired
 *  with a new name that wasn't there before, when they share a near-identical
 *  set of scene numbers. Best-effort; only used to rename the SAME cast member
 *  instead of creating an orphan. */
function detectCastRenames(oldViews: ScriptSceneView[], newViews: ScriptSceneView[]): { from: string; to: string }[] {
  const sceneSets = (views: ScriptSceneView[]) => {
    const map = new Map<string, Set<string>>();
    for (const v of views) {
      const num = normalizeSceneNumber(v.sceneNumber);
      for (const name of v.cast) {
        if (!map.has(name)) map.set(name, new Set());
        map.get(name)!.add(num);
      }
    }
    return map;
  };
  const oldSets = sceneSets(oldViews);
  const newSets = sceneSets(newViews);
  const oldNames = new Set(oldSets.keys());
  const newNames = new Set(newSets.keys());

  const candidates: { from: string; to: string; score: number }[] = [];
  for (const [from, oldScenes] of oldSets) {
    if (newNames.has(from)) continue;
    for (const [to, newScenes] of newSets) {
      if (oldNames.has(to)) continue;
      const score = setJaccard(oldScenes, newScenes);
      if (score >= 0.7) candidates.push({ from, to, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const usedFrom = new Set<string>();
  const usedTo = new Set<string>();
  const renames: { from: string; to: string }[] = [];
  for (const c of candidates) {
    if (usedFrom.has(c.from) || usedTo.has(c.to)) continue;
    usedFrom.add(c.from);
    usedTo.add(c.to);
    renames.push({ from: c.from, to: c.to });
  }
  return renames;
}

function setJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function buildPair(a: ScriptSceneView, b: ScriptSceneView, oldScene: Scene, newScene: ParsedScene, score: number, baseline?: ScriptSceneView): SceneDiffEntry {
  const fields = diffPair(a, b, baseline);
  return {
    status: fields.length === 0 ? 'unchanged' : 'modified',
    sceneNumber: b.sceneNumber,
    oldScene,
    newScene,
    fields,
    similarity: score >= 2 ? 1 : similarity(a, b),
  };
}

function buildAdded(b: ScriptSceneView, newScene: ParsedScene): SceneDiffEntry {
  return { status: 'added', sceneNumber: b.sceneNumber, newScene, fields: [], similarity: 0 };
}

function buildRemoved(a: ScriptSceneView, oldScene: Scene): SceneDiffEntry {
  return { status: 'removed', sceneNumber: a.sceneNumber, oldScene, fields: [], similarity: 0 };
}

/** A low-scoring added/removed scene that scores high against an adjacent
 *  matched scene is a likely split/merge fragment (same scoring data). */
function tagSplitMerge(entries: SceneDiffEntry[], oldViews: ScriptSceneView[], newViews: ScriptSceneView[]): void {
  const oldByNumber = new Map(oldViews.map(v => [v.sceneNumber, v]));
  const newByNumber = new Map(newViews.map(v => [v.sceneNumber, v]));
  const paired = entries.filter(e => e.status === 'unchanged' || e.status === 'modified');
  for (const e of entries) {
    if (e.status === 'added' && e.newScene) {
      const view = newByNumber.get(e.sceneNumber);
      if (!view) continue;
      for (const p of paired) {
        const oldView = p.oldScene ? oldByNumber.get(p.oldScene.sceneNumber) : undefined;
        if (oldView && similarity(oldView, view) >= MATCH_SIMILARITY_THRESHOLD) {
          e.splitOf = p.sceneNumber;
          break;
        }
      }
    } else if (e.status === 'removed' && e.oldScene) {
      const view = oldByNumber.get(e.sceneNumber);
      if (!view) continue;
      for (const p of paired) {
        const newView = p.newScene ? newByNumber.get(p.newScene.sceneNumber) : undefined;
        if (newView && similarity(view, newView) >= MATCH_SIMILARITY_THRESHOLD) {
          e.mergedInto = p.sceneNumber;
          break;
        }
      }
    }
  }
}
