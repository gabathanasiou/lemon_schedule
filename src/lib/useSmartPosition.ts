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
