import { describe, expect, it } from 'vitest';
import { makeBlankProject, reducer } from '../../store/reducer';
import { sanitizeReportBlocks, sanitizeStoredReportHtml } from '../reportSanitize';

// The S4 room worker folds the SAME reducer in a Cloudflare Worker — no
// `document`. The kit sanitizer is DOM-bound, so the ingest seam must pass
// markup through there instead of throwing: a throw made the room reject every
// report edit on a design holding formatted text, and the client's heal
// re-sync put the deleted block back. Node vitest is the same no-DOM host, so
// this suite (deliberately NOT mocking `reportSanitize` / `richText`) locks the
// exact regression.
describe('report sanitize without a DOM (room worker host)', () => {
  it('passes stored markup through and still clones the blocks', () => {
    expect(typeof document).toBe('undefined');

    expect(sanitizeStoredReportHtml('PLAIN TEXT')).toBe('PLAIN TEXT');
    expect(sanitizeStoredReportHtml('<b>BOLD</b>')).toBe('<b>BOLD</b>');

    const blocks: any = [
      { id: 'b1', type: 'text', text: '<i>italic</i>' },
      { id: 'b2', type: 'text', text: '{{title}}' },
    ];
    const out = sanitizeReportBlocks(blocks);
    expect(out).toEqual(blocks);
    expect(out).not.toBe(blocks);
    expect(out[0]).not.toBe(blocks[0]);
  });

  it('applies a report block delete while another block holds markup', () => {
    const blank = makeBlankProject('Room repro');
    blank.reportDesigns = [{
      id: 'd1',
      name: 'Repro',
      createdAt: 0,
      page: 'portrait',
      blocks: [
        { id: 'keep', type: 'text', text: '<b>kept</b>' },
        { id: 'gone', type: 'text', text: 'remove me' },
      ],
    }];
    const state = reducer(
      { past: [], present: blank, future: [], _batchDepth: 0 },
      { type: 'LOAD', payload: blank },
    );

    const next = reducer(state, {
      type: 'UPDATE_REPORT_DESIGN',
      payload: { id: 'd1', blocks: [{ id: 'keep', type: 'text', text: '<b>kept</b>' }] },
    });

    expect(next.present.reportDesigns![0].blocks!.map(b => b.id)).toEqual(['keep']);
  });
});
