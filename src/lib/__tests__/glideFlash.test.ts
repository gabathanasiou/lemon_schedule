import { describe, it, expect } from 'vitest';
import {
  GLIDE_FLASH_TTL_MS,
  diffGlideRows,
  glideFlashKey,
  glideFlashStamp,
  markGlideFlash,
  pruneGlideFlash,
  type GlideRowSnapshot,
} from '../glideFlash';

/**
 * Roadmap 364 — the pure half of the Glide change flash: the stamp map (mark /
 * active / prune with the fade TTL) and the visible-row diff that turns a peer
 * action or S3.5 reload into the cells that actually changed. The canvas paint
 * (Glide's `lastUpdated` fade) is a rule-7 manual check.
 */

describe('glideFlash stamp map', () => {
  it('marks cells by stable row + column key', () => {
    const map = new Map<string, number>();
    markGlideFlash(map, [{ rowKey: 'scene-a', colKey: 'set' }], 1000);
    expect(map.get(glideFlashKey('scene-a', 'set'))).toBe(1000);
    expect(map.has(glideFlashKey('scene-b', 'set'))).toBe(false);
  });

  it('reports a stamp while the fade runs and drops it at the TTL', () => {
    const map = new Map<string, number>();
    markGlideFlash(map, [{ rowKey: 'a', colKey: 'cast' }], 1000);
    expect(glideFlashStamp(map, 'a', 'cast', 1000)).toBe(1000);
    expect(glideFlashStamp(map, 'a', 'cast', 1000 + GLIDE_FLASH_TTL_MS - 1)).toBe(1000);
    expect(glideFlashStamp(map, 'a', 'cast', 1000 + GLIDE_FLASH_TTL_MS)).toBeUndefined();
  });

  it('re-marking refreshes the stamp', () => {
    const map = new Map<string, number>();
    markGlideFlash(map, [{ rowKey: 'a', colKey: 'set' }], 1000);
    markGlideFlash(map, [{ rowKey: 'a', colKey: 'set' }], 1200);
    expect(glideFlashStamp(map, 'a', 'set', 1250)).toBe(1200);
  });

  it('prunes only expired stamps and keeps live ones', () => {
    const map = new Map<string, number>();
    markGlideFlash(map, [{ rowKey: 'old', colKey: 'set' }], 1000);
    markGlideFlash(map, [{ rowKey: 'new', colKey: 'set' }], 1600);
    pruneGlideFlash(map, 1600);
    expect(map.has(glideFlashKey('old', 'set'))).toBe(false);
    expect(map.has(glideFlashKey('new', 'set'))).toBe(true);
  });
});

describe('diffGlideRows', () => {
  const before: GlideRowSnapshot[] = [
    { key: 's1', values: { set: 'KITCHEN', cast: '1,2', notes: '' } },
    { key: 's2', values: { set: 'STREET', cast: '3', notes: 'ok' } },
  ];

  it('returns only the cells whose value changed', () => {
    const after: GlideRowSnapshot[] = [
      { key: 's1', values: { set: 'KITCHEN', cast: '1,2,4', notes: '' } },
      { key: 's2', values: { set: 'STREET', cast: '3', notes: 'ok' } },
    ];
    expect(diffGlideRows(before, after, ['set', 'cast', 'notes']))
      .toEqual([{ rowKey: 's1', colKeys: ['cast'] }]);
  });

  it('never flashes unchanged rows or structural add/remove', () => {
    const after: GlideRowSnapshot[] = [
      { key: 's1', values: { set: 'KITCHEN', cast: '1,2', notes: '' } },
      { key: 's3', values: { set: 'NEW', cast: '9', notes: '' } },
    ];
    expect(diffGlideRows(before, after, ['set', 'cast', 'notes'])).toEqual([]);
  });

  it('compares only the requested columns (actions/controls never flash)', () => {
    const after: GlideRowSnapshot[] = [
      { key: 's2', values: { set: 'STREET', cast: '3', notes: 'changed', actions: 'x' } },
    ];
    expect(diffGlideRows(
      [{ key: 's2', values: { set: 'STREET', cast: '3', notes: 'ok', actions: 'y' } }],
      after,
      ['set', 'cast', 'notes'],
    )).toEqual([{ rowKey: 's2', colKeys: ['notes'] }]);
  });

  it('treats a missing value as empty (cells clear + fill symmetrically)', () => {
    expect(diffGlideRows(
      [{ key: 's1', values: { set: 'KITCHEN' } }],
      [{ key: 's1', values: { set: '' } }],
      ['set'],
    )).toEqual([{ rowKey: 's1', colKeys: ['set'] }]);
  });
});
