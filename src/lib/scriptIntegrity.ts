import type { Action } from '../store/reducer';
import type { Project, Scene, ScriptScene } from '../types';
import { normalizeSceneNumber } from './script';
import { nextLetterSceneNumber } from './sceneNumbering';
import { ensureAllScenesHaveRows } from '../store/rows';

/**
 * Project ↔ retained-script integrity audit + repair (roadmap 135). A `.lemon`
 * can carry a stale/corrupt script map (two scenes numbered `40`, a body with no
 * scene, a scene with no SCENE row). The audit is read-only; the repair is ONE
 * undo batch that renumbers collisions (project scene + its body), prunes orphan
 * bodies and restores missing stripboard rows — never a hand-edit.
 */

export type ScriptIntegrityKind =
  | 'duplicate-project-number'
  | 'duplicate-body-number'
  | 'body-without-scene'
  | 'scene-without-row'
  | 'scene-without-body';

export interface ScriptIntegrityIssue {
  kind: ScriptIntegrityKind;
  severity: 'error' | 'warning';
  message: string;
  sceneNumber?: string;
  sceneIds?: string[];
  versionId?: string;
}

export interface ScriptIntegrityReport {
  /** No corruption (errors). Warnings (e.g. scenes not in the script) don't count. */
  clean: boolean;
  issues: ScriptIntegrityIssue[];
  counts: { errors: number; warnings: number; repairable: number };
}

const REPAIRABLE: ReadonlySet<ScriptIntegrityKind> = new Set([
  'duplicate-project-number',
  'duplicate-body-number',
  'body-without-scene',
  'scene-without-row',
]);

const byNormalized = <T,>(items: T[], number: (t: T) => string): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const n = normalizeSceneNumber(number(item));
    if (!n) continue;
    const list = map.get(n);
    if (list) list.push(item);
    else map.set(n, [item]);
  }
  return map;
};

export function auditScriptMap(project: Project): ScriptIntegrityReport {
  const issues: ScriptIntegrityIssue[] = [];
  const scenes = project.scenes || [];
  const doc = project.scriptDocument;

  // Duplicate project numbers — intentional coverage copies (`duplicateKind:
  // 'coverage'`) share a number on purpose and are not corruption.
  for (const group of byNormalized(scenes, s => s.sceneNumber).values()) {
    if (group.length < 2) continue;
    const extras = group.slice(1).filter(s => s.duplicateKind !== 'coverage');
    if (extras.length === 0) continue;
    issues.push({
      kind: 'duplicate-project-number',
      severity: 'error',
      message: `Scene number ${group[0].sceneNumber} is used by ${group.length} scenes`,
      sceneNumber: group[0].sceneNumber,
      sceneIds: group.map(s => s.id),
    });
  }

  if (doc) {
    for (const group of byNormalized(doc.scenes, s => s.sceneNumber).values()) {
      if (group.length < 2) continue;
      issues.push({
        kind: 'duplicate-body-number',
        severity: 'error',
        message: `The retained script has ${group.length} bodies numbered ${group[0].sceneNumber}`,
        sceneNumber: group[0].sceneNumber,
      });
    }

    const orphanBodies = doc.scenes.filter(ds => {
      const n = normalizeSceneNumber(ds.sceneNumber);
      return n && !scenes.some(s => normalizeSceneNumber(s.sceneNumber) === n);
    });
    if (orphanBodies.length > 0) {
      issues.push({
        kind: 'body-without-scene',
        severity: 'error',
        message: `${orphanBodies.length} script bod${orphanBodies.length === 1 ? 'y has' : 'ies have'} no scene (orphaned)`,
      });
    }

    const bodiless = scenes.filter(s => {
      const n = normalizeSceneNumber(s.sceneNumber);
      return n && !doc.scenes.some(ds => normalizeSceneNumber(ds.sceneNumber) === n);
    });
    if (bodiless.length > 0) {
      issues.push({
        kind: 'scene-without-body',
        severity: 'warning',
        message: `${bodiless.length} scene${bodiless.length === 1 ? '' : 's'} have no retained script body`,
        sceneIds: bodiless.map(s => s.id),
      });
    }
  }

  for (const version of project.versions || []) {
    const inRows = new Set(version.rows.filter(r => r.type === 'SCENE').map(r => r.sceneId));
    const missing = scenes.filter(s => !inRows.has(s.id));
    if (missing.length > 0) {
      issues.push({
        kind: 'scene-without-row',
        severity: 'error',
        message: `${missing.length} scene${missing.length === 1 ? ' has' : 's have'} no stripboard row in "${version.name}"`,
        versionId: version.id,
        sceneIds: missing.map(s => s.id),
      });
    }
  }

  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const repairable = issues.filter(i => REPAIRABLE.has(i.kind)).length;
  return { clean: errors === 0, issues, counts: { errors, warnings, repairable } };
}

