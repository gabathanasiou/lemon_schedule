import React from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';

export const BoneyardExpandButton: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'Boneyard' }) => (
  <button
    onClick={onClick}
    title="Show Boneyard"
    data-presence-anchor="toolbar:boneyard:toggle"
    className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border border-dashed border-[color:var(--ui-border-strong)] text-[color:var(--ui-text-muted)] hover:border-[color:var(--ui-text-faint)] hover:bg-[var(--ui-card-hover)] hover:text-[color:var(--ui-text)] transition-colors cursor-pointer select-none text-xs font-semibold shrink-0"
  >
    <ChevronRight className="w-3.5 h-3.5 shrink-0" />
    {label}
  </button>
);

export const BoneyardCollapseButton: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'Boneyard' }) => (
  <button
    onClick={onClick}
    title="Hide Boneyard"
    data-presence-anchor="toolbar:boneyard:toggle"
    className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border border-dashed border-[color:var(--ui-border-strong)] text-[color:var(--ui-text-muted)] hover:border-[color:var(--ui-text-faint)] hover:bg-[var(--ui-card-hover)] hover:text-[color:var(--ui-text)] transition-colors cursor-pointer select-none text-xs font-semibold shrink-0"
  >
    <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
    {label}
  </button>
);
