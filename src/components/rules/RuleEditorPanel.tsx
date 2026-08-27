import React, { useMemo, useState } from 'react';
import { ProjectRule, Scene, CastMember } from '../../types';
import { getUniqueCastIds } from '../../lib/utils';
import { usePortalTarget } from '../../lib/popoutTarget';
import { EntityDropdown } from '../EntityDropdown';
import DatePicker from '../DatePicker';
import {
  RULE_TYPE_META, RULE_TYPES,
  RuleFormState, blankRuleForm, formFromRule, validateRuleForm, buildRulesFromForm,
} from './ruleMeta';
import { ruleModalSizes } from './ColorRuleFormParts';
import { X, Check, Trash2, AlertCircle } from 'lucide-react';

/** The shared dark rule editor (roadmap 46's shared shell) — one copy used by
 *  the Calendar's Day Events modal (inline, pre-seeded with the day) AND the
 *  Rules tab (in a dark Modal, add/edit). Covers every rule type: board IDs
 *  (multi-cast expansion via `buildRulesFromForm`), every-day/specific dates
 *  via the kit DatePicker, max-hours, time-window (range/after/before/all-day),
 *  cast conflict groups, scene flags, delete. */
export interface RuleEditorPanelProps {
  initial: ProjectRule | null;
  /** New-rule seed: opens as a DATE_RESTRICTION on this date (events UI). */
  preseedDateKey?: string;
  scenes: Scene[];
  castMembers: CastMember[];
  onSave: (rules: ProjectRule[]) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export const RuleEditorPanel: React.FC<RuleEditorPanelProps> = ({
  initial, preseedDateKey, scenes, castMembers, onSave, onDelete, onClose,
}) => {
  const [form, setForm] = useState<RuleFormState>(() => {
    if (initial) return formFromRule(initial);
    if (preseedDateKey) return { ...blankRuleForm(), type: 'DATE_RESTRICTION', dates: [preseedDateKey], datesMode: 'specific' };
    return blankRuleForm();
  });
  const [error, setError] = useState('');
  const portalTarget = usePortalTarget();
  const sizes = ruleModalSizes();
  const { XSZ, CREM_LABEL } = sizes;

  const castOptions = useMemo(() => {
    const ids = [...new Set([
      ...getUniqueCastIds(scenes),
      ...castMembers.map(m => m.id),
    ])].sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.localeCompare(b);
    });
    return ids.map(id => {
      const m = castMembers.find(c => c.id === id);
      return { id, name: m?.name || '?' };
    });
  }, [scenes, castMembers]);

  const handleSave = () => {
    const err = validateRuleForm(form);
    if (err) { setError(err); return; }
    setError('');
    onSave(buildRulesFromForm(form, initial));
  };

  const castField = (
    value: string[],
    setter: (v: string[]) => void,
    placeholder: string,
  ) => (
    <EntityDropdown
      value={value.join(', ')}
      onChange={val => setter(val.split(',').map(x => x.trim()).filter(Boolean))}
      items={castOptions}
      positioning="fixed"
      portalTarget={portalTarget ?? document.body}
      mode="multi"
      variant="chip"
      showSceneCounts
      scenes={scenes}
      placeholder={placeholder}
      className="text-xs"
      displayMode="id"
      renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '?'}</span></>}
    />
  );

  const windowModes: { mode: RuleFormState['windowMode']; label: string }[] = [
    { mode: 'range', label: 'Between A and B' },
    { mode: 'after', label: 'After A' },
    { mode: 'before', label: 'Before B' },
    { mode: 'allday', label: 'All Day' },
  ];

  const timeInput = (
    value: string,
    setter: (v: string) => void,
  ) => (
    <input
      type="time"
      value={value || ''}
      onChange={e => setter(e.target.value)}
      className={`${sizes.CREM_TEXT} px-2 py-1.5 rounded bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500`}
    />
  );

  return (
    <div className="border border-zinc-700 rounded-lg p-3 space-y-4" data-rule-editor>
      <div className="flex items-center justify-between">
        <span className={`${CREM_LABEL} text-zinc-300 uppercase font-semibold tracking-wider`}>
          {initial ? 'Edit Rule' : 'Add Rule'}
        </span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5">
          <X className={XSZ} />
        </button>
      </div>

      {/* Rule type */}
      <div className="grid grid-cols-2 gap-1.5">
        {RULE_TYPES.map(t => {
          const m = RULE_TYPE_META[t];
          const Icon = m.icon;
          const selected = form.type === t;
          return (
            <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-semibold transition-colors text-left ${
                selected ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              <Icon className="w-3 h-3 shrink-0" />
              <span className="truncate">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Cast */}
      {form.type !== 'CAST_CONFLICT' && form.type !== 'CAST_SCENE_FLAG' ? (
        <div>
          <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider mb-1.5 block`}>Board IDs</label>
          {castField(form.castIds, v => setForm(f => ({ ...f, castIds: v })), 'e.g. 1, 2, JOHN')}
        </div>
      ) : form.type === 'CAST_SCENE_FLAG' ? (
        <div>
          <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider mb-1.5 block`}>Cast</label>
          {castField(form.castIds, v => setForm(f => ({ ...f, castIds: v })), 'e.g. 1, 2')}
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider mb-1.5 block`}>Group A</label>
            {castField(form.castIds, v => setForm(f => ({ ...f, castIds: v })), 'e.g. 1, 2')}
          </div>
          <div>
            <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider mb-1.5 block`}>Group B</label>
            {castField(form.conflictCastIds, v => setForm(f => ({ ...f, conflictCastIds: v })), 'e.g. 3, 4')}
          </div>
        </div>
      )}

      {/* Dates */}
      {(form.type === 'DATE_RESTRICTION' || form.type === 'MAX_HOURS' || form.type === 'TIME_WINDOW') && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider`}>Dates</label>
            {form.type !== 'DATE_RESTRICTION' && (
              <button
                onClick={() => setForm(f => ({
                  ...f,
                  datesMode: f.datesMode === 'all' ? 'specific' : 'all',
                  dates: f.datesMode === 'all' && preseedDateKey ? [preseedDateKey] : [],
                }))}
                className={`${CREM_LABEL} font-medium flex items-center gap-1.5 transition-colors ${form.datesMode === 'all' ? 'text-zinc-300' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${form.datesMode === 'all' ? 'bg-zinc-600 border-zinc-500' : 'border-zinc-700'}`}>
                  {form.datesMode === 'all' && <Check className="w-2.5 h-2.5 text-zinc-200" />}
                </span>
                Every day
              </button>
            )}
          </div>
          {form.datesMode === 'all' ? (
            <p className={`${CREM_LABEL} text-zinc-500 italic`}>Applies every day.</p>
          ) : (
            <DatePicker
              selected={form.dates}
              onChange={dates => setForm(f => ({ ...f, dates }))}
              theme="dark"
            />
          )}
        </div>
      )}

      {/* Max hours */}
      {form.type === 'MAX_HOURS' && (
        <div>
          <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider mb-1.5 block`}>Max hours per day</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={form.maxHours}
            onChange={e => setForm(f => ({ ...f, maxHours: e.target.value }))}
            className={`${sizes.CREM_TEXT} w-24 px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500`}
          />
        </div>
      )}

      {/* Time window */}
      {form.type === 'TIME_WINDOW' && (
        <div className="space-y-2">
          <label className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider block`}>Time restriction</label>
          <div className="grid grid-cols-2 gap-1.5">
            {windowModes.map(wm => (
              <button
                key={wm.mode}
                type="button"
                onClick={() => setForm(f => ({ ...f, windowMode: wm.mode }))}
                className={`px-2 py-1.5 rounded text-[10px] font-semibold transition-colors text-left border ${
                  form.windowMode === wm.mode
                    ? 'bg-zinc-700 text-white border-zinc-600'
                    : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border-zinc-800'
                }`}
              >
                {wm.label}
              </button>
            ))}
          </div>
          {form.windowMode === 'range' && (
            <div className="flex items-center gap-2">
              {timeInput(form.windowStart, v => setForm(f => ({ ...f, windowMode: 'range', windowStart: v })))}
              <span className={`${CREM_LABEL} text-zinc-500`}>to</span>
              {timeInput(form.windowEnd, v => setForm(f => ({ ...f, windowMode: 'range', windowEnd: v })))}
            </div>
          )}
          {form.windowMode === 'after' && (
            <div className="flex items-center gap-2">
              <span className={`${CREM_LABEL} text-zinc-500 w-10`}>From</span>
              {timeInput(form.windowStart, v => setForm(f => ({ ...f, windowMode: 'after', windowStart: v })))}
            </div>
          )}
          {form.windowMode === 'before' && (
            <div className="flex items-center gap-2">
              <span className={`${CREM_LABEL} text-zinc-500 w-10`}>Until</span>
              {timeInput(form.windowEnd, v => setForm(f => ({ ...f, windowMode: 'before', windowEnd: v })))}
            </div>
          )}
          {form.windowMode === 'allday' && (
            <p className={`${CREM_LABEL} text-zinc-500 italic`}>Available the entire day — no time restriction.</p>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-950/40 border border-red-900/50 rounded px-2.5 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {onDelete ? (
          <button
            onClick={onDelete}
            className={`${CREM_LABEL} text-red-400 hover:text-red-300 font-medium flex items-center gap-1 transition-colors`}
          >
            <Trash2 className={XSZ} /> Delete
          </button>
        ) : <div />}
        <div className="flex items-center gap-2">
          <button onClick={onClose} className={`${CREM_LABEL} text-zinc-400 hover:text-zinc-200 font-medium transition-colors`}>Cancel</button>
          <button onClick={handleSave} className={`${CREM_LABEL} bg-zinc-700 hover:bg-zinc-600 text-white font-semibold px-3 py-1.5 rounded transition-colors`}>
            {initial ? 'Save Changes' : 'Add Rule'}
          </button>
        </div>
      </div>
    </div>
  );
};
