import React, { useMemo, useState } from 'react';
import { ProjectRule, Scene, CastMember } from '../../types';
import { getUniqueCastIds } from '../../lib/utils';
import { usePortalTarget } from '../../lib/popoutTarget';
import { EntityDropdown } from '../EntityDropdown';
import DateField from '../DateField';
import Checkbox from '../Checkbox';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import Button from '../Button';
import {
  RULE_TYPE_META, RULE_TYPES,
  RuleFormState, blankRuleForm, formFromRule, validateRuleForm, buildRulesFromForm,
} from './ruleMeta';
import { ruleModalSizes } from './ColorRuleFormParts';
import ModalFooterButton from '../ModalFooterButton';
import { X, Trash2, AlertCircle, ChevronDown } from 'lucide-react';

/** Modal-style field box (label above, bordered panel). Module scope — an
 *  inline definition would be a NEW component type every render, remounting
 *  the whole field tree (type menu, cast chips, date picker) on each form
 *  change. */
const FieldBox: React.FC<{ label: string; children: React.ReactNode; className?: string; labelClass?: string }> = ({ label, children, className, labelClass = '' }) => (
  <div className={`border border-zinc-700 rounded-lg p-3 space-y-3 ${className ?? ''}`}>
    <span className={`${labelClass} text-zinc-500 uppercase font-semibold tracking-wider block`}>{label}</span>
    {children}
  </div>
);

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
  /** Cast item keys that are element-link anchors — Anchor icons in the picker. */
  anchoredKeys?: Set<string>;
  onSave: (rules: ProjectRule[]) => void;
  onDelete?: () => void;
  onClose: () => void;
  /** Rendered inside a Modal shell (Rules tab): the Modal provides the title
   *  + close button; the panel renders fields + footer only, no box/header. */
  bare?: boolean;
}

export const RuleEditorPanel: React.FC<RuleEditorPanelProps> = ({
  initial, preseedDateKey, scenes, castMembers, anchoredKeys, onSave, onDelete, onClose, bare,
}) => {
  const [form, setForm] = useState<RuleFormState>(() => {
    if (initial) return formFromRule(initial);
    if (preseedDateKey) return { ...blankRuleForm(), type: 'DATE_RESTRICTION', dates: [preseedDateKey], datesMode: 'specific' };
    return blankRuleForm();
  });
  const [error, setError] = useState('');
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const portalTarget = usePortalTarget();
  const sizes = ruleModalSizes();
  const { XSZ, CREM_LABEL } = sizes;
  const selectedMeta = RULE_TYPE_META[form.type];
  const SelectedIcon = selectedMeta.icon;

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
      anchoredKeys={anchoredKeys}
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

  /** Adding from a specific day (events UI) locks the rule to that day:
   *  single date, no every-day toggle, no multi-date picker. Editing from a
   *  day is locked the same way — dates show read-only; full date editing
   *  lives on the Rules tab (no preseed). */
  const dayLocked = !!preseedDateKey;


  return (
    <div className="space-y-4" data-rule-editor>
      {!bare && (
        <div className="flex items-center justify-between">
          <span className={`${CREM_LABEL} text-zinc-300 uppercase font-semibold tracking-wider`}>
            {initial ? 'Edit Rule' : 'Add Rule'}
          </span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5">
            <X className={XSZ} />
          </button>
        </div>
      )}

      {/* Rule type */}
      <FieldBox label="Rule Type" labelClass={CREM_LABEL}>
      <DropdownMenu
        open={typeMenuOpen}
        onOpenChange={setTypeMenuOpen}
        width="w-52"
        theme="dark"
        trigger={
          <Button theme="dark" variant="subtle" className="bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 flex items-center gap-2" data-rule-type>
            <SelectedIcon className={`w-3.5 h-3.5 shrink-0 ${selectedMeta.chipIcon}`} />
            <span className="truncate text-zinc-200">{selectedMeta.label}</span>
            <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
          </Button>
        }
      >
        {RULE_TYPES.map(t => {
          const m = RULE_TYPE_META[t];
          const Icon = m.icon;
          return (
            <DropdownItem key={t} onClick={() => { setForm(f => ({ ...f, type: t, datesMode: t === 'DATE_RESTRICTION' ? 'specific' : f.datesMode })); setTypeMenuOpen(false); }}
              icon={<Icon className={`w-3.5 h-3.5 ${m.chipIcon}`} />}
            >
              <span className={m.chipIcon}>{m.label}</span>
            </DropdownItem>
          );
        })}
      </DropdownMenu>
      </FieldBox>

      {/* Cast */}
      <FieldBox label={form.type === 'CAST_CONFLICT' || form.type === 'CAST_SCENE_FLAG' ? 'Cast' : 'Board IDs'} labelClass={CREM_LABEL}>
      {form.type === 'CAST_CONFLICT' ? (
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
      ) : (
        castField(form.castIds, v => setForm(f => ({ ...f, castIds: v })), form.type === 'CAST_SCENE_FLAG' ? 'e.g. 1, 2' : 'e.g. 1, 2, JOHN')
      )}
      </FieldBox>

      {/* Dates — hidden entirely when opened from a day (add or edit); the
          full date surface lives on the Rules tab (no preseed). */}
      {!dayLocked && (form.type === 'DATE_RESTRICTION' || form.type === 'MAX_HOURS' || form.type === 'TIME_WINDOW') && (
        <FieldBox label="Dates" labelClass={CREM_LABEL}>
          <div className="flex items-center justify-end mb-1.5">
            {form.type !== 'DATE_RESTRICTION' && (
              <Checkbox
                checked={form.datesMode === 'all'}
                onChange={on => setForm(f => ({
                  ...f,
                  datesMode: on ? 'all' : 'specific',
                  dates: on ? [] : preseedDateKey ? [preseedDateKey] : f.dates,
                }))}
                label="Every day"
              />
            )}
          </div>
          {form.datesMode === 'all' && form.type !== 'DATE_RESTRICTION' ? (
            <p className={`${CREM_LABEL} text-zinc-500 italic`}>Applies every day.</p>
          ) : (
            <DateField
              multi
              variant="inline"
              value={form.dates}
              onChange={dates => setForm(f => ({ ...f, dates }))}
              placeholder="Pick dates"
            />
          )}
        </FieldBox>
      )}

      {/* Max hours */}
      {form.type === 'MAX_HOURS' && (
        <FieldBox label="Max Hours per Day" labelClass={CREM_LABEL}>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={form.maxHours}
            onChange={e => setForm(f => ({ ...f, maxHours: e.target.value }))}
            className={`${sizes.CREM_TEXT} w-24 px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500`}
          />
        </FieldBox>
      )}

      {/* Time window */}
      {form.type === 'TIME_WINDOW' && (
        <FieldBox label="Time Restriction" labelClass={CREM_LABEL}>
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
        </FieldBox>
      )}

      {error && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-950/40 border border-red-900/50 rounded px-2.5 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {onDelete ? (
          <ModalFooterButton variant="danger" onClick={onDelete}>
            <Trash2 className={XSZ} /> Delete
          </ModalFooterButton>
        ) : <div />}
        <div className="flex items-center gap-2">
          <ModalFooterButton variant="ghost" onClick={onClose}>Cancel</ModalFooterButton>
          <ModalFooterButton onClick={handleSave}>
            {initial ? 'Save Changes' : 'Add Rule'}
          </ModalFooterButton>
        </div>
      </div>
    </div>
  );
};
