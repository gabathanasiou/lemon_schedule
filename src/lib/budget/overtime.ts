import type {
  CastMember, CrewPerson, DayMeta, Expense, OvertimeOverride, OvertimePolicy,
  OvertimeTier, Project,
} from '../../types';
import { roleLabelOf } from '../dayCrew';

/**
 * Overtime engine (roadmap 334 phase 3). Pure and framework-free: the Day
 * Manager, the Overtime modal and the reports all read this ONE model. No
 * hardcoded union rules — the policy is editable data with presets.
 *
 * Hours come from the day's actual call/wrap (falling back to the scheduled
 * section times). The paid day is the guarantee (policy `dailyHours`, or the
 * person's `guaranteeHours` when larger); overtime is the excess, priced
 * through the tiers, then the 6th/7th-consecutive-day multiplier, then the
 * person's own multiplier.
 */

export const DEFAULT_CREW_OT_POLICY: OvertimePolicy = {
  dailyHours: 10,
  tiers: [
    { afterHours: 10, multiplier: 1.5, label: 'OT' },
    { afterHours: 12, multiplier: 2, label: 'Double' },
  ],
  sixthDayMultiplier: 1.5,
  seventhDayMultiplier: 2,
};

/** Cast preset: a shorter paid day, double time earlier (SAG-style, editable). */
export const DEFAULT_CAST_OT_POLICY: OvertimePolicy = {
  dailyHours: 8,
  tiers: [
    { afterHours: 8, multiplier: 1.5, label: 'OT' },
    { afterHours: 10, multiplier: 2, label: 'Double' },
  ],
  sixthDayMultiplier: 1.5,
  seventhDayMultiplier: 2,
};

export interface ResolvedOvertimePolicy {
  dailyHours: number;
  tiers: OvertimeTier[];
  sixthDayMultiplier: number;
  seventhDayMultiplier: number;
  /** Combined per-person/override scale applied to every tier multiplier. */
  multiplier: number;
  notes?: string;
}

export interface OvertimeCrewInput {
  personId: string;
  name: string;
  roleKey: string;
  role: string;
  dept: string;
  callTime?: string;
  noCall?: boolean;
}

export interface OvertimeCastInput {
  castId: string;
  name: string;
}

export interface OvertimeDay {
  sectionIndex: number;
  chronoDay: number;
  date: string;
  /** Scheduled section base call and end. */
  callTime: string;
  wrap?: string;
  crew: OvertimeCrewInput[];
  cast: OvertimeCastInput[];
  meta?: DayMeta | null;
}

export interface OvertimeRow {
  id: string;
  name: string;
  /** Crew role label / the cast member's performer label. */
  role: string;
  department?: string;
  callTime?: string;
  wrapTime?: string;
  hours: number;
  /** Paid day before overtime (policy daily hours / guarantee). */
  paidHours: number;
  otHours: number;
  rateCents?: number;
  rateUnit?: 'hour' | 'day' | 'flat';
  hourlyCents: number;
  otCostCents: number;
  dayCostCents: number;
  /** True when no numeric rate is set — hours still show, cost is 0. */
  noRate: boolean;
  policy: ResolvedOvertimePolicy;
}

export interface OvertimeDepartmentRow {
  department: string;
  hours: number;
  otHours: number;
  otCostCents: number;
  policy: ResolvedOvertimePolicy;
}

export interface OvertimeDayResult {
  sectionIndex: number;
  chronoDay: number;
  date: string;
  callTime: string;
  wrapTime: string;
  hours: number;
  crew: OvertimeRow[];
  cast: OvertimeRow[];
  departments: OvertimeDepartmentRow[];
  crewHours: number;
  crewOtHours: number;
  crewCostCents: number;
  castHours: number;
  castOtHours: number;
  castCostCents: number;
  totalHours: number;
  totalOtHours: number;
  totalCostCents: number;
  noRate: string[];
  /** 1-7 consecutive work-day position (6th/7th day multipliers). */
  workDayNumber: number;
  dayMultiplier: number;
}

const DEFAULT_TIERS: OvertimeTier[] = DEFAULT_CREW_OT_POLICY.tiers!.map(t => ({ ...t }));

function mergePolicy(base: ResolvedOvertimePolicy, patch: OvertimePolicy | undefined): void {
  if (!patch) return;
  if (typeof patch.dailyHours === 'number' && patch.dailyHours > 0) base.dailyHours = patch.dailyHours;
  if (patch.tiers && patch.tiers.length > 0) base.tiers = patch.tiers.map(t => ({ ...t }));
  if (typeof patch.sixthDayMultiplier === 'number') base.sixthDayMultiplier = patch.sixthDayMultiplier;
  if (typeof patch.seventhDayMultiplier === 'number') base.seventhDayMultiplier = patch.seventhDayMultiplier;
  if (patch.notes) base.notes = patch.notes;
}

