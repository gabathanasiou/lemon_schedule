import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildNonShootSet, computeRowData } from '../daybreakUtils';
import {
  buildReportCtx,
  resolveCollection,
  resolveCollectionItems,
  ancestorSceneScope,
  type ReportCtx,
} from '../reportData';
import { composeLookupKey, composeLookupPathKey, elementLookupKey, referenceOffer, getReportFieldDefs, getReportFieldMap, resolveReportTokens, resolveReportTokensHtml, type LookupPath } from '../reportFields';

// Resolver-level coverage for the day-scoped report collections, built from the
// committed hermetic seed via the SAME pure pipeline the app uses
// (`computeRowData` → `buildReportCtx`). The single-test report specs keep one
// rendering check each; the resolution semantics live here.

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

describe('resolveCollection — days / scenes', () => {
  const ctx = buildCtx(seedProject());

  it('resolves one item per production day (pinned section excluded)', () => {
    const days = resolveCollection(ctx, 'days', undefined, undefined) as any[];
    expect(days.length).toBeGreaterThan(0);
    expect(days.every(d => d.chronoDay >= 1)).toBe(true);
    // Every non-pinned computed section has a day, in order.
    expect(days.map(d => d.chronoDay)).toEqual(days.map((_, i) => i + 1));
  });

  it('scopes scenes of a day to that day\'s section only', () => {
    const days = resolveCollection(ctx, 'days', undefined, undefined) as any[];
    const day1 = days[0];
    const scenes = resolveCollection(ctx, 'scenesOfDay', undefined, day1) as any[];
    expect(scenes.length).toBeGreaterThan(0);
    expect(scenes.every(s => s.sectionIndex === day1.section.index)).toBe(true);
    // resolving scenes without a parent yields nothing
    expect(resolveCollection(ctx, 'scenesOfDay', undefined, undefined)).toEqual([]);
  });
});

describe('resolveCollection — day-scoped call-sheet collections', () => {
  it('locationsOfDay resolves the governing daybreak location', () => {
    const project = seedProject((p) => {
      p.locations = [{ id: 'loc-test', name: 'TEST LOCATION', type: 'set' }];
      for (const v of p.versions || []) {
        const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
        if (gov) gov.daybreakMeta = { ...(gov.daybreakMeta || {}), locationId: 'loc-test' };
      }
    });
    const ctx = buildCtx(project);
    const days = resolveCollection(ctx, 'days', undefined, undefined) as any[];
    const locations = resolveCollection(ctx, 'locationsOfDay', undefined, days[0]) as any[];
    expect(locations.map(l => l.name)).toContain('TEST LOCATION');
  });

  it('departmentCallsOfDay resolves a precall against the day call time', () => {
    const project = seedProject((p) => {
      p.crewTemplate = { departmentPrecalls: { Camera: '-30m' } };
    });
    const ctx = buildCtx(project);
    const days = resolveCollection(ctx, 'days', undefined, undefined) as any[];
    const depts = resolveCollection(ctx, 'departmentCallsOfDay', undefined, days[0]) as any[];
    const camera = depts.find(d => d.key === 'Camera');
    expect(camera).toBeTruthy();
    expect(camera.callTime).toBeTruthy();
  });

  it('elementCallsOfDay resolves call columns for the day\'s cast', () => {
    const ctx = buildCtx(seedProject());
    const days = resolveCollection(ctx, 'days', undefined, undefined) as any[];
    const calls = resolveCollection(ctx, 'elementCallsOfDay', undefined, days[0]) as any[];
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(c => c.name && c.callTimes && typeof c.callTimes === 'object')).toBe(true);
    // Each resolved call carries a stage key → { time } entry.
    expect(Object.keys(calls[0].callTimes).length).toBeGreaterThan(0);
    // Without a parent day there is nothing to resolve.
    expect(resolveCollection(ctx, 'elementCallsOfDay', undefined, undefined)).toEqual([]);
  });

  it('crewOfDay with no explicit crew resolves the template crew', () => {
    const ctx = buildCtx(seedProject());
    const days = resolveCollection(ctx, 'days', undefined, undefined) as any[];
    const crew = resolveCollection(ctx, 'crewOfDay', undefined, days[0]) as any[];
    // Always an array; each crew item carries a resolved call time.
    expect(Array.isArray(crew)).toBe(true);
    expect(crew.every(c => typeof c.callTime === 'string')).toBe(true);
  });
});

