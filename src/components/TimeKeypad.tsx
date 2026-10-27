import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Delete } from 'lucide-react';
import { usePortalTarget, useCurrentDocument, useCurrentWindow } from '../lib/popoutTarget';

/**
 * The touch time-entry keypad (`:` `+` `-` `h` `m`), extracted from
 * `TimeField` so the Glide cell editors can open the SAME keypad (roadmap 301
 * sweep). The keypad owns its draft; the caller mounts it when open and closes
 * it from `onCommit`/`onCancel`.
 */
export interface TimeKeypadProps {
  /** Initial expression shown in the display. */
  value: string;
  onCommit: (value: string) => void;
  /** Escape — the caller closes its open state. */
  onCancel?: () => void;
  /** Render inside this layer instead of the popout/body target. Glide's cell
   *  editors pass their `#portal` so taps on the keypad are not an
   *  outside-click that closes the overlay. */
  portalTarget?: HTMLElement | null;
}

const KEY = 'flex items-center justify-center rounded-md text-base font-semibold transition-all cursor-pointer active:scale-90 h-11 min-w-[44px] select-none';
const NUM = `${KEY} bg-[var(--ui-card-count-bg)] text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-border-strong)]`;
const ACT = `${KEY} bg-[var(--ui-card-band)] text-[color:var(--ui-text-muted)] hover:bg-[var(--ui-border-strong)]`;
const CMD = `${KEY} bg-[var(--ui-text-strong)] text-[var(--ui-panel-bg)] hover:bg-[var(--ui-text)]`;

export const TimeKeypad: React.FC<TimeKeypadProps> = ({ value, onCommit, onCancel, portalTarget }) => {
  const popoutTarget = usePortalTarget();
  const currentDocument = useCurrentDocument();
  const currentWindow = useCurrentWindow();
  const [draft, setDraft] = useState(value);
  const [done, setDone] = useState(false);
  const draftRef = useRef(value);

  const set = (next: string) => {
    draftRef.current = next;
    setDraft(next);
  };
  const press = (ch: string) => set(draftRef.current + ch);
  const backspace = () => set(draftRef.current.slice(0, -1));
  const commit = () => {
    if (done) return;
    setDone(true);
    onCommit(draftRef.current.trim());
  };
  const cancel = () => {
    setDone(true);
    onCancel?.();
  };
  const handlers = useRef({ commit, cancel, press, backspace });
  handlers.current = { commit, cancel, press, backspace };

  // The opening tap's pointerup must not reach the surface underneath.
  useEffect(() => {
    const block = (e: Event) => { e.stopPropagation(); e.preventDefault(); };
    currentDocument.addEventListener('pointerup', block, true);
    return () => currentDocument.removeEventListener('pointerup', block, true);
  }, [currentDocument]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); handlers.current.commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); handlers.current.cancel(); }
      else if (e.key === 'Backspace') { e.preventDefault(); handlers.current.backspace(); }
      else if (/^[0-9:+\-hm]$/i.test(e.key)) { e.preventDefault(); handlers.current.press(e.key.toLowerCase()); }
    };
    currentWindow.addEventListener('keydown', onKey, true);
    return () => currentWindow.removeEventListener('keydown', onKey, true);
  }, [currentWindow]);

  if (done) return null;

  return createPortal(
    <div
      // `click-outside-ignore` keeps Glide's cell-editor overlay open while
      // the keypad is in use (its ClickOutsideContainer ignores this subtree).
      className="click-outside-ignore fixed inset-0 z-[10002] bg-black/20"
      style={{ pointerEvents: 'auto' }}
      onPointerDown={commit}
    >
      <div
        className="fixed left-1/2 -translate-x-1/2 bottom-6 w-[280px]"
        onPointerDown={e => e.stopPropagation()}
        onPointerUp={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-[var(--ui-panel-bg)] backdrop-blur-md border border-[color:var(--ui-border)] rounded-lg shadow-[0_12px_40px_rgba(0,0,0,0.18)] p-4 font-sans">
          <div className="text-right text-[color:var(--ui-text-strong)] text-base font-mono mb-3 px-3 py-2 bg-[var(--ui-card-count-bg)] border-2 border-[color:var(--ui-border-strong)] rounded min-h-[32px]">
            {draft || '\u00A0'}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <button type="button" className={NUM} onPointerDown={() => press('7')}>7</button>
            <button type="button" className={NUM} onPointerDown={() => press('8')}>8</button>
            <button type="button" className={NUM} onPointerDown={() => press('9')}>9</button>
            <button type="button" className={ACT} onPointerDown={backspace}><Delete className="w-5 h-5" /></button>
            <button type="button" className={NUM} onPointerDown={() => press('4')}>4</button>
            <button type="button" className={NUM} onPointerDown={() => press('5')}>5</button>
            <button type="button" className={NUM} onPointerDown={() => press('6')}>6</button>
            <button type="button" className={ACT} onPointerDown={() => press(':')}>:</button>
            <button type="button" className={NUM} onPointerDown={() => press('1')}>1</button>
            <button type="button" className={NUM} onPointerDown={() => press('2')}>2</button>
            <button type="button" className={NUM} onPointerDown={() => press('3')}>3</button>
            <button type="button" className={ACT} onPointerDown={() => press('-')}>−</button>
            <div />
            <button type="button" className={NUM} onPointerDown={() => press('0')}>0</button>
            <button type="button" className={ACT} onPointerDown={() => press('+')}>+</button>
            <button type="button" className={ACT} onPointerDown={() => press('h')}>H</button>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-2">
            <button type="button" className={ACT} onPointerDown={() => press('m')}>M</button>
            <button type="button" className={ACT} onPointerDown={() => set('')}>Clear</button>
            <button type="button" className={`${CMD} col-span-2`} onPointerDown={commit}>⏎ Enter</button>
          </div>
        </div>
      </div>
    </div>,
    portalTarget ?? popoutTarget ?? document.body,
  );
};

export default TimeKeypad;
