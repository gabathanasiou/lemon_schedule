import { useLayoutEffect, type RefObject } from 'react';

export function useSmartPosition(
  wrapperRef: RefObject<HTMLElement>,
  open: boolean,
) {
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
    const vw = window.innerWidth;

    const overflowRight = ddRect.right - vw;
    if (overflowRight > 0) {
      const shift = Math.min(overflowRight + 8, ddRect.left);
      dropdown.style.left = `${ddRect.left - wrapperRect.left - shift}px`;
    }

    if (ddRect.left < 0) {
      dropdown.style.left = `${-wrapperRect.left + 4}px`;
    }
  }, [open, wrapperRef]);
}

export function useFixedPosition(
  wrapperRef: RefObject<HTMLElement>,
  open: boolean,
  setPos: (p: { top: number; left: number; width: number; maxH: number }) => void,
) {
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const voff = window.visualViewport?.offsetTop ?? 0;
    const panelWidth = 200;
    const gap = 4;

    let left = Math.max(0, rect.left);
    let top = Math.min(rect.bottom + gap, voff + vh);

    if (left + panelWidth > vw) left = Math.max(0, vw - panelWidth - 8);
    top = Math.max(voff, top);
    const maxH = Math.max(120, voff + vh - top - 16);

    setPos({ top, left, width: rect.width, maxH });
  }, [open, wrapperRef]);
}
