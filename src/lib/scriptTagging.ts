import type { Action } from '../store/reducer';
import type { CastMember, CustomCategoryDef, Project, Scene, ScriptAnnotation } from '../types';
import { ELEMENT_CATEGORIES, getFieldItems, getLabel, isMultiValue } from './categories';
import { getCategoryElements } from './elements';
import { firstFreeCastId } from './import/castIds';
import { generateUUID } from './utils';
import { scriptSceneOf } from './script';

/**
 * Script tagging (roadmap 136) — the selection → category-menu flow that
 * replaced the old tag picker. The highlighted text BECOMES the element: one
 * pure planner (`planTagCommit`) resolves the element key, the scene-field
 * patch and the annotation; `commitTag` applies it as ONE undo batch. Derived
 * suggestions (`suggestionRanges`) are ephemeral view data — never persisted.
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
 *  name-keyed. Shared by the hover badge and the divergence check. */
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
  /** Patch for the live scene, applied as a single `UPDATE_SCENE`. */
  scenePatch: Record<string, string>;
  /** Element to ensure exists (`ADD_ELEMENT` payload), or null. */
  newElement: ProjectElementLike | null;
  annotation:
    | { mode: 'add'; value: ScriptAnnotation }
    | { mode: 'update'; id: string; updates: Partial<ScriptAnnotation> };
}

/**
 * Plan a tag commit. `existing` is present when re-tagging an exact range or
 * committing a recognised (dotted) span: the span keeps its element and its
 * category may change (the scene-field attachment swaps, never stacks).
 */
