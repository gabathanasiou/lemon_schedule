export type PeriodKey = 'all' | 'month' | 'quarter' | 'year' | 'custom';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  all: 'All time',
  month: 'This month',
  quarter: 'This quarter',
  year: 'This year',
  custom: 'Custom range',
};

const pad = (n: number) => String(n).padStart(2, '0');

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** The as-of month/quarter/year window as ISO from/to (local calendar math). */
export function periodRange(key: PeriodKey, asOf: string): { from?: string; to?: string } {
  if (key === 'all' || key === 'custom') return {};
  const year = Number(asOf.slice(0, 4));
  const month = Number(asOf.slice(5, 7));
  if (!year || !month) return {};
  if (key === 'month') {
    return { from: `${asOf.slice(0, 7)}-01`, to: `${asOf.slice(0, 7)}-${pad(lastDayOfMonth(year, month))}` };
  }
  if (key === 'quarter') {
    const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const endMonth = startMonth + 2;
    return {
      from: `${year}-${pad(startMonth)}-01`,
      to: `${year}-${pad(endMonth)}-${pad(lastDayOfMonth(year, endMonth))}`,
    };
  }
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Toolbar label for the selected period (custom shows its live range). */
export function periodLabel(key: PeriodKey, customFrom: string, customTo: string): string {
  if (key !== 'custom') return PERIOD_LABELS[key];
  return customFrom || customTo ? `${customFrom || '…'} → ${customTo || '…'}` : 'Custom range';
}
