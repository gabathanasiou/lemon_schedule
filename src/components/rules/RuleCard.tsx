import React from 'react';
import { ProjectRule } from '../../types';
import { cn } from '../../lib/utils';
import { RULE_TYPE_META, describeRule } from './ruleMeta';
import { ChevronRight } from 'lucide-react';

interface RuleCardProps {
  rule: ProjectRule;
  onEdit: () => void;
}

export const RuleCard: React.FC<RuleCardProps> = ({ rule, onEdit }) => {
  const meta = RULE_TYPE_META[rule.type];
  const Icon = meta.icon;

  return (
    <button
      onClick={onEdit}
      className={cn(
        'w-full text-left bg-white border rounded-lg p-3 flex items-center gap-3 transition-all hover:shadow-sm cursor-pointer',
        meta.border
      )}
    >
      <div className={cn('w-9 h-9 rounded-md flex items-center justify-center shrink-0', meta.bg)}>
        <Icon className={cn('w-4 h-4', meta.text)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded', meta.badge)}>
            {meta.short}
          </span>
          <span className="text-sm text-zinc-900 font-medium truncate">
            {describeRule(rule)}
          </span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0" />
    </button>
  );
};
