import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hover-tip state that behaves on touch (roadmap 331).
 *
 * iOS Safari keeps the tap's `:hover` sticky, and a finger tap fires
 * `mouseenter` without a matching `mouseleave` when the next tap lands on a
 * non-interactive area — so a JS-only hover tip can stay on screen forever.
 * This hook is the ONE shared owner of that state: mouse enter/leave drive it
 * on desktop, and ANY pointerdown outside the bound element clears it on
 * touch (a tap anywhere else dismisses, like a menu).
 *
 * Usage:
 *   const tip = useHoverTip<HTMLDivElement>();
 *   <div ref={tip.ref} {...tip.bind}>{…}{tip.show && <Bubble/>}</div>
 *
 * The kit `Tooltip` implements the same outside-tap dismissal on its own
 * (separate package); keep the two behaviours aligned.
 */
export function useHoverTip<T extends HTMLElement = HTMLDivElement>(delay = 0) {
  const [show, setShow] = useState(false);
  const ref = useRef<T>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const showTip = useCallback(() => {
    clearTimer();
    if (delay > 0) {
      timer.current = setTimeout(() => setShow(true), delay);
    } else {
      setShow(true);
    }
  }, [clearTimer, delay]);

  const hideTip = useCallback(() => {
    clearTimer();
    setShow(false);
  }, [clearTimer]);

  /* Touch dismissal: a tap outside the bound element clears the tip. Capture
     phase so it beats any inner handler that stops propagation. */
  useEffect(() => {
    if (!show) return undefined;
    const doc = ref.current?.ownerDocument ?? document;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setShow(false);
    };
    doc.addEventListener('pointerdown', onPointerDown, true);
    return () => doc.removeEventListener('pointerdown', onPointerDown, true);
  }, [show]);

  useEffect(() => clearTimer, [clearTimer]);

  return { ref, show, showTip, hideTip, bind: { onMouseEnter: showTip, onMouseLeave: hideTip } };
}
