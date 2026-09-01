import React from 'react';
import { ProjectRule } from '../../types';
import { cn } from '../../lib/utils';
import { RULE_TYPE_META, describeRule, describeRuleDetailed } from './ruleMeta';
import { ItemRow } from '../cards/ItemRow';
import { ChevronRight, Flag, X } from 'lucide-react';

interface RuleCardProps {
  rule: ProjectRule;
  onEdit: () => void;
  /** When provided the card shows the cast-aware description
   *  ("1. FISHERMAN: max 8h") instead of the compact chip text. */
  castMembers?: Array<{ id: string; name: string }>;
  theme?: 'light' | 'dark';
  /** How many violations this rule has on the day the card is shown for. */
  conflicts?: number;
  /** Dark row only: drop the type icon + short chip (the per-type CardSection
   *  header already carries the type signal — the element events manager). */
  compact?: boolean;
  /** Dark row only: trailing delete X — the rest of the row opens the editor
   *  (the event-row contract; the element events manager). */
  onDelete?: () => void;
}

export const RuleCard: React.FC<RuleCardProps> = ({ rule, onEdit, castMembers, theme = 'light', conflicts, compact, onDelete }) => {
  const meta = RULE_TYPE_META[rule.type];
  const Icon = meta.icon;
  const dark = theme === 'dark';
  const desc = castMembers ? describeRuleDetailed(rule, castMembers) : describeRule(rule);

  // Dark theme = the shared ItemRow (the CardSection event-row contract): the
  // whole row opens the editor, the trailing X deletes.
  if (dark) {
    return (
      <ItemRow
        onClick={onEdit}
        titleClass="flex-1 min-w-0 flex items-center gap-2 text-left"
        title={
          <>
            {!compact && (
              <>
                <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-zinc-900 border border-zinc-700/60">
                  <Icon className={cn('w-3.5 h-3.5', meta.chipIcon)} />
                </span>
                <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0', meta.chip)}>
                  {meta.short}
                </span>
              </>
            )}
            <span className="flex-1 min-w-0 text-xs text-zinc-300 group-hover:text-zinc-100 transition-colors truncate">
              {desc}
            </span>
            {!!conflicts && conflicts > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 shrink-0">
                <Flag className="w-3 h-3 fill-current" /> {conflicts}
              </span>
            )}
          </>
        }
        trailing={onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete rule"
            title="Delete this rule"
            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400 transition-colors shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        ) : undefined}
      />
    );
  }

  return (
    <button
      onClick={onEdit}
      className={cn(
        'w-full text-left rounded-lg p-3 flex items-center gap-3 transition-all hover:shadow-sm cursor-pointer',
        'bg-white border hover:shadow-md',
        meta.border,
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
          <span className="text-sm font-medium truncate text-zinc-900">
            {desc}
          </span>
        </div>
        {!!conflicts && conflicts > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-bold mt-1 text-red-600">
            <Flag className="w-3 h-3 fill-current" /> {conflicts} {conflicts === 1 ? 'conflict' : 'conflicts'}
          </span>
        )}
      </div>
      <ChevronRight className="w-4 h-4 shrink-0 text-zinc-300" />
    </button>
  );
};
