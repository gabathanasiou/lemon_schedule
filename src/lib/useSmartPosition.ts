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
    const vh = window.innerHeight;

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
  setPos: (p: { top: number; left: number; width: number }) => void,
) {
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelWidth = 200;
    const panelHeight = 200;
    const gap = 4;

    let left = Math.max(0, rect.left);
    let top = rect.bottom + gap;

    if (left + panelWidth > vw) left = Math.max(0, vw - panelWidth - 8);
    if (top + panelHeight > vh && rect.top - panelHeight - gap >= 0) {
      top = rect.top - panelHeight - gap;
    }
    top = Math.max(0, top);

    setPos({ top, left, width: rect.width });
  }, [open, wrapperRef]);
}
