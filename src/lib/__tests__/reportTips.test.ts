import { describe, it, expect } from 'vitest';
import { makeReportBlock } from '../reportBlocks';
import { hasCalculatedContent } from '../reportTips';

// Roadmap 203: the designer-only ★ marks CALCULATED content — cell references
// and `@` item lookups. Plain field tokens are data, never a calculation.

function textBlock(text: string): any {
  return makeReportBlock('text', { text });
}

function freeTable(cells: string[], labels: string[] = []): any {
  return makeReportBlock('table', {
    custom: true,
    columns: labels.length
      ? labels.map(label => ({ id: `c${label}`, label, field: '', width: 50 }))
      : [{ id: 'c0', label: '', field: '', width: 50 }],
    customRows: cells.map((html, i) => ({ id: `r${i}`, cells: [html] })),
  });
}

describe('hasCalculatedContent', () => {
  it('ignores plain field tokens', () => {
    expect(hasCalculatedContent(textBlock('<p>Cast: {{cast}}</p>'))).toBe(false);
    expect(hasCalculatedContent(textBlock('<p>{{title|— | items}}</p>'))).toBe(false);
    expect(hasCalculatedContent(freeTable(['{{wardrobe}}']))).toBe(false);
  });

  it('stars text blocks with cell references or item lookups', () => {
    expect(hasCalculatedContent(textBlock('<p>{{cellref.r1.c2}}</p>'))).toBe(true);
    expect(hasCalculatedContent(textBlock('<p>{{cellref.rel.-1.0.phone}}</p>'))).toBe(true);
    expect(hasCalculatedContent(textBlock('<p>{{lookup.crew.crewName.p1}}</p>'))).toBe(true);
    // affixed tokens are parsed down to their key first
    expect(hasCalculatedContent(textBlock('<p>{{cellref.r1.c2| + | /day}}</p>'))).toBe(true);
  });

  it('stars free tables on cell references in cells or headers', () => {
    expect(hasCalculatedContent(freeTable(['Total: {{cellref.r1.c2}}']))).toBe(true);
    expect(hasCalculatedContent(freeTable(['plain'], ['{{cellref.rel.0.1}}']))).toBe(true);
    // lookups alone do not star a free table
    expect(hasCalculatedContent(freeTable(['{{lookup.locations.locationName.hq}}']))).toBe(false);
  });

  it('never stars other block types', () => {
    expect(hasCalculatedContent(makeReportBlock('table'))).toBe(false);
    expect(hasCalculatedContent(makeReportBlock('field', { field: 'title' }))).toBe(false);
    expect(hasCalculatedContent(makeReportBlock('repeat', { collection: 'scenes' }))).toBe(false);
  });
});
