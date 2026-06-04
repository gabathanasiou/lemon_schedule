import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useProject } from '../store';
import { ProjectRule, Scene } from '../types';
import { generateUUID, getUniqueCastIds, formatRuleDate, formatRuleDateShort, cn } from '../lib/utils';
import { checkAllDays } from '../lib/rulesEngine';
import {
  Plus, Trash2, X, Search, Clock, CalendarX2, Timer, ChevronDown, ChevronRight,
  AlertCircle, Pencil, Clock4, Sun, Info
} from 'lucide-react';

type RuleType = 'MAX_HOURS' | 'DATE_RESTRICTION' | 'TIME_WINDOW';

const RULE_TYPE_META: Record<RuleType, {
  label: string;
  short: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  ring: string;
  bg: string;
  border: string;
  text: string;
  badge: string;
}> = {
  MAX_HOURS: {
    label: 'Max Hours',
    short: 'Max',
    description: 'Limit how long a cast member can work in a single day.',
    icon: Clock,
    color: 'sky',
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
    color: 'rose',
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
    color: 'amber',
    ring: 'ring-amber-500',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
  },
};

function describeTimeWindow(r: Extract<ProjectRule, { type: 'TIME_WINDOW' }>): string {
  const ws = r.windowStart || '00:00';
  const we = r.windowEnd || '23:59';
  const fullDay = ws === '00:00' && we === '23:59';
  if (fullDay) return 'all day';
  if (r.windowStart && r.windowEnd) return `${ws} – ${we}`;
  if (r.windowStart) return `after ${ws}`;
  return `before ${we}`;
}

