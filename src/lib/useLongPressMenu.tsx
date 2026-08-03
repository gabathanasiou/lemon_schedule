import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IS_COARSE } from './device';
import { usePortalTarget, useCurrentDocument } from '../lib/popoutTarget';

type MarqueeMode = 'off' | 'tool';

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

let _transientMarquee = false;
let _transientListeners = new Set<() => void>();

export function getTransientMarquee(): boolean { return _transientMarquee; }

export function setTransientMarquee(v: boolean) {
  _transientMarquee = v;
  _transientListeners.forEach(fn => fn());
}

export function useTransientMarquee(): boolean {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick(n => n + 1);
    _transientListeners.add(fn);
    return () => { _transientListeners.delete(fn); };
  }, []);
  return _transientMarquee;
}

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 5;
const RING_SIZE = 88;
const RING_STROKE = 4;

function animateRing(ringEl: SVGElement, ms: number) {
  const circle = ringEl.querySelectorAll('circle')[1]!;
  const total = 2 * Math.PI * 40;
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
  const portalTarget = usePortalTarget();
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
          r={40}
          fill="none"
          stroke="rgba(0,0,0,0.45)"
          strokeWidth={RING_STROKE + 2}
          strokeLinecap="round"
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={40}
          fill="none"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
        />
      </svg>
    </div>,
    portalTarget ?? document.body,
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
  if (el.closest('button, input, select, textarea')) return true;
  return false;
}

export function LongPressMenuProvider({ children }: { children: React.ReactNode }) {
  const [indicator, setIndicator] = useState<{ x: number; y: number } | null>(null);
  const currentDocument = useCurrentDocument();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number; target: EventTarget | null }>({ x: 0, y: 0, target: null });
  const activeRef = useRef(false);

  useEffect(() => {
    if (!IS_COARSE) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || e.button !== 0) return;
      const target = e.target as HTMLElement;
      const inMarqueeToolZone = !!target.closest('[data-marquee-tool-only]');
      if (inMarqueeToolZone && _marqueeMode !== 'tool') return;
      const inRow = !!target.closest('[data-row-id]');
      if (inMarqueeToolZone) {
        if (target.closest('button, input, select, textarea')) return;
      } else {
        if (isInteractiveElement(target)) return;
        if (inRow && _marqueeMode !== 'tool') return;
      }

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

        if (inRow) {
          const ctxEvent = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button: 2,
            view: window,
          });
          heldTarget.dispatchEvent(ctxEvent);
        } else {
          setTransientMarquee(true);
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

    currentDocument.addEventListener('pointerdown', onPointerDown);
    currentDocument.addEventListener('pointermove', onPointerMove);
    currentDocument.addEventListener('pointerup', onPointerUp);
    currentDocument.addEventListener('pointercancel', onPointerUp);
    currentDocument.addEventListener('pointerleave', onPointerLeave);

    return () => {
      currentDocument.removeEventListener('pointerdown', onPointerDown);
      currentDocument.removeEventListener('pointermove', onPointerMove);
      currentDocument.removeEventListener('pointerup', onPointerUp);
      currentDocument.removeEventListener('pointercancel', onPointerUp);
      currentDocument.removeEventListener('pointerleave', onPointerLeave);
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
