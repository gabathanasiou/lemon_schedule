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
  ancestorSceneScope,
  type ReportCtx,
} from '../reportData';
import { getReportFieldMap, reportFieldValueByKey } from '../reportFields';
import type { ReportBlock } from '../../types';

// Regression coverage for Lego element lists / typed-parent membership: empty
// scopes, table-row scoping through the renderer, custom category parsing,
// malformed entities, case-variant cast values, duplicate custom keys, and
// categories without a label.

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

const cats = (ctx: ReportCtx) => resolveCollectionItems(ctx, 'categories', undefined, undefined, undefined) as any[];
const catByKey = (ctx: ReportCtx, key: string) => cats(ctx).find(c => c.key === key);
/** The id of the first scene actually on the stripboard (project.scenes order != board order). */
function firstBoardSceneId(project: any): string {
  return buildCtx(project).sceneInfos[0].scene.id;
}

describe('an empty ancestor scene scope renders no elements (not the catalog)', () => {
  // reportFields.ts:167-168: `if (!scope || scope.size === 0) return it.items.join(', ')`.
  // docs/REPORTS-LEGO-CONTEXT.md §2: "top level = the full catalog; inside a
  // scene/day chain = only that scene's/day's elements." An empty day is still
  // a day chain (zero elements), not "no scope".
  // Reachability: the categories block must opt out of Lego scoping
  // (`scopedToParent: false`) for its rows to exist on an empty day; the field's
  // outer scope is still the empty day. `elementsOfCategory` correctly returns [].
  it('returns "" for an empty production day, not the full catalog', () => {
    const project = seedProject((p: any) => {
      const v = p.versions.find((x: any) => x.id === p.activeVersionId) || p.versions[0];
      const maxOrder = Math.max(0, ...v.rows.map((r: any) => r.order));
      // Back-to-back daybreaks create an empty production day between them.
      v.rows.push({ id: 'row-db-a', type: 'DAYBREAK', containerId: 1, order: maxOrder + 1, daybreakCallTime: '08:00' });
      v.rows.push({ id: 'row-db-b', type: 'DAYBREAK', containerId: 1, order: maxOrder + 2, daybreakCallTime: '08:00' });
    });
    const ctx = buildCtx(project);
    const fieldMap = getReportFieldMap(project);
    const emptyDay = (resolveCollection(ctx, 'days', undefined, undefined) as any[])
      .find(d => resolveCollection(ctx, 'scenesOfDay', undefined, d).length === 0)!;
    expect(emptyDay).toBeTruthy();
    const scope = ancestorSceneScope(ctx, [emptyDay])!;
    expect(scope.size).toBe(0);
    // Same context through the element collection is (correctly) empty:
    const props = catByKey(ctx, 'props');
    const rows = resolveCollectionItems(ctx, 'elementsOfCategory', undefined, props, undefined, { collection: 'elementsOfCategory' } as any, [props, emptyDay]) as any[];
    expect(rows).toHaveLength(0);
    // The Element List must agree — actual: every prop in the project.
    expect(reportFieldValueByKey(ctx, fieldMap, 'categoryItems', props, { outerSceneScope: scope })).toBe('');
  });
});

describe('a categories table inside a Scenes repeat scopes each row to the scene', () => {
  // ReportBlockView.tsx:176: `ancestorSceneScope(ctx, ancestors?.filter(a => a !== item))`.
  // For a TABLE, `item` is the parent repeat's item (the scene), not the row, so
  // filtering it out drops the only ancestor → outerSceneScope null → full list.
  // docs/REPORTS-LEGO-CONTEXT.md §2: "inside a scene/day chain = only that
  // scene's/day's elements". The table row's Element List must be the scene's props.
  it("lists only the enclosing scene's props in the row's Element List", () => {
    const project = seedProject();
    const ctx = buildCtx(project);
    const fieldMap = getReportFieldMap(project);
    const scene = ctx.sceneInfos.find(si => ctx.sceneFieldItems(si.scene, 'props').length === 1)!;
    const sceneProps = ctx.sceneFieldItems(scene.scene, 'props');
    expect(sceneProps).toHaveLength(1);
    const table: ReportBlock = {
      id: 'cats', type: 'table', collection: 'categories', showHeader: true,
      columns: [{ id: 'items', field: 'categoryItems', width: 100 }],
    };
    const html = renderToStaticMarkup(React.createElement(ReportBlockView, {
      block: table, ctx, fieldMap, hint: false, item: scene, parentCollection: 'scenes', ancestors: [scene],
    }));
    // 'Wheelchair' is a props-catalog entry that is NOT in this scene.
    expect(sceneProps).not.toContain('Wheelchair');
    expect(html).not.toContain('Wheelchair');
  });
});

