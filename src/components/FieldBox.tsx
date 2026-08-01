import React from 'react';

const FIELD_BOX_BASE = 'flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 focus-within:border-zinc-500 transition-colors';

export const FieldBox: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`${FIELD_BOX_BASE} ${className || 'w-36'}`}>{children}</div>
);

export const SuffixField: React.FC<{ suffix: string; children: React.ReactNode; className?: string }> = ({ suffix, children, className }) => (
  <div className={`${FIELD_BOX_BASE} ${className || 'w-36'}`}>
    {children}
    <span className="text-[10px] font-medium text-zinc-500 uppercase shrink-0">{suffix}</span>
  </div>
);