export function planTagCommit(
  project: Project,
  target: ScriptTagTarget,
  category: string,
  existing?: ScriptAnnotation,
): TagPlan {
  const scene = project.scenes.find(s => s.id === target.sceneId);
  if (!scene) throw new Error(`planTagCommit: scene ${target.sceneId} not found`);
  const cast = project.castMembers || [];

  let elementKey: string;
  let newElement: ProjectElementLike | null = null;

  if (existing) {
    if (category === 'cast') {
      if (existing.category === 'cast') {
        elementKey = existing.elementKey;
      } else {
        const resolved = resolveCast(cast, existing.elementKey);
        elementKey = resolved.elementKey;
        newElement = resolved.newElement;
      }
    } else if (existing.category === 'cast') {
      const member = cast.find(m => String(m.id) === String(existing.elementKey));
      elementKey = (member?.name || existing.elementKey).trim().toUpperCase();
      newElement = { id: elementKey, name: elementKey };
    } else {
      elementKey = existing.elementKey;
      newElement = { id: elementKey, name: elementKey };
    }
  } else {
    const name = target.text.trim().toUpperCase();
    if (category === 'cast') {
      const resolved = resolveCast(cast, name);
      elementKey = resolved.elementKey;
      newElement = resolved.newElement;
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

  const annotation: TagPlan['annotation'] = existing
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

  return { elementKey, scenePatch, newElement, annotation };
}

/**
 * Apply a tag commit as ONE undo batch: ensure the element, patch the scene
 * field(s), then add/update the annotation. Returns the plan (or null when the
 * target is invalid/empty). Mirrors `addNewElement`'s element shapes without
 * the naming-modal queue — the highlight already IS the name.
 */
export function commitTag(
  dispatch: (a: Action) => void,
  project: Project,
  target: ScriptTagTarget,
  category: string,
  existing?: ScriptAnnotation,
): TagPlan | null {
  if (!target.text.trim() || !project.scenes.some(s => s.id === target.sceneId)) return null;
  const plan = planTagCommit(project, target, category, existing);
  dispatch({ type: 'BATCH_START' });
  if (plan.newElement) dispatch({ type: 'ADD_ELEMENT', payload: { category, element: plan.newElement } });
  dispatch({ type: 'UPDATE_SCENE', payload: { id: target.sceneId, ...plan.scenePatch } });
  if (plan.annotation.mode === 'add') {
    dispatch({ type: 'ADD_SCRIPT_ANNOTATION', payload: { annotation: plan.annotation.value } });
  } else {
    dispatch({ type: 'UPDATE_SCRIPT_ANNOTATION', payload: { id: plan.annotation.id, updates: plan.annotation.updates } });
  }
  dispatch({ type: 'BATCH_COMMIT' });
  return plan;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function suggestionAnnotation(
  blockIndex: number,
  start: number,
  end: number,
  text: string,
  category: string,
  elementKey: string,
): ScriptAnnotation {
  return {
    id: `suggest:${category}:${elementKey}:${blockIndex}:${start}`,
    sceneId: '',
    blockIndex,
    start,
    end,
    text,
    category,
    elementKey,
    recognized: true,
  };
}

/** Names that are really a number (Board-ID artifacts) — never suggested. */
const isNumericName = (s: string) => /^[\d\s.]+$/.test(s);

/**
 * Ephemeral tag suggestions for a live scene (roadmap 136). Two passes:
 *  1. **Character names from the body** — every `character` cue is suggested as
 *     a cast tag (matched to an existing member by name, else the cue name
 *     itself). This reads the screenplay, not just the breakdown.
 *  2. **Known element names** — whole-word matches of existing element names in
 *     action/dialogue. Sets are NOT suggested (locations carry that job) and
 *     numeric-only names are skipped.
 * Computed in the view and never persisted; ranges overlapping a stored tag are
 * skipped so a suggestion never stacks on an existing annotation.
 */
export function suggestionRanges(project: Project, scene: Scene): ScriptAnnotation[] {
  const docScene = scriptSceneOf(project.scriptDocument, scene.sceneNumber);
  if (!docScene) return [];

  const stored = (project.scriptAnnotations || []).filter(a => a.sceneId === scene.id);
  const cast = project.castMembers || [];
  const castByName = new Map<string, CastMember>();
  for (const m of cast) {
    const n = (m.name || '').trim().toUpperCase();
    if (n && !isNumericName(n)) castByName.set(n, m);
  }

  const candidates: { key: string; category: string }[] = [];
  for (const c of ELEMENT_CATEGORIES) {
    if (c.key === 'cast' || c.key === 'set') continue;
    for (const e of getCategoryElements(project, c.key)) {
      const name = (e.name || '').trim();
      if (name && !isNumericName(name)) candidates.push({ key: name, category: c.key });
    }
  }
  for (const m of cast) {
    const name = (m.name || '').trim();
    if (name && !isNumericName(name)) candidates.push({ key: m.id, category: 'cast' });
  }

  const out: ScriptAnnotation[] = [];
  const claimed = (blockIndex: number, start: number, end: number) =>
    stored.some(a => a.blockIndex === blockIndex && a.start < end && a.end > start) ||
    out.some(a => a.blockIndex === blockIndex && a.start < end && a.end > start);

  docScene.blocks.forEach((block, blockIndex) => {
    const [type, text] = block;
    if (!text) return;
    if (type === 'character') {
      const trimmed = text.trim();
      if (!trimmed || isNumericName(trimmed)) return;
      const member = castByName.get(trimmed.toUpperCase());
      const start = text.indexOf(trimmed);
      const end = start + trimmed.length;
      if (claimed(blockIndex, start, end)) return;
      const sug = suggestionAnnotation(blockIndex, start, end, text.slice(start, end), 'cast', member ? member.id : trimmed.toUpperCase());
      sug.sceneId = scene.id;
      out.push(sug);
      return;
    }
    if (type !== 'action' && type !== 'dialogue' && type !== 'dual_left' && type !== 'dual_right') return;
    for (const cand of candidates) {
      const re = new RegExp(`\\b${escapeRegExp(cand.key)}\\b`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        if (claimed(blockIndex, start, end)) continue;
        const sug = suggestionAnnotation(blockIndex, start, end, text.slice(start, end), cand.category, cand.key);
        sug.sceneId = scene.id;
        out.push(sug);
      }
    }
  });
  return out;
}
