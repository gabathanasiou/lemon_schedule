import React from 'react';
import { ProjectRule } from '../../types';
import { cn } from '../../lib/utils';
import { RULE_TYPE_META, describeRule } from './ruleMeta';
import { Pencil, Trash2 } from 'lucide-react';

interface RuleCardProps {
  rule: ProjectRule;
  onEdit: () => void;
  onDelete: () => void;
}

export const RuleCard: React.FC<RuleCardProps> = ({ rule, onEdit, onDelete }) => {
  const meta = RULE_TYPE_META[rule.type];
  const Icon = meta.icon;

  return (
    <div className={cn(
      'group bg-white border rounded-lg p-3 flex items-center gap-3 transition-all hover:shadow-sm',
      meta.border
    )}>
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
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          title="Edit rule"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
          title="Delete rule"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
