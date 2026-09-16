import type { Action } from '../store/reducer';
import type { CastMember, CustomCategoryDef, Project, Scene, ScriptAnnotation, ScriptScene } from '../types';
import { ELEMENT_CATEGORIES, getFieldItems, getLabel, isMultiValue } from './categories';
import { getCategoryElements } from './elements';
import { firstFreeCastId } from './import/castIds';
import { generateUUID } from './utils';
import { scriptSceneOf } from './script';

/**
 * Script tagging (roadmap 136).
 *
 * Two derived views over (scene fields × screenplay body), plus the write path:
 * - `attachedRanges` — elements already attached to a scene that appear in its
 *   body, shown SOLID (read-only derivation, never persisted).
 * - `suggestionRanges` — existing element names that appear in the body but are
 *   NOT attached, shown WAVY (ephemeral).
 * Accepting a tag writes every occurrence of the element in the scene in ONE
 * batch; removing it detaches the element from the scene (and deletes any stored
 * annotations), so it immediately falls back to a suggestion.
 */

/** The selected span an annotation anchors to (also the retained-body target). */
export interface ScriptTagTarget {
  sceneId: string;
  blockIndex: number;
  start: number;
  end: number;
  text: string;
}

/** A category row for the selection menu (built-ins + custom). */
export interface TagCategory {
  key: string;
  label: string;
  isCustom: boolean;
  icon?: string;
}

/** Every element category, built-ins first then custom (one menu source). */
export function tagCategories(project: Project): TagCategory[] {
  const out: TagCategory[] = [];
  const seen = new Set<string>();
  for (const c of ELEMENT_CATEGORIES) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    out.push({ key: c.key, label: getLabel(c.key, c.label, project.categoryLabels), isCustom: false });
  }
  for (const c of project.customCategories || []) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    out.push({ key: c.key, label: c.label, isCustom: true, icon: c.icon });
  }
  return out;
}

/** The element's display name: cast resolves its member name, others are
 *  name-keyed. Shared by the hover badge, occurrence scanning and the
 *  divergence check. */
export function annotationElementName(project: Project, annotation: ScriptAnnotation): string {
  if (annotation.category === 'cast') {
    return (project.castMembers || []).find(m => String(m.id) === String(annotation.elementKey))?.name || annotation.elementKey;
  }
  return annotation.elementKey;
}

/** Category display label (built-in or custom). */
export function annotationCategoryLabel(project: Project, category: string): string {
  const builtin = ELEMENT_CATEGORIES.find(c => c.key === category);
  if (builtin) return getLabel(category, builtin.label, project.categoryLabels);
  return (project.customCategories || []).find(c => c.key === category)?.label || category;
}

function resolveCast(cast: CastMember[], name: string): { elementKey: string; newElement: ProjectElementLike | null } {
  const norm = name.trim().toUpperCase();
  const member = (cast || []).find(m => (m.name || '').trim().toUpperCase() === norm);
  if (member) return { elementKey: member.id, newElement: null };
  const id = String(firstFreeCastId(cast || []));
  return { elementKey: id, newElement: { id, name: norm } };
}

type ProjectElementLike = { id: string; name: string };

/** Add `key` to a scene's category field (comma-append for multi-value, replace
 *  for single-value categories such as Set). Case-insensitive dedupe. */
function mergeIntoField(category: string, current: string, key: string, custom?: CustomCategoryDef[]): string {
  if (isMultiValue(category, custom)) {
    const items = getFieldItems(category, current);
    if (!items.some(i => i.toUpperCase() === key.toUpperCase())) items.push(key);
    return items.join(', ');
  }
  return key;
}

/** Remove one attachment from a scene field (multi = drop the token, single =
 *  clear only when it is exactly `key`). */
function removeFromField(category: string, current: string, key: string, custom?: CustomCategoryDef[]): string {
  if (isMultiValue(category, custom)) {
    return getFieldItems(category, current).filter(i => i.toUpperCase() !== key.toUpperCase()).join(', ');
  }
  return current.trim().toUpperCase() === key.trim().toUpperCase() ? '' : current;
}

