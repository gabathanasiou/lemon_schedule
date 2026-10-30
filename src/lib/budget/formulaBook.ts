import type { BudgetGlobal } from '../../types';
import { FORMULA_FUNCTIONS } from './formula';
import { parseSearchTags } from '@gabriel/ui-kit';

/**
 * The ONE formula registry (roadmap 346): the autocomplete panel and the
 * searchable formula book read the same entries — never a second list.
 * System globals come from the schedule (`SYSTEM_GLOBAL_KEYS`), project globals
 * from the budget library, functions from the safe evaluator.
 */
export type FormulaBookKind = 'system' | 'project' | 'function';

export interface FormulaBookEntry {
  /** The identifier (global symbol or function name). */
  key: string;
  kind: FormulaBookKind;
  label: string;
  detail: string;
  example?: string;
  /** Text inserted into the field (functions include the opening paren). */
  insert: string;
  /** Current value for system/project globals (display only). */
  value?: number;
}

const SYSTEM_DETAILS: Record<string, string> = {
  SHOOT_DAYS: 'Production days in the active schedule.',
  PREP_DAYS: 'Prep days before the production window.',
  PREP_WEEKS: 'Prep days ÷ 5.',
  WRAP_DAYS: 'Wrap days after the production window (currently 0).',
  WRAP_WEEKS: 'Wrap days ÷ 5 (currently 0).',
  POST_WEEKS: 'Post-production days ÷ 5.',
  TOTAL_WEEKS: 'The whole calendar span in weeks.',
};

const KIND_LABEL: Record<FormulaBookKind, string> = {
  system: 'System globals',
  project: 'Project globals',
  function: 'Functions',
};

export function formulaBookKindLabel(kind: FormulaBookKind): string {
  return KIND_LABEL[kind];
}

export function buildFormulaBook(
  systemValues: Record<string, number>,
  globals: BudgetGlobal[] | undefined,
): FormulaBookEntry[] {
  const out: FormulaBookEntry[] = [];
  for (const key of Object.keys(systemValues)) {
    out.push({
      key,
      kind: 'system',
      label: key,
      detail: SYSTEM_DETAILS[key] || 'System global computed from the schedule.',
      insert: key,
      value: systemValues[key],
    });
  }
  for (const g of globals || []) {
    if (!g.symbol) continue;
    const key = g.symbol.toUpperCase();
    out.push({
      key,
      kind: 'project',
      label: key,
      detail: g.system ? 'System global (read-only).' : (g.description || (g.formula ? `Formula: ${g.formula}` : 'Project global')),
      insert: key,
      value: typeof g.value === 'number' ? g.value : undefined,
    });
  }
  for (const fn of FORMULA_FUNCTIONS) {
    out.push({
      key: fn.key,
      kind: 'function',
      label: fn.key,
      detail: fn.detail,
      example: fn.example,
      insert: `${fn.key}(`,
    });
  }
  return out;
}

/** Typeahead / book search: comma tags AND-match key, detail and example. */
export function searchFormulaBook(entries: FormulaBookEntry[], query: string): FormulaBookEntry[] {
  const tags = parseSearchTags(query).map(t => t.toLowerCase());
  if (tags.length === 0) return entries;
  return entries.filter(entry => {
    const haystack = `${entry.key} ${entry.label} ${entry.detail} ${entry.example || ''}`.toLowerCase();
    return tags.every(tag => haystack.includes(tag));
  });
}

/** The identifier the caret is inside/at the end of (`Qty * SH` → `SH`). */
export function formulaFragmentAt(text: string, caret: number): { start: number; fragment: string } {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const match = /[A-Za-z_][A-Za-z0-9_]*$/.exec(before);
  const fragment = match ? match[0] : '';
  return { start: before.length - fragment.length, fragment };
}

/** Replace the fragment at `caret` with `insert`; returns the next text/caret. */
export function insertFormulaText(text: string, caret: number, insert: string): { next: string; caret: number } {
  const { start } = formulaFragmentAt(text, caret);
  const next = text.slice(0, start) + insert + text.slice(caret);
  return { next, caret: start + insert.length };
}
