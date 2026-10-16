import { describe, it, expect, vi } from 'vitest';

// The report-ingest actions route stored markup through the (DOM-bound)
// sanitizer; mock it like reportSanitizeStore.test.ts does so the trash
// lifecycle runs in plain Node (roadmap 275).
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
import { pruneReportTrash, VERSION_TRASH_TTL_MS } from '../../store/storage';
import type { ReportDesign } from '../../types';

function init(): State {
  const blank = makeBlankProject('Report Trash Test');
  return reducer({ past: [], present: blank, future: [], _batchDepth: 0 }, { type: 'LOAD', payload: blank });
}

const design = (id: string): ReportDesign => ({
  id, name: `Design ${id}`, createdAt: 0, page: 'portrait', blocks: [], header: [], footer: [],
});

describe('report design trash lifecycle (roadmap 275)', () => {
  it('delete moves the design to reportTrash; restore brings it back', () => {
    let s = init();
    s = reducer(s, { type: 'ADD_REPORT_DESIGN', payload: { id: 'd2', name: 'Two' } });

    s = reducer(s, { type: 'DELETE_REPORT_DESIGN', payload: 'd2' });
    expect(s.present.reportDesigns?.some(d => d.id === 'd2')).toBe(false);
    expect(s.present.reportTrash?.find(t => t.design.id === 'd2')?.design.name).toBe('Two');

    s = reducer(s, { type: 'RESTORE_REPORT_FROM_TRASH', payload: 'd2' });
    expect(s.present.reportDesigns?.some(d => d.id === 'd2')).toBe(true);
    expect(s.present.reportTrash?.some(t => t.design.id === 'd2')).toBe(false);
  });

  it('DELETE_REPORT_DESIGN refuses to delete the last design', () => {
    let s = init();
    for (const id of s.present.reportDesigns!.slice(1).map(d => d.id)) {
      s = reducer(s, { type: 'DELETE_REPORT_DESIGN', payload: id });
    }
    expect(s.present.reportDesigns).toHaveLength(1);
    const lastId = s.present.reportDesigns![0].id;
    expect(reducer(s, { type: 'DELETE_REPORT_DESIGN', payload: lastId })).toBe(s);
  });

  it('EMPTY_TRASH clears reportTrash', () => {
    let s = init();
    s = reducer(s, { type: 'ADD_REPORT_DESIGN', payload: { id: 'd2', name: 'Two' } });
    s = reducer(s, { type: 'DELETE_REPORT_DESIGN', payload: 'd2' });
    expect(s.present.reportTrash).toHaveLength(1);

    s = reducer(s, { type: 'EMPTY_TRASH' });
    expect(s.present.reportTrash).toEqual([]);
  });
});

describe('pruneReportTrash (roadmap 275)', () => {
  it('keeps fresh entries and drops those past the 30-day TTL', () => {
    const now = Date.now();
    const fresh = { design: design('fresh'), deletedAt: now - 1000 };
    const stale = { design: design('stale'), deletedAt: now - VERSION_TRASH_TTL_MS - 1 };
    expect(pruneReportTrash([stale, fresh]).map(t => t.design.id)).toEqual(['fresh']);
  });

  it('is safe on empty and missing lists', () => {
    expect(pruneReportTrash([])).toEqual([]);
    expect(pruneReportTrash(undefined as unknown as [])).toEqual([]);
  });
});
