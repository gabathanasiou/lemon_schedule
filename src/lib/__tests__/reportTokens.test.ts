import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildNonShootSet, computeRowData } from '../daybreakUtils';
import { buildReportCtx, resolveCollection, ancestorSceneScope, type ReportCtx } from '../reportData';
import { makeReportBlock } from '../reportBlocks';
import {
  composeCellRefKey, composeRelativeCellRefKey, parseCellRefKey,
  composeLookupKey, resolveReportTokens, resolveReportTokensHtml,
  cellRefTarget, cellRefChipMeta, cellRefAttributeItems, cellRefChain,
  getReportFieldMap,
  type CellRefEditorInfo,
} from '../reportFields';

// Free-table cell references (roadmap 190): token parse/compose + resolution
// (mirror / pinned / relative / cycle / errors / pair suppression) and the
// editor chip vocabulary. Built on the committed hermetic seed.

const SEED = fileURLToPath(new URL('../../../e2e/fixtures/seed.lemon', import.meta.url));

function seedProject(mutate?: (p: any) => void): any {
  const project = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  mutate?.(project);
  return project;
}

function buildCtx(project: any): ReportCtx {
  const version = project.versions.find((v: any) => v.id === project.activeVersionId) || project.versions[0];
  const calendar =
    (project.calendarVersions || []).find((c: any) => c.id === project.activeCalendarVersionId) ||
    (project.calendarVersions || [])[0];
  const containerRows = version.rows
    .filter((r: any) => r.containerId != null && r.containerId !== -1)
    .sort((a: any, b: any) => (a.containerId || 0) - (b.containerId || 0) || a.order - b.order);
  const nonShootSet = buildNonShootSet(calendar?.nonShootDates);
  const startDate = calendar?.productionStart || '2026-01-01';
  const firstDaybreak = containerRows.find((r: any) => r.type === 'DAYBREAK');
  const daybreak = computeRowData(containerRows, project.scenes, startDate, nonShootSet, firstDaybreak?.daybreakCallTime);
  return buildReportCtx(project, version, calendar, { sections: daybreak.sections, computedRows: daybreak.computedRows });
}

/** Free table with stable ids r1… × c1… (one column per row cell). */
function table(rows: string[][]) {
  const base = makeReportBlock('table', { custom: true });
  const cols = rows[0]?.length ?? 0;
  return {
    ...base,
    columns: Array.from({ length: cols }, (_, i) => ({ id: `c${i + 1}`, field: '', width: 50 })),
    customRows: rows.map((cells, i) => ({ id: `r${i + 1}`, cells })),
  } as any;
}

const project = seedProject((p) => {
  p.crew = { gaffer: [{ id: 'p-test', name: 'BOB', phone: '555-0134', email: 'bob@example.com' }] };
});
const ctx = buildCtx(project);
const fieldMap = getReportFieldMap(project);
const crewRef = composeLookupKey('crew', 'crewName', 'p-test');

describe('cellref token parse/compose', () => {
  it('round-trips absolute, pinned and relative forms', () => {
    expect(parseCellRefKey('cellref.r1.c2')).toEqual({ kind: 'abs', rowId: 'r1', colId: 'c2', field: undefined });
    expect(parseCellRefKey('cellref.r1.c2.phone')).toEqual({ kind: 'abs', rowId: 'r1', colId: 'c2', field: 'phone' });
    expect(parseCellRefKey('cellref.rel.-1.0')).toEqual({ kind: 'rel', dx: -1, dy: 0, field: undefined });
    expect(parseCellRefKey('cellref.rel.0.-1.phone')).toEqual({ kind: 'rel', dx: 0, dy: -1, field: 'phone' });
    expect(composeCellRefKey('r1', 'c2', 'phone')).toBe('cellref.r1.c2.phone');
    expect(composeRelativeCellRefKey(0, 1)).toBe('cellref.rel.0.1');
    expect(parseCellRefKey('lookup.crew.crewName.x')).toBeNull();
    expect(parseCellRefKey('cellref.rel.x.0')).toBeNull();
    expect(parseCellRefKey('cellref.r1')).toBeNull();
  });
});

