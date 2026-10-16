import { beforeEach, describe, expect, it, vi } from 'vitest';

// Store wiring for roadmap 274: every report-ingest action must route stored
// markup through the sanitizer (the transform itself is DOM-bound and is
// proven in e2e; here the module is mocked so the WIRING is locked).
const mocks = vi.hoisted(() => ({
  sanitizeReportBlocks: vi.fn((blocks: unknown) => blocks),
  sanitizeReportDesignsHtml: vi.fn((designs: unknown) => designs),
  sanitizeReportTrashHtml: vi.fn((items: unknown) => items),
  sanitizeStoredReportHtml: vi.fn((html: string) => html),
  sanitizeProjectReportHtml: vi.fn((project: unknown) => project),
}));

vi.mock('../reportSanitize', () => mocks);

import { makeBlankProject, reducer } from '../../store/reducer';
import type { State } from '../../store/reducer';

function init(): State {
  const blank = makeBlankProject('Sanitize wiring');
  return reducer({ past: [], present: blank, future: [], _batchDepth: 0 }, { type: 'LOAD', payload: blank });
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockClear();
});

describe('report ingest sanitize wiring', () => {
  it('UPDATE_REPORT_DESIGN routes blocks/header/footer through sanitizeReportBlocks', () => {
    const state = init();
    const design = state.present.reportDesigns![0];
    const blocks = [{ id: 'b', type: 'text', text: '<img src=x onerror=alert(1)>' }] as any;
    const header = [{ id: 'h', type: 'text', text: 'H' }] as any;
    const footer = [{ id: 'f', type: 'text', text: 'F' }] as any;
    const clean = { cleaned: true } as any;
    mocks.sanitizeReportBlocks.mockReturnValue(clean);

    const next = reducer(state, { type: 'UPDATE_REPORT_DESIGN', payload: { id: design.id, blocks, header, footer } });

    expect(mocks.sanitizeReportBlocks).toHaveBeenCalledTimes(3);
    expect(mocks.sanitizeReportBlocks).toHaveBeenCalledWith(blocks);
    expect(mocks.sanitizeReportBlocks).toHaveBeenCalledWith(header);
    expect(mocks.sanitizeReportBlocks).toHaveBeenCalledWith(footer);
    const updated = next.present.reportDesigns!.find(d => d.id === design.id)!;
    expect(updated.blocks).toBe(clean);
    expect(updated.header).toBe(clean);
    expect(updated.footer).toBe(clean);
  });

  it('UPDATE_PROJECT without report fields skips the sanitizer entirely', () => {
    const next = reducer(init(), { type: 'UPDATE_PROJECT', payload: { title: 'Renamed' } });
    expect(next.present.title).toBe('Renamed');
    expect(mocks.sanitizeReportDesignsHtml).not.toHaveBeenCalled();
    expect(mocks.sanitizeReportTrashHtml).not.toHaveBeenCalled();
  });

  it('UPDATE_PROJECT sanitizes report fields carried through the broad spread', () => {
    const designs = [{ id: 'd-new' }] as any;
    const trash = [{ deletedAt: 1, design: { id: 'd-gone' } }] as any;
    const cleanDesigns = [{ cleaned: 'designs' }] as any;
    const cleanTrash = [{ cleaned: 'trash' }] as any;
    mocks.sanitizeReportDesignsHtml.mockReturnValue(cleanDesigns);
    mocks.sanitizeReportTrashHtml.mockReturnValue(cleanTrash);

    const next = reducer(init(), { type: 'UPDATE_PROJECT', payload: { reportDesigns: designs, reportTrash: trash } });

    expect(mocks.sanitizeReportDesignsHtml).toHaveBeenCalledWith(designs);
    expect(mocks.sanitizeReportTrashHtml).toHaveBeenCalledWith(trash);
    expect(next.present.reportDesigns).toBe(cleanDesigns);
    expect(next.present.reportTrash).toBe(cleanTrash);
  });

  it('ADD_REPORT_DESIGN sanitizes provided blocks and cloned source blocks', () => {
    const state = init();
    const source = state.present.reportDesigns![0];
    const clean = [{ cleaned: true }] as any;
    mocks.sanitizeReportBlocks.mockReturnValue(clean);

    const next = reducer(state, { type: 'ADD_REPORT_DESIGN', payload: { name: 'Fresh', blocks: [{ id: 'b', type: 'text' }] as any } });
    const added = next.present.reportDesigns![next.present.reportDesigns!.length - 1];
    expect(added.blocks).toBe(clean);

    mocks.sanitizeReportBlocks.mockClear();
    reducer(state, { type: 'ADD_REPORT_DESIGN', payload: { name: 'Clone', cloneFromId: source.id } });
    expect(mocks.sanitizeReportBlocks).toHaveBeenCalledWith(source.blocks);
  });
});
