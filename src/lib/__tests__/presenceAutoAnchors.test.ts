import { describe, it, expect } from 'vitest';
import { autoAnchorKeyFor } from '../presenceAutoAnchors';

/* Auto anchors for authored controls: identity precedence (test id →
   aria-label → title → visible text), whitespace collapse and the length cap.
   The chain skips these keys for the nearest-item snap (direct hit only), so
   a bug here would either break magnets or make dense chrome grab the pointer
   — see src/lib/presenceAnchors.ts. */

const el = (attrs: Record<string, string>, text = '') => ({
  getAttribute: (name: string) => attrs[name] ?? null,
  textContent: text,
});

describe('autoAnchorKeyFor', () => {
  it('prefers test id, then aria-label, then title, then text', () => {
    expect(autoAnchorKeyFor(el({ 'data-testid': 'undo' }, 'Undo'))).toBe('ui:testid:undo');
    expect(autoAnchorKeyFor(el({ 'aria-label': 'Align Left' }, 'Left'))).toBe('ui:label:Align Left');
    expect(autoAnchorKeyFor(el({ title: 'Move up' }, 'Move'))).toBe('ui:title:Move up');
    expect(autoAnchorKeyFor(el({}, '  Save\n  draft '))).toBe('ui:text:Save draft');
  });

  it('is null without any authored identity', () => {
    expect(autoAnchorKeyFor(el({}, '   '))).toBeNull();
    expect(autoAnchorKeyFor(el({}, ''))).toBeNull();
    expect(autoAnchorKeyFor({ getAttribute: () => null })).toBeNull();
  });

  it('caps the identity part', () => {
    expect(autoAnchorKeyFor(el({ 'aria-label': 'x'.repeat(200) }))).toBe(`ui:label:${'x'.repeat(60)}`);
  });
});
