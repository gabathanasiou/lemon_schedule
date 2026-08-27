import React from 'react';
import { ProjectRule } from '../../types';
import { formatRuleDateShort, generateUUID } from '../../lib/utils';
import { formatCastId, formatCastIds, timeWindowLabel } from '../../lib/violationMessages';
import { Clock, CalendarX2, Timer, Ban, Bell } from 'lucide-react';

export type RuleType = 'MAX_HOURS' | 'DATE_RESTRICTION' | 'TIME_WINDOW' | 'CAST_CONFLICT' | 'CAST_SCENE_FLAG';

export interface RuleTypeMeta {
  label: string;
  short: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  ring: string;
  bg: string;
  border: string;
  text: string;
  badge: string;
  /** Dark RuleEditorPanel type-chip: selected state + always-on icon color. */
  chip: string;
  chipIcon: string;
}

export function getRuleGroupKey(rule: ProjectRule): string {
  if (rule.type === 'MAX_HOURS' || rule.type === 'DATE_RESTRICTION' || rule.type === 'TIME_WINDOW') return rule.castId;
  if (rule.type === 'CAST_CONFLICT') {
    const all = [...rule.castIds, ...rule.conflictCastIds];
    return all.length > 0 ? all[0] : 'Other';
  }
  if (rule.type === 'CAST_SCENE_FLAG') {
    return rule.castIds.length > 0 ? rule.castIds[0] : 'Other';
  }
  return 'Other';
}

export function getRuleSearchText(rule: ProjectRule): string {
  if (rule.type === 'MAX_HOURS' || rule.type === 'DATE_RESTRICTION' || rule.type === 'TIME_WINDOW') return rule.castId;
  if (rule.type === 'CAST_CONFLICT') return [...rule.castIds, ...rule.conflictCastIds].join(' ');
  if (rule.type === 'CAST_SCENE_FLAG') return rule.castIds.join(' ');
  return '';
}

export const RULE_TYPE_META: Record<RuleType, RuleTypeMeta> = {
  MAX_HOURS: {
    label: 'Max Hours',
    short: 'Max',
    description: 'Limit how long a cast member can work in a single day.',
    icon: Clock,
    ring: 'ring-sky-500',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-700',
    badge: 'bg-sky-100 text-sky-700',
    chip: 'bg-sky-950 border-sky-700 text-sky-200',
    chipIcon: 'text-sky-400',
  },
  DATE_RESTRICTION: {
    label: 'Date Restriction',
    short: 'Date',
    description: 'Block a cast member from working on specific dates.',
    icon: CalendarX2,
    ring: 'ring-rose-500',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-700',
    badge: 'bg-rose-100 text-rose-700',
    chip: 'bg-rose-950 border-rose-700 text-rose-200',
    chipIcon: 'text-rose-400',
  },
  TIME_WINDOW: {
    label: 'Time Window',
    short: 'Window',
    description: 'Restrict a cast member to working only during specific hours.',
    icon: Timer,
    ring: 'ring-amber-500',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
    chip: 'bg-amber-950 border-amber-700 text-amber-200',
    chipIcon: 'text-amber-400',
  },
  CAST_CONFLICT: {
    label: 'Cast Conflict',
    short: 'Conflict',
    description: 'Flag when two groups of cast are scheduled on the same day.',
    icon: Ban,
    ring: 'ring-violet-500',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    text: 'text-violet-700',
    badge: 'bg-violet-100 text-violet-700',
    chip: 'bg-violet-950 border-violet-700 text-violet-200',
    chipIcon: 'text-violet-400',
  },
  CAST_SCENE_FLAG: {
    label: 'Cast Scene Flag',
    short: 'Flag',
    description: 'Flag scenes that include specific cast members.',
    icon: Bell,
    ring: 'ring-emerald-500',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-700',
    chip: 'bg-emerald-950 border-emerald-700 text-emerald-200',
    chipIcon: 'text-emerald-400',
  },
};

export const RULE_TYPES: RuleType[] = ['MAX_HOURS', 'DATE_RESTRICTION', 'TIME_WINDOW', 'CAST_CONFLICT', 'CAST_SCENE_FLAG'];

function describeTimeWindow(r: Extract<ProjectRule, { type: 'TIME_WINDOW' }>): string {
  const ws = r.windowStart || '00:00';
  const we = r.windowEnd || '23:59';
  const fullDay = ws === '00:00' && we === '23:59';
  if (fullDay) return 'all day';
  if (r.windowStart && r.windowEnd) return `${r.windowStart} - ${r.windowEnd}`;
  if (r.windowStart) return `after ${r.windowStart}`;
  return `before ${r.windowEnd}`;
}

