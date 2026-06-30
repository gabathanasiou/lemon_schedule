import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { IS_COARSE } from './device';

type MarqueeMode = 'off' | 'tool' | 'transient';

let _marqueeMode: MarqueeMode = 'off';
let _marqueeModeListeners = new Set<() => void>();

export function getMarqueeMode(): MarqueeMode { return _marqueeMode; }

export function setMarqueeMode(m: MarqueeMode) {
  _marqueeMode = m;
  _marqueeModeListeners.forEach(fn => fn());
}

export function useMarqueeMode(): MarqueeMode {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick(n => n + 1);
    _marqueeModeListeners.add(fn);
    return () => { _marqueeModeListeners.delete(fn); };
  }, []);
  return _marqueeMode;
}

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 8;
const RING_SIZE = 44;
const RING_STROKE = 3;

function animateRing(ringEl: SVGElement, ms: number) {
  const circle = ringEl.querySelector('circle')!;
  const total = 2 * Math.PI * 19;
  circle.style.strokeDasharray = String(total);
  circle.style.strokeDashoffset = String(total);
  const start = performance.now();
  const tick = (now: number) => {
    const elapsed = now - start;
    const frac = Math.min(elapsed / ms, 1);
    circle.style.strokeDashoffset = String(total * (1 - frac));
    if (frac < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function LongPressIndicator({ x, y }: { x: number; y: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (svgRef.current) animateRing(svgRef.current, LONG_PRESS_MS);
  }, []);
  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: x - RING_SIZE / 2,
        top: y - RING_SIZE / 2,
        width: RING_SIZE,
        height: RING_SIZE,
        zIndex: 99999,
        pointerEvents: 'none',
      }}
    >
      <svg ref={svgRef} width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={19}
          fill="none"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
        />
      </svg>
    </div>,
    document.body,
  );
}

export function useLongPressOptOut() {
  return { 'data-no-longpress': 'true' as const };
}

function isInteractiveElement(el: HTMLElement): boolean {
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return true;
  if (el.isContentEditable) return true;
  if (el.closest('[data-no-longpress]')) return true;
  if (el.closest('button, input, select, textarea, [role="button"]')) return true;
  return false;
}

export function LongPressMenuProvider({ children }: { children: React.ReactNode }) {
  const [indicator, setIndicator] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number; target: EventTarget | null }>({ x: 0, y: 0, target: null });
  const activeRef = useRef(false);

  useEffect(() => {
    if (!IS_COARSE) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (isInteractiveElement(target)) return;

      const x = e.clientX;
      const y = e.clientY;
      startRef.current = { x, y, target: e.target };
      activeRef.current = true;

      setIndicator({ x, y });

      timerRef.current = setTimeout(() => {
        if (!activeRef.current) return;
        setIndicator(null);

        const heldTarget = startRef.current.target as HTMLElement | null;
        if (!heldTarget) return;

        const ctxEvent = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 2,
          view: window,
        });

        heldTarget.dispatchEvent(ctxEvent);

        if (!ctxEvent.defaultPrevented) {
          setMarqueeMode('transient');
        }
      }, LONG_PRESS_MS);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activeRef.current || timerRef.current === null) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > MOVE_TOLERANCE) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        activeRef.current = false;
        setIndicator(null);
      }
    };

    const onPointerUp = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      activeRef.current = false;
      setIndicator(null);
    };

    const onPointerLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      activeRef.current = false;
      setIndicator(null);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    document.addEventListener('pointerleave', onPointerLeave);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('pointerleave', onPointerLeave);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <>
      {children}
      {indicator && <LongPressIndicator x={indicator.x} y={indicator.y} />}
    </>
  );
}