function basePolicy(project: Project, kind: 'crew' | 'cast'): ResolvedOvertimePolicy {
  const preset = kind === 'cast'
    ? (project.productionInfo?.castOvertime ?? DEFAULT_CAST_OT_POLICY)
    : (project.productionInfo?.overtime ?? DEFAULT_CREW_OT_POLICY);
  const base: ResolvedOvertimePolicy = {
    dailyHours: preset.dailyHours ?? (kind === 'cast' ? 8 : 10),
    tiers: (preset.tiers && preset.tiers.length > 0 ? preset.tiers : DEFAULT_TIERS).map(t => ({ ...t })),
    sixthDayMultiplier: preset.sixthDayMultiplier ?? 1.5,
    seventhDayMultiplier: preset.seventhDayMultiplier ?? 2,
    multiplier: 1,
    notes: preset.notes,
  };
  return base;
}

/** Precedence: project preset → day policy → department override → person. */
export function resolveOvertimePolicy(
  project: Project,
  day: Pick<OvertimeDay, 'meta'> | undefined,
  dept?: string,
  personId?: string,
  kind: 'crew' | 'cast' = 'crew',
): ResolvedOvertimePolicy {
  const resolved = basePolicy(project, kind);
  const dayOvertime = day?.meta?.overtime;
  mergePolicy(resolved, dayOvertime?.policy);
  const overrides = dayOvertime?.overrides || [];
  const applyOverride = (override: OvertimeOverride | undefined) => {
    if (!override) return;
    if (typeof override.dailyHours === 'number' && override.dailyHours > 0) resolved.dailyHours = override.dailyHours;
    if (override.tiers && override.tiers.length > 0) resolved.tiers = override.tiers.map(t => ({ ...t }));
    if (typeof override.multiplier === 'number' && override.multiplier > 0) resolved.multiplier *= override.multiplier;
    if (override.note) resolved.notes = override.note;
  };
  if (dept) applyOverride(overrides.find(o => o.target === 'department' && o.targetId === dept));
  if (personId) applyOverride(overrides.find(o => o.target === 'person' && o.targetId === personId));
  resolved.tiers.sort((a, b) => a.afterHours - b.afterHours);
  return resolved;
}

/** Hours between two call expressions, overnight-safe. 0 when either is blank. */
export function hoursBetween(call?: string, wrap?: string): number {
  const toMin = (raw?: string): number | null => {
    if (!raw) return null;
    const s = raw.trim().toLowerCase();
    const m = /^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/.exec(s);
    if (!m) return null;
    let h = Number(m[1]) % 24;
    const min = Number(m[2]);
    if (min > 59) return null;
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    return h * 60 + min;
  };
  const a = toMin(call);
  const b = toMin(wrap);
  if (a == null || b == null) return 0;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
}

