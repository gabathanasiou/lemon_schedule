import { addMinutesToTime, normalizeTime, parseDuration } from './utils';
import type { CallStageDef, CallTimeSettings, ElementCallTimes, Project } from '../types';

/**
 * Optional 1st-AD call-time helper (item 99, D9-D11). Computed on read from
 * the settings + schedule; only OVERRIDES are stored (`daybreakMeta.elementCalls`).
 * A box accepts an ABSOLUTE time (`7:30`, `730`, `7:30am`) or a RELATIVE offset
 * (`-1h`, `-45m`, `+30m`) measured from the NEXT (later) stage. This module is
 * the single parser + chain computer — TimeField, the call-times section and
 * the report collections all go through it.
 */

export type TimeExpression =
  | { kind: 'absolute'; time: string }
  | { kind: 'relative'; minutes: number }
  | { kind: 'empty' };

export function parseTimeExpression(raw: string | undefined | null): TimeExpression {
  const s = (raw || '').trim();
  if (!s) return { kind: 'empty' };
  if (/^[+-]/.test(s)) {
    const minutes = parseDuration(s.replace(/^[+-]/, ''));
    if (!Number.isNaN(minutes) && minutes > 0) {
      return { kind: 'relative', minutes: s.startsWith('-') ? -minutes : minutes };
    }
    return { kind: 'empty' };
  }
  const time = normalizeTime(s);
  if (time) return { kind: 'absolute', time };
  return { kind: 'empty' };
}

/** True when the raw string parses to an absolute time or a relative offset. */
export function isValidTimeExpression(raw: string | undefined | null): boolean {
  return parseTimeExpression(raw).kind !== 'empty';
}

export const DEFAULT_CALL_STAGES: CallStageDef[] = [
  { key: 'pickup', label: 'Pickup', abbrev: 'P', lead: '-1h' },
  { key: 'arrive', label: 'Arrive', abbrev: 'Arr', lead: '-30m' },
  { key: 'hmua', label: 'HMU', abbrev: 'HMU', lead: '-1h' },
  { key: 'costume', label: 'Costume', abbrev: 'Cost', lead: '-30m' },
  { key: 'onSet', label: 'On Set', abbrev: 'OnSet' },
];

export const DEFAULT_CATEGORY_STAGES: Record<string, string[]> = {
  cast: ['pickup', 'arrive', 'hmua', 'costume', 'onSet'],
  backgroundActors: ['arrive', 'onSet'],
};

/** Settings merged with the defaults (project may have never opened the
 *  Call Times tab). */
export function getCallTimeSettings(project: Project): CallTimeSettings {
  const s = project.productionInfo?.callTimes;
  return {
    stages: s?.stages?.length ? s.stages : DEFAULT_CALL_STAGES,
    categoryStages: { ...DEFAULT_CATEGORY_STAGES, ...(s?.categoryStages || {}) },
  };
}

export interface ResolvedCall {
  time: string;
  source: 'override' | 'computed';
  /** The raw override expression, when one is stored. */
  expr?: string;
}

/**
 * Computes every stage's call time for one element. The LAST stage in
 * `stageKeys` is the anchor (On Set) — its time is the element's first scene
 * call. Earlier stages walk backwards, each using its override (absolute or
 * relative) or its configured default lead.
 */
export function computeElementCallChain(
  stages: CallStageDef[],
  stageKeys: string[],
  anchor: string,
  overrides?: ElementCallTimes,
): Record<string, ResolvedCall> {
  const byKey = new Map(stages.map(s => [s.key, s]));
  const ordered = stageKeys.filter(k => byKey.has(k));
  const out: Record<string, ResolvedCall> = {};
  if (ordered.length === 0) return out;

  let nextTime = anchor;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const key = ordered[i];
    const override = (overrides as Record<string, string | undefined> | undefined)?.[key];
    const isAnchor = i === ordered.length - 1;

    if (isAnchor) {
      const parsed = parseTimeExpression(override);
      if (override && parsed.kind === 'absolute') {
        out[key] = { time: parsed.time, source: 'override', expr: override };
        nextTime = parsed.time;
      } else {
        out[key] = { time: anchor, source: 'computed' };
        nextTime = anchor;
      }
      continue;
    }

    const expr = override ?? byKey.get(key)?.lead;
    const parsed = parseTimeExpression(expr);
    if (override && parsed.kind === 'absolute') {
      out[key] = { time: parsed.time, source: 'override', expr: override };
      nextTime = parsed.time;
    } else if (parsed.kind === 'relative') {
      const time = addMinutesToTime(nextTime, parsed.minutes);
      out[key] = { time, source: override ? 'override' : 'computed', expr: override };
      nextTime = time;
    } else {
      out[key] = { time: nextTime, source: 'computed' };
    }
  }
  return out;
}

export { normalizeTime };
