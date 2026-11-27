import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildNonShootSet, computeRowData } from '../daybreakUtils';
import {
  buildReportCtx,
  resolveCollection,
  ancestorSceneScope,
  type ReportCtx,
  type ReportCollectionItem,
} from '../reportData';
import {
  composeLookupKey,
  composeLookupPathKey,
  getReportFieldMap,
  reportFieldValueByKey,
  resolveReportTokens,
  type FieldAux,
  type LookupPath,
} from '../reportFields';
import { scopeLookupTarget } from '../reportLookup';
import { boardLabel } from '../elements';

// Lego-scoped lookups / references / cellrefs / chained nav (docs §7).
// `scopeLookupTarget` reduces a category target through `aux.sceneScope`; the
// target read must NOT re-apply the containing block's outer membership scope
// (`lookupTargetAux` clears it). A chain resolves against its OWN path scope.

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

/** The aux ReportBlockView computes for a block (ReportBlockView.tsx:168-179):
 *  item = the repeat/table's current item, ancestors = [item, …parents]. */
function blockAux(ctx: ReportCtx, item: ReportCollectionItem, ancestors: ReportCollectionItem[]): FieldAux {
  return {
    sceneScope: ancestorSceneScope(ctx, ancestors),
    outerSceneScope: ancestorSceneScope(ctx, ancestors.filter(a => a !== item)),
  };
}

const project = seedProject((p) => {
  // A costume designer (default role categories = ['wardrobe']) for the
  // crew → categories chained-navigation repro.
  p.crew = { ...(p.crew || {}), costumeDesigner: [{ id: 'edith-1', name: 'EDITH' }] };
});
const ctx = buildCtx(project);
const fieldMap = getReportFieldMap(project);
const days = resolveCollection(ctx, 'days', undefined, undefined) as any[];
const scenesOf = (day: any) => resolveCollection(ctx, 'scenesOfDay', undefined, day) as any[];
const categories = resolveCollection(ctx, 'categories', undefined, undefined) as any[];
const cat = (key: string) => categories.find(c => c.key === key);
const propsCat = cat('props');
const wardrobeCat = cat('wardrobe');
const propsListToken = composeLookupKey('categories', 'categoryItems', 'props');
const wardrobeListToken = composeLookupKey('categories', 'categoryItems', 'wardrobe');

/** A day with wardrobe in a scene that has NO props, plus props elsewhere. */
function mixedWardrobePropsDay(): any {
  const day = days.find(d => {
    const scenes = scenesOf(d);
    return scenes.some(si => ctx.sceneFieldItems(si.scene, 'wardrobe').length > 0 && ctx.sceneFieldItems(si.scene, 'props').length === 0)
      && scenes.some(si => ctx.sceneFieldItems(si.scene, 'props').length > 0);
  });
  expect(day).toBeTruthy();
  return day;
}

