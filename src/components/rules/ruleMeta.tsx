import React from 'react';
import { ProjectRule } from '../../types';
import { formatRuleDateShort } from '../../lib/utils';
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
  },
};

export const RULE_TYPES: RuleType[] = ['MAX_HOURS', 'DATE_RESTRICTION', 'TIME_WINDOW', 'CAST_CONFLICT', 'CAST_SCENE_FLAG'];

function describeTimeWindow(r: Extract<ProjectRule, { type: 'TIME_WINDOW' }>): string {
  const ws = r.windowStart || '00:00';
  const we = r.windowEnd || '23:59';
  const fullDay = ws === '00:00' && we === '23:59';
  if (fullDay) return 'all day';
  if (r.windowStart && r.windowEnd) return `${r.windowStart} – ${r.windowEnd}`;
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
    if (rule.dates.length === 0) return `Unavailable · no dates set`;
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
  if (rule.dates.length === 0) return `Only ${t} · every day`;
  if (rule.dates.length === 1) return `Only ${t} · ${formatRuleDateShort(rule.dates[0])}`;
  return `Only ${t} · ${rule.dates.length} dates`;
}

export const RuleTypeIcon: React.FC<{ type: RuleType; className?: string }> = ({ type, className }) => {
  const Icon = RULE_TYPE_META[type].icon;
  return <Icon className={className} />;
};

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
      dates: [...rule.dates],
      datesMode: rule.dates.length > 0 ? 'specific' : 'all',
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