describe('cellref resolution', () => {
  it('mirrors the target cell (plain text and a resolved item reference)', () => {
    const block = table([['Hello', `<p>{{${crewRef}}}</p>`], ['', '']]);
    const formula = { block, rowId: 'r2', colId: 'c1' };
    expect(resolveReportTokensHtml(ctx, fieldMap, '<p>{{cellref.r1.c1}}</p>', null, undefined, { cellRef: formula })).toBe('<p>Hello</p>');
    expect(resolveReportTokensHtml(ctx, fieldMap, '<p>{{cellref.r1.c2}}</p>', null, undefined, { cellRef: formula })).toBe('<p>BOB</p>');
  });

  it('pins an attribute of the target item (and follows a target item change)', () => {
    const block = table([['', `<p>{{${crewRef}}}</p>`], ['', '']]);
    const formula = { block, rowId: 'r2', colId: 'c1' };
    const html = resolveReportTokensHtml(ctx, fieldMap, '<p>{{cellref.r1.c2.phone}}</p>', null, undefined, { cellRef: formula });
    expect(html).toContain('555-0134');
    // phone is a link field — the pinned value keeps the tel anchor.
    expect(html).toContain('tel:555-0134');

    const other = seedProject((p) => {
      p.crew = { gaffer: [
        { id: 'p-test', name: 'BOB', phone: '555-0134', email: 'bob@example.com' },
        { id: 'p-2', name: 'MARY', phone: '555-0199', email: 'mary@example.com' },
      ] };
    });
    const otherCtx = buildCtx(other);
    const otherBlock = table([['', `<p>{{${composeLookupKey('crew', 'crewName', 'p-2')}}}</p>`], ['', '']]);
    const text = resolveReportTokens(otherCtx, getReportFieldMap(other), '{{cellref.r1.c2.phone}}', null, undefined, { cellRef: { block: otherBlock, rowId: 'r2', colId: 'c1' } });
    expect(text).toBe('555-0199');
  });

  it('pins through a nested ref (target cell mirrors another cell)', () => {
    const block = table([['', `<p>{{${crewRef}}}</p>`], [`<p>{{cellref.r1.c2}}</p>`, '']]);
    const formula = { block, rowId: 'r2', colId: 'c2' };
    expect(resolveReportTokens(ctx, fieldMap, '{{cellref.r2.c1.phone}}', null, undefined, { cellRef: formula })).toBe('555-0134');
  });

  it('pins through a labelled target cell ("Director: @Bob") and its mirror (roadmap 210)', () => {
    const block = table([
      [`<p>Director: {{${crewRef}}}</p>`, `<p>{{cellref.r1.c1}}</p>`],
      ['', ''],
    ]);
    const formula = { block, rowId: 'r2', colId: 'c2' };
    expect(resolveReportTokens(ctx, fieldMap, '{{cellref.r1.c1.phone}}', null, undefined, { cellRef: formula })).toBe('555-0134');
    expect(resolveReportTokens(ctx, fieldMap, '{{cellref.r1.c2.email}}', null, undefined, { cellRef: formula })).toBe('bob@example.com');
  });

  it('chains pinned refs (@Bob | LEFT.phone | LEFT.email)', () => {
    const block = table([
      [`<p>{{${crewRef}}}</p>`, `<p>{{${composeRelativeCellRefKey(-1, 0, 'phone')}}}</p>`, `<p>{{${composeRelativeCellRefKey(-1, 0, 'email')}}}</p>`],
      ['', '', ''],
    ]);
    const phoneHtml = resolveReportTokensHtml(ctx, fieldMap, block.customRows[0].cells[1], null, undefined, { cellRef: { block, rowId: 'r1', colId: 'c2' } });
    expect(phoneHtml).toContain('555-0134');
    const emailHtml = resolveReportTokensHtml(ctx, fieldMap, block.customRows[0].cells[2], null, undefined, { cellRef: { block, rowId: 'r1', colId: 'c3' } });
    expect(emailHtml).toContain('bob@example.com');
  });

  it('tracks the hover chain back to the origin', () => {
    const block = table([
      [`<p>{{${crewRef}}}</p>`, `<p>{{${composeRelativeCellRefKey(-1, 0, 'phone')}}}</p>`, `<p>{{${composeRelativeCellRefKey(-1, 0, 'email')}}}</p>`],
      ['', '', ''],
    ]);
    const chain = cellRefChain(block, { rowId: 'r1', colId: 'c3' }, parseCellRefKey(composeRelativeCellRefKey(-1, 0, 'email'))!);
    expect(chain.map(t => `${t.rowId}:${t.colId}`)).toEqual(['r1:c2', 'r1:c1']);
  });

  it('suppresses a same-target ref+pinned pair (the 121 chip convention)', () => {
    const block = table([['', `<p>{{${crewRef}}}</p>`], ['', `<p>{{cellref.r1.c2}}{{cellref.r1.c2.phone}}</p>`]]);
    const formula = { block, rowId: 'r2', colId: 'c2' };
    const html = resolveReportTokensHtml(ctx, fieldMap, block.customRows[1].cells[1], null, undefined, { cellRef: formula });
    expect(html).toContain('555-0134');
    expect(html).not.toContain('BOB');
  });

  it('errors: missing target, cycle, bad pin, unknown field', () => {
    const block = table([['Plain text', `<p>{{cellref.r2.c1}}</p>`], [`<p>{{cellref.r1.c2}}</p>`, `<p>{{${crewRef}}}</p>`]]);
    const formula = { block, rowId: 'r2', colId: 'c1' };
    expect(resolveReportTokensHtml(ctx, fieldMap, '{{cellref.nope.c1}}', null, undefined, { cellRef: formula })).toContain('#REF!');
    expect(resolveReportTokensHtml(ctx, fieldMap, '{{cellref.r2.c1}}', null, undefined, { cellRef: formula })).toContain('#REF!');
    expect(resolveReportTokensHtml(ctx, fieldMap, '{{cellref.r1.c1.phone}}', null, undefined, { cellRef: formula })).toContain('#VALUE!');
    expect(resolveReportTokensHtml(ctx, fieldMap, '{{cellref.r2.c2.nope}}', null, undefined, { cellRef: formula })).toContain('#VALUE!');
    expect(resolveReportTokensHtml(ctx, fieldMap, '{{cellref.nope.c1}}', null, undefined, { cellRef: formula })).toContain('report-cell-error');
  });

  it('empty target is empty; dangling item refs are #REF!', () => {
    const block = table([['', `<p>{{lookup.crew.crewName.gone}}</p>`], ['', '']]);
    const formula = { block, rowId: 'r2', colId: 'c1' };
    expect(resolveReportTokens(ctx, fieldMap, '{{cellref.r1.c1}}', null, undefined, { cellRef: formula })).toBe('');
    expect(resolveReportTokens(ctx, fieldMap, '{{cellref.r1.c1.phone}}', null, undefined, { cellRef: formula })).toBe('');
    expect(resolveReportTokens(ctx, fieldMap, '{{cellref.r1.c2}}', null, undefined, { cellRef: formula })).toContain('#REF!');
    expect(resolveReportTokens(ctx, fieldMap, '{{cellref.r1.c2.phone}}', null, undefined, { cellRef: formula })).toBe('#REF!');
  });

  it('resolves cellrefs only inside a table context', () => {
    expect(resolveReportTokens(ctx, fieldMap, '{{cellref.r1.c1}}', null)).toBe('#REF!');
  });
});

