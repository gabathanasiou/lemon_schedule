import React from 'react';
import { Flag } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { violationTypeLabel } from '../../../../lib/violations';

const ConflictsSection: React.FC<DaySectionProps> = ({ day }) => {
  if (day.violations.length === 0) {
    return <p className="text-xs text-zinc-400">No rule conflicts on this day.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {day.violations.map((v, i) => (
        <li key={`${v.ruleId}-${i}`} className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5">
          <Flag className="w-3.5 h-3.5 shrink-0 text-red-500 mt-0.5" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-red-700">{violationTypeLabel(v.ruleType)}</div>
            <div className="text-[11px] text-red-600/90 leading-relaxed">{v.message}{v.detail ? ` — ${v.detail}` : ''}</div>
          </div>
        </li>
      ))}
    </ul>
  );
};

export const ConflictsIcon = Flag;

export default ConflictsSection;
