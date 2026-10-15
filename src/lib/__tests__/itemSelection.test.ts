import { describe, expect, it } from 'vitest';
import { MAX_SELECTION_ITEMS } from '../supabase/presence';
import { itemSelectionOf, outlineRectSignature, type PeerOutlineRect } from '../itemSelection';
import { reportSelectionItems } from '../reportSelectionItems';

describe('DOM-surface peer selection (roadmap 234 stage 2)', () => {
  it('encodes a local item list: blank ids dropped, capped, null when empty', () => {
    expect(itemSelectionOf('schedule', [])).toBeNull();
    expect(itemSelectionOf('schedule', ['', ''])).toBeNull();
    expect(itemSelectionOf('schedule', ['r1', '', 'r2'])).toEqual({ scope: 'schedule', items: ['r1', 'r2'] });
    const many = itemSelectionOf('schedule', Array.from({ length: MAX_SELECTION_ITEMS + 30 }, (_, i) => `r${i}`));
    expect(many!.items.length).toBe(MAX_SELECTION_ITEMS);
    expect(many!.items[0]).toBe('r0');
    expect(many!.items[MAX_SELECTION_ITEMS - 1]).toBe(`r${MAX_SELECTION_ITEMS - 1}`);
  });

  it('signs measured rects stably: order-free, 1px-quantized', () => {
    const rect = (userId: string, item: string, left: number, top: number): PeerOutlineRect => ({ userId, item, left, top, width: 100, height: 20 });
    expect(outlineRectSignature([])).toBe('');
    const a = [rect('u1', 'r1', 10, 20), rect('u2', 'r2', 30, 40)];
    expect(outlineRectSignature(a)).toBe(outlineRectSignature([...a].reverse()));
    // Sub-pixel jitter collapses; a real move re-signs.
    expect(outlineRectSignature([rect('u1', 'r1', 10.4, 20.49)])).toBe(outlineRectSignature([rect('u1', 'r1', 10, 20)]));
    expect(outlineRectSignature([rect('u1', 'r1', 11, 20)])).not.toBe(outlineRectSignature([rect('u1', 'r1', 10, 20)]));
    expect(outlineRectSignature([rect('u2', 'r1', 10, 20)])).not.toBe(outlineRectSignature([rect('u1', 'r1', 10, 20)]));
  });

  it('encodes the Report Designer vocabulary: the block, or the selected column', () => {
    expect(reportSelectionItems(null, null)).toEqual([]);
    expect(reportSelectionItems('b1', null)).toEqual(['b1']);
    // A selected column wins (selecting a column clears the block selection).
    expect(reportSelectionItems('b1', { colsId: 'b1', colIndex: 2 })).toEqual(['col:b1:2']);
    expect(reportSelectionItems(null, { colsId: 'b9', colIndex: 0 })).toEqual(['col:b9:0']);
  });
});
