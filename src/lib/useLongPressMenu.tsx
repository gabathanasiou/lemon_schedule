import { useState, useEffect } from 'react';

// Long-press provider + opt-out come from the shared kit (configured in
// App.tsx with this app's marquee/row target rules).
export { LongPressMenuProvider, useLongPressOptOut } from '@gabriel/ui-kit';

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
