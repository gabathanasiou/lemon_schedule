import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildNonShootSet, computeRowData } from '../daybreakUtils';
import {
  buildReportCtx,
  resolveCollection,
  resolveCollectionItems,
  type ReportCtx,
} from '../reportData';
import { getReportFieldMap } from '../reportFields';
import { contextualCollectionsFor, tableItemCollection } from '../reportBlocks';
import type { ReportBlock } from '../../types';

// Heavy/hostile leaves are stubbed (leaflet map, tiptap editor, canvas grids).
vi.mock('../../components/reports/ReportMapView', () => ({ ReportMapView: () => null }));
vi.mock('../../components/reports/ImageBlockView', () => ({ ImageBlockView: () => null }));
vi.mock('../../components/reports/ReportGridBlock', () => ({ default: () => null }));
vi.mock('../../components/reports/ReportBudgetTable', () => ({ default: () => null }));
vi.mock('../../components/reports/CustomTable', () => ({ default: () => null }));
vi.mock('../../components/reports/ReportBlockTitle', () => ({ default: () => null }));

import { ReportBlockView } from '../../components/reports/ReportBlockView';

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

const ctx = buildCtx(seedProject());
const fieldMap = getReportFieldMap(ctx.project);

const c2Categories = () => resolveCollection(ctx, 'categories', undefined, undefined) as any[];

const render = (block: ReportBlock, extra: Record<string, any> = {}) =>
  renderToStaticMarkup(React.createElement(ReportBlockView, { block, ctx, fieldMap, hint: false, ...extra }));

const countRows = (html: string) => (html.match(/class="rm-row"/g) || []).length;

