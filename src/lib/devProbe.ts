/**
 * TEMPORARY device probe (roadmap 267 phone debugging) — DEV builds only.
 * Beacons viewport/shell measurements to the Mac's probe server
 * (/private/var/folders/.../opencode/lemon-probe-server.mjs) so a real phone's
 * Safari can be inspected without Web Inspector. Remove once the phone pass
 * is done; see docs/ROADMAP.md item 267.
 */
const PROBE_URL = (import.meta.env.VITE_PHONE_PROBE_URL as string | undefined) || 'http://192.168.0.210:3999/probe';

const recentErrors: string[] = [];

function measure() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = { top: cs.paddingTop, bottom: cs.paddingBottom, left: cs.paddingLeft, right: cs.paddingRight };
  probe.remove();

  const rect = (el: HTMLElement | null) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), styleH: el.style.height || null, scrollH: el.scrollHeight };
  };

  return {
    at: new Date().toISOString(),
    url: location.href,
    inner: { w: innerWidth, h: innerHeight },
    vv: visualViewport ? { w: Math.round(visualViewport.width), h: Math.round(visualViewport.height), top: Math.round(visualViewport.offsetTop) } : null,
    screen: { w: screen.width, h: screen.height, dpr: devicePixelRatio },
    insets,
    viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null,
    standalone: matchMedia('(display-mode: standalone)').matches,
    doc: { scrollH: document.documentElement.scrollHeight, clientH: document.documentElement.clientHeight, bodyH: document.body.scrollHeight },
    shell: rect(document.querySelector<HTMLElement>('#root > div')),
    scroller: rect(document.querySelector<HTMLElement>('[data-marquee-container]')),
    errors: recentErrors.slice(-5),
  };
}

function send() {
  try {
    navigator.sendBeacon(PROBE_URL, JSON.stringify(measure()));
  } catch { /* best effort */ }
}

export function installDevProbe(): void {
  if (!import.meta.env.DEV) return;
  addEventListener('error', (e) => {
    const msg = e instanceof ErrorEvent ? e.message : String(e);
    if (msg) recentErrors.push(msg);
  });
  setTimeout(send, 1200);
  setTimeout(send, 3000);
  addEventListener('resize', () => setTimeout(send, 400), { passive: true });
  addEventListener('orientationchange', () => setTimeout(send, 600));
  addEventListener('focus', () => setTimeout(send, 300));
}