describe('lookups under Lego scopes — the target read ignores the block outer scope', () => {
  it('Cast → Days: @Props.Element List must reduce to the ancestor intersection (≡ {{props}} on the day)', () => {
    const george = (resolveCollection(ctx, 'cast', undefined, undefined) as any[]).find(e => e.name === 'GEORGE');
    expect(george).toBeTruthy();
    const georgeDays = resolveCollection(ctx, 'daysOfCast', undefined, george) as any[];
    expect(georgeDays.length).toBeGreaterThan(0);
    // A workday narrower than the person's whole scene set.
    const georgeDay = georgeDays.find(d => {
      const dayAndPerson = ancestorSceneScope(ctx, [d, george])!;
      const personOnly = ancestorSceneScope(ctx, [george])!;
      return dayAndPerson.size < personOnly.size && dayAndPerson.size > 0;
    });
    expect(georgeDay).toBeTruthy();
    const aux = blockAux(ctx, georgeDay, [georgeDay, george]);
    expect(aux.sceneScope!.size).toBeLessThan(aux.outerSceneScope!.size);

    const expected = resolveReportTokens(ctx, fieldMap, '{{props}}', georgeDay, aux);
    expect(expected).not.toBe('');
    // Doc §7: category Element List reduces through aux.sceneScope.
    expect(resolveReportTokens(ctx, fieldMap, `{{${propsListToken}}}`, georgeDay, aux)).toBe(expected);
  });

  it('Days → Scenes: @Props.Element List must list the scene, not the whole day', () => {
    const outerDay = days.find(d => {
      const scenes = scenesOf(d);
      return scenes.length > 1
        && scenes.some(si => ctx.sceneFieldItems(si.scene, 'props').length > 0)
        && scenes.some(si => ctx.sceneFieldItems(si.scene, 'props').length === 0);
    });
    expect(outerDay).toBeTruthy();
    const scene = scenesOf(outerDay).find((si: any) => ctx.sceneFieldItems(si.scene, 'props').length > 0);
    expect(scene).toBeTruthy();
    const aux = blockAux(ctx, scene, [scene, outerDay]);
    expect(aux.sceneScope!.size).toBe(1);
    expect(aux.outerSceneScope!.size).toBeGreaterThan(1);

    const expected = resolveReportTokens(ctx, fieldMap, '{{props}}', scene, aux);
    expect(expected).not.toBe('');
    // Doc §7: Element List reduces to aux.sceneScope = the scene (∩ its day).
    expect(resolveReportTokens(ctx, fieldMap, `{{${propsListToken}}}`, scene, aux)).toBe(expected);
  });

  it('nested categories chain: Element List and Element Count must agree (same aux.sceneScope)', () => {
    const day = mixedWardrobePropsDay();
    const aux = blockAux(ctx, propsCat, [propsCat, day]);
    const list = resolveReportTokens(ctx, fieldMap, `{{${wardrobeListToken}}}`, propsCat, aux);
    const count = resolveReportTokens(
      ctx,
      fieldMap,
      `{{${composeLookupKey('categories', 'categoryElementCount', 'wardrobe')}}}`,
      propsCat,
      aux,
    );
    // Both resolve through the same curated target: the scoped union and its count.
    expect(list.split(',').map(x => x.trim()).filter(Boolean).length).toBe(Number(count));
  });

  it('Cast → Days → Categories: Element List must intersect all three ancestors', () => {
    const castItems = resolveCollection(ctx, 'cast', undefined, undefined) as any[];
    const combo = castItems
      .flatMap(el => (resolveCollection(ctx, 'daysOfCast', undefined, el) as any[]).map(day => ({ el, day })))
      .find(({ el, day }) => {
        const scenes = scenesOf(day).filter((si: any) => el.sceneIds.includes(si.scene.id));
        return scenes.some(si => ctx.sceneFieldItems(si.scene, 'props').length > 0)
          && scenes.some(si => ctx.sceneFieldItems(si.scene, 'wardrobe').length > 0 && ctx.sceneFieldItems(si.scene, 'props').length === 0);
      });
    expect(combo).toBeTruthy();
    const aux = blockAux(ctx, propsCat, [propsCat, combo!.day, combo!.el]);
    // The wardrobe-only scene is inside the outer (cast ∩ day) chain but NOT
    // inside the containing props category, so the wardrobe ref must be empty.
    const scopedTarget = scopeLookupTarget(ctx, fieldMap, 'categories', wardrobeCat, aux.sceneScope);
    const documented = reportFieldValueByKey(ctx, fieldMap, 'categoryItems', scopedTarget, { outerSceneScope: null });
    expect(documented).toBe('');
    expect(resolveReportTokens(ctx, fieldMap, `{{${wardrobeListToken}}}`, propsCat, aux)).toBe(documented);
  });

  it('chained refs resolve against their OWN path scope, not the containing day', () => {
    const path: LookupPath = {
      v: 1,
      root: { collection: 'crew', itemKey: 'edith-1' },
      hops: [{ collection: 'categories', key: 'wardrobe' }],
    };
    const chain = composeLookupPathKey('categories', 'categoryItems', path);
    const bare = resolveReportTokens(ctx, fieldMap, `{{${chain}}}`, null);
    expect(bare).not.toBe('');

    // Doc §7: "@EDITH.Categories.Wardrobe.Element List scopes the category to
    // EDITH's scenes and the containing block's aux.sceneScope never leaks in."
    const day = mixedWardrobePropsDay();
    const aux = blockAux(ctx, propsCat, [propsCat, day]);
    expect(resolveReportTokens(ctx, fieldMap, `{{${chain}}}`, propsCat, aux)).toBe(bare);
  });

  it('cellref pins resolve through the containing scope, not the block’s outer scope', () => {
    const day = mixedWardrobePropsDay();
    const aux = blockAux(ctx, propsCat, [propsCat, day]);
    const block = {
      id: 't',
      type: 'table',
      custom: true,
      columns: [{ id: 'c1' }, { id: 'c2' }],
      customRows: [
        { id: 'r1', cells: ['', `<p>{{${composeLookupKey('categories', 'categoryLabel', 'wardrobe')}}}</p>`] },
        { id: 'r2', cells: ['', ''] },
      ],
      cellMerges: [],
    } as any;

    // Documented pin scope = aux.sceneScope (reportTokens.ts resolveCellRefAtom).
    const scopedTarget = scopeLookupTarget(ctx, fieldMap, 'categories', wardrobeCat, aux.sceneScope);
    const expected = reportFieldValueByKey(ctx, fieldMap, 'categoryItems', scopedTarget, { outerSceneScope: null });
    expect(expected).not.toBe('');

    const pinned = resolveReportTokens(ctx, fieldMap, '{{cellref.r1.c2.categoryItems}}', propsCat, aux, {
      cellRef: { block, rowId: 'r2', colId: 'c2' },
    });
    expect(pinned).toBe(expected);
  });
});


describe('lookup target with an empty ancestor scope', () => {
  it('is an empty chain, not the global catalog', () => {
    const target = scopeLookupTarget(ctx, fieldMap, 'categories', propsCat, new Set<string>()) as any;
    expect(target.items).toEqual([]);
    expect(target.elementCount).toBe(0);
  });
});
