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

  it('carries non-cast Board IDs too (roadmap 305)', () => {
    const project = seedProject((p) => {
      const scene = p.scenes.find((s: any) => (s.props || '').trim());
      const name = String(scene.props).split(',')[0].trim();
      p.breakdownElements = p.breakdownElements || {};
      p.breakdownElements.props = [
        ...(p.breakdownElements.props || []).filter((e: any) => e.name !== name),
        { id: name, name, boardId: '77' },
      ];
    });
    const { days } = build(project);
    const entries = days.flatMap(d => d.elements.props || []);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(e => e.boardId === '77' || !e.boardId)).toBe(true);
    expect(entries.some(e => e.boardId === '77')).toBe(true);
  });

  it('merges elements added to the day with no scene (item 164)', () => {
    const base = build(seedProject());
    const existingCast = base.days[0].cast[0]?.key;
    const project = seedProject((p) => {
      p.castMembers = [...(p.castMembers || []), { id: '99', name: 'FITTING DOUBLE' }];
      p.breakdownElements = p.breakdownElements || {};
      p.breakdownElements.props = [
        ...(p.breakdownElements.props || []),
        { id: 'FITTING CHAIR', name: 'FITTING CHAIR', boardId: '900' },
      ];
      for (const v of p.versions || []) {
        const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned);
        if (gov) {
          gov.daybreakMeta = {
            ...(gov.daybreakMeta || {}),
            extraElements: {
              cast: ['99', '777', ...(existingCast ? [existingCast] : [])],
              props: ['FITTING CHAIR'],
            },
          };
        }
      }
    });
    const day = build(project).days[0];
    // Added, no scene, anchored on the day's base call.
    expect(day.cast.find(c => c.key === '99')).toMatchObject({
      added: true,
      firstScene: 0,
      name: 'FITTING DOUBLE',
      firstCallTime: day.callTime,
    });
    // A stale key never renders a phantom row…
    expect(day.cast.some(c => c.key === '777')).toBe(false);
    // …and an element already in the day's scenes is not duplicated.
    if (existingCast) expect(day.cast.filter(c => c.key === existingCast)).toHaveLength(1);
    expect(day.elements.props?.find(e => e.key === 'FITTING CHAIR')).toMatchObject({
      added: true,
      firstScene: 0,
      boardId: '900',
    });
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
