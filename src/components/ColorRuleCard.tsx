import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ColorRule } from '../types';
import { IS_COARSE } from '../lib/device';
import { Check, Copy, GripVertical, X } from 'lucide-react';
import { getCatIcon, getCategoryLabel, getElementName } from './ColorRuleCardMeta';
import { Project } from '../types';

interface ColorRuleCardProps {
  project: Project;
  rule: ColorRule;
  onToggle: (id: string) => void;
  onEdit: (rule: ColorRule) => void;
  onDuplicate: (rule: ColorRule) => void;
  onDelete: (id: string) => void;
}

export default function ColorRuleCard({ project, rule, onToggle, onEdit, onDuplicate, onDelete }: ColorRuleCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const SECO = IS_COARSE ? 'w-4 h-4' : 'w-3.5 h-3.5';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 p-3 rounded-lg bg-[var(--ui-card-bg)] border border-[color:var(--ui-card-border)] hover:border-[color:var(--ui-border-strong)] transition-colors group"
    >
      <button {...attributes} {...listeners} className="text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-text-muted)] mt-0.5 cursor-grab active:cursor-grabbing shrink-0">
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => onToggle(rule.id)} className="cursor-pointer mt-0.5 shrink-0">
        <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${rule.enabled ? 'bg-[var(--ui-text-faint)] border-[color:var(--ui-border-strong)]' : 'border-[color:var(--ui-border-strong)]'}`}>
          {rule.enabled && <Check className="w-3 h-3 text-[color:var(--ui-input-text)]" />}
        </span>
      </button>
      <div className="flex-1 min-w-0" onClick={() => onEdit(rule)} style={{ cursor: 'pointer' }}>
        <div className="space-y-0.5">
          {rule.conditions.map((c, i) => {
            const catLabel = getCategoryLabel(project, c.category);
            const elName = getElementName(project, c.category, c.elementId);
            const isCast = c.category === 'cast';
            const isLast = i === rule.conditions.length - 1;
            return (
              <div key={i} className="flex items-center gap-1 text-xs leading-snug">
                {getCatIcon(project, c.category)}
                <span className="font-medium text-[color:var(--ui-text)]">{catLabel} <span className="text-[color:var(--ui-text-faint)]">=</span></span>
                <span className="text-[color:var(--ui-input-text)] truncate">
                  {isCast ? `${c.elementId}. ${elName}` : elName}
                </span>
                {isLast && (
                  <span className="flex items-center gap-1 ml-2 shrink-0">
                    {rule.override.type === 'single' ? (
                      <span className="w-3 h-3 rounded-sm border border-[color:var(--ui-border-strong)] shrink-0" style={{ background: rule.override.background }} />
                    ) : (
                      <span className="text-[9px] text-[color:var(--ui-text-faint)]">M</span>
                    )}
                    <span className="text-[9px] text-[color:var(--ui-text-faint)] capitalize">{rule.override.type}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(rule); }}
          className="text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-text)] transition-colors opacity-0 group-hover:opacity-100 p-1.5"
        >
          <Copy className={SECO} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(rule.id); }}
          className="text-[color:var(--ui-text-faint)] hover:text-[color:var(--ui-danger-text)] transition-colors opacity-0 group-hover:opacity-100 p-1.5"
        >
          <X className={SECO} />
        </button>
      </div>
    </div>
  );
}
