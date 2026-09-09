import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget, useCurrentDocument, useCurrentWindow } from '../lib/popoutTarget';

interface FloatingTooltipProps {
  open: boolean;
  children: React.ReactNode;
  /** Optional viewport-coordinate anchor. Seeds the position (and re-seeds on
   *  change) so a tooltip driven by non-pointer events — e.g. a Glide grid row
   *  hover — doesn't flash at 0,0 before the first pointermove. */
  anchor?: { x: number; y: number } | null;
  /** Follow the pointer (default true). False keeps the tooltip pinned to the
   *  anchor — used by grid row hovers so it never jumps between the cell and
   *  the cursor. */
  followPointer?: boolean;
}

export const FloatingTooltip: React.FC<FloatingTooltipProps> = ({ open, children, anchor, followPointer = true }) => {
  const portalTarget = usePortalTarget();
  const currentDocument = useCurrentDocument();
  const currentWindow = useCurrentWindow();
  const currentWindowRef = useRef(currentWindow);
  currentWindowRef.current = currentWindow;
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  const updatePos = useCallback(() => {
    const el = tooltipRef.current;
    if (!el) {
      setPos(posRef.current);
      return;
    }
    const rect = el.getBoundingClientRect();
    const MARGIN = 8;
    let left = posRef.current.x + 12;
    let top = posRef.current.y - 12 - rect.height;
    if (top < MARGIN) top = posRef.current.y + 12;
    if (left + rect.width > currentWindowRef.current.innerWidth - MARGIN) {
      left = currentWindowRef.current.innerWidth - rect.width - MARGIN;
    }
    if (left < MARGIN) left = MARGIN;
    top = Math.max(MARGIN, Math.min(top, currentWindowRef.current.innerHeight - rect.height - MARGIN));
    setPos({ x: left, y: top });
  }, []);

  useEffect(() => {
    if (!open || !followPointer) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    const handler = (e: PointerEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          updatePos();
          rafRef.current = null;
        });
      }
    };
    currentDocument.addEventListener('pointermove', handler);
    return () => {
      currentDocument.removeEventListener('pointermove', handler);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [open, updatePos, followPointer]);

  useEffect(() => {
    if (open) currentWindow.addEventListener('scroll', updatePos, true);
    return () => currentWindow.removeEventListener('scroll', updatePos, true);
  }, [open, updatePos]);

  // Seed/re-seed from the anchor (grid row hover has no pointermove of its own).
  useEffect(() => {
    if (!open || !anchor) return;
    posRef.current = anchor;
    updatePos();
  }, [open, anchor?.x, anchor?.y, updatePos]);

  if (!open) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-[99999] pointer-events-none"
      style={{ left: pos.x, top: pos.y }}
    >
      {children}
    </div>,
    portalTarget ?? document.body
  );
};

export default FloatingTooltip;