export interface RepairResult {
  renumbered: number;
  prunedBodies: number;
  rowsAdded: number;
}

/**
 * Repair the script map in ONE batch: renumber duplicate scene numbers (and
 * their paired bodies) to lettered children, prune orphan bodies, and restore
 * missing SCENE rows. Safe to run on a clean project (no-op).
 */
export function repairScriptMap(dispatch: (a: Action) => void, project: Project): RepairResult {
  const scenes = project.scenes || [];
  const doc = project.scriptDocument;

  // 1. Unique scene numbers: the first scene keeps it, later non-coverage
  // duplicates get the next letter.
  const seen = new Set<string>();
  const working: { sceneNumber: string }[] = [];
  const renames = new Map<string, string>(); // sceneId → new number
  for (const s of scenes) {
    const n = normalizeSceneNumber(s.sceneNumber);
    if (!n || !seen.has(n) || s.duplicateKind === 'coverage') {
      if (n) seen.add(n);
      working.push({ sceneNumber: s.sceneNumber });
      continue;
    }
    const next = nextLetterSceneNumber(working, s.sceneNumber);
    renames.set(s.id, next);
    working.push({ sceneNumber: next });
  }

  // 2. Pair bodies to scenes by original number (positional), rename paired
  // bodies of renamed scenes, prune the rest.
  let newDocScenes: ScriptScene[] | null = null;
  let prunedBodies = 0;
  let bodiesRenamed = 0;
  if (doc) {
    const bodiesByNumber = byNormalized(doc.scenes, s => s.sceneNumber);
    const consumed = new Set<ScriptScene>();
    const groupsByNumber = byNormalized(scenes, s => s.sceneNumber);
    for (const [n, group] of groupsByNumber) {
      const bodies = bodiesByNumber.get(n) || [];
      group.forEach((scene, i) => {
        const body = bodies[i];
        if (!body) return;
        consumed.add(body);
        const next = renames.get(scene.id);
        if (next) { body.sceneNumber = next; bodiesRenamed++; }
      });
    }
    newDocScenes = doc.scenes.filter(ds => consumed.has(ds));
    prunedBodies = doc.scenes.length - newDocScenes.length;
  }

  // 3. Missing SCENE rows (per version).
  const rowRepairs: { id: string; rows: Project['versions'][number]['rows'] }[] = [];
  for (const version of project.versions || []) {
    const ensured = ensureAllScenesHaveRows({ ...project, versions: [version] }).versions[0];
    if (ensured.rows.length !== version.rows.length) rowRepairs.push({ id: version.id, rows: ensured.rows });
  }
  const rowsAdded = rowRepairs.reduce((sum, r) => {
    const before = project.versions.find(v => v.id === r.id)?.rows.length ?? 0;
    return sum + (r.rows.length - before);
  }, 0);

  if (renames.size === 0 && prunedBodies === 0 && rowRepairs.length === 0) {
    return { renumbered: 0, prunedBodies: 0, rowsAdded: 0 };
  }

  dispatch({ type: 'BATCH_START' });
  for (const [id, sceneNumber] of renames) dispatch({ type: 'UPDATE_SCENE', payload: { id, sceneNumber } });
  if (doc && newDocScenes && (prunedBodies > 0 || bodiesRenamed > 0)) {
    dispatch({ type: 'UPDATE_SCRIPT_DOCUMENT', payload: { document: { ...doc, scenes: newDocScenes } } });
  }
  for (const r of rowRepairs) dispatch({ type: 'UPDATE_VERSION', payload: { id: r.id, rows: r.rows } });
  dispatch({ type: 'BATCH_COMMIT' });

  return { renumbered: renames.size, prunedBodies, rowsAdded };
}