describe('resolveCollectionItems — day-scoped categories', () => {
  const ctx = buildCtx(seedProject());

  it('returns every category at the top level', () => {
    const all = resolveCollectionItems(ctx, 'categories', undefined, undefined, undefined);
    expect(all.length).toBeGreaterThan(0);
  });

  it('scopes categories to the ones actually used in the ancestor day', () => {
    const days = resolveCollection(ctx, 'days', undefined, undefined) as any[];
    const day = days[0];
    const scoped = resolveCollectionItems(ctx, 'categories', undefined, day, undefined, {} as any, [day]) as any[];
    const all = resolveCollectionItems(ctx, 'categories', undefined, undefined, undefined) as any[];
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.length).toBeLessThanOrEqual(all.length);
    const dayScenes = resolveCollection(ctx, 'scenesOfDay', undefined, day) as any[];
    for (const category of scoped) {
      const used = dayScenes.some(si => ctx.sceneFieldItems(si.scene, category.key).length > 0);
      expect(used).toBe(true);
    }
  });
});

describe('ancestorSceneScope', () => {
  const ctx = buildCtx(seedProject());

  it('is null without ancestors (no scoping)', () => {
    expect(ancestorSceneScope(ctx, undefined)).toBeNull();
    expect(ancestorSceneScope(ctx, [])).toBeNull();
  });

  it('is exactly the ancestor day\'s scene ids', () => {
    const days = resolveCollection(ctx, 'days', undefined, undefined) as any[];
    const day = days[0];
    const scope = ancestorSceneScope(ctx, [day])!;
    const expected = resolveCollection(ctx, 'scenesOfDay', undefined, day).map((s: any) => s.scene.id);
    expect([...scope].sort()).toEqual([...expected].sort());
  });

  it('intersects nested ancestors (day + category ⊂ day)', () => {
    const days = resolveCollection(ctx, 'days', undefined, undefined) as any[];
    const day = days[0];
    const dayIds = ancestorSceneScope(ctx, [day])!;
    const category = (resolveCollectionItems(ctx, 'categories', undefined, day, undefined, {} as any, [day]) as any[])[0];
    const nested = ancestorSceneScope(ctx, [day, category])!;
    expect(nested.size).toBeLessThanOrEqual(dayIds.size);
    for (const id of nested) expect(dayIds.has(id)).toBe(true);
  });
});

describe('lookup pair suppression — the 121 reference + attribute pair', () => {
  const project = seedProject((p) => {
    p.crewRoles = [{ key: 'gaffer', label: 'Gaffer' }];
    p.crew = { gaffer: [{ id: 'p-test', name: 'BOB', phone: '555-0134', email: 'bob@example.com' }] };
  });
  const ctx = buildCtx(project);
  const fieldMap = getReportFieldMap(project);
  const ref = composeLookupKey('crew', 'crewName', 'p-test');
  const phone = composeLookupKey('crew', 'phone', 'p-test');

  it('an adjacent pair prints the attribute only (reference is the anchor)', () => {
    expect(resolveReportTokens(ctx, fieldMap, `{{${ref}}}{{${phone}}}`, null)).toBe('555-0134');
    // the HTML path shares the same pair pass (phone stays a tel link)
    expect(resolveReportTokensHtml(ctx, fieldMap, `<p>{{${ref}}}{{${phone}}}</p>`, null)).toContain('555-0134');
  });

  it('deleting the attribute leaves the reference resolving to the name', () => {
    expect(resolveReportTokens(ctx, fieldMap, `{{${ref}}}`, null)).toBe('BOB');
  });

  it('deleting the reference leaves the attribute resolving on its own', () => {
    expect(resolveReportTokens(ctx, fieldMap, `{{${phone}}}`, null)).toBe('555-0134');
  });

  it('text between the tokens stops the suppression', () => {
    expect(resolveReportTokens(ctx, fieldMap, `{{${ref}}} at {{${phone}}}`, null)).toBe('BOB at 555-0134');
  });

  it('a dangling reference prints #REF! and an unknown attribute #VALUE!', () => {
    expect(resolveReportTokens(ctx, fieldMap, '{{lookup.crew.crewName.gone}}', null)).toBe('#REF!');
    expect(resolveReportTokens(ctx, fieldMap, `{{lookup.crew.nope.p-test}}`, null)).toBe('#VALUE!');
  });
});