function joinNames(names: string[], max = 3): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max} more`;
}

export function describeRule(rule: ProjectRule): string {
  if (rule.type === 'MAX_HOURS') {
    if (rule.dates && rule.dates.length > 0) {
      if (rule.dates.length === 1) return `Max ${rule.maxHours}h · ${formatRuleDateShort(rule.dates[0])}`;
      return `Max ${rule.maxHours}h · ${rule.dates.length} dates`;
    }
    return `Max ${rule.maxHours}h · every day`;
  }
  if (rule.type === 'DATE_RESTRICTION') {
    if (!rule.dates?.length) return `Unavailable · no dates set`;
    if (rule.dates.length === 1) return `Unavailable · ${formatRuleDateShort(rule.dates[0])}`;
    return `Unavailable · ${rule.dates.length} dates`;
  }
  if (rule.type === 'CAST_CONFLICT') {
    return `Conflict: ${joinNames(rule.castIds)} vs ${joinNames(rule.conflictCastIds)}`;
  }
  if (rule.type === 'CAST_SCENE_FLAG') {
    return `Flag when ${joinNames(rule.castIds)} appear`;
  }
  const t = describeTimeWindow(rule);
  if (!rule.dates?.length) return `Only ${t} · every day`;
  if (rule.dates.length === 1) return `Only ${t} · ${formatRuleDateShort(rule.dates[0])}`;
  return `Only ${t} · ${rule.dates.length} dates`;
}

export const RuleTypeIcon: React.FC<{ type: RuleType; className?: string }> = ({ type, className }) => {
  const Icon = RULE_TYPE_META[type].icon;
  return <Icon className={className} />;
};

/** Cast-aware rule description for cards ("1. FISHERMAN: max 8h" + extra-date
 *  scope) — the shared text for RuleCard in both the Rules tab and the day
 *  modal. `describeRule` stays the compact chip text. */
export function describeRuleDetailed(rule: ProjectRule, castMembers: Array<{ id: string; name: string }>): string {
  const scope = (dates?: string[]) => {
    if (!dates || dates.length <= 1) return '';
    return ` · also ${dates.length - 1} more date${dates.length === 2 ? '' : 's'}`;
  };
  switch (rule.type) {
    case 'MAX_HOURS':
      return `${formatCastId(rule.castId, castMembers)}: max ${rule.maxHours}h${scope(rule.dates)}`;
    case 'DATE_RESTRICTION':
      return `${formatCastId(rule.castId, castMembers)}: unavailable${scope(rule.dates)}`;
    case 'TIME_WINDOW':
      return `${formatCastId(rule.castId, castMembers)}: only ${timeWindowLabel(rule.windowStart, rule.windowEnd)}${scope(rule.dates)}`;
    case 'CAST_CONFLICT':
      return `${formatCastIds(rule.castIds, castMembers)} vs ${formatCastIds(rule.conflictCastIds, castMembers)}`;
    default:
      return `flag when ${formatCastIds(rule.castIds, castMembers)} appear`;
  }
}

export interface RuleFormState {
  type: RuleType;
  castId: string;
  castIds: string[];
  conflictCastIds: string[];
  maxHours: string;
  dates: string[];
  datesMode: 'all' | 'specific';
  windowMode: 'range' | 'after' | 'before' | 'allday';
  windowStart: string;
  windowEnd: string;
}

export const blankRuleForm = (): RuleFormState => ({
  type: 'MAX_HOURS',
  castId: '',
  castIds: [],
  conflictCastIds: [],
  maxHours: '8',
  dates: [],
  datesMode: 'all',
  windowMode: 'range',
  windowStart: '09:00',
  windowEnd: '17:00',
});

export const formFromRule = (rule: ProjectRule): RuleFormState => {
  if (rule.type === 'MAX_HOURS') {
    return {
      type: 'MAX_HOURS',
      castId: rule.castId,
      castIds: [rule.castId],
      conflictCastIds: [],
      maxHours: String(rule.maxHours),
      dates: rule.dates ? [...rule.dates] : [],
      datesMode: rule.dates && rule.dates.length > 0 ? 'specific' : 'all',
      windowMode: 'range',
      windowStart: '09:00',
      windowEnd: '17:00',
    };
  }
  if (rule.type === 'DATE_RESTRICTION') {
    return {
      type: 'DATE_RESTRICTION',
      castId: rule.castId,
      castIds: [rule.castId],
      conflictCastIds: [],
      maxHours: '8',
      dates: rule.dates ? [...rule.dates] : [],
      datesMode: rule.dates?.length ? 'specific' : 'all',
      windowMode: 'range',
      windowStart: '09:00',
      windowEnd: '17:00',
    };
  }
  if (rule.type === 'CAST_CONFLICT') {
    return {
      type: 'CAST_CONFLICT',
      castId: '',
      castIds: [...rule.castIds],
      conflictCastIds: [...rule.conflictCastIds],
      maxHours: '8',
      dates: [],
      datesMode: 'all',
      windowMode: 'range',
      windowStart: '09:00',
      windowEnd: '17:00',
    };
  }
  if (rule.type === 'CAST_SCENE_FLAG') {
    return {
      type: 'CAST_SCENE_FLAG',
      castId: '',
      castIds: [...rule.castIds],
      conflictCastIds: [],
      maxHours: '8',
      dates: [],
      datesMode: 'all',
      windowMode: 'range',
      windowStart: '09:00',
      windowEnd: '17:00',
    };
  }
  const ws = rule.windowStart || '';
  const we = rule.windowEnd || '';
  let windowMode: RuleFormState['windowMode'] = 'allday';
  if (ws && we) windowMode = 'range';
  else if (ws) windowMode = 'after';
  else if (we) windowMode = 'before';
  return {
    type: 'TIME_WINDOW',
    castId: rule.castId,
    castIds: [rule.castId],
    conflictCastIds: [],
    maxHours: '8',
    dates: rule.dates ? [...rule.dates] : [],
    datesMode: rule.dates && rule.dates.length > 0 ? 'specific' : 'all',
    windowMode,
    windowStart: ws || '09:00',
    windowEnd: we || '17:00',
  };
};

/* ------------------------------------------------------------------ */
/* Form → rule building (shared by the RulesTab modal and the events  */
/* day modal's inline editor — one source of truth)                    */
/* ------------------------------------------------------------------ */

/** Returns an error message or null when the form is valid. */
export function validateRuleForm(form: RuleFormState): string | null {
  if (form.castIds.length === 0) return 'Select at least one cast member';
  if (form.type === 'DATE_RESTRICTION' && form.dates.length === 0) return 'At least one date is required';
  if (form.type === 'CAST_CONFLICT') {
    if (form.castIds.length === 0 || form.conflictCastIds.length === 0) return 'Both groups must have at least one cast member';
  }
  if (form.type === 'CAST_SCENE_FLAG' && form.castIds.length === 0) return 'Select at least one cast member';
  if (form.type === 'MAX_HOURS') {
    const h = parseFloat(form.maxHours);
    if (isNaN(h) || h <= 0) return 'Max hours must be a positive number';
  }
  return null;
}

/** Builds the ProjectRule[] a form saves (multi-cast expansion for single
 *  rules; `initial` keeps its id on the first expanded rule). */
export function buildRulesFromForm(form: RuleFormState, initial: ProjectRule | null): ProjectRule[] {
  const id = initial?.id || generateUUID();
  const saveSingle = (castId: string, ruleId: string): ProjectRule => {
    if (form.type === 'MAX_HOURS') {
      const h = parseFloat(form.maxHours);
      return { id: ruleId, type: 'MAX_HOURS', castId, maxHours: h, dates: form.dates.length > 0 ? form.dates : undefined };
    }
    if (form.type === 'DATE_RESTRICTION') {
      return { id: ruleId, type: 'DATE_RESTRICTION', castId, dates: [...form.dates] };
    }
    const base: any = { id: ruleId, type: 'TIME_WINDOW', castId, dates: [...form.dates] };
    if (form.windowMode === 'range') {
      if (form.windowStart) base.windowStart = form.windowStart;
      if (form.windowEnd) base.windowEnd = form.windowEnd;
    } else if (form.windowMode === 'after') {
      if (form.windowStart) base.windowStart = form.windowStart;
    } else if (form.windowMode === 'before') {
      if (form.windowEnd) base.windowEnd = form.windowEnd;
    }
    return base;
  };

  if (form.type === 'CAST_CONFLICT') {
    return [{ id, type: 'CAST_CONFLICT', castIds: [...form.castIds], conflictCastIds: [...form.conflictCastIds] }];
  }
  if (form.type === 'CAST_SCENE_FLAG') {
    return [{ id, type: 'CAST_SCENE_FLAG', castIds: [...form.castIds] }];
  }
  if (initial) {
    const result: ProjectRule[] = [saveSingle(form.castIds[0].trim(), initial.id)];
    for (let i = 1; i < form.castIds.length; i++) result.push(saveSingle(form.castIds[i].trim(), generateUUID()));
    return result;
  }
  return form.castIds.map(cid => saveSingle(cid.trim(), generateUUID()));
}
