import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget, useCurrentWindow } from '../lib/popoutTarget';

/**
 * Shared hover tooltip: fixed-position floating panel anchored above the
 * trigger, clamped to the viewport. Renders via portal into the popout
 * window's target when present (cross-window safe).
 *
 * Used by ViolationTooltip (rules/conflicts) and TravelHoldTooltip (calendar
 * day travel/hold annotations).
 */
export const HoverTooltip: React.FC<{
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Wait this many ms before showing (0 = immediate). */
  delay?: number;
}> = ({ content, children, className, delay = 0 }) => {
  const portalTarget = usePortalTarget();
  const currentWindow = useCurrentWindow();
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipOffset, setTipOffset] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePos = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
  };

  const onEnter = () => {
    updatePos();
    if (delay > 0) {
      timerRef.current = setTimeout(() => setShow(true), delay);
    } else {
      setShow(true);
    }
  };

  const onLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  useLayoutEffect(() => {
    if (show && tipRef.current) {
      const r = tipRef.current.getBoundingClientRect();
      const vw = currentWindow.innerWidth;
      let offset = 0;
      if (r.left < 8) offset = 8 - r.left;
      else if (r.right > vw - 8) offset = (vw - 8) - r.right;
      setTipOffset(offset);
    } else {
      setTipOffset(0);
    }
  }, [show, content]);

  useEffect(() => {
    if (show) { updatePos(); currentWindow.addEventListener('scroll', updatePos, true); }
    return () => currentWindow.removeEventListener('scroll', updatePos, true);
  }, [show, content]);

  return (
    <div
      ref={ref}
      className={className ?? 'inline-flex'}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {children}
      {show && createPortal(
        <div
          ref={tipRef}
          className="fixed px-2.5 py-1.5 bg-zinc-900 text-white text-[10px] rounded shadow-xl leading-relaxed max-w-lg border border-white/20 pointer-events-none"
          style={{ left: pos.x, top: pos.y - 4, transform: `translate(calc(-50% + ${tipOffset}px), -100%)`, zIndex: 99999 }}
        >
          {content}
          <div className="absolute top-full -translate-x-1/2 -mt-px border-4 border-transparent border-t-zinc-900" style={{ left: `calc(50% - ${tipOffset}px)` }} />
        </div>,
        portalTarget ?? document.body
      )}
    </div>
  );
};
