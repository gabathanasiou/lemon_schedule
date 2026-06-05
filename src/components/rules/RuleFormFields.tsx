import React from 'react';
import { RuleFormState } from './ruleMeta';
import { cn, formatRuleDate, formatRuleDateShort } from '../../lib/utils';
import { Plus, X } from 'lucide-react';
import { CastDropdown } from '../CastDropdown';

export const MaxHoursFields: React.FC<{
  form: RuleFormState;
  setForm: React.Dispatch<React.SetStateAction<RuleFormState>>;
  addDateChip: () => void;
  removeDateChip: (d: string) => void;
}> = ({ form, setForm, addDateChip, removeDateChip }) => (
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
);

export const DateRestrictionFields: React.FC<{
  form: RuleFormState;
  setForm: React.Dispatch<React.SetStateAction<RuleFormState>>;
}> = ({ form, setForm }) => (
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
);

export const TimeWindowFields: React.FC<{
  form: RuleFormState;
  setForm: React.Dispatch<React.SetStateAction<RuleFormState>>;
}> = ({ form, setForm }) => (
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
        {(['range', 'after', 'before', 'allday'] as const).map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => setForm(f => ({ ...f, windowMode: mode }))}
            className={cn(
              'px-3 py-2 rounded-md text-xs font-medium border-2',
              form.windowMode === mode
                ? 'border-amber-400 bg-amber-50 text-amber-800'
                : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
            )}
          >
            {mode === 'range' ? 'Between A and B' : mode === 'after' ? 'After A' : mode === 'before' ? 'Before B' : 'All Day'}
          </button>
        ))}
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
);

export const CastConflictFields: React.FC<{
  form: RuleFormState;
  setForm: React.Dispatch<React.SetStateAction<RuleFormState>>;
  castMembers: Array<{ id: string; name: string }>;
}> = ({ form, setForm, castMembers }) => (
  <div className="space-y-4">
    <div>
      <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
        Group A
      </label>
      <CastDropdown
        value={form.castIds.join(', ')}
        onChange={val => setForm(f => ({ ...f, castIds: val.split(',').map(x => x.trim()).filter(Boolean) }))}
        items={castMembers}
        positioning="fixed"
        standalone
        placeholder="Search cast members..."
      />
    </div>
    <div className="flex items-center gap-2">
      <div className="flex-1 h-px bg-zinc-200" />
      <span className="text-xs text-zinc-400 font-medium">VS</span>
      <div className="flex-1 h-px bg-zinc-200" />
    </div>
    <div>
      <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
        Group B
      </label>
      <CastDropdown
        value={form.conflictCastIds.join(', ')}
        onChange={val => setForm(f => ({ ...f, conflictCastIds: val.split(',').map(x => x.trim()).filter(Boolean) }))}
        items={castMembers}
        positioning="fixed"
        standalone
        placeholder="Search cast members..."
      />
    </div>
  </div>
);

export const CastSceneFlagFields: React.FC<{
  form: RuleFormState;
  setForm: React.Dispatch<React.SetStateAction<RuleFormState>>;
  castMembers: Array<{ id: string; name: string }>;
}> = ({ form, setForm, castMembers }) => (
  <div>
    <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
      Flag scenes containing these cast members
    </label>
    <CastDropdown
      value={form.castIds.join(', ')}
      onChange={val => setForm(f => ({ ...f, castIds: val.split(',').map(x => x.trim()).filter(Boolean) }))}
      items={castMembers}
      positioning="fixed"
      standalone
      placeholder="Search cast members..."
    />
  </div>
);
