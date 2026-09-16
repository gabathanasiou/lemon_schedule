import { describe, it, expect } from 'vitest';
import { makeBlankProject, reducer } from '../../store/reducer';
import { computeElementDayStats } from '../elementDayStats';

// Two production days: pinned daybreak anchors Day 1 (2026-08-10), the second
// daybreak opens Day 2 (2026-08-11). GEORGE is on Day 1 only, MARY on Day 2
// only, the `gun` prop is on both.
function buildProject(mutate?: (p: any) => void): any {
  const blank = makeBlankProject('Stats Test');
  const project: any = reducer(
    { past: [], present: blank, future: [], _batchDepth: 0 },
    { type: 'LOAD', payload: blank },
  ).present;

  project.versions[0].rows = [
    { id: 'd0', type: 'DAYBREAK', containerId: 1, order: 0, pinned: true, daybreakCallTime: '08:00' },
    { id: 'r1', type: 'SCENE', containerId: 1, order: 1, sceneId: 's1', estimatedDuration: 30 },
    { id: 'd1', type: 'DAYBREAK', containerId: 1, order: 2, pinned: false, daybreakCallTime: '08:00' },
    { id: 'r2', type: 'SCENE', containerId: 1, order: 3, sceneId: 's2', estimatedDuration: 30 },
    { id: 'd2', type: 'DAYBREAK', containerId: 1, order: 4, pinned: false, daybreakCallTime: '08:00' },
  ];
  project.scenes = [
    { id: 's1', sceneNumber: '1', cast: '1', props: 'gun' },
    { id: 's2', sceneNumber: '2', cast: '2', props: 'gun' },
  ];
  project.activeVersionId = project.versions[0].id;
  project.castMembers = [{ id: '1', name: 'GEORGE' }, { id: '2', name: 'MARY' }];
  project.breakdownElements = { props: [{ id: 'gun', name: 'gun' }] };

  const cal = project.calendarVersions[0];
  project.activeCalendarVersionId = cal.id;
  cal.productionStart = '2026-08-10';
  cal.nonShootDates = [];

  mutate?.(project);
  return project;
}

describe('computeElementDayStats', () => {
  it('counts each cast member\'s production days from their scenes', () => {
    const stats = computeElementDayStats(buildProject(), 'cast');
    const george = stats.get('1')!;
    const mary = stats.get('2')!;
    expect(george.workDays).toBe(1);
    expect(george.startDate).toBe('2026-08-10');
    expect(mary.workDays).toBe(1);
    expect(mary.startDate).toBe('2026-08-11');
  });

  it('counts non-cast elements by name across days', () => {
    const stats = computeElementDayStats(buildProject(), 'props');
    const gun = stats.get('gun')!;
    expect(gun.workDays).toBe(2);
    expect(gun.startDate).toBe('2026-08-10');
    expect(gun.finishDate).toBe('2026-08-11');
  });

  it('adds attached status days to statusCounts and totalDays', () => {
    const project = buildProject((p) => {
      p.calendarVersions[0].nonShootDates = [
        { date: '2026-08-12', status: 'hold', lists: { hold: { cast: ['1'] } } },
      ];
    });
    const stats = computeElementDayStats(project, 'cast');
    const george = stats.get('1')!;
    expect(george.workDays).toBe(1);
    expect(george.statusCounts.hold).toBe(1);
    expect(george.totalDays).toBe(2);
    expect(george.finishDate).toBe('2026-08-12');
  });

  it('keeps totalDays = workDays + sum(statusCounts) for every entry', () => {
    const project = buildProject((p) => {
      p.calendarVersions[0].nonShootDates = [
        { date: '2026-08-12', status: 'hold', lists: { hold: { cast: ['1', '2'], props: ['gun'] } } },
        { date: '2026-08-13', status: 'travel', lists: { travel: { props: ['*'] } } },
      ];
    });
    for (const category of ['cast', 'props']) {
      for (const s of computeElementDayStats(project, category).values()) {
        const attached = Object.values(s.statusCounts).reduce((a, b) => a + b, 0);
        expect(s.totalDays).toBe(s.workDays + attached);
      }
    }
  });
});
