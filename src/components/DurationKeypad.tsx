import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Delete } from 'lucide-react';
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
  sceneNumber?: string;
  pageCount?: string;
}

const KEY = 'flex items-center justify-center rounded-md text-base font-semibold transition-all cursor-pointer active:scale-90 h-11 min-w-[48px] select-none';
const NUM = `${KEY} bg-zinc-200 text-zinc-800 hover:bg-zinc-300 hover:text-zinc-900 active:bg-zinc-400 active:text-zinc-900`;
const ACT = `${KEY} bg-zinc-100 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700 active:bg-zinc-400 active:text-zinc-800`;
const CMD = `${KEY} bg-zinc-800 text-white hover:bg-zinc-700 active:bg-zinc-600`;
const PNUM = 'bg-zinc-400 text-zinc-900 scale-90';
const PACT = 'bg-zinc-400 text-zinc-800 scale-90';
const PCMD = 'bg-zinc-600 text-white scale-90';

export default function DurationKeypad({
  value,
  onChange,
  display,
  onExit,
  onOpen,
  className = '',
  autoFocus = false,
  sceneNumber,
  pageCount,
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
  const [pressedKey, setPressedKey] = useState<string | null>(null);

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
    setPressedKey(null);
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

  const handleKeyPressText = useCallback((ch: string) => {
    const next = isPristine ? ch : draftRef.current + ch;
    setDraft(next);
    draftRef.current = next;
    setIsPristine(false);
  }, [isPristine]);

  const backspaceText = useCallback(() => {
    const next = isPristine ? '' : draftRef.current.slice(0, -1);
    setDraft(next);
    draftRef.current = next;
    if (isPristine) setIsPristine(false);
  }, [isPristine]);

  useEffect(() => {
    if (!open) return;
    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); setPressedKey('Enter'); handleCommit(); return; }
      if (e.key === 'Escape') { e.preventDefault(); handleCancel(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); setPressedKey('Backspace'); backspaceText(); return; }
      if (/^[0-9hm]$/i.test(e.key)) { e.preventDefault(); setPressedKey(e.key.toLowerCase()); handleKeyPressText(e.key.toLowerCase()); }
    };
    const keyupHandler = () => setPressedKey(null);
    window.addEventListener('keydown', keydownHandler, true);
    window.addEventListener('keyup', keyupHandler, true);
    return () => {
      window.removeEventListener('keydown', keydownHandler, true);
      window.removeEventListener('keyup', keyupHandler, true);
      setPressedKey(null);
    };
  }, [open, handleCommit, handleCancel, backspaceText, handleKeyPressText]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  const pk = pressedKey;

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
            onPointerDown={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
          >
            <div className="bg-white/95 backdrop-blur-md border border-zinc-200 rounded-lg shadow-[0_-1px_8px_rgba(0,0,0,0.04),0_12px_40px_rgba(0,0,0,0.13)] p-4 min-w-[220px] font-sans">
              {(sceneNumber || pageCount) && (
                <div className="flex items-center justify-between text-[11px] text-zinc-500 font-medium mb-3 px-1">
                  <span>{sceneNumber ? `Scene ${sceneNumber}` : ''}</span>
                  <span>{pageCount ? `${pageCount} pgs` : ''}</span>
                </div>
              )}
              <div className="text-right text-zinc-900 text-base font-mono mb-3 px-3 py-2 bg-zinc-200/70 border-2 border-zinc-300 rounded min-h-[32px]">
                {draft || '\u00A0'}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <button className={`${NUM} ${pk === '1' ? PNUM : ''}`} onPointerDown={() => handleKeyPress('1')}>1</button>
                <button className={`${NUM} ${pk === '2' ? PNUM : ''}`} onPointerDown={() => handleKeyPress('2')}>2</button>
                <button className={`${NUM} ${pk === '3' ? PNUM : ''}`} onPointerDown={() => handleKeyPress('3')}>3</button>
                <button className={`${ACT} ${pk === 'Backspace' ? PACT : ''}`} onPointerDown={backspace}><Delete className="w-5 h-5" /></button>
                <button className={`${NUM} ${pk === '4' ? PNUM : ''}`} onPointerDown={() => handleKeyPress('4')}>4</button>
                <button className={`${NUM} ${pk === '5' ? PNUM : ''}`} onPointerDown={() => handleKeyPress('5')}>5</button>
                <button className={`${NUM} ${pk === '6' ? PNUM : ''}`} onPointerDown={() => handleKeyPress('6')}>6</button>
                <button className={`${ACT} ${pk === 'h' ? PACT : ''}`} onPointerDown={() => handleKeyPress('h')}>H</button>
                <button className={`${NUM} ${pk === '7' ? PNUM : ''}`} onPointerDown={() => handleKeyPress('7')}>7</button>
                <button className={`${NUM} ${pk === '8' ? PNUM : ''}`} onPointerDown={() => handleKeyPress('8')}>8</button>
                <button className={`${NUM} ${pk === '9' ? PNUM : ''}`} onPointerDown={() => handleKeyPress('9')}>9</button>
                <button className={`${ACT} ${pk === 'm' ? PACT : ''}`} onPointerDown={() => handleKeyPress('m')}>M</button>
                <div />
                <button className={`${NUM} ${pk === '0' ? PNUM : ''}`} onPointerDown={() => handleKeyPress('0')}>0</button>
                <button className={`${CMD} col-span-2 ${pk === 'Enter' ? PCMD : ''}`} onPointerDown={(e) => { e.nativeEvent.stopImmediatePropagation(); e.stopPropagation(); handleCommit(); }}>⏎ Enter</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