function describeRule(rule: ProjectRule): string {
  if (rule.type === 'MAX_HOURS') {
    if (rule.dates && rule.dates.length > 0) {
      if (rule.dates.length === 1) return `Max ${rule.maxHours}h · ${formatRuleDateShort(rule.dates[0])}`;
      if (rule.dates.length === 2) return `Max ${rule.maxHours}h · ${rule.dates.length} dates`;
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

const RuleTypeIcon: React.FC<{ type: RuleType; className?: string }> = ({ type, className }) => {
  const Icon = RULE_TYPE_META[type].icon;
  return <Icon className={className} />;
};

interface RuleFormState {
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

const blankForm = (): RuleFormState => ({
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

const formFromRule = (rule: ProjectRule): RuleFormState => {
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

const RuleFormModal: React.FC<{
  open: boolean;
  initial: ProjectRule | null;
  scenes: Scene[];
  onClose: () => void;
  onSave: (rule: ProjectRule) => void;
}> = ({ open, initial, scenes, onClose, onSave }) => {
  const [form, setForm] = useState<RuleFormState>(blankForm());
  const [error, setError] = useState('');
  const [castQuery, setCastQuery] = useState('');
  const [castOpen, setCastOpen] = useState(false);
  const castRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      if (initial) {
        const f = formFromRule(initial);
        setForm(f);
        setCastQuery(f.castId);
      } else {
        setForm(blankForm());
        setCastQuery('');
      }
      setError('');
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!castOpen) return;
    const onClick = (e: MouseEvent) => {
      if (castRef.current && !castRef.current.contains(e.target as Node)) setCastOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [castOpen]);

  if (!open) return null;

  const castOptions = getUniqueCastIds(scenes);
  const filteredCast = castOptions.filter(c =>
    c.toLowerCase().includes(castQuery.toLowerCase())
  );

  const setType = (t: RuleType) => setForm(f => ({ ...f, type: t }));

  const addDateChip = () => {
    if (!form.dateInput) return;
    if (!form.dates.includes(form.dateInput)) {
      setForm(f => ({ ...f, dates: [...f.dates, f.dateInput].sort() }));
    }
    setForm(f => ({ ...f, dateInput: '' }));
  };

  const removeDateChip = (d: string) => {
    setForm(f => ({ ...f, dates: f.dates.filter(x => x !== d) }));
  };

  const handleSave = () => {
    if (!form.castId.trim()) {
      setError('Cast ID is required');
      return;
    }
    if (form.type === 'DATE_RESTRICTION' && !form.date) {
      setError('Date is required');
      return;
    }
    setError('');

    let rule: ProjectRule;
    const id = initial?.id || generateUUID();
    if (form.type === 'MAX_HOURS') {
      const h = parseFloat(form.maxHours);
      if (isNaN(h) || h <= 0) {
        setError('Max hours must be a positive number');
        return;
      }
      rule = {
        id, type: 'MAX_HOURS', castId: form.castId.trim(), maxHours: h,
        dates: form.dates.length > 0 ? form.dates : undefined,
      };
    } else if (form.type === 'TIME_WINDOW') {
      const base: any = {
        id, type: 'TIME_WINDOW', castId: form.castId.trim(),
      };
      if (form.date) base.date = form.date;
      if (form.windowMode === 'allday') {
        // omit both
      } else if (form.windowMode === 'range') {
        if (form.windowStart) base.windowStart = form.windowStart;
        if (form.windowEnd) base.windowEnd = form.windowEnd;
      } else if (form.windowMode === 'after') {
        if (form.windowStart) base.windowStart = form.windowStart;
      } else if (form.windowMode === 'before') {
        if (form.windowEnd) base.windowEnd = form.windowEnd;
      }
      rule = base;
    } else {
      rule = {
        id, type: 'DATE_RESTRICTION', castId: form.castId.trim(), date: form.date,
      };
    }
    onSave(rule);
  };

  const meta = RULE_TYPE_META[form.type];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <div>
            <h2 className="text-zinc-900 font-bold text-base">
              {initial ? 'Edit Rule' : 'New Rule'}
            </h2>
            <p className="text-zinc-500 text-xs mt-0.5">
              {initial ? 'Update this rule\'s parameters.' : 'Add a rule to flag cast violations.'}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Type selector */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
              Rule Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(RULE_TYPE_META) as RuleType[]).map(t => {
                const m = RULE_TYPE_META[t];
                const Icon = m.icon;
                const selected = form.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      'text-left p-3 rounded-lg border-2 transition-all',
                      selected
                        ? `${m.border} ${m.bg} ring-1 ${m.ring}`
                        : 'border-zinc-200 hover:border-zinc-300 bg-white'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={cn('w-4 h-4', selected ? m.text : 'text-zinc-400')} />
                      <span className={cn(
                        'text-xs font-bold',
                        selected ? m.text : 'text-zinc-700'
                      )}>
                        {m.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-snug">
                      {m.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cast ID */}
          <div ref={castRef} className="relative">
            <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
              Cast ID
            </label>
            <input
              value={castQuery}
              onChange={e => { setCastQuery(e.target.value); setForm(f => ({ ...f, castId: e.target.value })); setCastOpen(true); }}
              onFocus={() => setCastOpen(true)}
              placeholder="e.g. 1, JOHN, SARAH"
              className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900"
              autoFocus
            />
            {castOpen && filteredCast.length > 0 && (
              <div className="absolute z-10 top-full mt-1 w-full bg-white border border-zinc-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                {filteredCast.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setCastQuery(c); setForm(f => ({ ...f, castId: c })); setCastOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 font-mono flex items-center justify-between"
                  >
                    <span>{c}</span>
                    <span className="text-[10px] text-zinc-400">
                      {scenes.filter(s => s.cast.split(',').map(x => x.trim()).includes(c)).length} scenes
                    </span>
                  </button>
                ))}
              </div>
            )}
            {castOptions.length === 0 && (
              <p className="text-[10px] text-amber-600 mt-1.5 flex items-center gap-1">
                <Info className="w-3 h-3" />
                No cast found in your scenes yet. Type a custom ID.
              </p>
            )}
          </div>

          {/* Type-specific fields */}
          {form.type === 'MAX_HOURS' && (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
                  Max Hours per Day
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={form.maxHours}
                    onChange={e => setForm(f => ({ ...f, maxHours: e.target.value }))}
                    className="w-24 border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                  <span className="text-sm text-zinc-500">hours</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
                  Apply To
                </label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="applyMode"
                      checked={form.dates.length === 0}
                      onChange={() => setForm(f => ({ ...f, dates: [] }))}
                      className="accent-zinc-900"
                    />
                    All days
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="applyMode"
                      checked={form.dates.length > 0}
                      onChange={() => {}}
                      className="accent-zinc-900"
                    />
                    Specific dates
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={form.dateInput}
                    onChange={e => setForm(f => ({ ...f, dateInput: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDateChip(); } }}
                    className="border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={addDateChip}
                    className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>
                {form.dates.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {form.dates.map(d => (
                      <span key={d} className="inline-flex items-center gap-1 bg-sky-50 border border-sky-200 text-sky-800 rounded-md px-2 py-1 text-xs font-medium">
                        {formatRuleDateShort(d)}
                        <button type="button" onClick={() => removeDateChip(d)} className="hover:text-sky-900">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {form.type === 'DATE_RESTRICTION' && (
            <div>
              <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
                Unavailable On
              </label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {form.date && (
                <p className="text-[10px] text-zinc-500 mt-1.5">
                  {formatRuleDate(form.date)}
                </p>
              )}
            </div>
          )}

          {form.type === 'TIME_WINDOW' && (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
                  Apply To Date
                </label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="dateMode"
                      checked={!form.date}
                      onChange={() => setForm(f => ({ ...f, date: '' }))}
                      className="accent-zinc-900"
                    />
                    Every day
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="dateMode"
                      checked={!!form.date}
                      onChange={() => {
                        if (!form.date) {
                          const today = new Date().toISOString().slice(0, 10);
                          setForm(f => ({ ...f, date: today }));
                        }
                      }}
                      className="accent-zinc-900"
                    />
                    Specific date
                  </label>
                </div>
                {form.date && (
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                )}
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
                  Working Hours
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, windowMode: 'range' }))}
                    className={cn(
                      'px-3 py-2 rounded-md text-xs font-medium border-2',
                      form.windowMode === 'range'
                        ? 'border-amber-400 bg-amber-50 text-amber-800'
                        : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
                    )}
                  >
                    Between A and B
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, windowMode: 'after' }))}
                    className={cn(
                      'px-3 py-2 rounded-md text-xs font-medium border-2',
                      form.windowMode === 'after'
                        ? 'border-amber-400 bg-amber-50 text-amber-800'
                        : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
                    )}
                  >
                    After A
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, windowMode: 'before' }))}
                    className={cn(
                      'px-3 py-2 rounded-md text-xs font-medium border-2',
                      form.windowMode === 'before'
                        ? 'border-amber-400 bg-amber-50 text-amber-800'
                        : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
                    )}
                  >
                    Before B
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, windowMode: 'allday' }))}
                    className={cn(
                      'px-3 py-2 rounded-md text-xs font-medium border-2',
                      form.windowMode === 'allday'
                        ? 'border-amber-400 bg-amber-50 text-amber-800'
                        : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
                    )}
                  >
                    All Day
                  </button>
                </div>
                {form.windowMode === 'range' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={form.windowStart}
                      onChange={e => setForm(f => ({ ...f, windowStart: e.target.value }))}
                      className="flex-1 border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                    <span className="text-zinc-400 text-sm">to</span>
                    <input
                      type="time"
                      value={form.windowEnd}
                      onChange={e => setForm(f => ({ ...f, windowEnd: e.target.value }))}
                      className="flex-1 border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                )}
                {form.windowMode === 'after' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-16">From</span>
                    <input
                      type="time"
                      value={form.windowStart}
                      onChange={e => setForm(f => ({ ...f, windowStart: e.target.value }))}
                      className="flex-1 border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                )}
                {form.windowMode === 'before' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-16">Until</span>
                    <input
                      type="time"
                      value={form.windowEnd}
                      onChange={e => setForm(f => ({ ...f, windowEnd: e.target.value }))}
                      className="flex-1 border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                )}
                {form.windowMode === 'allday' && (
                  <p className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2">
                    Cast member is available the entire day. No time restrictions.
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-rose-600 text-xs bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
          >
            {initial ? 'Save Changes' : 'Add Rule'}
          </button>
        </div>
      </div>
    </div>
  );
};

const RuleCard: React.FC<{
  rule: ProjectRule;
  violationCount: number;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ rule, violationCount, onEdit, onDelete }) => {
  const meta = RULE_TYPE_META[rule.type];
  const Icon = meta.icon;

  return (
    <div className={cn(
      'group bg-white border rounded-lg p-3 flex items-center gap-3 transition-all hover:shadow-sm',
      meta.border
    )}>
      <div className={cn('w-9 h-9 rounded-md flex items-center justify-center shrink-0', meta.bg)}>
        <Icon className={cn('w-4 h-4', meta.text)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded', meta.badge)}>
            {meta.short}
          </span>
          <span className="text-sm text-zinc-900 font-medium truncate">
            {describeRule(rule)}
          </span>
          {violationCount > 0 && (
            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 flex items-center gap-1 shrink-0">
              <AlertCircle className="w-2.5 h-2.5" />
              {violationCount} {violationCount === 1 ? 'violation' : 'violations'}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          title="Edit rule"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
          title="Delete rule"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const RulesTab: React.FC = () => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const rules = project.rules || [];
  const scenes = project.scenes;

  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<ProjectRule | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<RuleType | 'ALL'>('ALL');
  const [collapsedCasts, setCollapsedCasts] = useState<Set<string>>(new Set());

  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  // Compute violations per rule (across all days of the active version)
  const violationsByRule = useMemo(() => {
    const map = new Map<string, number>();
    if (!activeVersion) return map;
    const allViolations = checkAllDays(project.rules || [], project.scenes, activeVersion.rows, activeVersion.dayMeta);
    for (const [, vlist] of allViolations) {
      for (const v of vlist) {
        map.set(v.ruleId, (map.get(v.ruleId) || 0) + 1);
      }
    }
    return map;
  }, [project.rules, project.scenes, activeVersion]);

  // Group rules by cast, applying search/filter
  const grouped = useMemo(() => {
    const groups = new Map<string, ProjectRule[]>();
    for (const r of rules) {
      if (typeFilter !== 'ALL' && r.type !== typeFilter) continue;
      if (search) {
        const q = search.toLowerCase();
        const inCast = r.castId.toLowerCase().includes(q);
        const inDesc = describeRule(r).toLowerCase().includes(q);
        if (!inCast && !inDesc) continue;
      }
      if (!groups.has(r.castId)) groups.set(r.castId, []);
      groups.get(r.castId)!.push(r);
    }
    // Sort cast IDs naturally
    return Array.from(groups.entries()).sort(([a], [b]) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.localeCompare(b);
    });
  }, [rules, search, typeFilter]);

  const totalRules = rules.length;
  const totalCasts = new Set(rules.map(r => r.castId)).size;
  const totalViolations = useMemo(() => {
    let s = 0;
    for (const v of violationsByRule.values()) s += v;
    return s;
  }, [violationsByRule]);

  const toggleCastCollapse = (castId: string) => {
    setCollapsedCasts(prev => {
      const next = new Set(prev);
      if (next.has(castId)) next.delete(castId);
      else next.add(castId);
      return next;
    });
  };

  const handleAdd = () => {
    setEditingRule(null);
    setShowForm(true);
  };

  const handleEdit = (rule: ProjectRule) => {
    setEditingRule(rule);
    setShowForm(true);
  };

  const handleDelete = (rule: ProjectRule) => {
    if (confirm(`Delete this rule?\n\n${describeRule(rule)}`)) {
      dispatch({ type: 'DELETE_RULE', payload: rule.id });
    }
  };

  const handleSave = (rule: ProjectRule) => {
    if (editingRule) {
      dispatch({ type: 'UPDATE_RULE', payload: rule });
    } else {
      dispatch({ type: 'ADD_RULE', payload: rule });
    }
    setShowForm(false);
    setEditingRule(null);
  };

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden bg-zinc-200/50">
        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto w-full p-8 pb-32">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Production Rules</h1>
                <p className="text-sm text-zinc-500 mt-1 max-w-xl">
                  Track cast availability, working hours, and time constraints.
                  Violations flag red on day headers and scene strips in your schedule.
                </p>
              </div>
              <button
                onClick={handleAdd}
                className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                New Rule
              </button>
            </div>

            {/* Toolbar */}
            {totalRules > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by cast ID or rule..."
                    className="w-full bg-white border border-zinc-200 rounded-md pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900"
                  />
                </div>
                <div className="flex bg-white border border-zinc-200 rounded-md p-0.5">
                  <button
                    onClick={() => setTypeFilter('ALL')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                      typeFilter === 'ALL' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
                    )}
                  >
                    All
                  </button>
                  {(Object.keys(RULE_TYPE_META) as RuleType[]).map(t => {
                    const m = RULE_TYPE_META[t];
                    return (
                      <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        className={cn(
                          'px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1',
                          typeFilter === t ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
                        )}
                      >
                        <m.icon className="w-3 h-3" />
                        {m.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rules list or empty state */}
            {totalRules === 0 ? (
              <div className="bg-white border-2 border-dashed border-zinc-200 rounded-xl p-12 text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-100 mx-auto mb-4 flex items-center justify-center">
                  <Clock4 className="w-5 h-5 text-zinc-400" />
                </div>
                <h3 className="text-zinc-900 font-semibold text-base mb-1">No rules defined yet</h3>
                <p className="text-sm text-zinc-500 max-w-md mx-auto mb-6">
                  Rules let you flag cast unavailability, hour limits, and time windows.
                  Violations will appear as red flags on your schedule and calendar.
                </p>
                <button
                  onClick={handleAdd}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add your first rule
                </button>
                <div className="mt-8 grid grid-cols-3 gap-3 max-w-xl mx-auto text-left">
                  {(Object.keys(RULE_TYPE_META) as RuleType[]).map(t => {
                    const m = RULE_TYPE_META[t];
                    const Icon = m.icon;
                    return (
                      <div key={t} className={cn('p-3 rounded-lg border', m.border, m.bg)}>
                        <Icon className={cn('w-4 h-4 mb-1.5', m.text)} />
                        <div className={cn('text-xs font-bold', m.text)}>{m.label}</div>
                        <p className="text-[10px] text-zinc-600 leading-snug mt-0.5">{m.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : grouped.length === 0 ? (
              <div className="bg-white border border-zinc-200 rounded-lg p-8 text-center text-zinc-500 text-sm">
                No rules match your filters.
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map(([castId, castRules]) => {
                  const isCollapsed = collapsedCasts.has(castId);
                  const castViolations = castRules.reduce((sum, r) => sum + (violationsByRule.get(r.id) || 0), 0);
                  return (
                    <div key={castId}>
                      <button
                        onClick={() => toggleCastCollapse(castId)}
                        className="w-full flex items-center gap-2 mb-1.5 px-1 group"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700" />
                        )}
                        <span className="font-mono font-bold text-zinc-700 text-sm">Cast {castId}</span>
                        <span className="text-xs text-zinc-500">·</span>
                        <span className="text-xs text-zinc-500">
                          {castRules.length} {castRules.length === 1 ? 'rule' : 'rules'}
                        </span>
                        {castViolations > 0 && (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" />
                            {castViolations}
                          </span>
                        )}
                      </button>
                      {!isCollapsed && (
                        <div className="space-y-1.5">
                          {castRules.map(rule => (
                            <RuleCard
                              key={rule.id}
                              rule={rule}
                              violationCount={violationsByRule.get(rule.id) || 0}
                              onEdit={() => handleEdit(rule)}
                              onDelete={() => handleDelete(rule)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <RuleFormModal
        open={showForm}
        initial={editingRule}
        scenes={scenes}
        onClose={() => { setShowForm(false); setEditingRule(null); }}
        onSave={handleSave}
      />
    </>
  );
};