describe('custom single-value categories keep one element (no comma split)', () => {
  // categories.ts:34-37 `getFieldItems` (and reducer.ts:707 `getElementsFromScenes`)
  // call `isMultiValue(field)` WITHOUT the project's custom defs, so a custom
  // single-value category is split on commas. AGENTS.md: use
  // `isMultiValue(field, customCategories)`; the registry says false → one value.
  it('keeps one element for "Stage 5, Backlot"', () => {
    const baseline = seedProject();
    const sceneId = firstBoardSceneId(baseline);
    const project = seedProject((p: any) => {
      p.customCategories = [...(p.customCategories || []), { key: '_cat_single', label: 'Location Single', icon: 'Tag', multiValue: false }];
      p.breakdownElements._cat_single = [{ id: 'stage 5, backlot', name: 'Stage 5, Backlot' }];
      p.scenes.find((s: any) => s.id === sceneId)._cat_single = 'Stage 5, Backlot';
    });
    const ctx = buildCtx(project);
    const fieldMap = getReportFieldMap(project);
    const cat = catByKey(ctx, '_cat_single');
    // Regression: elementCount 3, items ["Stage 5, Backlot", "Backlot", "Stage 5"].
    expect(cat.elementCount).toBe(1);
    expect(cat.items).toEqual(['Stage 5, Backlot']);
    const scene = ctx.sceneInfos.find(si => si.scene.id === sceneId)!;
    // Regression: "Backlot, Stage 5" — two phantom elements, not the stored name.
    expect(reportFieldValueByKey(ctx, fieldMap, 'categoryItems', cat, { outerSceneScope: ancestorSceneScope(ctx, [scene]) }))
      .toBe('Stage 5, Backlot');
  });
});

describe('malformed elements/cast members never crash buildReportCtx', () => {
  // elements.ts:38 (`m.name.toUpperCase()`) and :42 (`e.name.toLowerCase()`).
  // docs/REPORTS-LEGO-CONTEXT.md §8: a saved design always renders (values
  // resolve safely); one malformed element must not take down every report surface.
  it('does not throw for a cast member with only an id', () => {
    const project = seedProject((p: any) => { p.castMembers.push({ id: '77' }); });
    expect(() => buildCtx(project)).not.toThrow();
  });
});

describe('case-variant cast values collapse to one scoped list entry', () => {
  // elements.ts:33-39 merges cast by EXACT id, while matching everywhere
  // (reportFields.ts:172 / resolveCollectionItems) is case-insensitive. Two
  // name-typed IDs ('mary'/'MARY', roadmap 228) both match either scene.
  // Expectation (docs §2): the scoped Element List holds only the members
  // attached to that scene.
  it('lists only the scene\'s own cast entry', () => {
    const baseline = seedProject();
    const [sceneA, sceneB] = buildCtx(baseline).sceneInfos.slice(0, 2).map(si => si.scene.id);
    const project = seedProject((p: any) => {
      p.scenes.find((s: any) => s.id === sceneA).cast = 'mary';
      p.scenes.find((s: any) => s.id === sceneB).cast = 'MARY';
    });
    const ctx = buildCtx(project);
    const fieldMap = getReportFieldMap(project);
    const scene = ctx.sceneInfos.find(si => si.scene.id === sceneA)!;
    const list = reportFieldValueByKey(ctx, fieldMap, 'categoryItems', catByKey(ctx, 'cast'), {
      outerSceneScope: ancestorSceneScope(ctx, [scene]),
    });
    // Regression: "MARY. MARY, mary. mary"
    expect(list.split(',').map(x => x.trim()).filter(Boolean)).toHaveLength(1);
  });
});

describe('duplicate custom category keys resolve one category row', () => {
  // reportData.ts:908-912 appends custom categories without key de-dupe (unlike
  // allCategoryKeysOf, reportData.ts:647-652). Reachable in the app: delete a
  // custom category, recreate it with the same name (same `_cat_<slug>` key),
  // then restore the deleted one from Trash (store/actions/breakdown.ts:477
  // appends without a key check). One key must be one category row.
  it('keeps one row per category key', () => {
    const project = seedProject((p: any) => {
      p.customCategories = [
        ...(p.customCategories || []),
        { key: '_cat_rigging', label: 'Rigging', icon: 'Tag', multiValue: true },
        { key: '_cat_rigging', label: 'Rigging', icon: 'Tag', multiValue: true },
      ];
    });
    const ctx = buildCtx(project);
    expect(cats(ctx).filter(c => c.key === '_cat_rigging')).toHaveLength(1);
  });
});

describe('a category without a label still carries typed-parent membership', () => {
  // reportData.ts:611-615 `isCategoryItem` requires `label !== undefined`, while
  // ruleBearingAncestor (1694) accepts the same item. The category is then
  // treated as a scene-intersection rule, dropping its unused catalog element —
  // the regression the typed-parent fix removed, re-entered by a missing label.
  it('lists the category\'s unused catalog element too', () => {
    const baseline = seedProject();
    const sceneId = firstBoardSceneId(baseline);
    const project = seedProject((p: any) => {
      p.customCategories = [...(p.customCategories || []), { key: '_cat_nolabel', icon: 'Tag' }];
      p.breakdownElements._cat_nolabel = [
        { id: 'used', name: 'USED EL' },
        { id: 'unused', name: 'UNUSED EL' },
      ];
      p.scenes.find((s: any) => s.id === sceneId)._cat_nolabel = 'USED EL';
    });
    const ctx = buildCtx(project);
    const cat = catByKey(ctx, '_cat_nolabel');
    expect(cat.elementCount).toBe(2);
    const rows = resolveCollectionItems(ctx, 'elementsOfCategory', undefined, cat, undefined, { collection: 'elementsOfCategory' } as any, [cat]) as any[];
    // Regression: [] — parentScenesOf (same `isCategoryItem` gate at :629) resolves
    // zero scenes, so the intersection drops even the USED element.
    expect(rows.map(e => e.name).sort()).toEqual(['UNUSED EL', 'USED EL']);
  });
});
