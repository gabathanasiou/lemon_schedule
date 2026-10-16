import { beforeEach, describe, expect, it, vi } from 'vitest';

// The kit sanitizer parses through the DOM — unavailable in the node vitest
// env. This suite locks the WALKER (which fields get sanitized, cloning,
// memoization) with the kit call mocked; the real transform is exercised in
// e2e (report-xmlns.spec.ts), where a browser actually exists.
const sanitizeSpy = vi.hoisted(() => vi.fn((html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, '')));

vi.mock('../richText', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../richText')>();
  return { ...actual, sanitizeRichText: sanitizeSpy };
});

import {
  sanitizeProjectReportHtml,
  sanitizeReportBlocks,
  sanitizeReportDesignsHtml,
  sanitizeReportTrashHtml,
  sanitizeStoredReportHtml,
} from '../reportSanitize';

const hostile = (marker: string) => `${marker}<script>evil()</script>`;

beforeEach(() => {
  sanitizeSpy.mockClear();
});

describe('sanitizeStoredReportHtml', () => {
  it('passes plain strings through without touching the DOM sanitizer', () => {
    expect(sanitizeStoredReportHtml('Props: {{props}}')).toBe('Props: {{props}}');
    expect(sanitizeSpy).not.toHaveBeenCalled();
  });

  it('sanitizes markup and memoizes by stored string', () => {
    const raw = hostile('memo');
    const out = sanitizeStoredReportHtml(raw);
    expect(out).toBe('memo');
    expect(sanitizeStoredReportHtml(raw)).toBe(out);
    expect(sanitizeSpy).toHaveBeenCalledTimes(1);
    expect(sanitizeSpy).toHaveBeenCalledWith(raw);
  });
});

describe('sanitizeReportBlocks', () => {
  it('sanitizes every stored-HTML field and clones (input untouched)', () => {
    const block: any = {
      id: 'b1',
      type: 'text',
      text: hostile('top'),
      url: 'https://example.com/{{x}}',
      titleBlock: { id: 't1', type: 'text', text: hostile('title') },
      children: [{ id: 'c1', type: 'text', text: hostile('child') }],
      cols: [{ id: 'col1', width: 100, blocks: [{ id: 'cb1', type: 'text', text: hostile('col') }] }],
      customRows: [{ id: 'r1', cells: [hostile('cell'), 'plain'] }],
    };
    const [out] = sanitizeReportBlocks([block]);
    expect(out.text).toBe('top');
    expect(out.titleBlock!.text).toBe('title');
    expect(out.children![0].text).toBe('child');
    expect(out.cols![0].blocks[0].text).toBe('col');
    expect(out.customRows![0].cells).toEqual(['cell', 'plain']);
    // Link targets are scheme-guarded at render, not here.
    expect(out.url).toBe('https://example.com/{{x}}');
    expect(out).not.toBe(block);
    expect(block.text).toBe(hostile('top'));
  });
});

describe('design / trash / project seams', () => {
  const textBlock = (id: string, marker: string) => ({ id, type: 'text', text: hostile(marker) } as any);
  const design = (id: string) => ({
    id,
    name: id,
    createdAt: 0,
    page: 'portrait' as const,
    blocks: [textBlock(`${id}-b`, 'block')],
    header: [textBlock(`${id}-h`, 'header')],
    footer: [textBlock(`${id}-f`, 'footer')],
  });

  it('sanitizes designs (blocks + header + footer) as fresh objects', () => {
    const source = design('d1');
    const [out] = sanitizeReportDesignsHtml([source]);
    expect(out.blocks[0].text).toBe('block');
    expect(out.header![0].text).toBe('header');
    expect(out.footer![0].text).toBe('footer');
    expect(out).not.toBe(source);
    expect(source.blocks[0].text).toBe(hostile('block'));
  });

  it('sanitizes trash items through their design', () => {
    const source = { design: design('d2'), deletedAt: 1 };
    const [out] = sanitizeReportTrashHtml([source]);
    expect(out.design.blocks[0].text).toBe('block');
    expect(out.design.header![0].text).toBe('header');
    expect(out.deletedAt).toBe(1);
    expect(source.design.blocks[0].text).toBe(hostile('block'));
  });

  it('project seam is identity without report data, fresh otherwise', () => {
    const plain: any = { title: 'No reports', scenes: [] };
    expect(sanitizeProjectReportHtml(plain)).toBe(plain);

    const withDesigns: any = { title: 'X', reportDesigns: [design('d3')], scenes: [] };
    const out = sanitizeProjectReportHtml(withDesigns);
    expect(out).not.toBe(withDesigns);
    expect(out.reportDesigns![0].blocks[0].text).toBe('block');
    expect(out.title).toBe('X');

    const trashOnly: any = { title: 'Y', reportTrash: [{ design: design('d4'), deletedAt: 2 }] };
    const out2 = sanitizeProjectReportHtml(trashOnly);
    expect(out2).not.toBe(trashOnly);
    expect(out2.reportTrash![0].design.blocks[0].text).toBe('block');
  });
});