export interface TagPlan {
  elementKey: string;
  /** The element's display name — occurrence scanning + hints. */
  name: string;
  /** Patch for the live scene, applied as a single `UPDATE_SCENE`. */
  scenePatch: Record<string, string>;
  /** Element to ensure exists (`ADD_ELEMENT` payload), or null. */
  newElement: ProjectElementLike | null;
  annotation:
    | { mode: 'add'; value: ScriptAnnotation }
    | { mode: 'update'; id: string; updates: Partial<ScriptAnnotation> };
}

/** A previously-anchored element for a re-tag. `id` is present only when a
 *  stored annotation backs it (an attached-derived span has no record). */
export type TagExisting = Pick<ScriptAnnotation, 'category' | 'elementKey'> & { id?: string };

/**
 * Plan a tag commit. `existing` is present when re-tagging an existing tag or an
 * attached-derived span: the element is kept and the category may change (the
 * scene-field attachment swaps, never stacks).
 */
export function planTagCommit(
  project: Project,
  target: ScriptTagTarget,
  category: string,
  existing?: TagExisting,
): TagPlan {
  const scene = project.scenes.find(s => s.id === target.sceneId);
  if (!scene) throw new Error(`planTagCommit: scene ${target.sceneId} not found`);
  const cast = project.castMembers || [];

  let elementKey: string;
  let name: string;
  let newElement: ProjectElementLike | null = null;

  if (existing) {
    if (category === 'cast') {
      if (existing.category === 'cast') {
        elementKey = existing.elementKey;
        name = ((cast.find(m => String(m.id) === String(elementKey))?.name) || existing.elementKey).trim().toUpperCase();
      } else {
        const resolved = resolveCast(cast, existing.elementKey);
        elementKey = resolved.elementKey;
        newElement = resolved.newElement;
        name = (resolved.newElement?.name || existing.elementKey).trim().toUpperCase();
      }
    } else if (existing.category === 'cast') {
      const member = cast.find(m => String(m.id) === String(existing.elementKey));
      name = (member?.name || existing.elementKey).trim().toUpperCase();
      elementKey = name;
      newElement = { id: name, name };
    } else {
      elementKey = existing.elementKey;
      name = existing.elementKey;
      newElement = { id: elementKey, name: elementKey };
    }
  } else {
    name = target.text.trim().toUpperCase();
    if (category === 'cast') {
      const resolved = resolveCast(cast, name);
      elementKey = resolved.elementKey;
      newElement = resolved.newElement;
      if (resolved.newElement) name = resolved.newElement.name;
    } else {
      elementKey = name;
      newElement = { id: name, name };
    }
  }

  const scenePatch: Record<string, string> = {};
  scenePatch[category] = mergeIntoField(category, String((scene as unknown as Record<string, string>)[category] ?? ''), elementKey, project.customCategories);
  if (existing && existing.category !== category) {
    scenePatch[existing.category] = removeFromField(
      existing.category,
      String((scene as unknown as Record<string, string>)[existing.category] ?? ''),
      existing.elementKey,
      project.customCategories,
    );
  }

  const annotation: TagPlan['annotation'] = existing?.id
    ? { mode: 'update', id: existing.id, updates: { category, elementKey, recognized: false } }
    : {
        mode: 'add',
        value: {
          id: generateUUID(),
          sceneId: target.sceneId,
          blockIndex: target.blockIndex,
          start: target.start,
          end: target.end,
          text: target.text,
          category,
          elementKey,
        },
      };

  return { elementKey, name, scenePatch, newElement, annotation };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Names that are really a number (Board-ID artifacts) — never tagged/suggested. */
const isNumericName = (s: string) => /^[\d\s.]+$/.test(s);

const PROSE_BLOCK_TYPES = new Set(['action', 'dialogue', 'dual_left', 'dual_right']);

export interface ElementOccurrence {
  blockIndex: number;
  start: number;
  end: number;
  text: string;
}

/**
 * Every body occurrence of an element's display name in a scene. Cast also
 * matches a whole `character` cue (trailing `(O.S.)/(V.O.)/(CONT'D)…` stripped);
 * all categories match whole words in action/dialogue. Numeric names never match.
 */
export function elementOccurrences(docScene: ScriptScene, category: string, name: string): ElementOccurrence[] {
  const clean = (name || '').trim();
  if (!clean || isNumericName(clean)) return [];
  const out: ElementOccurrence[] = [];
  docScene.blocks.forEach((block, blockIndex) => {
    const [type, text] = block;
    if (!text) return;
    if (category === 'cast' && type === 'character') {
      const cue = text.trim().replace(/(\s*\([^)]*\)\s*)+$/g, '').trim();
      if (cue.toUpperCase() === clean.toUpperCase()) {
        const start = Math.max(0, text.indexOf(cue));
        out.push({ blockIndex, start, end: start + cue.length, text: text.slice(start, start + cue.length) });
      }
    }
    if (!PROSE_BLOCK_TYPES.has(type)) return;
    const re = new RegExp(`\\b${escapeRegExp(clean)}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.push({ blockIndex, start: m.index, end: m.index + m[0].length, text: m[0] });
    }
  });
  return out;
}

/**
 * Apply a tag commit as ONE undo batch: ensure the element, patch the scene
 * field(s), then write an annotation for EVERY occurrence of that element in the
 * scene (accepting "Bob" once tags all five Bobs). Returns the plan (or null
 * when the target is invalid/empty).
 */
export function commitTag(
  dispatch: (a: Action) => void,
  project: Project,
  target: ScriptTagTarget,
  category: string,
  existing?: TagExisting,
): TagPlan | null {
  const scene = project.scenes.find(s => s.id === target.sceneId);
  if (!target.text.trim() || !scene) return null;
  const plan = planTagCommit(project, target, category, existing);
  const docScene = scriptSceneOf(project.scriptDocument, scene.sceneNumber);
  const occs = docScene ? elementOccurrences(docScene, category, plan.name) : [];
  const stored = project.scriptAnnotations || [];

  dispatch({ type: 'BATCH_START' });
  if (plan.newElement) dispatch({ type: 'ADD_ELEMENT', payload: { category, element: plan.newElement } });
  dispatch({ type: 'UPDATE_SCENE', payload: { id: target.sceneId, ...plan.scenePatch } });

  const overlapsStored = (occ: ElementOccurrence) =>
    stored.some(a => a.id !== existing?.id && a.sceneId === scene.id && a.blockIndex === occ.blockIndex && a.start < occ.end && a.end > occ.start);

  if (occs.length === 0) {
    if (plan.annotation.mode === 'update') {
      dispatch({ type: 'UPDATE_SCRIPT_ANNOTATION', payload: { id: plan.annotation.id, updates: plan.annotation.updates } });
    } else {
      dispatch({ type: 'ADD_SCRIPT_ANNOTATION', payload: { annotation: plan.annotation.value } });
    }
  } else {
    let targetUpdated = false;
    for (const occ of occs) {
      const isTarget = !!existing?.id && occ.blockIndex === target.blockIndex && occ.start === target.start && occ.end === target.end;
      if (isTarget) {
        dispatch({ type: 'UPDATE_SCRIPT_ANNOTATION', payload: { id: existing!.id!, updates: { category, elementKey: plan.elementKey, recognized: false } } });
        targetUpdated = true;
      } else if (!overlapsStored(occ)) {
        dispatch({
          type: 'ADD_SCRIPT_ANNOTATION',
          payload: {
            annotation: {
              id: generateUUID(),
              sceneId: scene.id,
              blockIndex: occ.blockIndex,
              start: occ.start,
              end: occ.end,
              text: occ.text,
              category,
              elementKey: plan.elementKey,
            },
          },
        });
      }
    }
    if (existing?.id && !targetUpdated) {
      dispatch({ type: 'UPDATE_SCRIPT_ANNOTATION', payload: { id: existing.id, updates: { category, elementKey: plan.elementKey, recognized: false } } });
    }
  }

  dispatch({ type: 'BATCH_COMMIT' });
  return plan;
}

/**
 * Detach an element from a scene: remove it from the scene field and drop every
 * stored annotation for it. The element stays in the element manager, so a name
 * still present in the body immediately reappears as a SUGGESTION. ONE batch.
 */
export function detachTag(
  dispatch: (a: Action) => void,
  project: Project,
  sceneId: string,
  category: string,
  elementKey: string,
): void {
  const scene = project.scenes.find(s => s.id === sceneId);
  if (!scene) return;
  const current = String((scene as unknown as Record<string, string>)[category] ?? '');
  dispatch({ type: 'BATCH_START' });
  dispatch({ type: 'UPDATE_SCENE', payload: { id: sceneId, [category]: removeFromField(category, current, elementKey, project.customCategories) } });
  for (const a of project.scriptAnnotations || []) {
    if (a.sceneId === sceneId && a.category === category && a.elementKey.toLowerCase() === elementKey.toLowerCase()) {
      dispatch({ type: 'REMOVE_SCRIPT_ANNOTATION', payload: a.id });
    }
  }
  dispatch({ type: 'BATCH_COMMIT' });
}

/**
 * Solid spans for elements already attached to a scene (from the Element
 * Manager / scene fields) whose name appears in the body. Derived on the fly —
 * NEVER persisted (roadmap 136 decision), so merely viewing a scene writes
 * nothing. `set` is skipped (locations aren't script elements).
 */
export function attachedRanges(project: Project, scene: Scene): ScriptAnnotation[] {
  const docScene = scriptSceneOf(project.scriptDocument, scene.sceneNumber);
  if (!docScene) return [];
  const out: ScriptAnnotation[] = [];
  for (const cat of tagCategories(project)) {
    if (cat.key === 'set') continue;
    const raw = String((scene as unknown as Record<string, string>)[cat.key] ?? '');
    for (const value of getFieldItems(cat.key, raw)) {
      let elementKey = value;
      let name = value;
      if (cat.key === 'cast') {
        const member = (project.castMembers || []).find(m => String(m.id) === String(value));
        if (!member) continue;
        elementKey = member.id;
        name = member.name;
      }
      for (const occ of elementOccurrences(docScene, cat.key, name)) {
        out.push({
          id: `attached:${cat.key}:${elementKey}:${occ.blockIndex}:${occ.start}`,
          sceneId: scene.id,
          blockIndex: occ.blockIndex,
          start: occ.start,
          end: occ.end,
          text: occ.text,
          category: cat.key,
          elementKey,
        });
      }
    }
  }
  return out;
}

/**
 * Wavy suggestions for a live scene: existing element names that appear in the
 * body and are NOT already attached. Cast names come from the cast database;
 * non-cast names from the element manager. `set` and numeric-only names are
 * skipped. `attached` is passed in so suggestions never stack on a solid span.
 * Ephemeral — computed in the view, never persisted.
 */
export function suggestionRanges(project: Project, scene: Scene, attached: ScriptAnnotation[] = []): ScriptAnnotation[] {
  const docScene = scriptSceneOf(project.scriptDocument, scene.sceneNumber);
  if (!docScene) return [];

  const stored = (project.scriptAnnotations || []).filter(a => a.sceneId === scene.id);
  const attachedKeys = new Set(attached.map(a => `${a.category}\u0000${a.elementKey.toLowerCase()}`));

  const out: ScriptAnnotation[] = [];
  const claimed = (blockIndex: number, start: number, end: number) =>
    stored.some(a => a.blockIndex === blockIndex && a.start < end && a.end > start) ||
    attached.some(a => a.blockIndex === blockIndex && a.start < end && a.end > start) ||
    out.some(a => a.blockIndex === blockIndex && a.start < end && a.end > start);

  for (const cat of ELEMENT_CATEGORIES) {
    if (cat.key === 'set') continue;
    for (const e of getCategoryElements(project, cat.key)) {
      const name = (e.name || '').trim();
      if (!name || isNumericName(name)) continue;
      const elementKey = cat.key === 'cast' ? e.id : (e.name || e.id);
      if (attachedKeys.has(`${cat.key}\u0000${elementKey.toLowerCase()}`)) continue;
      for (const occ of elementOccurrences(docScene, cat.key, name)) {
        if (claimed(occ.blockIndex, occ.start, occ.end)) continue;
        out.push({
          id: `suggest:${cat.key}:${elementKey}:${occ.blockIndex}:${occ.start}`,
          sceneId: scene.id,
          blockIndex: occ.blockIndex,
          start: occ.start,
          end: occ.end,
          text: occ.text,
          category: cat.key,
          elementKey,
          recognized: true,
        });
      }
    }
  }
  return out;
}
