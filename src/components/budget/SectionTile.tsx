import React from 'react';

/**
 * The small KPI tile used by the Budget and Cost Report views
 * (`docs/BUDGETING-SURFACES.md` §2/§5). Local to the budget surfaces — not a
 * promoted kit primitive (promote only if a second feature outside Budget
 * needs it).
 */
export function SectionTile({
  label, value, tone = 'strong', hint, icon,
}: {
  label: string;
  value: string;
  tone?: 'muted' | 'strong' | 'good' | 'bad';
  hint?: string;
  icon?: React.ReactNode;
}) {
  const valueColor = tone === 'muted'
    ? 'text-[color:var(--ui-text-muted)]'
    : tone === 'good'
      ? 'text-emerald-700'
      : tone === 'bad'
        ? 'text-red-600'
        : 'text-[color:var(--ui-text-strong)]';
  return (
    <div className="min-w-0 rounded-md border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-[color:var(--ui-text-faint)] truncate">{label}</div>
      <div className={`flex items-center gap-1 text-xs font-semibold truncate ${valueColor}`}>
        {icon}
        <span className="truncate">{value}</span>
        {hint && <span className="text-[9px] font-medium opacity-80 truncate">{hint}</span>}
      </div>
    </div>
  );
}

export default SectionTile;
