import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useTouchMode } from '../lib/useMarquee';
import TimeKeypad from './TimeKeypad';

/**
 * Shared call-time expression input (D11/D19). DISPLAYS the resolved absolute
 * time as plain, readable text; focusing switches the SAME input to the raw
 * expression (absolute `7:30`/`730`/`7:30am` or relative `-1h`/`+30m`) and
 * selects it. Desktop = always-mounted inline input (no mount/caret jump);
 * touch = a keypad with `:` `+` `-` `h` `m`. A stored override shows an amber
 * dot + reset.
 */
export interface TimeFieldProps {
  /** Raw expression (absolute or relative). */
  value?: string;
  onChange: (raw: string) => void;
  /** The absolute time the expression resolves to (caller-computed). */
  resolvedTime?: string;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  /** Show a reset-to-auto affordance when an override is stored. */
  onReset?: () => void;
  autoFocus?: boolean;
  /** Dark chrome (the modal surfaces). Default light (the Day Manager page). */
  theme?: 'light' | 'dark';
  /** Hide the amber "overridden" dot. For fields where a non-empty value is
   *  the configured default rather than an override (e.g. call-stage leads). */
  hideOverrideDot?: boolean;
  /** Accessible name for the input / touch trigger. */
  ariaLabel?: string;
  /** Horizontal alignment of the value. Default center (the inline forms);
   *  `left` for value tiles whose label is left-aligned. */
  align?: 'left' | 'center';
}

export const TimeField: React.FC<TimeFieldProps> = ({
  value = '',
  onChange,
  resolvedTime,
  readOnly,
  placeholder = '—',
  className = '',
  onReset,
  autoFocus,
  theme = 'light',
  hideOverrideDot,
  ariaLabel,
  align = 'center',
}) => {
  const isTouch = useTouchMode();
  const dark = theme === 'dark';
  const alignCls = align === 'left' ? 'text-left' : 'text-center';

  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);

  const hasOverride = !!value;
  const display = resolvedTime || value || '';

  useEffect(() => { if (!focused) setDraft(value); }, [value, focused]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const openKeypad = () => {
    setDraft(value);
    setOpen(true);
  };

  const resetBtn = onReset && hasOverride && !readOnly ? (
    <button
      type="button"
      aria-label="Reset to calculated"
      title="Reset to calculated"
      onClick={onReset}
      className={`p-1 rounded transition-colors ${dark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}
    >
      <RotateCcw className="w-3 h-3" />
    </button>
  ) : null;

  const overrideDot = hasOverride && !hideOverrideDot ? <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Overridden" /> : null;

  if (readOnly) {
    return <span className={`inline-flex items-center gap-1 text-xs tabular-nums ${dark ? 'text-zinc-200' : 'text-zinc-800'} ${className}`}>{display || '—'}</span>;
  }

  if (!isTouch) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <input
          ref={inputRef}
          data-timefield
          aria-label={ariaLabel}
          type="text"
          value={focused ? draft : display}
          placeholder={display || placeholder}
          onChange={e => setDraft(e.target.value)}
          onFocus={e => {
            setFocused(true);
            setDraft(value);
            const el = e.currentTarget;
            // Select after React swaps the display value for the raw expression.
            requestAnimationFrame(() => el.select());
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancelRef.current = true; e.currentTarget.blur(); }
          }}
          onBlur={() => {
            if (!cancelRef.current && draft.trim() !== value) onChange(draft.trim());
            cancelRef.current = false;
            setFocused(false);
          }}
          className={`w-full min-w-[3.25rem] px-1.5 py-0.5 rounded bg-transparent text-xs tabular-nums ${alignCls} outline-none cursor-text transition-colors ${dark
            ? 'text-zinc-100 hover:bg-zinc-800 hover:ring-1 hover:ring-zinc-700 focus:bg-zinc-800 focus:ring-2 focus:ring-zinc-600'
            : 'text-zinc-800 hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 focus:bg-white focus:ring-2 focus:ring-blue-400'}`}
        />
        {overrideDot}
        {resetBtn}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        data-timefield
        aria-label={ariaLabel}
        onClick={openKeypad}
        className={`flex-1 min-w-0 flex items-center ${align === 'left' ? 'justify-start' : 'justify-center'} gap-1 px-2 py-1.5 rounded border text-xs tabular-nums transition-colors ${dark ? 'bg-zinc-950 border-zinc-700 text-zinc-100 hover:bg-zinc-900' : 'border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50'}`}
      >
        <span className="truncate">{display || <span className="text-zinc-400">{placeholder}</span>}</span>
        {overrideDot}
      </button>
      {resetBtn}
      {open && (
        <TimeKeypad
          value={draft}
          onCommit={v => { onChange(v.trim()); setOpen(false); }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
};

export default TimeField;