/** 1-based position in the run of consecutive work days ending at `date`. */
export function consecutiveWorkDayNumber(project: Project, date: string): number {
  if (!date) return 1;
  const calendar = project.calendarVersions?.find(v => v.id === project.activeCalendarVersionId) || project.calendarVersions?.[0];
  if (!calendar) return 1;
  const offDates = new Set((calendar.nonShootDates || []).filter(d => !!d.status).map(d => d.date));
  const weeklyOff = new Set(calendar.weeklyDaysOff || []);
  // The run never starts before the production window (prep start / production
  // start) — otherwise a blank calendar's early dates count as consecutive.
  const windowStart = calendar.prepStart || calendar.productionStart || '';
  const isWork = (iso: string) => {
    if (!iso) return false;
    if (offDates.has(iso)) return false;
    const d = new Date(iso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return false;
    // `weeklyDaysOff` is Mon=0..Sun=6; Date#getDay is Sun=0..Sat=6.
    return !weeklyOff.has((d.getDay() + 6) % 7);
  };
  const start = new Date(date + 'T00:00:00');
  if (Number.isNaN(start.getTime()) || !isWork(date)) return 1;
  let count = 1;
  const cursor = new Date(start);
  for (let i = 0; i < 14; i++) {
    cursor.setDate(cursor.getDate() - 1);
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (windowStart && iso < windowStart) break;
    if (!isWork(iso)) break;
    count++;
    if (count >= 7) break;
  }
  return Math.min(7, count);
}

function dayMultiplierFor(policy: ResolvedOvertimePolicy, workDayNumber: number): number {
  if (workDayNumber >= 7) return policy.seventhDayMultiplier;
  if (workDayNumber === 6) return policy.sixthDayMultiplier;
  return 1;
}

/** Overtime hours/cost for one person with a known hourly rate. */
export function computeOvertimeCost({
  hours, policy, hourlyCents, guaranteeHours, personMultiplier = 1, flatRateCents,
}: {
  hours: number;
  policy: ResolvedOvertimePolicy;
  hourlyCents: number;
  guaranteeHours?: number;
  personMultiplier?: number;
  flatRateCents?: number;
}): { paidHours: number; otHours: number; otCostCents: number; dayCostCents: number } {
  const paidHours = Math.max(policy.dailyHours, guaranteeHours ?? 0);
  const otHours = Math.max(0, hours - paidHours);
  const multiplierScale = policy.multiplier * personMultiplier;
  let cost = 0;
  if (hourlyCents > 0 && otHours > 0) {
    let bandStart = paidHours;
    for (let i = 0; i < policy.tiers.length; i++) {
      const tier = policy.tiers[i];
      const next = policy.tiers[i + 1]?.afterHours ?? Infinity;
      const from = Math.max(bandStart, tier.afterHours);
      const to = Math.min(hours, next);
      if (to > from) cost += (to - from) * hourlyCents * tier.multiplier * multiplierScale;
      bandStart = Math.max(bandStart, from);
      if (bandStart >= hours) break;
    }
  }
  const otCostCents = Math.round(cost);
  const dayCostCents = flatRateCents
    ? Math.round(flatRateCents + otCostCents)
    : Math.round((paidHours + otHours) * hourlyCents + otCostCents);
  return { paidHours, otHours, otCostCents, dayCostCents };
}

function personRate(person: CrewPerson | CastMember | undefined): { rateCents?: number; rateUnit: 'hour' | 'day' | 'flat'; guaranteeHours?: number; multiplier?: number } {
  if (!person) return { rateUnit: 'flat' };
  const rateUnit = (person.rateUnit as 'hour' | 'day' | 'flat' | undefined) || (person.rateCents ? 'day' : 'flat');
  return {
    rateCents: person.rateCents && person.rateCents > 0 ? person.rateCents : undefined,
    rateUnit,
    guaranteeHours: person.guaranteeHours,
    multiplier: person.overtime?.multiplier,
  };
}

export function computeDayOvertime(project: Project, day: OvertimeDay): OvertimeDayResult {
  const meta = day.meta || undefined;
  const callTime = meta?.overtime?.actualCall || day.callTime;
  const wrapTime = meta?.overtime?.actualWrap || day.wrap || '';
  const hours = hoursBetween(callTime, wrapTime);
  const workDayNumber = consecutiveWorkDayNumber(project, day.date);

  const crewPeople = new Map<string, CrewPerson>();
  for (const list of Object.values(project.crew || {})) for (const person of list) crewPeople.set(person.id, person);
  const castPeople = new Map(project.castMembers.map(m => [m.id, m]));

  const crew: OvertimeRow[] = day.crew.map(entry => {
    const person = crewPeople.get(entry.personId);
    const policy = resolveOvertimePolicy(project, day, entry.dept, entry.personId, 'crew');
    const rate = personRate(person);
    const dailyHours = policy.dailyHours;
    const hourlyCents = rate.rateUnit === 'hour'
      ? rate.rateCents ?? 0
      : rate.rateUnit === 'day' ? Math.round((rate.rateCents ?? 0) / (dailyHours || 10)) : 0;
    const dm = dayMultiplierFor(policy, workDayNumber);
    const scaled: ResolvedOvertimePolicy = { ...policy, multiplier: policy.multiplier * dm };
    const cost = computeOvertimeCost({
      hours,
      policy: scaled,
      hourlyCents,
      guaranteeHours: rate.guaranteeHours ?? person?.overtime?.guaranteeHours,
      personMultiplier: rate.multiplier,
      flatRateCents: rate.rateUnit === 'flat' ? rate.rateCents : undefined,
    });
    return {
      id: entry.personId,
      name: entry.name,
      role: entry.role,
      department: entry.dept,
      callTime,
      wrapTime,
      hours,
      paidHours: cost.paidHours,
      otHours: cost.otHours,
      rateCents: rate.rateCents,
      rateUnit: rate.rateUnit,
      hourlyCents,
      otCostCents: cost.otCostCents,
      dayCostCents: cost.dayCostCents,
      noRate: !rate.rateCents,
      policy: policy,
    };
  });

  const cast: OvertimeRow[] = day.cast.map(entry => {
    const member = castPeople.get(entry.castId);
    const policy = resolveOvertimePolicy(project, day, undefined, entry.castId, 'cast');
    const rate = personRate(member);
    const dailyHours = policy.dailyHours;
    const hourlyCents = rate.rateUnit === 'hour'
      ? rate.rateCents ?? 0
      : rate.rateUnit === 'day' ? Math.round((rate.rateCents ?? 0) / (dailyHours || 8)) : 0;
    const dm = dayMultiplierFor(policy, workDayNumber);
    const scaled: ResolvedOvertimePolicy = { ...policy, multiplier: policy.multiplier * dm };
    const cost = computeOvertimeCost({
      hours,
      policy: scaled,
      hourlyCents,
      guaranteeHours: rate.guaranteeHours ?? member?.guaranteeHours,
      personMultiplier: rate.multiplier,
      flatRateCents: rate.rateUnit === 'flat' ? rate.rateCents : undefined,
    });
    return {
      id: entry.castId,
      name: entry.name,
      role: member?.performer || 'Cast',
      callTime,
      wrapTime,
      hours,
      paidHours: cost.paidHours,
      otHours: cost.otHours,
      rateCents: rate.rateCents,
      rateUnit: rate.rateUnit,
      hourlyCents,
      otCostCents: cost.otCostCents,
      dayCostCents: cost.dayCostCents,
      noRate: !rate.rateCents,
      policy: policy,
    };
  });

  const deptMap = new Map<string, OvertimeDepartmentRow>();
  for (const row of crew) {
    const dept = row.department || 'Other';
    const hit = deptMap.get(dept) || {
      department: dept,
      hours: 0,
      otHours: 0,
      otCostCents: 0,
      policy: resolveOvertimePolicy(project, day, dept, undefined, 'crew'),
    };
    hit.hours += row.hours;
    hit.otHours += row.otHours;
    hit.otCostCents += row.otCostCents;
    deptMap.set(dept, hit);
  }

  const crewCost = crew.reduce((s, r) => s + r.otCostCents, 0);
  const castCost = cast.reduce((s, r) => s + r.otCostCents, 0);
  const crewHours = crew.reduce((s, r) => s + r.hours, 0);
  const castHours = cast.reduce((s, r) => s + r.hours, 0);
  const crewOt = crew.reduce((s, r) => s + r.otHours, 0);
  const castOt = cast.reduce((s, r) => s + r.otHours, 0);
  const dayMultiplier = dayMultiplierFor(basePolicy(project, 'crew'), workDayNumber);

  return {
    sectionIndex: day.sectionIndex,
    chronoDay: day.chronoDay,
    date: day.date,
    callTime,
    wrapTime,
    hours,
    crew,
    cast,
    departments: [...deptMap.values()].sort((a, b) => a.department.localeCompare(b.department)),
    crewHours,
    crewOtHours: crewOt,
    crewCostCents: crewCost,
    castHours,
    castOtHours: castOt,
    castCostCents: castCost,
    totalHours: crewHours + castHours,
    totalOtHours: crewOt + castOt,
    totalCostCents: crewCost + castCost,
    noRate: [...crew, ...cast].filter(r => r.noRate).map(r => r.name),
    workDayNumber,
    dayMultiplier,
  };
}

/** The overtime costs to post, as actual payroll expenses (one batch). */
export function overtimeExpensesForDay(project: Project, day: OvertimeDay, result: OvertimeDayResult): Partial<Expense>[] {
  void project;
  const rows = [...result.crew, ...result.cast].filter(r => r.otCostCents > 0);
  return rows.map(r => ({
    date: day.date,
    description: `Overtime — ${r.name}`,
    amountCents: r.otCostCents,
    method: 'payroll' as const,
    status: 'actual' as const,
    vendor: undefined,
    notes: `${r.otHours.toFixed(r.otHours % 1 === 0 ? 0 : 1)}h OT · ${r.role}`,
    dayDate: day.date,
    dayNumber: day.chronoDay,
  }));
}

/** Build the engine input from a Day Manager `DayView` (structurally typed). */
export function overtimeDayFromView(project: Project, day: {
  sectionIndex: number;
  chronoDay: number;
  date: string;
  callTime: string;
  wrap?: string;
  crew: { person: { id: string; name: string }; role: string; dept: string; resolvedCall?: string }[];
  cast: { key: string; name: string }[];
  meta?: DayMeta | null;
}): OvertimeDay {
  return {
    sectionIndex: day.sectionIndex,
    chronoDay: day.chronoDay,
    date: day.date,
    callTime: day.callTime,
    wrap: day.wrap,
    crew: day.crew.map(entry => ({
      personId: entry.person.id,
      name: entry.person.name,
      roleKey: entry.role,
      role: roleLabelOf(project, entry.role),
      dept: entry.dept,
      callTime: entry.resolvedCall,
    })),
    cast: day.cast.map(entry => ({ castId: entry.key, name: entry.name })),
    meta: day.meta,
  };
}
