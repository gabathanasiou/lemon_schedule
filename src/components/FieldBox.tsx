import React from 'react';

const FIELD_BOX_BASE = 'flex items-center gap-1.5 rounded-md border border-[color:var(--ui-input-border)] bg-[var(--ui-input-bg)] px-2.5 py-1.5 focus-within:border-[color:var(--ui-input-focus-border)] transition-colors';

export const FieldBox: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`${FIELD_BOX_BASE} ${className || 'w-36'}`}>{children}</div>
);

export const SuffixField: React.FC<{ suffix: string; children: React.ReactNode; className?: string }> = ({ suffix, children, className }) => (
  <div className={`${FIELD_BOX_BASE} ${className || 'w-36'}`}>
    {children}
    <span className="text-[10px] font-medium text-[color:var(--ui-text-faint)] uppercase shrink-0">{suffix}</span>
  </div>
);
