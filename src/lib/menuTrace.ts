/* TEMPORARY on-device diagnostics (not a product feature).
 *
 * Records the pointer/click/focus/mutation sequence around the touch menus and
 * POSTs it to the dev server (`/__menu-trace`, see vite.config.ts), so a REAL
 * iPhone can reproduce a bug while the agent reads the trace from the Mac.
 *
 * Enable per visit with `?menutrace=1` (or localStorage `LEMON_MENU_TRACE=1`).
 * Remove this file + the call in main.tsx + the Vite plugin when done. */

const enabled = (() => {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(location.search).has('menutrace')
      || localStorage.getItem('LEMON_MENU_TRACE') === '1';
  } catch {
    return false;
  }
})();

type Rec = Record<string, unknown>;

export function installMenuTrace() {
  if (!import.meta.env.DEV || !enabled) return;

  const started = Math.round(performance.now());
  let recs: Rec[] = [];
  let sendTimer = 0;
  let badge: HTMLElement | null = null;

  const describe = (node: EventTarget | null) => {
    if (!(node instanceof Element)) return null;
    const row = (node.closest('[role="menuitem"], [data-submenu-back], [aria-haspopup], button, input') ?? node) as HTMLElement;
    return {
      tag: row.tagName,
      role: row.getAttribute('role'),
      label: row.getAttribute('aria-label'),
      text: (row.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 36),
      popup: row.getAttribute('aria-haspopup'),
      state: row.getAttribute('data-state'),
      anchor: row.getAttribute('data-presence-anchor'),
    };
  };

  const menus = () => [...document.querySelectorAll('[role="menu"]')].map(m => {
    const s = getComputedStyle(m);
    const r = m.getBoundingClientRect();
    return {
      op: Number(s.opacity).toFixed(2),
      vis: s.visibility,
      pe: s.pointerEvents,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      text: (m.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 22),
    };
  });

  /* Long tasks + frame gaps: "the button becomes Done then nothing responds
     for a while" is either a dropped click or a blocked main thread. Record
     both so the trace can tell them apart. */
  const longTasks: number[] = [];
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) longTasks.push(Math.round(e.duration));
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* unsupported */ }
  let lastFrame = performance.now();
  const frameLoop = () => {
    const now = performance.now();
    if (now - lastFrame > 120) push({ ev: 'frame-gap', ms: Math.round(now - lastFrame) });
    lastFrame = now;
    requestAnimationFrame(frameLoop);
  };
  requestAnimationFrame(frameLoop);

  const editState = () => {
    const el = document.querySelector('[data-presence-anchor="toolbar:schedule:edit"]') as HTMLElement | null;
    if (!el) return null;
    return {
      active: el.getAttribute('data-active'),
      disabled: (el as HTMLButtonElement).disabled,
      spinner: !!el.querySelector('.animate-spin'),
      w: Math.round(el.getBoundingClientRect().width),
    };
  };

  const push = (rec: Rec) => {
    recs.push({ t: Math.round(performance.now()) - started, ...rec });
    if (recs.length > 160) recs = recs.slice(-160);
    if (badge) badge.textContent = `menu trace ● ${recs.length}`;
    scheduleSend();
  };

  const send = () => {
    if (!recs.length) return;
    const body = JSON.stringify({ ua: navigator.userAgent, href: location.href, recs });
    try {
      if (recs.length > 60) { navigator.sendBeacon('/__menu-trace', body); recs = []; }
      else void fetch('/__menu-trace', { method: 'POST', keepalive: true, body });
    } catch { /* diagnostics only */ }
  };

  const scheduleSend = () => {
    if (sendTimer) return;
    sendTimer = window.setTimeout(() => { sendTimer = 0; send(); }, 700);
  };

  const evt = (type: string, phase: 'capture' | 'bubble' = 'capture') => (e: Event) => {
    const p = e as PointerEvent & MouseEvent;
    push({
      ev: type,
      phase,
      pointer: (e as PointerEvent).pointerType ?? null,
      x: typeof p.clientX === 'number' ? Math.round(p.clientX) : null,
      y: typeof p.clientY === 'number' ? Math.round(p.clientY) : null,
      target: describe(e.target),
      hit: (() => {
        const el = document.elementFromPoint(p.clientX, p.clientY) as HTMLElement | null;
        return el ? { tag: el.tagName, anchor: el.getAttribute('data-presence-anchor'), text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24) } : null;
      })(),
      edit: editState(),
      bodyPE: getComputedStyle(document.body).pointerEvents,
      prevented: e.defaultPrevented,
      menus: menus(),
      long: longTasks.slice(-3),
    });
  };

  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) {
    document.addEventListener(type, evt(type), true);
  }
  // Bubble-phase click: shows whether a handler cancelled the select/close.
  document.addEventListener('click', evt('click!', 'bubble'));

  document.addEventListener('focusin', (e) => {
    push({ ev: 'focusin', target: describe(e.target), menus: menus() });
  }, true);

  // Menu mounts/unmounts + open-state/style changes (opacity, visibility,
  // pointer-events are how a "dismissed" card looks in the trace).
  let lastCount = -1;
  const observer = new MutationObserver(() => {
    const n = document.querySelectorAll('[role="menu"]').length;
    if (n !== lastCount) {
      lastCount = n;
      push({ ev: n > lastCount ? 'menus+' : 'menus-', count: n, menus: menus() });
    }
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['data-state', 'style', 'data-submenu-inert', 'data-submenu-open'],
  });

  // Visible recorder badge (top-left, never intercepts taps).
  badge = document.createElement('div');
  badge.textContent = 'menu trace ● 0';
  badge.style.cssText = [
    'position:fixed', 'left:6px', 'top:6px', 'z-index:2147483647',
    'background:#7c3aed', 'color:#fff', 'font:600 10px/1.4 ui-monospace,monospace',
    'padding:2px 6px', 'border-radius:999px', 'pointer-events:none', 'opacity:.85',
  ].join(';');
  document.body.appendChild(badge);

  window.addEventListener('pagehide', () => { navigator.sendBeacon('/__menu-trace', JSON.stringify({ ua: navigator.userAgent, href: location.href, recs })); });
  push({ ev: 'start', menus: menus() });
}
