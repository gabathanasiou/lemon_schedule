import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget, useCurrentDocument, useCurrentWindow } from '../lib/popoutTarget';

interface FloatingTooltipProps {
  open: boolean;
  children: React.ReactNode;
}

export const FloatingTooltip: React.FC<FloatingTooltipProps> = ({ open, children }) => {
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
    if (!open) {
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
  }, [open, updatePos]);

  useEffect(() => {
    if (open) currentWindow.addEventListener('scroll', updatePos, true);
    return () => currentWindow.removeEventListener('scroll', updatePos, true);
  }, [open, updatePos]);

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
