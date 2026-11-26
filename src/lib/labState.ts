/**
 * Modals Studio state (roadmap 374) — a tiny, React-free store so the debug
 * bridge / local MCP can answer "which surface is the user looking at?".
 *
 * The DEV-only studio (`#/lab/modals`) publishes a snapshot on every surface,
 * theme, width or scale change; `debugBridge.getLabState()` reads it. Outside
 * the studio the snapshot is null, so agents can tell the app apart from the
 * lab. Nothing here is product state — it never reaches the project store.
 */

export type LabSurfaceKind = 'modal' | 'dialog';

/** The entity a fixture is currently pointed at (which cast member, scene…). */
export interface LabSelection {
  kind: 'cast' | 'element' | 'scene' | 'day' | 'crew' | 'location' | 'report' | 'budget' | 'dialog';
  id?: string;
  label?: string;
}

export interface LabStateSnapshot {
  surfaceId: string;
  title: string;
  group: string;
  kind: LabSurfaceKind;
  /** 1-based position in the studio's full surface list. */
  index: number;
  total: number;
  /** The project the fixture renders against (null before one is open). */
  project: { id: string; title: string } | null;
  theme: 'light' | 'dark';
  width: string;
  /** Text-scale percentage (100 = design size). */
  scale: number;
  /** The fixture's current entity pick, when it has one. */
  selection?: LabSelection;
  /** The studio's deep link (a `#/lab/modals/<surfaceId>` hash). */
  hash: string;
}

let snapshot: LabStateSnapshot | null = null;
const listeners = new Set<() => void>();

export function setLabState(next: LabStateSnapshot | null): void {
  snapshot = next;
  listeners.forEach((cb) => cb());
}

export function getLabState(): LabStateSnapshot | null {
  return snapshot;
}

/** Subscribe to studio changes (the bridge doesn't need this; a live MCP
 *  consumer or a future dev overlay can). Returns an unsubscribe. */
export function subscribeLabState(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** The demo project the studio imports is a sandbox: fixtures may seed preview
 *  data (a sample screenplay, one split) there, never in the user's own
 *  project. Stored as ids so it survives a reload. */
const SANDBOX_KEY = 'lemon_modals_studio_sandbox';
const SANDBOX_MAX = 5;

export function markLabSandboxProject(id: string): void {
  try {
    const ids = JSON.parse(localStorage.getItem(SANDBOX_KEY) || '[]') as string[];
    const next = [id, ...ids.filter((x) => x !== id)].slice(0, SANDBOX_MAX);
    localStorage.setItem(SANDBOX_KEY, JSON.stringify(next));
  } catch { /* dev tooling only — storage may be unavailable */ }
}

export function isLabSandboxProject(id: string): boolean {
  try {
    const ids = JSON.parse(localStorage.getItem(SANDBOX_KEY) || '[]') as string[];
    return ids.includes(id);
  } catch {
    return false;
  }
}

/* ── Agent control surface (roadmap 374) ────────────────────────────────
   The studio registers these while mounted. The debug bridge / local MCP
   exposes them so an agent can drive the preview (switch surface/theme/width)
   and run the DOM contrast audit without brittle UI clicks. `null` outside
   the studio. */

export interface LabSurfaceSummary {
  id: string;
  title: string;
  group: string;
  kind: LabSurfaceKind;
  projectless: boolean;
  capabilities: string[];
}

export interface LabAuditIssue {
  /** low-contrast = WCAG text contrast below the threshold;
   *  dark-on-light = a dark form control/dropdown trigger on a light surface. */
  kind: 'low-contrast' | 'dark-on-light';
  tag: string;
  selector: string;
  text: string;
  bg: string;
  fg: string;
  contrast: number;
}

export interface LabAuditSurface {
  id: string;
  title: string;
  kind: LabSurfaceKind;
  capabilities: string[];
  issues: LabAuditIssue[];
  /** Set when the surface rendered no modal at all (empty/projectless state). */
  note?: string;
}

export interface LabAuditResult {
  theme: 'light' | 'dark';
  surfaces: LabAuditSurface[];
  summary: { surfaces: number; withIssues: number; issues: number };
}

export interface LabShowOptions {
  theme?: 'light' | 'dark';
  width?: string;
  scale?: number;
}

export interface LabAuditOptions {
  /** Subset of surfaces to audit; omit for the current surface. */
  surfaceIds?: string[];
  /** Audit every surface in one studio group (Calendar, Budget, …). */
  group?: string;
  theme?: 'light' | 'dark';
  /** Put the studio back where it was after the run (default true). */
  restore?: boolean;
}

export interface LabControls {
  list: () => LabSurfaceSummary[];
  show: (surfaceId: string, options?: LabShowOptions) => boolean;
  audit: (options?: LabAuditOptions) => Promise<LabAuditResult>;
}

let controls: LabControls | null = null;

export function registerLabControls(next: LabControls | null): void {
  controls = next;
}

export function getLabControls(): LabControls | null {
  return controls;
}
