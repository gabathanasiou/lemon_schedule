import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useCurrentWindow } from './popoutTarget';

export function useSmartPosition(
  wrapperRef: RefObject<HTMLElement>,
  open: boolean,
) {
  const currentWindow = useCurrentWindow();
  const currentWindowRef = useRef(currentWindow);
  currentWindowRef.current = currentWindow;
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const dropdown = wrapperRef.current.querySelector('.absolute') as HTMLElement | null;
    if (!dropdown) return;

    dropdown.style.left = '';
    dropdown.style.right = '';
    dropdown.style.top = '';
    dropdown.style.bottom = '';
    dropdown.style.maxHeight = '';

    const wrapperRect = wrapperRef.current.getBoundingClientRect();
    const ddRect = dropdown.getBoundingClientRect();
    const vw = currentWindowRef.current.innerWidth;
    const vh = currentWindowRef.current.innerHeight;

    const overflowRight = ddRect.right - vw;
    if (overflowRight > 0) {
      const shift = Math.min(overflowRight + 8, ddRect.left);
      dropdown.style.left = `${ddRect.left - wrapperRect.left - shift}px`;
    }

    if (ddRect.left < 0) {
      dropdown.style.left = `${-wrapperRect.left + 4}px`;
    }

    if (ddRect.bottom > vh + 4) {
      dropdown.style.top = 'auto';
      dropdown.style.bottom = '100%';
      const newRect = dropdown.getBoundingClientRect();
      if (newRect.top < 0) {
        dropdown.style.bottom = 'auto';
        dropdown.style.top = `${-wrapperRect.top + 4}px`;
        dropdown.style.maxHeight = `${vh - 8}px`;
      }
    }
  }, [open, wrapperRef]);
}

export function useFixedPosition(
  wrapperRef: RefObject<HTMLElement>,
  open: boolean,
  setPos: (p: { top: number; left: number; width: number; maxH: number; bottom?: number }) => void,
) {
  const currentWindow = useCurrentWindow();
  const currentWindowRef = useRef(currentWindow);
  currentWindowRef.current = currentWindow;
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const el = wrapperRef.current;
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const vw = currentWindowRef.current.innerWidth;
      const vh = currentWindowRef.current.visualViewport?.height ?? currentWindowRef.current.innerHeight;
      const voff = currentWindowRef.current.visualViewport?.offsetTop ?? 0;
      const panelWidth = 200;
      const gap = 4;
      const minH = 120;

      let left = Math.max(0, rect.left);
      if (left + panelWidth > vw) left = Math.max(0, vw - panelWidth - 8);

      const spaceBelow = voff + vh - rect.bottom - gap - 16;
      const spaceAbove = rect.top - voff - gap - 16;

      if (spaceBelow >= minH || spaceBelow >= spaceAbove) {
        const top = Math.min(rect.bottom + gap, voff + vh);
        const maxH = Math.max(minH, voff + vh - top - 16);
        setPos({ top, left, width: rect.width, maxH });
      } else {
        const maxH = Math.max(minH, Math.min(spaceAbove, 360));
        const bottom = voff + vh - (rect.top - gap);
        setPos({ top: 0, left, width: rect.width, maxH, bottom: Math.max(0, bottom) });
      }
    });
  }, [open, wrapperRef]);
}