describe('lookup contextual resolution (roadmap 195)', () => {
  const project = seedProject();
  const ctx = buildCtx(project);
  const fieldMap = getReportFieldMap(project);
  const days = resolveCollection(ctx, 'days', undefined, undefined) as any[];
  const day = days[0];
  const sceneScope = ancestorSceneScope(ctx, [day])!;
  const propsItems = composeLookupKey('categories', 'categoryItems', 'props');

  it('a category ref inside a day prints that day\'s union (≡ {{props}})', () => {
    const viaRef = resolveReportTokens(ctx, fieldMap, `{{${propsItems}}}`, day, { sceneScope });
    const viaUnion = resolveReportTokens(ctx, fieldMap, '{{props}}', day, { sceneScope });
    expect(viaUnion).not.toBe('');
    expect(viaRef).toBe(viaUnion);
  });

  it('a bare category ref outside any repeater stays project-wide', () => {
    const projectWide = resolveReportTokens(ctx, fieldMap, `{{${propsItems}}}`, null);
    const scoped = resolveReportTokens(ctx, fieldMap, `{{${propsItems}}}`, day, { sceneScope });
    expect(projectWide).toBe(ctx.categoryInfos.find(c => c.key === 'props')!.items.join(', '));
    expect(scoped).not.toBe(projectWide);
  });

  it('an element ref scopes its scene-derived fields to the day', () => {
    const cast = resolveCollection(ctx, 'cast', undefined, undefined) as any[];
    const el = cast.find(e => e.sceneIds.some((id: string) => sceneScope.has(id)) && e.sceneIds.some((id: string) => !sceneScope.has(id)));
    expect(el).toBeTruthy();
    const key = composeLookupKey('elements', 'attachedScenes', elementLookupKey('cast', el.id));
    const scoped = resolveReportTokens(ctx, fieldMap, `{{${key}}}`, day, { sceneScope });
    const global = resolveReportTokens(ctx, fieldMap, `{{${key}}}`, null);
    const numberById = new Map(ctx.sceneInfos.map(si => [si.scene.id, si.scene.sceneNumber]));
    expect(scoped).toBe(el.sceneIds.filter((id: string) => sceneScope.has(id)).map((id: string) => numberById.get(id)).join(', '));
    expect(scoped).not.toBe('');
    expect(scoped).not.toBe(global);
  });
});

