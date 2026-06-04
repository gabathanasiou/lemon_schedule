import React, { useState, useEffect, useRef } from 'react';

interface MarqueeBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

let _shiftKey = false;
let _addMode = false;
let _listenersInitialized = false;
const _marqueeJustEndedRef = { current: false };
const _shiftListeners = new Set<() => void>();

export function isShiftKeyDown() { return _shiftKey; }

export function useShiftKey(): boolean {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick(n => n + 1);
    _shiftListeners.add(fn);
    return () => { _shiftListeners.delete(fn); };
  }, []);
  return _shiftKey;
}

function initKeyboardListeners() {
  if (_listenersInitialized) return;
  _listenersInitialized = true;
  const down = (e: KeyboardEvent) => {
    if (e.key === 'Shift') { _shiftKey = true; _shiftListeners.forEach(fn => fn()); }
    if (e.metaKey || e.ctrlKey) _addMode = true;
  };
  const up = (e: KeyboardEvent) => {
    if (e.key === 'Shift') { _shiftKey = false; _shiftListeners.forEach(fn => fn()); }
    _addMode = e.metaKey || e.ctrlKey;
  };
  const blur = () => { _shiftKey = false; _addMode = false; _shiftListeners.forEach(fn => fn()); };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
}

export function useMarquee(
  containerRef: React.RefObject<HTMLElement>,
  onSelectionChange: (ids: Set<string>, isAddMode: boolean) => void,
) {
  const [marqueeBox, setMarqueeBox] = useState<MarqueeBox | null>(null);

  useEffect(() => { initKeyboardListeners(); }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let startX = 0, startY = 0;
    let active = false;
    let hadMovement = false;

    const isShiftDown = () => _shiftKey;
    const isAddMode = () => _addMode;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (!isShiftDown() && target.closest('[data-row-id]')) return;
      if (target.closest('button, input, select, textarea, [role="button"]')) return;

      const rect = container.getBoundingClientRect();
      startX = e.clientX - rect.left + container.scrollLeft;
      startY = e.clientY - rect.top + container.scrollTop;
      active = true;
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      setMarqueeBox({ left: startX, top: startY, width: 0, height: 0 });
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!active) return;
      const rect = container.getBoundingClientRect();
      const curX = e.clientX - rect.left + container.scrollLeft;
      const curY = e.clientY - rect.top + container.scrollTop;
      const left = Math.min(startX, curX);
      const top = Math.min(startY, curY);
      const width = Math.abs(curX - startX);
      const height = Math.abs(curY - startY);

      setMarqueeBox({ left, top, width, height });

      if (width > 10 || height > 10) {
        hadMovement = true;
        const rowEls = container.querySelectorAll('[data-row-id]');
        const intersected = new Set<string>();
        rowEls.forEach((el) => {
          const r = el.getBoundingClientRect();
          const eb = {
            left: r.left - rect.left + container.scrollLeft,
            top: r.top - rect.top + container.scrollTop,
            width: r.width,
            height: r.height,
          };
          if (eb.left < left + width && eb.left + eb.width > left && eb.top < top + height && eb.top + eb.height > top) {
            intersected.add(el.getAttribute('data-row-id')!);
          }
        });
        onSelectionChange(intersected, isAddMode());
      }
    };

    const onMouseUp = () => {
      if (!active) return;
      active = false;
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      setMarqueeBox(null);
      if (hadMovement) _marqueeJustEndedRef.current = true;
    };

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [containerRef, onSelectionChange]);

  return { marqueeBox, justEndedRef: _marqueeJustEndedRef };
}

export function MarqueeOverlay({ box }: { box: MarqueeBox | null }) {
  if (!box) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        background: 'transparent',
        border: '1px dotted #3168D8',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    />
  );
}
