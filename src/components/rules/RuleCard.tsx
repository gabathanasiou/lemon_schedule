import React from 'react';
import { ProjectRule } from '../../types';
import { cn } from '../../lib/utils';
import { RULE_TYPE_META, describeRule, describeRuleDetailed } from './ruleMeta';
import { ChevronRight } from 'lucide-react';

interface RuleCardProps {
  rule: ProjectRule;
  onEdit: () => void;
  /** When provided the card shows the cast-aware description
   *  ("1. FISHERMAN: max 8h") instead of the compact chip text. */
  castMembers?: Array<{ id: string; name: string }>;
  theme?: 'light' | 'dark';
}

export const RuleCard: React.FC<RuleCardProps> = ({ rule, onEdit, castMembers, theme = 'light' }) => {
  const meta = RULE_TYPE_META[rule.type];
  const Icon = meta.icon;
  const dark = theme === 'dark';
  const desc = castMembers ? describeRuleDetailed(rule, castMembers) : describeRule(rule);

  return (
    <button
      onClick={onEdit}
      className={cn(
        'w-full text-left rounded-lg p-3 flex items-center gap-3 transition-all hover:shadow-sm cursor-pointer',
        dark
          ? 'bg-zinc-900 border border-zinc-800 hover:bg-zinc-800'
          : cn('bg-white border hover:shadow-md', meta.border),
      )}
    >
      <div className={cn('w-9 h-9 rounded-md flex items-center justify-center shrink-0', dark ? 'bg-zinc-800' : meta.bg)}>
        <Icon className={cn('w-4 h-4', dark ? meta.chipIcon : meta.text)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded', dark ? meta.chip : meta.badge)}>
            {meta.short}
          </span>
          <span className={cn('text-sm font-medium truncate', dark ? 'text-zinc-200' : 'text-zinc-900')}>
            {desc}
          </span>
        </div>
      </div>
      <ChevronRight className={cn('w-4 h-4 shrink-0', dark ? 'text-zinc-600' : 'text-zinc-300')} />
    </button>
  );
};