// ---------------------------------------------------------------------------
// 1. Once-table summary through the renderer: every category element lists,
//    including catalogue entries with no scene (typed-parent membership).
// ---------------------------------------------------------------------------
describe('summary table (onceTable)', () => {
  const project = seedProject(p => {
    p.breakdownElements = p.breakdownElements || {};
    p.breakdownElements.props = [...(p.breakdownElements.props || []), { id: 'el-unused-swarm', name: 'UNUSED CATALOG PROP', boardId: '999' }];
  });
  const c = buildCtx(project);
  const category = c.categoryInfos.find(ci => ci.key === 'props' && ci.elementCount > 0)!;
  const summary: ReportBlock = {
    id: 'once',
    type: 'table',
    collection: 'elementsOfCategory',
    columns: [{ id: 'el', field: 'elementName', width: 100 }],
    showHeader: true,
  };
  const repeat: ReportBlock = {
    id: 'rep',
    type: 'repeat',
    collection: 'elementsOfCategory',
    children: [
      { id: 'name', type: 'field', field: 'elementName' },
      summary,
    ],
  };

  it('lists every category element, including unused catalog entries', () => {
    const html = render(repeat, { ctx: c, item: category, parentCollection: 'categories', ancestors: [category] });
    expect(html.includes('class="rm-once"')).toBe(true);
    expect(html.includes('UNUSED CATALOG PROP')).toBe(true);
  });
});
// ---------------------------------------------------------------------------
// 2. Per-item tables under a parent with no contextual collections ignore an
//    EXPLICIT collection. reportBlocks.ts: "an explicitly set collection ...
//    is always respected"; docs/REPORTS-LEGO-CONTEXT.md §3 "crew → none" is the
//    DEFAULT, not a ban on explicit picks (the menu offers them).
// ---------------------------------------------------------------------------
describe('explicit location table inside a Crew repeat', () => {
  const project = seedProject(p => {
    p.locations = [
      { id: 'loc-1', name: 'STAGE 5', type: 'set' },
      { id: 'loc-2', name: 'UNIT BASE', type: 'unitBase' },
    ];
  });
  const c = buildCtx(project);
  const crew = resolveCollection(c, 'crew', undefined, undefined) as any[];
  const table: ReportBlock = {
    id: 'tbl',
    type: 'table',
    collection: 'locations',
    columns: [{ id: 'ln', field: 'locationName', width: 100 }],
    showHeader: true,
  };

  it('resolves the effective collection to locations (not the crew parent)', () => {
    expect(tableItemCollection(table, 'crew')).toBe('locations');
    expect(contextualCollectionsFor('crew')).toEqual([]);
  });

  it('prints all location rows, not one crew row', () => {
    const html = render(table, {
      ctx: c,
      item: crew[0],
      parentCollection: 'crew',
      ancestors: [crew[0]],
    });
    expect(countRows(html)).toBe(2);
    expect(html.includes('STAGE 5')).toBe(true);
    expect(html.includes('UNIT BASE')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2b. Per-item table Counter (docs/REPORTS-LEGO-CONTEXT.md §6): "Per-item
//     tables ... Counter uses the repeat index, not the row." ReportBlockView
//     computes `perItemIndex` (line 836) but renderTable hardcodes
//     perItemIndex={undefined} (lines 823-824), so the row index (0) wins.
// ---------------------------------------------------------------------------
describe('per-item table counter', () => {
  const crew = resolveCollection(ctx, 'crew', undefined, undefined) as any[];
  const table: ReportBlock = {
    id: 'peritem',
    type: 'table',
    collection: 'crew',
    columns: [{ id: 'c', field: 'counter', width: 100 }],
    showHeader: true,
  };

  it('uses the repeat index for the Counter in a per-item table', () => {
    const html = render(table, {
      item: crew[3],
      parentCollection: 'crew',
      ancestors: [crew[3]],
      aux: { index: 3, pageSize: 'portrait' },
    });
    expect(html.includes('>4<')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2b(ii). Print scope on the same per-item table: filterItemsByScope('crew')
//        compares the row POSITION in the items array. A per-item table passes
//        a ONE-item array, so it always tests index 0 — a top-level crew scope
//        that excludes crew[0] drops the nested table's only row.
// ---------------------------------------------------------------------------
describe('print scope on a per-item crew table', () => {
  const crew = resolveCollection(ctx, 'crew', undefined, undefined) as any[];
  const table: ReportBlock = {
    id: 'scoped',
    type: 'table',
    collection: 'crew',
    columns: [{ id: 'n', field: 'crewName', width: 100 }],
    showHeader: true,
  };

  it('keeps the row when the printed crew index matches the repeat item', () => {
    const html = render(table, {
      item: crew[2],
      parentCollection: 'crew',
      ancestors: [crew[2]],
      aux: { index: 2, pageSize: 'portrait' },
      scopeFilter: { scopes: [{ collection: 'crew', include: [2] }] },
    });
    expect(countRows(html)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2c. Relative (Advance) keeps the parent's post-scope list, index and ancestor
//     chain — normal and fragmented rendering.
// ---------------------------------------------------------------------------
describe('relative/advance context', () => {
  const cats = c2Categories();
  const relative: ReportBlock = {
    id: 'rel',
    type: 'relative',
    relativeOffset: 1,
    relativeCount: 1,
    children: [{ id: 'label', type: 'field', field: 'categoryLabel' }],
  };

  it('advances from the parent list and renders the next category (normal + fragment)', () => {
    const base = { item: cats[1], parentCollection: 'categories', parentItems: cats, itemIndex: 1, ancestors: [cats[1]] } as any;
    const whole = render(relative, base);
    expect(whole.includes(cats[2].label)).toBe(true);
    const fragmented = render(relative, { ...base, itemRange: [0, 1], partChildren: [null] });
    expect(fragmented.includes(cats[2].label)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Ribbon context: docs/REPORTS-LEGO-CONTEXT.md §5 — "inside elements/
//    categories/cast/crew item → nothing". The renderer only special-cases
//    scene/day items and otherwise falls through to the FULL schedule.
// ---------------------------------------------------------------------------
describe('ribbon inside a cast repeat', () => {
  const project = seedProject();
  const c = buildCtx(project);
  const cast = resolveCollection(c, 'cast', undefined, undefined) as any[];

  it('renders nothing for a cast item (not the full schedule)', () => {
    const block: ReportBlock = { id: 'rib', type: 'ribbon' };
    const html = render(block, { item: cast[0], parentCollection: 'cast', ancestors: [cast[0]] });
    expect(html.length).toBe(0);
  });
});
