import React, { useState, useEffect, useRef } from 'react';
import { getMarqueeMode, setMarqueeMode } from './useLongPressMenu';

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
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

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
    let mouseY = 0;
    let autoScrollRaf: number | null = null;

    const setRowsDisabled = (v: boolean) => {
      if (v) {
        container.dataset.marqueeActive = '1';
        container.style.touchAction = 'none';
      } else {
        delete container.dataset.marqueeActive;
        container.style.touchAction = '';
      }
    };

    const startAutoScroll = () => {
      if (autoScrollRaf !== null) return;
      let step = 0;
      const buffer = 80;
      const loop = () => {
        const y = mouseY;
        const crect = container.getBoundingClientRect();
        if (y > crect.top + buffer && y < crect.bottom - buffer) {
          autoScrollRaf = null;
          return;
        }
        let target = container.scrollTop;
        if (y <= crect.top + buffer) {
          const t = 1 - (y - crect.top) / buffer;
          const speed = 2 + t * t * 15;
          step = step * 0.85 + speed * 0.15;
          target = Math.max(0, container.scrollTop - step);
        } else if (y >= crect.bottom - buffer) {
          const t = (y - (crect.bottom - buffer)) / buffer;
          const speed = 2 + t * t * 15;
          step = step * 0.85 + speed * 0.15;
          target = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + step);
        }
        container.scrollTop = target;
        autoScrollRaf = requestAnimationFrame(loop);
      };
      autoScrollRaf = requestAnimationFrame(loop);
    };

    const stopAutoScroll = () => {
      if (autoScrollRaf !== null) {
        cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = null;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      const onRibbon = target.closest('[data-row-id]');

      if (e.pointerType === 'touch' && !_addMode && getMarqueeMode() === 'off') {
        if (target.closest('button, input, select, textarea, [role="button"]')) return;
        return;
      }

      if (onRibbon && e.altKey) {
        e.stopPropagation();
      } else {
        if (e.pointerType === 'touch' && getMarqueeMode() === 'tool') return;
        if (!_addMode && onRibbon) {
          const rowId = onRibbon.getAttribute('data-row-id') || '';
          if (!rowId.startsWith('empty-')) return;
        }
        if (target.closest('button, input, select, textarea, [role="button"]')) return;
        e.stopPropagation();
      }

      const rect = container.getBoundingClientRect();
      startX = e.clientX - rect.left + container.scrollLeft;
      startY = e.clientY - rect.top + container.scrollTop;
      active = true;
      hadMovement = false;
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      setMarqueeBox({ left: startX, top: startY, width: 0, height: 0 });
      setRowsDisabled(true);
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!active && e.pointerType === 'touch' && getMarqueeMode() === 'transient') {
        const rect = container.getBoundingClientRect();
        startX = e.clientX - rect.left + container.scrollLeft;
        startY = e.clientY - rect.top + container.scrollTop;
        active = true;
        hadMovement = false;
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        setMarqueeBox({ left: startX, top: startY, width: 0, height: 0 });
        setRowsDisabled(true);
        e.preventDefault();
        return;
      }
      if (!active) return;
      e.preventDefault();
      mouseY = e.clientY;
      const crect = container.getBoundingClientRect();
      const edge = 80;
      if (e.clientY < crect.top + edge || e.clientY > crect.bottom - edge) {
        startAutoScroll();
      } else {
        stopAutoScroll();
      }
      const rect = container.getBoundingClientRect();
      const curX = e.clientX - rect.left + container.scrollLeft;
      const curY = e.clientY - rect.top + container.scrollTop;
      const left = Math.min(startX, curX);
      const top = Math.min(startY, curY);
      const width = Math.abs(curX - startX);
      const height = Math.abs(curY - startY);

      setMarqueeBox({ left, top, width, height });
      hadMovement = true;

      if (width > 10 || height > 10) {
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
        onSelectionChangeRef.current(intersected, _addMode || e.shiftKey);
      }
    };

    const onPointerUp = () => {
      if (!active) return;
      if (getMarqueeMode() === 'transient') {
        setMarqueeMode('off');
      }
      stopAutoScroll();
      active = false;
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      setMarqueeBox(null);
      setRowsDisabled(false);
      if (hadMovement) {
        _marqueeJustEndedRef.current = true;
      } else {
        onSelectionChangeRef.current(new Set(), _addMode);
      }
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      stopAutoScroll();
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setRowsDisabled(false);
    };
  }, [containerRef, isEnabled]);

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
        background: 'rgba(128,128,128,0.15)',
        border: '1px dotted #000',
        outline: '1px dotted #fff',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    />
  );
}
