import React, { useState, useEffect, useRef } from 'react';
import { ProjectRule, Scene, CastMember } from '../../types';
import { generateUUID, getUniqueCastIds, cn } from '../../lib/utils';
import {
  RULE_TYPE_META, RuleFormState, RuleType, blankRuleForm, formFromRule,
} from './ruleMeta';
import { MaxHoursFields, DateRestrictionFields, TimeWindowFields } from './RuleFormFields';
import { X, AlertCircle, Info } from 'lucide-react';

interface RuleFormModalProps {
  open: boolean;
  initial: ProjectRule | null;
  scenes: Scene[];
  castMembers: CastMember[];
  onClose: () => void;
  onSave: (rule: ProjectRule) => void;
}

export const RuleFormModal: React.FC<RuleFormModalProps> = ({
  open, initial, scenes, castMembers, onClose, onSave,
}) => {
  const [form, setForm] = useState<RuleFormState>(blankRuleForm());
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
        setForm(blankRuleForm());
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

  const castOptions = [...new Set([
    ...getUniqueCastIds(scenes),
    ...castMembers.map(m => m.id),
  ])].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;
    return a.localeCompare(b);
  });
  const filteredCast = castOptions.filter(c =>
    c.toLowerCase().includes(castQuery.toLowerCase())
  );

  const setType = (t: RuleType) => setForm(f => ({ ...f, type: t }));

  const addDateChip = () => {
    if (!form.dateInput) return;
    if (!form.dates.includes(form.dateInput)) {
      setForm(f => ({ ...f, dates: [...f.dates, form.dateInput].sort() }));
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
      const base: any = { id, type: 'TIME_WINDOW', castId: form.castId.trim() };
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
                {filteredCast.map(c => {
                  const member = castMembers.find(m => m.id === c);
                  return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setCastQuery(c); setForm(f => ({ ...f, castId: c })); setCastOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 font-mono flex items-center justify-between"
                  >
                    <span>{c}{member?.name ? <span className="text-zinc-400 ml-2 font-sans">. {member.name}</span> : null}</span>
                    <span className="text-[10px] text-zinc-400">
                      {scenes.filter(s => s.cast.split(',').map(x => x.trim()).includes(c)).length} scenes
                    </span>
                  </button>
                  );
                })}
              </div>
            )}
            {castOptions.length === 0 && (
              <p className="text-[10px] text-amber-600 mt-1.5 flex items-center gap-1">
                <Info className="w-3 h-3" />
                No cast found in your scenes yet. Type a custom ID.
              </p>
            )}
          </div>

          {form.type === 'MAX_HOURS' && (
            <MaxHoursFields form={form} setForm={setForm} addDateChip={addDateChip} removeDateChip={removeDateChip} />
          )}

          {form.type === 'DATE_RESTRICTION' && (
            <DateRestrictionFields form={form} setForm={setForm} />
          )}

          {form.type === 'TIME_WINDOW' && (
            <TimeWindowFields form={form} setForm={setForm} />
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
