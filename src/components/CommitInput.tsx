import React, { useState } from 'react';

export const inputCls = 'flex-1 min-w-0 bg-white border border-zinc-300 rounded px-2 py-1 text-xs text-zinc-800 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400 disabled:opacity-50';

/** Commit-on-blur input (CellInput contract: never per-keystroke). */
export const CommitInput: React.FC<{ value: string; onCommit: (v: string) => void; readOnly?: boolean; placeholder?: string; className?: string }> = ({ value, onCommit, readOnly, placeholder, className }) => {
  const [draft, setDraft] = useState(value);
  const [active, setActive] = useState(false);
  const commit = () => {
    setActive(false);
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      value={active ? draft : value}
      placeholder={placeholder}
      disabled={readOnly}
      className={className || inputCls}
      onChange={e => { setDraft(e.target.value); setActive(true); }}
      onFocus={e => { setDraft(value); setActive(true); e.target.select(); }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(value); (e.target as HTMLInputElement).blur(); } }}
    />
  );
};

/** Transient add-field input: commits on Enter/blur, cancels on Escape. */
export const AddPromptInput: React.FC<{ placeholder?: string; onCommit: (v: string) => void; onCancel?: () => void; className?: string }> = ({ placeholder, onCommit, onCancel, className }) => {
  const [draft, setDraft] = useState('');
  const commit = () => { onCommit(draft); setDraft(''); };
  return (
    <input
      autoFocus
      value={draft}
      placeholder={placeholder}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { setDraft(''); onCancel?.(); }
      }}
      className={className || inputCls}
    />
  );
};
