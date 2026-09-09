import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Delete, RotateCcw } from 'lucide-react';
import { useTouchMode } from '../lib/useMarquee';
import { usePortalTarget, useCurrentDocument, useCurrentWindow } from '../lib/popoutTarget';

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
}

const KEY = 'flex items-center justify-center rounded-md text-base font-semibold transition-all cursor-pointer active:scale-90 h-11 min-w-[44px] select-none';
const NUM = `${KEY} bg-zinc-200 text-zinc-800 hover:bg-zinc-300`;
const ACT = `${KEY} bg-zinc-100 text-zinc-500 hover:bg-zinc-300`;
const CMD = `${KEY} bg-zinc-800 text-white hover:bg-zinc-700`;

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
}) => {
  const isTouch = useTouchMode();
  const dark = theme === 'dark';
  const portalTarget = usePortalTarget();
  const currentDocument = useCurrentDocument();
  const currentWindow = useCurrentWindow();

  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const keypadDraft = useRef(value);
  const openRef = useRef(false);

  const hasOverride = !!value;
  const display = resolvedTime || value || '';

  useEffect(() => { if (!focused) setDraft(value); }, [value, focused]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // ---- touch keypad ----
  const commitKeypad = useCallback(() => {
    onChange(keypadDraft.current.trim());
    setOpen(false);
  }, [onChange]);

  useEffect(() => {
    if (!open) return;
    openRef.current = true;
    const block = (e: Event) => {
      if (openRef.current) { e.stopPropagation(); e.preventDefault(); }
    };
    currentDocument.addEventListener('pointerup', block, true);
    return () => currentDocument.removeEventListener('pointerup', block, true);
  }, [open, currentDocument]);

  useEffect(() => {
    if (open) return;
    const id = setTimeout(() => { openRef.current = false; }, 200);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); commitKeypad(); }
      else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
      else if (e.key === 'Backspace') { e.preventDefault(); setDraft(k => { const n = k.slice(0, -1); keypadDraft.current = n; return n; }); }
      else if (/^[0-9:+\-hm]$/i.test(e.key)) { e.preventDefault(); setDraft(k => { const n = k + e.key.toLowerCase(); keypadDraft.current = n; return n; }); }
    };
    currentWindow.addEventListener('keydown', onKey, true);
    return () => currentWindow.removeEventListener('keydown', onKey, true);
  }, [open, commitKeypad, currentWindow]);

  const openKeypad = () => {
    setDraft(value);
    keypadDraft.current = value;
    setOpen(true);
  };
  const press = (ch: string) => setDraft(k => { const n = k + ch; keypadDraft.current = n; return n; });
  const backspace = () => setDraft(k => { const n = k.slice(0, -1); keypadDraft.current = n; return n; });

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

  const overrideDot = hasOverride ? <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Overridden" /> : null;

  if (readOnly) {
    return <span className={`inline-flex items-center gap-1 text-xs tabular-nums ${dark ? 'text-zinc-200' : 'text-zinc-800'} ${className}`}>{display || '—'}</span>;
  }

  if (!isTouch) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <input
          ref={inputRef}
          data-timefield
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
          className={`w-full min-w-[3.25rem] px-1.5 py-0.5 rounded bg-transparent text-xs tabular-nums text-center outline-none cursor-text transition-colors ${dark
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
        onClick={openKeypad}
        className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-2 py-1.5 rounded border text-xs tabular-nums transition-colors ${dark ? 'bg-zinc-950 border-zinc-700 text-zinc-100 hover:bg-zinc-900' : 'border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50'}`}
      >
        <span className="truncate">{display || <span className="text-zinc-400">{placeholder}</span>}</span>
        {overrideDot}
      </button>
      {resetBtn}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[10002] bg-black/20"
          style={{ pointerEvents: 'auto' }}
          onPointerDown={() => commitKeypad()}
        >
          <div
            className="fixed left-1/2 -translate-x-1/2 bottom-6 w-[280px]"
            onPointerDown={e => e.stopPropagation()}
          >
            <div className="bg-white/95 backdrop-blur-md border border-zinc-200 rounded-lg shadow-[0_12px_40px_rgba(0,0,0,0.18)] p-4 font-sans">
              <div className="text-right text-zinc-900 text-base font-mono mb-3 px-3 py-2 bg-zinc-200/70 border-2 border-zinc-300 rounded min-h-[32px]">
                {draft || '\u00A0'}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <button className={NUM} onPointerDown={() => press('7')}>7</button>
                <button className={NUM} onPointerDown={() => press('8')}>8</button>
                <button className={NUM} onPointerDown={() => press('9')}>9</button>
                <button className={ACT} onPointerDown={backspace}><Delete className="w-5 h-5" /></button>
                <button className={NUM} onPointerDown={() => press('4')}>4</button>
                <button className={NUM} onPointerDown={() => press('5')}>5</button>
                <button className={NUM} onPointerDown={() => press('6')}>6</button>
                <button className={ACT} onPointerDown={() => press(':')}>:</button>
                <button className={NUM} onPointerDown={() => press('1')}>1</button>
                <button className={NUM} onPointerDown={() => press('2')}>2</button>
                <button className={NUM} onPointerDown={() => press('3')}>3</button>
                <button className={ACT} onPointerDown={() => press('-')}>−</button>
                <div />
                <button className={NUM} onPointerDown={() => press('0')}>0</button>
                <button className={ACT} onPointerDown={() => press('+')}>+</button>
                <button className={ACT} onPointerDown={() => press('h')}>H</button>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-2">
                <button className={ACT} onPointerDown={() => press('m')}>M</button>
                <button className={ACT} onPointerDown={() => { setDraft(''); keypadDraft.current = ''; }}>Clear</button>
                <button className={`${CMD} col-span-2`} onPointerDown={commitKeypad}>⏎ Enter</button>
              </div>
            </div>
          </div>
        </div>,
        portalTarget ?? document.body,
      )}
    </div>
  );
};

export default TimeField;