describe('reference navigation — chained lookups (roadmap 196)', () => {
  const project = seedProject();
  const ctx = buildCtx(project);
  const fieldMap = getReportFieldMap(project);
  const fields = getReportFieldDefs(project);
  const days = resolveCollection(ctx, 'days', undefined, undefined) as any[];
  const day = days[0];
  const dayScenes = resolveCollection(ctx, 'scenesOfDay', undefined, day) as any[];
  const dayRoot = { collection: 'days', itemKey: String(day.section.index) };
  const firstScenePath = { v: 1 as const, root: dayRoot, hops: [{ collection: 'scenes' as const, pick: 'first' as const }] };

  it('walks day → first/last/specific scene', () => {
    const first = composeLookupPathKey('scenes', 'sceneLabel', firstScenePath);
    expect(resolveReportTokens(ctx, fieldMap, `{{${first}}}`, null)).toBe(`Scene ${dayScenes[0].scene.sceneNumber}`);
    const lastPath = { v: 1 as const, root: dayRoot, hops: [{ collection: 'scenes' as const, pick: 'last' as const }] };
    const last = composeLookupPathKey('scenes', 'sceneLabel', lastPath);
    expect(resolveReportTokens(ctx, fieldMap, `{{${last}}}`, null)).toBe(`Scene ${dayScenes[dayScenes.length - 1].scene.sceneNumber}`);
    const target = dayScenes[Math.min(1, dayScenes.length - 1)];
    const specific = composeLookupPathKey('scenes', 'sceneLabel', { v: 1, root: dayRoot, hops: [{ collection: 'scenes', key: target.scene.id }] });
    expect(resolveReportTokens(ctx, fieldMap, `{{${specific}}}`, null)).toBe(`Scene ${target.scene.sceneNumber}`);
  });

  it('resolves an attribute through the chain (day → first scene → Int/Ext)', () => {
    const intExt = composeLookupPathKey('scenes', 'intExt', firstScenePath);
    expect(resolveReportTokens(ctx, fieldMap, `{{${intExt}}}`, null)).toBe(dayScenes[0].scene.intExt);
  });

  it('a chain is self-contained — the containing scope does not re-intersect it', () => {
    const foreign = new Set(ctx.sceneInfos.filter(si => si.sectionIndex !== day.section.index).slice(0, 1).map(si => si.scene.id));
    expect(foreign.size).toBeGreaterThan(0);
    const intExt = composeLookupPathKey('scenes', 'intExt', firstScenePath);
    expect(resolveReportTokens(ctx, fieldMap, `{{${intExt}}}`, day, { sceneScope: foreign })).toBe(dayScenes[0].scene.intExt);
  });

  it('anchor + chain suppress like the 121 pair; chain + attribute print the value', () => {
    const root = composeLookupKey('days', 'dayLabel', String(day.section.index));
    const chain = composeLookupPathKey('scenes', 'sceneLabel', firstScenePath);
    const chainVal = resolveReportTokens(ctx, fieldMap, `{{${chain}}}`, null);
    expect(resolveReportTokens(ctx, fieldMap, `{{${root}}}{{${chain}}}`, null)).toBe(chainVal);
    const intExt = composeLookupPathKey('scenes', 'intExt', firstScenePath);
    expect(resolveReportTokens(ctx, fieldMap, `{{${chain}}}{{${intExt}}}`, null)).toBe(dayScenes[0].scene.intExt);
  });

  it('walks deeper: day → a scene → its first element', () => {
    const withEls = dayScenes.find(si => (resolveCollection(ctx, 'elementsOfScene', undefined, si) as any[]).length > 0);
    expect(withEls).toBeTruthy();
    const els = resolveCollection(ctx, 'elementsOfScene', undefined, withEls) as any[];
    const sceneHop = { collection: 'scenes' as const, key: withEls.scene.id };
    const path: LookupPath = { v: 1, root: dayRoot, hops: [sceneHop, { collection: 'elements', pick: 'first' }] };
    const name = composeLookupPathKey('elements', 'elementName', path);
    expect(resolveReportTokens(ctx, fieldMap, `{{${name}}}`, null)).toBe(els[0].name);
    // The full anchor + scene + element run suppresses down to the element identity.
    const sceneChain = composeLookupPathKey('scenes', 'sceneLabel', { v: 1, root: dayRoot, hops: [sceneHop] });
    expect(resolveReportTokens(ctx, fieldMap, `{{${composeLookupKey('days', 'dayLabel', String(day.section.index))}}}{{${sceneChain}}}{{${name}}}`, null)).toBe(els[0].name);
  });

  it('walks category → elements', () => {
    const propsEls = resolveCollection(ctx, 'elements', 'props', undefined, undefined) as any[];
    expect(propsEls.length).toBeGreaterThan(0);
    const path: LookupPath = { v: 1, root: { collection: 'categories', itemKey: 'props' }, hops: [{ collection: 'elements', pick: 'first' }] };
    expect(resolveReportTokens(ctx, fieldMap, `{{${composeLookupPathKey('elements', 'elementName', path)}}}`, null)).toBe(propsEls[0].name);
  });

  it('walks crew → categories (their position\'s categories)', () => {
    const p = seedProject((proj) => {
      proj.crewRoles = [{ key: 'costumeDesigner', label: 'Costume Designer' }];
      proj.crew = { costumeDesigner: [{ id: 'c-1', name: 'EDITH' }] };
    });
    const c = buildCtx(p);
    const fm = getReportFieldMap(p);
    const path: LookupPath = { v: 1, root: { collection: 'crew', itemKey: 'c-1' }, hops: [{ collection: 'categories', pick: 'first' }] };
    expect(resolveReportTokens(c, fm, `{{${composeLookupPathKey('categories', 'categoryLabel', path)}}}`, null)).toBeTruthy();
    const wardrobePath: LookupPath = { v: 1, root: path.root, hops: [{ collection: 'categories', key: 'wardrobe' }] };
    const wardrobe = c.categoryInfos.find(x => x.key === 'wardrobe') as any;
    expect(wardrobe).toBeTruthy();
    expect(resolveReportTokens(c, fm, `{{${composeLookupPathKey('categories', 'categoryItems', wardrobePath)}}}`, null)).toBe(wardrobe.items.join(', '));
  });

  it('referenceOffer lists attributes + First/Last + specific children, query-narrowed', () => {
    const offer = referenceOffer(fields, ctx, { collection: 'days', itemKey: String(day.section.index) }, '');
    expect(offer.item).toBeTruthy();
    expect(offer.attributes.map(f => f.key)).toContain('dayCallTime');
    expect(offer.attributes.map(f => f.key)).not.toContain('company');
    const labels = offer.children.map(c => c.label);
    expect(labels).toContain('→ First scene');
    expect(labels).toContain('→ Last scene');
    expect(offer.children.filter(c => c.group === 'Scenes').length).toBeLessThanOrEqual(2 + 8);
    const sceneNumber = dayScenes[0].scene.sceneNumber;
    const narrowed = referenceOffer(fields, ctx, { collection: 'days', itemKey: String(day.section.index) }, sceneNumber);
    expect(narrowed.children.some(c => c.path.hops[0].key === dayScenes[0].scene.id)).toBe(true);
  });
});

describe('scene lookup — the Scene identity label', () => {
  const project = seedProject();
  const ctx = buildCtx(project);
  const fieldMap = getReportFieldMap(project);

  it('resolves to "Scene {number}" so the chip and the print agree', () => {
    const scene = ctx.sceneInfos[0].scene;
    const key = composeLookupKey('scenes', 'sceneLabel', scene.id);
    expect(resolveReportTokens(ctx, fieldMap, `{{${key}}}`, null)).toBe(`Scene ${scene.sceneNumber}`);
  });

  it('resolves scenes that are NOT on the stripboard (schedule fields blank)', () => {
    const scheduled = new Set(ctx.sceneInfos.map(si => si.scene.id));
    const off = project.scenes.find(sc => !scheduled.has(sc.id));
    expect(off).toBeTruthy();
    const intExt = composeLookupKey('scenes', 'intExt', off!.id);
    const day = composeLookupKey('scenes', 'day', off!.id);
    expect(resolveReportTokens(ctx, fieldMap, `{{${intExt}}}`, null)).toBe(off!.intExt);
    expect(resolveReportTokens(ctx, fieldMap, `{{${day}}}`, null)).toBe('');
  });
});
