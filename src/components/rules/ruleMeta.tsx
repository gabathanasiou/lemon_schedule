import React from 'react';
import { ProjectRule } from '../../types';
import { formatRuleDateShort } from '../../lib/utils';
import { Clock, CalendarX2, Timer } from 'lucide-react';

export type RuleType = 'MAX_HOURS' | 'DATE_RESTRICTION' | 'TIME_WINDOW';

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
};

export const RULE_TYPES: RuleType[] = ['MAX_HOURS', 'DATE_RESTRICTION', 'TIME_WINDOW'];

function describeTimeWindow(r: Extract<ProjectRule, { type: 'TIME_WINDOW' }>): string {
  const ws = r.windowStart || '00:00';
  const we = r.windowEnd || '23:59';
  const fullDay = ws === '00:00' && we === '23:59';
  if (fullDay) return 'all day';
  if (r.windowStart && r.windowEnd) return `${r.windowStart} – ${r.windowEnd}`;
  if (r.windowStart) return `after ${r.windowStart}`;
  return `before ${r.windowEnd}`;
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
    return `Unavailable · ${formatRuleDateShort(rule.date)}`;
  }
  const t = describeTimeWindow(rule);
  return rule.date ? `Only ${t} · ${formatRuleDateShort(rule.date)}` : `Only ${t} · every day`;
}

export const RuleTypeIcon: React.FC<{ type: RuleType; className?: string }> = ({ type, className }) => {
  const Icon = RULE_TYPE_META[type].icon;
  return <Icon className={className} />;
};

export interface RuleFormState {
  type: RuleType;
  castId: string;
  maxHours: string;
  dates: string[];
  dateInput: string;
  date: string;
  windowMode: 'range' | 'after' | 'before' | 'allday';
  windowStart: string;
  windowEnd: string;
}

export const blankRuleForm = (): RuleFormState => ({
  type: 'MAX_HOURS',
  castId: '',
  maxHours: '8',
  dates: [],
  dateInput: '',
  date: '',
  windowMode: 'range',
  windowStart: '09:00',
  windowEnd: '17:00',
});

export const formFromRule = (rule: ProjectRule): RuleFormState => {
  if (rule.type === 'MAX_HOURS') {
    return {
      type: 'MAX_HOURS',
      castId: rule.castId,
      maxHours: String(rule.maxHours),
      dates: rule.dates ? [...rule.dates] : [],
      dateInput: '',
      date: '',
      windowMode: 'range',
      windowStart: '09:00',
      windowEnd: '17:00',
    };
  }
  if (rule.type === 'DATE_RESTRICTION') {
    return {
      type: 'DATE_RESTRICTION',
      castId: rule.castId,
      maxHours: '8',
      dates: [],
      dateInput: '',
      date: rule.date,
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
    maxHours: '8',
    dates: [],
    dateInput: '',
    date: rule.date || '',
    windowMode,
    windowStart: ws || '09:00',
    windowEnd: we || '17:00',
  };
};
