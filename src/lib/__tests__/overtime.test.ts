import { describe, it, expect } from 'vitest';
import type { Project } from '../../types';
import { makeBlankProject } from '../../store/reducer';
import {
  DEFAULT_CREW_OT_POLICY, computeDayOvertime, consecutiveWorkDayNumber,
  hoursBetween, overtimeExpensesForDay, resolveOvertimePolicy, type OvertimeDay,
} from '../budget/overtime';

function projectWithCrew(partialRate: Partial<{ rateCents: number; rateUnit: 'hour' | 'day' | 'flat'; guaranteeHours: number }> = {}, castRate = 8000): Project {
  const p = makeBlankProject('OT Test');
  p.productionInfo = { overtime: { ...DEFAULT_CREW_OT_POLICY } };
  p.crew = { camera: [{ id: 'p1', name: 'ALEX', rateCents: 10000, rateUnit: 'day', ...partialRate }] };
  p.castMembers = [{ id: '1', name: 'MARY', rateCents: castRate, rateUnit: 'day' }];
  p.calendarVersions[0].productionStart = '2026-08-03';
  return p;
}

function day(overrides: Partial<OvertimeDay> = {}): OvertimeDay {
  return {
    sectionIndex: 1,
    chronoDay: 1,
    date: '2026-08-03',
    callTime: '08:00',
    wrap: '18:00',
    crew: [{ personId: 'p1', name: 'ALEX', roleKey: 'camera', role: 'Camera', dept: 'Camera' }],
    cast: [{ castId: '1', name: 'MARY' }],
    meta: {},
    ...overrides,
  };
}

describe('overtime engine (roadmap 334 phase 3)', () => {
  it('computes hours overnight-safe and resolves policy precedence', () => {
    expect(hoursBetween('08:00', '20:30')).toBe(12.5);
    expect(hoursBetween('20:00', '02:00')).toBe(6);
    expect(hoursBetween('', '02:00')).toBe(0);
    const p = projectWithCrew();
    const base = resolveOvertimePolicy(p, { meta: {} });
    expect(base.dailyHours).toBe(10);
    const dayPolicy = resolveOvertimePolicy(p, { meta: { overtime: { policy: { dailyHours: 8 } } } });
    expect(dayPolicy.dailyHours).toBe(8);
    const dept = resolveOvertimePolicy(p, { meta: { overtime: { overrides: [{ target: 'department', targetId: 'Camera', multiplier: 2 }] } } }, 'Camera');
    expect(dept.multiplier).toBe(2);
    const person = resolveOvertimePolicy(p, { meta: { overtime: { overrides: [{ target: 'person', targetId: 'p1', dailyHours: 12 }] } } }, 'Camera', 'p1');
    expect(person.dailyHours).toBe(12);
  });

  it('prices tiers, guarantee and the 6th-day multiplier', () => {
    const p = projectWithCrew();
    // 12h: 2h at 1.5x; hourly = 10000 / 10 = 1000.
    const twelve = computeDayOvertime(p, day({ wrap: '20:00' }));
    expect(twelve.crew[0].otHours).toBe(2);
    expect(twelve.crew[0].otCostCents).toBe(3000);
    // 13h: 2h at 1.5 + 1h at 2.
    const thirteen = computeDayOvertime(p, day({ wrap: '21:00' }));
    expect(thirteen.crew[0].otCostCents).toBe(5000);
    // Guarantee raises the paid day: 12h paid → no OT at 12h.
    const guaranteed = computeDayOvertime(projectWithCrew({ guaranteeHours: 12 }), day({ wrap: '20:00' }));
    expect(guaranteed.crew[0].otHours).toBe(0);
    // Flat day rate: no OT, the day cost is the flat rate.
    const flat = computeDayOvertime(projectWithCrew({ rateUnit: 'flat' }), day({ wrap: '21:00' }));
    expect(flat.crew[0].otHours).toBe(3);
    expect(flat.crew[0].otCostCents).toBe(0);
    expect(flat.crew[0].dayCostCents).toBe(10000);
  });

  it('finds the 6th consecutive work day (weekly days off + statuses)', () => {
    const p = projectWithCrew();
    p.calendarVersions[0].weeklyDaysOff = [6]; // Sunday (Mon=0 → Sun=6)
    p.calendarVersions[0].nonShootDates = [{ id: 'n1', date: '2026-08-06', status: 'hold' } as any];
    // Mon 3, Tue 4, Wed 5, (Thu 6 is off), Fri 7, Sat 8 → the 6th is Sat 8.
    expect(consecutiveWorkDayNumber(p, '2026-08-03')).toBe(1);
    expect(consecutiveWorkDayNumber(p, '2026-08-05')).toBe(3);
    expect(consecutiveWorkDayNumber(p, '2026-08-07')).toBe(1);
    expect(consecutiveWorkDayNumber(p, '2026-08-08')).toBe(2);
    // With no statused Thursday the run reaches the 6th day on Sat.
    p.calendarVersions[0].nonShootDates = [];
    expect(consecutiveWorkDayNumber(p, '2026-08-08')).toBe(6);
    // Without a weekly day off it still stops at the production window start.
    p.calendarVersions[0].weeklyDaysOff = [];
    expect(consecutiveWorkDayNumber(p, '2026-08-08')).toBe(6);
  });

  it('applies a department multiplier and prices cast from its own preset', () => {
    const p = projectWithCrew();
    const withDept = computeDayOvertime(p, day({
      wrap: '21:00',
      meta: { overtime: { overrides: [{ target: 'department', targetId: 'Camera', multiplier: 2 }] } },
    }));
    expect(withDept.crew[0].otCostCents).toBe(10000);
    const cast = computeDayOvertime(p, day({ wrap: '18:00' }));
    // Cast preset: 8h paid; 10h worked → 2h at 1.5; hourly = 8000/8 = 1000.
    expect(cast.cast[0].otHours).toBe(2);
    expect(cast.cast[0].otCostCents).toBe(3000);
    expect(cast.totalCostCents).toBe(cast.crewCostCents + cast.castCostCents);
  });

  it('flags missing rates and posts only positive OT costs', () => {
    const p = projectWithCrew({ rateCents: undefined as any, rateUnit: 'flat' });
    const result = computeDayOvertime(p, day({ wrap: '21:00' }));
    expect(result.noRate).toContain('ALEX');
    const expenses = overtimeExpensesForDay(p, day({ wrap: '21:00' }), result);
    expect(expenses.every(e => (e.amountCents || 0) > 0)).toBe(true);
    expect(expenses.every(e => e.method === 'payroll' && e.status === 'actual')).toBe(true);
  });
});
