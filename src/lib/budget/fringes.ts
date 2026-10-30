import type { BudgetFringe, BudgetLine } from '../../types';

/** Half-up rounding to the cent — the ONE rounding rule (lines only). */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

export interface FringeApplication {
  fringe: BudgetFringe;
  cents: number;
}

function groupsMatch(fringe: BudgetFringe, line: BudgetLine): boolean {
  if (!fringe.groups || fringe.groups.length === 0) return false;
  const lineGroups = line.groups || [];
  return fringe.groups.some(g => lineGroups.includes(g));
}

/** A fringe applies when the line names it OR shares one of its groups. */
export function fringeApplies(fringe: BudgetFringe, line: BudgetLine): boolean {
  return (line.fringes || []).includes(fringe.id) || groupsMatch(fringe, line);
}

export function fringesForLine(line: BudgetLine, fringes: BudgetFringe[]): BudgetFringe[] {
  return fringes.filter(f => fringeApplies(f, line));
}

/**
 * Fringe amount for one line. `rangeBaseCents` is the shared base when lines
 * share a `fringeRangeId` (percent fringes then apply ONCE over the range sum,
 * attached to the first line); `isRangeAnchor` says whether this line owns it.
 */
export function fringeCentsForLine(
  fringe: BudgetFringe,
  line: BudgetLine,
  localBaseCents: number,
  rangeBaseCents?: number,
  isRangeAnchor = true,
): number {
  if (fringe.calc === 'fixedPerUnit') {
    return roundHalfUp((fringe.amountCents || 0) * line.qty * line.multiplier);
  }
  if (fringe.calc === 'flat') {
    return roundHalfUp(fringe.amountCents || 0);
  }
  if (!isRangeAnchor) return 0;
  const base = rangeBaseCents != null ? rangeBaseCents : localBaseCents;
  const cut = fringe.cutoffCents != null ? Math.min(base, fringe.cutoffCents) : base;
  return roundHalfUp((cut * (fringe.percent || 0)) / 100);
}

export interface LineFringeResult {
  items: FringeApplication[];
  cents: number;
}

/** Fringe breakdown for every applicable fringe on a line. */
export function computeLineFringes(
  line: BudgetLine,
  localBaseCents: number,
  fringes: BudgetFringe[],
  rangeBaseCents?: number,
  isRangeAnchor = true,
): LineFringeResult {
  const items: FringeApplication[] = [];
  let cents = 0;
  for (const fringe of fringesForLine(line, fringes)) {
    const amount = fringeCentsForLine(fringe, line, localBaseCents, rangeBaseCents, isRangeAnchor);
    items.push({ fringe, cents: amount });
    cents += amount;
  }
  return { items, cents };
}

/** Range totals for percent fringes: lines sharing `fringeRangeId`. */
export function fringeRangeBases(lines: { line: BudgetLine; localBaseCents: number }[]): Map<string, number> {
  const sums = new Map<string, number>();
  for (const { line, localBaseCents } of lines) {
    if (!line.fringeRangeId) continue;
    sums.set(line.fringeRangeId, (sums.get(line.fringeRangeId) || 0) + localBaseCents);
  }
  return sums;
}
