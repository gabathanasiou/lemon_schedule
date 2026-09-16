import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildNonShootSet, computeRowData } from '../daybreakUtils';
import { buildReportCtx, resolveCollection, type ReportCtx } from '../reportData';

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
