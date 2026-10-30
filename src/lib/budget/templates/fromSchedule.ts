import type { Budget, BudgetLine, Project } from '../../../types';
import { makeBudgetLine } from '../model';
import { computeScheduleQuantities, scheduleQtyFor } from '../scheduleSync';
import { featureBudget } from './index';

/**
 * "From schedule" budget creation (`docs/BUDGETING-SURFACES.md` §9). Pure: the
 * caller previews the counts, then commits the returned Budget through
 * `IMPORT_BUDGET` (one undo entry). The reducer never derives schedule data.
 *
 * Generated lines carry `source` and no quantity override, so they stay live:
 * move a scene or mark a hold day and the linked line follows. Rates start at
 * zero — the schedule knows days, not money.
 */

export interface ScheduleBudgetPreview {
  shootDays: number;
  crewLines: number;
  castLines: number;
  locationLines: number;
  totalLines: number;
}

export function previewBudgetFromSchedule(project: Project): ScheduleBudgetPreview {
  const q = computeScheduleQuantities(project);
  const crewLines = Object.values(q.crewPersonDays).filter(n => n > 0).length;
  const castLines = Object.values(q.castDays).filter(n => n > 0).length;
  const locationLines = Object.values(q.locationDays).filter(n => n > 0).length;
  return {
    shootDays: q.shootDays,
    crewLines,
    castLines,
    locationLines,
    totalLines: crewLines + castLines + locationLines + (q.shootDays > 0 ? 1 : 0),
  };
}

function accountByNumber(budget: Budget, number: string): string {
  return budget.accounts.find(a => a.number === number)?.id || '';
}

export function buildBudgetFromSchedule(project: Project): Budget {
  const budget = featureBudget();
  const q = computeScheduleQuantities(project);
  const version = budget.versions[0];
  const lines: BudgetLine[] = [];
  let sort = 0;

  const push = (accountNumber: string, base: Omit<BudgetLine, 'id' | 'accountId' | 'sort'>) => {
    lines.push(makeBudgetLine({ ...base, accountId: accountByNumber(budget, accountNumber), sort: sort++ }));
  };

  // Production days: the set-operations day rate is the classic per-day line.
  if (q.shootDays > 0) {
    push('2400', {
      description: 'Production days — set operations',
      kind: 'rental',
      qty: q.shootDays,
      unit: 'unit-day',
      rateCents: 0,
      multiplier: 1,
      source: { kind: 'shootDays' },
    });
  }

  // Crew: one line per person who actually works a production day.
  const personName = (roleKey: string, personId: string) => {
    const role = project.crewRoles?.find(r => r.key === roleKey);
    const person = (project.crew?.[roleKey] || []).find(p => p.id === personId);
    return `${role?.label || roleKey} — ${person?.name || personId}`;
  };
  for (const role of project.crewRoles || []) {
    for (const person of project.crew?.[role.key] || []) {
      const days = q.crewPersonDays[`${role.key}\u0000${person.id}`] || 0;
      if (days <= 0) continue;
      push('2100', {
        description: personName(role.key, person.id),
        kind: 'labor',
        qty: days,
        unit: 'unit-day',
        rateCents: 0,
        multiplier: 1,
        phase: 'shoot',
        source: { kind: 'crewRole', roleKey: role.key, personId: person.id },
      });
    }
  }

  // Cast: one line per working member (Board ID kept in the description).
  for (const member of project.castMembers || []) {
    const days = q.castDays[member.id] || 0;
    if (days <= 0) continue;
    push('1400', {
      description: `${member.id}. ${member.name}`,
      kind: 'labor',
      qty: days,
      unit: 'unit-day',
      rateCents: 0,
      multiplier: 1,
      phase: 'shoot',
      source: { kind: 'cast', castId: member.id },
    });
  }

  // Locations that the schedule actually uses.
  for (const location of project.locations || []) {
    const days = q.locationDays[location.id] || 0;
    if (days <= 0) continue;
    push('3200', {
      description: location.name,
      kind: 'rental',
      qty: days,
      unit: 'unit-day',
      rateCents: 0,
      multiplier: 1,
      phase: 'shoot',
      locationId: location.id,
      source: { kind: 'location', locationId: location.id },
    });
  }

  version.lines = lines;
  budget.settings.templateKey = 'schedule';
  budget.updatedAt = Date.now();
  // Sanity: the engine resolves every generated quantity the same way.
  for (const line of lines) {
    if (line.source && scheduleQtyFor(line.source, q) !== line.qty) line.qty = scheduleQtyFor(line.source, q);
  }
  return budget;
}
