import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildNonShootSet, computeRowData } from '../daybreakUtils';
import { buildDayViews } from '../dayView';

const SEED = fileURLToPath(new URL('../../../e2e/fixtures/seed.lemon', import.meta.url));

function seedProject(mutate?: (p: any) => void): any {
  const project = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  mutate?.(project);
  return project;
}

function build(project: any) {
  const version = project.versions.find((v: any) => v.id === project.activeVersionId) || project.versions[0];
  const calendar =
    (project.calendarVersions || []).find((c: any) => c.id === project.activeCalendarVersionId) ||
    (project.calendarVersions || [])[0];
  const containerRows = version.rows
    .filter((r: any) => r.containerId != null && r.containerId !== -1)
    .sort((a: any, b: any) => (a.containerId || 0) - (b.containerId || 0) || a.order - b.order);
  const firstDaybreak = containerRows.find((r: any) => r.type === 'DAYBREAK');
  const { sections, computedRows, sectionDateMap, sectionSums } = computeRowData(
    containerRows,
    project.scenes,
    calendar?.productionStart || '2026-01-01',
    buildNonShootSet(calendar?.nonShootDates),
    firstDaybreak?.daybreakCallTime,
  );
  const days = buildDayViews({
    project,
    sections,
    productionSections: sections.filter(s => !s.isPinned),
    sectionDateMap,
    computedRows,
    sectionSums,
    calendarVersion: calendar,
  });
  return { days, sections, sectionDateMap, project };
}

describe('buildDayViews', () => {
  it('assembles one day per production section, chronologically', () => {
    const { days, sectionDateMap } = build(seedProject());
    expect(days.length).toBeGreaterThan(0);
    expect(days.map(d => d.chronoDay)).toEqual(days.map((_, i) => i + 1));
    for (const d of days) {
      expect(d.date).toBe(sectionDateMap.get(d.sectionIndex));
      expect(Array.isArray(d.scenes)).toBe(true);
      expect(Array.isArray(d.violations)).toBe(true);
      expect(d.callTime).toBeTruthy();
    }
  });

  it('resolves scenes, cast names and call times', () => {
    const { days, project } = build(seedProject());
    const castById = new Map((project.castMembers || []).map((m: any) => [m.id, m.name]));
    const day = days.find(d => d.cast.length > 0)!;
    expect(day).toBeTruthy();
    expect(day.scenes.every(s => s.scene && typeof s.callTime === 'string')).toBe(true);
    for (const c of day.cast) {
      expect(c.boardId).toBe(c.key);
      expect(c.name).toBe(castById.get(c.key));
    }
  });

  it('reads the governing daybreak\'s master location', () => {
    const project = seedProject((p) => {
      p.locations = [{ id: 'loc-test', name: 'TEST LOCATION', type: 'set' }];
      for (const v of p.versions || []) {
        const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
        if (gov) gov.daybreakMeta = { ...(gov.daybreakMeta || {}), locationId: 'loc-test' };
      }
    });
    const { days } = build(project);
    expect(days[0].masterLocation?.id).toBe('loc-test');
  });

  it('filters the day crew to the explicit crewIds when set', () => {
    const project = seedProject((p) => {
      // pick a real crew person to put on Day 1
      const role = (p.crewRoles || [])[0];
      const person = role ? (p.crew?.[role.key] || [])[0] : undefined;
      if (person) {
        for (const v of p.versions || []) {
          const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
          if (gov) gov.daybreakMeta = { ...(gov.daybreakMeta || {}), crewIds: [person.id] };
        }
      }
    });
    const { days } = build(project);
    if (days[0].crew.length > 0) {
      expect(days[0].crew).toHaveLength(1);
    }
  });
});
