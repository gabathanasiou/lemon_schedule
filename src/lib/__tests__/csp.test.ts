import { describe, it, expect } from 'vitest';
import { buildCsp } from '../csp';

// Roadmap 285 — the policy invariants. Deliberately exact: a loosening edit
// (someone adding 'unsafe-inline' to script-src, dropping an origin) must fail
// here and force a conscious decision + a docs update (SECURITY.md §7).

const directive = (policy: string, name: string) =>
  policy.split('; ').find((d) => d === name || d.startsWith(`${name} `));

describe('buildCsp', () => {
  const prod = buildCsp({ dev: false });
  const dev = buildCsp({ dev: true });

  it('ships every required directive', () => {
    for (const name of [
      'default-src', 'script-src', 'style-src', 'img-src', 'font-src',
      'connect-src', 'frame-src', 'object-src', 'base-uri', 'form-action',
    ]) {
      expect(directive(prod, name), name).toBeTruthy();
    }
  });

  it('keeps production scripts strict — no inline, no eval (item 274 defense-in-depth)', () => {
    expect(directive(prod, 'script-src')).toBe("script-src 'self' https://accounts.google.com");
  });

  it('allows the inline styles the app actually uses (React/Leaflet/Glide)', () => {
    expect(directive(prod, 'style-src')).toBe("style-src 'self' 'unsafe-inline'");
  });

  it('names every third-party origin the app reaches', () => {
    for (const origin of [
      'https://accounts.google.com', 'https://www.googleapis.com',
      'https://places.googleapis.com',
      'https://nominatim.openstreetmap.org',
      'https://tile.openstreetmap.org',
      'https://api.open-meteo.com', 'https://archive-api.open-meteo.com',
      'https://www.gstatic.com', 'https://*.supabase.co', 'wss://*.supabase.co',
      'https://*.workers.dev', 'wss://*.workers.dev', 'ws://127.0.0.1:3939',
    ]) {
      expect(prod, origin).toContain(origin);
    }
  });

  it('locks down objects, the base URL and form targets', () => {
    expect(directive(prod, 'object-src')).toBe("object-src 'none'");
    expect(directive(prod, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(prod, 'form-action')).toBe("form-action 'self'");
  });

  it('never emits frame-ancestors — ignored in a meta tag (SECURITY.md §7)', () => {
    expect(prod).not.toContain('frame-ancestors');
    expect(dev).not.toContain('frame-ancestors');
  });

  it('dev relaxes exactly two things: inline scripts + local websockets', () => {
    const tokens = (directive(dev, 'script-src') || '').split(' ');
    expect(tokens).toContain("'unsafe-inline'");
    expect(tokens).toContain('https://accounts.google.com');
    const connect = directive(dev, 'connect-src') || '';
    expect(connect).toContain('ws://localhost:*');
    expect(connect).toContain('ws://127.0.0.1:*');
    // Production never gains the dev websockets.
    expect(directive(prod, 'connect-src')).not.toContain('ws://localhost');
  });
});
