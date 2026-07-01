import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { parseDuration, formatDuration } from '../lib/utils';

interface DurationKeypadProps {
  value: number;
  onChange: (minutes: number) => void;
  display?: string;
  onExit?: () => void;
  onOpen?: () => void;
  className?: string;
  autoFocus?: boolean;
  'data-row-id'?: string;
  'data-col'?: string;
}

const KEY = 'flex items-center justify-center rounded-md text-base font-medium transition-colors cursor-pointer active:scale-90 h-11 min-w-[48px] select-none';
const NUM = `${KEY} bg-zinc-800/60 text-zinc-200 hover:bg-zinc-700 hover:text-white`;
const ACT = `${KEY} bg-zinc-800/40 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200`;
const CMD = `${KEY} bg-zinc-700 text-white hover:bg-zinc-600`;

export default function DurationKeypad({
  value,
  onChange,
  display,
  onExit,
  onOpen,
  className = '',
  autoFocus = false,
  ...rest
}: DurationKeypadProps) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const [isPristine, setIsPristine] = useState(true);
  const triggerRef = useRef<HTMLDivElement>(null);
  const keypadRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const displayText = display ?? formatDuration(value || 0);

  const reposition = useCallback(() => {
    if (triggerRef.current) {
      triggerRef.current.scrollIntoView({ block: 'nearest' });
      const r = triggerRef.current.getBoundingClientRect();
      const rowEl = triggerRef.current.closest('[data-row-id]');
      const rowBounds = rowEl ? rowEl.getBoundingClientRect() : r;
      const pw = 260;
      const estHeight = 280;
      const gap = 6;

      const rightSpace = window.innerWidth - (r.right + gap);
      const leftSpace = r.left - gap;

      let left: number, top: number;

      const spaceBelow = window.innerHeight - rowBounds.bottom;
      const spaceAbove = rowBounds.top;

      if (rightSpace >= pw) {
        left = r.right + gap;
        top = spaceBelow >= estHeight + gap
          ? rowBounds.bottom + gap
          : Math.max(gap, rowBounds.top - estHeight - gap);
      } else if (leftSpace >= pw) {
        left = r.left - gap - pw;
        top = spaceBelow >= estHeight + gap
          ? rowBounds.bottom + gap
          : Math.max(gap, rowBounds.top - estHeight - gap);
      } else {
        const centerLeft = Math.max(8, Math.min(r.left + r.width / 2 - pw / 2, window.innerWidth - pw - 8));
        top = spaceBelow >= estHeight + gap ? rowBounds.bottom + gap : Math.max(gap, rowBounds.top - estHeight - gap);
        left = centerLeft;
      }

      setPos({ top, left });
    }
  }, []);

  const handleOpen = useCallback(() => {
    reposition();
    setDraft(displayText);
    draftRef.current = displayText;
    setIsPristine(true);
    setOpen(true);
    openRef.current = true;
    onOpen?.();
  }, [reposition, displayText, onOpen]);

  useEffect(() => {
    if (autoFocus) {
      handleOpen();
    }
  }, [autoFocus, handleOpen]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    const block = (e: Event) => {
      if (openRef.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    document.addEventListener('dblclick', block, true);
    document.addEventListener('click', block, true);
    document.addEventListener('pointerup', block, true);
    return () => {
      document.removeEventListener('dblclick', block, true);
      document.removeEventListener('click', block, true);
      document.removeEventListener('pointerup', block, true);
    };
  }, []);

  useEffect(() => {
    if (open) {
      openRef.current = true;
    } else {
      const id = setTimeout(() => { openRef.current = false; }, 200);
      return () => clearTimeout(id);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setDraft('');
    draftRef.current = '';
    setIsPristine(true);
  }, []);

  const handleCommit = useCallback(() => {
    if (draft.length > 0) {
      onChange(parseDuration(draft));
    }
    handleClose();
    onExit?.();
  }, [draft, onChange, handleClose, onExit]);

  const handleCancel = useCallback(() => {
    handleClose();
    onExit?.();
  }, [handleClose, onExit]);

  const handleKeyPress = useCallback((ch: string) => {
    const next = isPristine ? ch : draftRef.current + ch;
    setDraft(next);
    draftRef.current = next;
    setIsPristine(false);
    onChange(parseDuration(next));
  }, [isPristine, onChange]);

  const backspace = useCallback(() => {
    const next = isPristine ? '' : draftRef.current.slice(0, -1);
    setDraft(next);
    draftRef.current = next;
    if (isPristine) setIsPristine(false);
    onChange(parseDuration(next || '0'));
  }, [isPristine, onChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); handleCommit(); return; }
      if (e.key === 'Escape') { e.preventDefault(); handleCancel(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); backspace(); return; }
      if (/^[0-9hm]$/i.test(e.key)) { e.preventDefault(); handleKeyPress(e.key.toLowerCase()); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, handleCommit, handleCancel, backspace, handleKeyPress]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  return (
    <>
      <div
        ref={triggerRef}
        className={`cursor-pointer ${className}`}
        onPointerDown={(e) => {
          e.stopPropagation();
          handleOpen();
        }}
        data-col="duration"
        {...rest}
      >
        {displayText || '\u00A0'}
      </div>
      {open && createPortal(
        <div
          className="fixed inset-0 z-[300]"
          onPointerDown={(e) => { e.nativeEvent.stopImmediatePropagation(); handleCommit(); }}
        >
          <div
            ref={keypadRef}
            className="fixed z-[301]"
            style={{ top: pos.top, left: pos.left }}
            onPointerDown={e => e.stopPropagation()}
          >
            <div className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-xl p-4 min-w-[220px]">
              <div className="text-right text-white text-base font-mono mb-3 px-3 py-2 bg-zinc-900/60 border border-zinc-700/50 rounded min-h-[32px]">
                {draft || '\u00A0'}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <button className={NUM} onPointerDown={() => handleKeyPress('1')}>1</button>
                <button className={NUM} onPointerDown={() => handleKeyPress('2')}>2</button>
                <button className={NUM} onPointerDown={() => handleKeyPress('3')}>3</button>
                <button className={ACT} onPointerDown={backspace}>⌫</button>
                <button className={NUM} onPointerDown={() => handleKeyPress('4')}>4</button>
                <button className={NUM} onPointerDown={() => handleKeyPress('5')}>5</button>
                <button className={NUM} onPointerDown={() => handleKeyPress('6')}>6</button>
                <button className={ACT} onPointerDown={() => handleKeyPress('h')}>H</button>
                <button className={NUM} onPointerDown={() => handleKeyPress('7')}>7</button>
                <button className={NUM} onPointerDown={() => handleKeyPress('8')}>8</button>
                <button className={NUM} onPointerDown={() => handleKeyPress('9')}>9</button>
                <button className={ACT} onPointerDown={() => handleKeyPress('m')}>M</button>
                <div />
                <button className={NUM} onPointerDown={() => handleKeyPress('0')}>0</button>
                <button className={`${CMD} col-span-2`} onPointerDown={handleCommit}>⏎ Enter</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