describe('cellref relative offsets', () => {
  it('resolves all four directions from the formula cell', () => {
    const block = table([['NW', 'NE'], ['SW', 'SE']]);
    const formula = { block, rowId: 'r2', colId: 'c2' };
    const get = (raw: string) => resolveReportTokens(ctx, fieldMap, raw, null, undefined, { cellRef: formula });
    expect(get('{{cellref.rel.-1.0}}')).toBe('SW');
    expect(get('{{cellref.rel.0.-1}}')).toBe('NE');
    expect(get('{{cellref.rel.1.0}}')).toContain('#REF!');
    expect(get('{{cellref.rel.0.1}}')).toContain('#REF!');
    expect(get('{{cellref.rel.0.-2}}')).toContain('#REF!');
  });

  it('follows the neighbour when a row is inserted between the cells', () => {
    const before = table([['A', ''], ['', '']]);
    const formula = { block: before, rowId: 'r2', colId: 'c1' };
    expect(resolveReportTokens(ctx, fieldMap, '{{cellref.rel.0.-1}}', null, undefined, { cellRef: formula })).toBe('A');
    const after = {
      ...table([['', ''], ['', ''], ['', '']]),
      customRows: [
        { id: 'n0', cells: ['NEW', ''] },
        { id: 'r1', cells: ['A', ''] },
        { id: 'r2', cells: ['', ''] },
      ],
    };
    expect(resolveReportTokens(ctx, fieldMap, '{{cellref.rel.0.-1}}', null, undefined, { cellRef: { block: after, rowId: 'r2', colId: 'c1' } })).toBe('A');
  });

  it('pins on a relative ref', () => {
    const block = table([['', `<p>{{${crewRef}}}</p>`], ['', '']]);
    const formula = { block, rowId: 'r2', colId: 'c2' };
    const html = resolveReportTokensHtml(ctx, fieldMap, '{{cellref.rel.0.-1}}{{cellref.rel.0.-1.phone}}', null, undefined, { cellRef: formula });
    expect(html).toContain('555-0134');
    expect(html).not.toContain('BOB');
  });

  it('maps merged targets to their anchor', () => {
    const block = table([['MERGED', ''], ['', '']]);
    block.cellMerges = [{ rowId: 'r1', colId: 'c1', colSpan: 2, rowSpan: 1 }];
    block.customRows[0].cells = ['MERGED', ''];
    const target = cellRefTarget({ block, rowId: 'r2', colId: 'c1' }, { kind: 'abs', rowId: 'r1', colId: 'c2' });
    expect(target?.colId).toBe('c1');
    expect(target?.html).toBe('MERGED');
  });
});

