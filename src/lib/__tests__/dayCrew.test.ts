import { describe, it, expect } from 'vitest';
import {
  buildDefaultSlots,
  groupSlotsByDept,
  resolveSlotCall,
  slotsForDay,
  addSlot,
  removeSlot,
  assignSlotPerson,
  setSlotCall,
  setSlotNoCall,
} from '../dayCrew';
import type { DayCrewSlot, DayMeta, Project } from '../../types';

function proj(partial: Partial<Project> = {}): Project {
  return {
    crewRoles: [
      { key: 'dop', label: 'Director of Photography' },
      { key: 'secondAC', label: '2nd AC' },
      { key: 'boomOp', label: 'Boom Operator' },
    ],
    crew: {
      secondAC: [{ id: 'bob', name: 'Bob' }, { id: 'mark', name: 'Mark' }],
      dop: [{ id: 'ann', name: 'Ann' }],
    },
    crewTemplate: {},
    ...partial,
  } as unknown as Project;
}

describe('buildDefaultSlots', () => {
  it('one slot per role that has people, first person, catalog role order', () => {
    const slots = buildDefaultSlots(proj());
    expect(slots.map(s => [s.role, s.personId])).toEqual([
      ['dop', 'ann'],
      ['secondAC', 'bob'],
    ]);
  });

  it('omits roles with no people', () => {
    expect(buildDefaultSlots(proj()).some(s => s.role === 'boomOp')).toBe(false);
  });
});

describe('slotsForDay', () => {
  it('derives from the roster when there is no template or day crew', () => {
    expect(slotsForDay(proj(), {}).map(s => s.role)).toEqual(['dop', 'secondAC']);
  });

  it('inherits the template when the day has none', () => {
    const templateSlots: DayCrewSlot[] = [{ id: 't1', role: 'boomOp', personId: 'sue' }];
    const project = proj({ crew: { boomOp: [{ id: 'sue', name: 'Sue' }] }, crewTemplate: { slots: templateSlots } });
    expect(slotsForDay(project, {})).toBe(templateSlots);
  });

  it('the day list wins over the template', () => {
    const daySlots: DayCrewSlot[] = [{ id: 'd1', role: 'dop', personId: 'ann' }];
    const project = proj({ crewTemplate: { slots: [{ id: 't1', role: 'boomOp', personId: 'x' }] } });
    expect(slotsForDay(project, { crewSlots: daySlots })).toBe(daySlots);
  });

  it('materializes legacy crewIds/crewCalls as slots', () => {
    const slots = slotsForDay(proj(), { crewIds: ['mark'], crewCalls: [{ personId: 'mark', callTime: '-1h' }] });
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ role: 'secondAC', personId: 'mark', callTime: '-1h' });
  });
});

describe('resolveSlotCall', () => {
  it('override anchors on the department call', () => {
    // day 08:00 → dept -1h = 07:00 → slot -30m = 06:30
    expect(resolveSlotCall({ id: 's', role: 'secondAC', personId: 'bob', callTime: '-30m' }, '-1h', '08:00')).toBe('06:30');
  });
  it('noCall wins over everything', () => {
    expect(resolveSlotCall({ id: 's', role: 'secondAC', personId: 'bob', callTime: '-30m', noCall: true }, '-1h', '08:00')).toBe('');
  });
  it('falls back to the department call', () => {
    expect(resolveSlotCall({ id: 's', role: 'secondAC', personId: 'bob' }, '-1h', '08:00')).toBe('07:00');
  });
});

describe('groupSlotsByDept', () => {
  it('groups by catalog department and computes the dept call', () => {
    const project = proj();
    const meta: DayMeta = { departmentPrecalls: { Camera: '-1h' } };
    const groups = groupSlotsByDept(project, meta, buildDefaultSlots(project), '08:00');
    expect(groups.map(g => g.dept)).toEqual(['Camera']);
    expect(groups[0].slots.map(s => s.role)).toEqual(['dop', 'secondAC']);
    expect(groups[0].deptCall).toBe('07:00');
    expect(groups[0].excluded).toBe(false);
  });

  it('flags excluded departments', () => {
    const project = proj();
    const groups = groupSlotsByDept(project, { excludedCrewDepts: ['Camera'] }, buildDefaultSlots(project), '08:00');
    expect(groups[0].excluded).toBe(true);
  });
});

describe('slot mutations', () => {
  const base: DayCrewSlot[] = [{ id: 'a', role: 'secondAC', personId: 'bob' }];

  it('adds and removes', () => {
    const added = addSlot(base, 'secondAC', 'mark');
    expect(added).toHaveLength(2);
    expect(removeSlot(added, 'a')).toHaveLength(1);
  });

  it('assigns a person without touching the call', () => {
    const withCall = setSlotCall(base, 'a', '-1h');
    expect(assignSlotPerson(withCall, 'a', 'mark')[0]).toMatchObject({ personId: 'mark', callTime: '-1h' });
    expect(assignSlotPerson(withCall, 'a', undefined)[0].personId).toBeUndefined();
  });

  it('setSlotCall clears noCall; setSlotNoCall clears the call', () => {
    const noCall = setSlotNoCall(base, 'a', true);
    expect(noCall[0].noCall).toBe(true);
    const called = setSlotCall(noCall, 'a', '-1h');
    expect(called[0].noCall).toBeUndefined();
    expect(called[0].callTime).toBe('-1h');
    const cleared = setSlotCall(called, 'a', '');
    expect(cleared[0].callTime).toBeUndefined();
    expect(cleared[0].noCall).toBeUndefined();
  });
});
