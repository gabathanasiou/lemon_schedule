import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Delete, RotateCcw } from 'lucide-react';
import { CellInput } from './CellInput';
import { useTouchMode } from '../lib/useMarquee';
import { usePortalTarget, useCurrentDocument, useCurrentWindow } from '../lib/popoutTarget';

/**
 * Shared call-time expression input (D11/D19). Stores the RAW expression
 * (absolute `7:30`/`730`/`7:30am` or relative `-1h`/`-45m`/`+30m`); the caller
 * resolves it to an absolute time and passes `resolvedTime` for display.
 * Desktop = inline `CellInput`; touch = a keypad with `:` `+` `-` `h` `m`.
 */
export interface TimeFieldProps {
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
  placeholder = '7:30 or -1h',
  className = '',
  onReset,
  autoFocus,
}) => {
  const isTouch = useTouchMode();
  const portalTarget = usePortalTarget();
  const currentDocument = useCurrentDocument();
  const currentWindow = useCurrentWindow();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const openRef = useRef(false);

  const commit = useCallback(() => {
    onChange(draftRef.current.trim());
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
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
      else if (e.key === 'Backspace') { e.preventDefault(); setDraft(d => d.slice(0, -1)); }
      else if (/^[0-9:+\-hm]$/i.test(e.key)) { e.preventDefault(); setDraft(d => d + e.key.toLowerCase()); }
    };
    currentWindow.addEventListener('keydown', onKey, true);
    return () => currentWindow.removeEventListener('keydown', onKey, true);
  }, [open, commit, currentWindow]);

  const openKeypad = () => {
    setDraft(value);
    draftRef.current = value;
    setOpen(true);
  };

  const press = (ch: string) => setDraft(d => { const next = d + ch; draftRef.current = next; return next; });
  const backspace = () => setDraft(d => { const next = d.slice(0, -1); draftRef.current = next; return next; });

  const resetBtn = onReset && value && !readOnly ? (
    <button
      type="button"
      aria-label="Reset to calculated"
      title="Reset to calculated"
      onClick={onReset}
      className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
    >
      <RotateCcw className="w-3 h-3" />
    </button>
  ) : null;

  if (readOnly) {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <span>{value || '\u00A0'}</span>
        {resolvedTime && <span className="text-[10px] text-zinc-400">{resolvedTime}</span>}
      </span>
    );
  }

  if (!isTouch) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <CellInput value={value} onChange={onChange} placeholder={placeholder} noFill autoFocus={autoFocus} />
        {resolvedTime && <span className="text-[10px] text-zinc-400 whitespace-nowrap">{resolvedTime}</span>}
        {resetBtn}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={openKeypad}
        className="flex-1 min-w-0 text-left px-2 py-1.5 rounded border border-zinc-300 bg-white text-xs text-zinc-800 hover:bg-zinc-50"
      >
        {value || <span className="text-zinc-400">{placeholder}</span>}
        {resolvedTime && <span className="ml-1 text-[10px] text-zinc-400">{resolvedTime}</span>}
      </button>
      {resetBtn}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[10002] bg-black/20"
          style={{ pointerEvents: 'auto' }}
          onPointerDown={() => commit()}
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
                <button className={ACT} onPointerDown={() => { setDraft(''); draftRef.current = ''; }}>Clear</button>
                <button className={`${CMD} col-span-2`} onPointerDown={commit}>⏎ Enter</button>
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