describe('cellref pins resolve through the containing scope (roadmap 195)', () => {
  const propsRef = composeLookupKey('categories', 'categoryLabel', 'props');
  const block = table([['', `<p>{{${propsRef}}}</p>`], ['', '']]);
  const formula = { block, rowId: 'r2', colId: 'c1' };
  const days = resolveCollection(ctx, 'days', undefined, undefined) as any[];
  const day = days[0];
  const sceneScope = ancestorSceneScope(ctx, [day])!;

  it('a pinned category Element List prints the day union inside a days context', () => {
    const scoped = resolveReportTokens(ctx, fieldMap, '{{cellref.r1.c2.categoryItems}}', day, { sceneScope }, { cellRef: formula });
    const union = resolveReportTokens(ctx, fieldMap, '{{props}}', day, { sceneScope });
    expect(union).not.toBe('');
    expect(scoped).toBe(union);
  });

  it('the same pin outside any repeater stays project-wide', () => {
    const projectWide = resolveReportTokens(ctx, fieldMap, '{{cellref.r1.c2.categoryItems}}', null, undefined, { cellRef: formula });
    expect(projectWide).toBe((ctx.categoryInfos.find(c => c.key === 'props') as any).items.join(', '));
  });
});

describe('cellref editor vocabulary', () => {
  const block = table([['', `<p>{{${crewRef}}}</p>`], ['', '']]);
  const info: CellRefEditorInfo = { block, rowId: 'r2', colId: 'c1', ctx, fieldMap };

  it('labels chips with the referenced cell address (mirror) and the attribute only (pinned)', () => {
    expect(cellRefChipMeta(info, 'cellref.r1.c2')?.label).toBe('R1C2');
    expect(cellRefChipMeta(info, 'cellref.r1.c2.phone')).toMatchObject({ label: 'Phone', nested: true });
    expect(cellRefChipMeta(info, 'cellref.nope.c1')).toMatchObject({ label: '#REF!', error: true });
    expect(cellRefChipMeta(info, 'cellref.r1.c1')?.label).toBe('R1C1');
  });

  it('labels relative chips by direction', () => {
    const relInfo: CellRefEditorInfo = { block, rowId: 'r2', colId: 'c2', ctx, fieldMap };
    expect(cellRefChipMeta(relInfo, 'cellref.rel.-1.0')?.label).toBe('LEFT');
    expect(cellRefChipMeta(relInfo, 'cellref.rel.0.-1.phone')).toMatchObject({ label: 'Phone', nested: true });
  });

  it('offers the target item attributes as pinned refs', () => {
    const items = cellRefAttributeItems(info, 'cellref.r1.c2', 'ph', []);
    expect(items).toEqual([]);
    const allFields = getReportFieldMap(project);
    const fields = Object.values(allFields);
    const items2 = cellRefAttributeItems(info, 'cellref.r1.c2', '', fields);
    const phone = items2.find(i => i.key === 'cellref.r1.c2.phone');
    expect(phone?.label).toBe('Phone');
    expect(items2.find(i => i.key === composeCellRefKey('r1', 'c2', 'crewName'))).toBeUndefined();
    expect(cellRefAttributeItems(info, 'cellref.r1.c2.phone', '', fields)).toEqual([]);
  });

  it('offers attributes when the target wraps the reference in a label (roadmap 210)', () => {
    const labelled = table([['', `<p>Director: {{${crewRef}}}</p>`], ['', '']]);
    const info2: CellRefEditorInfo = { block: labelled, rowId: 'r2', colId: 'c1', ctx, fieldMap };
    const fields = Object.values(getReportFieldMap(project));
    const items = cellRefAttributeItems(info2, 'cellref.r1.c2', '', fields);
    expect(items.find(i => i.key === 'cellref.r1.c2.phone')?.label).toBe('Phone');
  });
});

