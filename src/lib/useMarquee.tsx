import React, { useState, useEffect, useRef } from 'react';

interface MarqueeBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

let _addMode = false;
let _listenersInitialized = false;
const _marqueeJustEndedRef = { current: false };
const _addModeListeners = new Set<() => void>();

export function isAddModeActive() { return _addMode; }

export function useAddMode(): boolean {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick(n => n + 1);
    _addModeListeners.add(fn);
    return () => { _addModeListeners.delete(fn); };
  }, []);
  return _addMode;
}

function initKeyboardListeners() {
  if (_listenersInitialized) return;
  _listenersInitialized = true;
  const down = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
      if (!_addMode) {
        _addMode = true;
        _addModeListeners.forEach(fn => fn());
      }
    }
  };
  const up = (e: KeyboardEvent) => {
    if (!e.metaKey && !e.ctrlKey && _addMode) {
      _addMode = false;
      _addModeListeners.forEach(fn => fn());
    }
  };
  const blur = () => {
    if (_addMode) {
      _addMode = false;
      _addModeListeners.forEach(fn => fn());
    }
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
}

export function useMarquee(
  containerRef: React.RefObject<HTMLElement>,
  onSelectionChange: (ids: Set<string>, isAddMode: boolean) => void,
  isEnabled: boolean = true,
) {
  const [marqueeBox, setMarqueeBox] = useState<MarqueeBox | null>(null);

  useEffect(() => { 
    if (!isEnabled) return;
    initKeyboardListeners(); 
  }, [isEnabled]);

  useEffect(() => {
    if (!isEnabled) return;
    const container = containerRef.current;
    if (!container) return;

    let startX = 0, startY = 0;
    let active = false;
    let hadMovement = false;

    const allowOnRibbons = () => _addMode;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      const onRibbon = target.closest('[data-row-id]');

      if (onRibbon && e.altKey) {
        e.stopPropagation();
      } else {
        if (!allowOnRibbons() && onRibbon) return;
        if (target.closest('button, input, select, textarea, [role="button"]')) return;
      }

      const rect = container.getBoundingClientRect();
      startX = e.clientX - rect.left + container.scrollLeft;
      startY = e.clientY - rect.top + container.scrollTop;
      active = true;
      hadMovement = false;
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      setMarqueeBox({ left: startX, top: startY, width: 0, height: 0 });
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
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
        onSelectionChange(intersected, _addMode || e.shiftKey);
      }
    };

    const onPointerUp = () => {
      if (!active) return;
      active = false;
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      setMarqueeBox(null);
      if (hadMovement) _marqueeJustEndedRef.current = true;
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [containerRef, onSelectionChange, isEnabled]);

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