// Designer-only unresolved tags (showUnresolved): empty tokens read as chips,
// never blank spots; references render the error pair chip with a hover title.
describe('designer unresolved tags (showUnresolved)', () => {
  const tagProject = seedProject((p: any) => {
    p.crew = { gaffer: [{ id: 'p-empty', name: 'NOBODY', phone: '', email: '' }] };
  });
  const tagCtx = buildCtx(tagProject);
  const tagMap = getReportFieldMap(tagProject);
  const emptyRef = composeLookupKey('crew', 'crewName', 'p-empty');

  it('plain empty field renders a labeled chip, not the raw {{token}}', () => {
    const html = resolveReportTokensHtml(tagCtx, tagMap, '<p>{{set}}</p>', null, undefined, { showUnresolved: true });
    expect(html).toContain('>Set</span>');
    expect(html).not.toContain('{{set}}');
    // preview/print (no showUnresolved) stay blank
    expect(resolveReportTokensHtml(tagCtx, tagMap, '<p>{{set}}</p>', null)).toBe('<p></p>');
  });

  it('empty lookup renders the error pair chip (item + attribute label)', () => {
    const key = composeLookupKey('crew', 'phone', 'p-empty');
    const html = resolveReportTokensHtml(tagCtx, tagMap, `<p>{{${key}}}</p>`, null, undefined, { showUnresolved: true });
    expect(html).toContain('✕ NOBODY');
    expect(html).toContain('Phone');
    expect(html).toContain('background:#b91c1c');
    expect(html).toContain('data-ui-tooltip="No items"');
  });

  it('empty cellref pair renders ONE error chip (ref + attribute label)', () => {
    const block = table([['', `<p>{{${emptyRef}}}</p>`], ['', '']]);
    const html = resolveReportTokensHtml(
      tagCtx, tagMap, '<p>{{cellref.r1.c2}}{{cellref.r1.c2.phone}}</p>', null, undefined,
      { showUnresolved: true, cellRef: { block, rowId: 'r2', colId: 'c2' } },
    );
    expect(html).toContain('✕ R1C2');
    expect(html).toContain('Phone');
    expect(html.match(/✕/g)).toHaveLength(1);
  });
});
