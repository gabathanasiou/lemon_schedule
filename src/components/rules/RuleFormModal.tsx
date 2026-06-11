import React, { useState, useEffect } from 'react';
import { ProjectRule, Scene, CastMember } from '../../types';
import { generateUUID, getUniqueCastIds, cn } from '../../lib/utils';
import {
  RULE_TYPE_META, RuleFormState, RuleType, blankRuleForm, formFromRule,
} from './ruleMeta';
import { MaxHoursFields, DateRestrictionFields, TimeWindowFields, CastConflictFields, CastSceneFlagFields } from './RuleFormFields';
import { AlertCircle, Info } from 'lucide-react';
import { EntityDropdown } from '../EntityDropdown';
import Modal from '../Modal';
import { ModalFooter } from '../Modal';

interface RuleFormModalProps {
  open: boolean;
  initial: ProjectRule | null;
  scenes: Scene[];
  castMembers: CastMember[];
  onClose: () => void;
  onSave: (rules: ProjectRule[]) => void;
}

export const RuleFormModal: React.FC<RuleFormModalProps> = ({
  open, initial, scenes, castMembers, onClose, onSave,
}) => {
  const [form, setForm] = useState<RuleFormState>(blankRuleForm());
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm(formFromRule(initial));
      } else {
        setForm(blankRuleForm());
      }
      setError('');
    }
  }, [open, initial]);

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

  const setType = (t: RuleType) => setForm(f => ({ ...f, type: t }));

  const handleSave = () => {
    if (form.castIds.length === 0) {
      setError('Select at least one cast member');
      return;
    }
    if (form.type === 'DATE_RESTRICTION' && form.dates.length === 0) {
      setError('At least one date is required');
      return;
    }
    if (form.type === 'CAST_CONFLICT') {
      if (form.castIds.length === 0 || form.conflictCastIds.length === 0) {
        setError('Both groups must have at least one cast member');
        return;
      }
    }
    if (form.type === 'CAST_SCENE_FLAG' && form.castIds.length === 0) {
      setError('Select at least one cast member');
      return;
    }
    setError('');

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

    let rules: ProjectRule[];
    if (form.type === 'CAST_CONFLICT') {
      rules = [{ id, type: 'CAST_CONFLICT', castIds: [...form.castIds], conflictCastIds: [...form.conflictCastIds] }];
    } else if (form.type === 'CAST_SCENE_FLAG') {
      rules = [{ id, type: 'CAST_SCENE_FLAG', castIds: [...form.castIds] }];
    } else if (form.type === 'MAX_HOURS') {
      const h = parseFloat(form.maxHours);
      if (isNaN(h) || h <= 0) { setError('Max hours must be a positive number'); return; }
      rules = buildSingleRules();
    } else {
      rules = buildSingleRules();
    }
    onSave(rules);

    function buildSingleRules(): ProjectRule[] {
      if (initial) {
        const result: ProjectRule[] = [saveSingle(form.castIds[0].trim(), initial.id)];
        for (let i = 1; i < form.castIds.length; i++) result.push(saveSingle(form.castIds[i].trim(), generateUUID()));
        return result;
      }
      return form.castIds.map(cid => saveSingle(cid.trim(), generateUUID()));
    }
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Edit Rule' : 'Add Rule'} icon={<AlertCircle className="w-4 h-4" />} width="max-w-3xl"
      footer={
        <ModalFooter>
          <button onClick={onClose} className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-zinc-900 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
          >
            {initial ? 'Save Changes' : 'Add Rule'}
          </button>
        </ModalFooter>
      }
    >
      <div className="px-6 py-4 space-y-5">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
            Rule Type
          </label>
          <div className="grid grid-cols-2 gap-3">
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
                      : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn('w-4 h-4', selected ? m.text : 'text-zinc-400')} />
                    <span className={cn('text-xs font-bold', selected ? m.text : 'text-zinc-300')}>
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

        {form.type !== 'CAST_SCENE_FLAG' && form.type !== 'CAST_CONFLICT' && (
        <div>
          <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-2 block">
            Cast IDs
          </label>
          <EntityDropdown
            value={form.castIds.join(', ')}
            onChange={val => setForm(f => ({ ...f, castIds: val.split(',').map(x => x.trim()).filter(Boolean) }))}
            items={castOptions.map(id => {
              const m = castMembers.find(m => m.id === id);
              return { id, name: m?.name || '—' };
            })}
            positioning="fixed"
            mode="multi"
            showSceneCounts
            scenes={scenes}
            placeholder="e.g. 1, 2, JOHN"
            className="text-xs"
            displayMode="id"
            renderItem={(item) => <><span className="text-zinc-400 shrink-0">{item.id}.</span><span className="truncate flex-1">{item.name && item.name !== item.id ? item.name : '—'}</span></>}
          />
          {castOptions.length === 0 && (
            <p className="text-[10px] text-amber-500 mt-1.5 flex items-center gap-1">
              <Info className="w-3 h-3" />
              No cast found in your scenes yet. Type custom IDs.
            </p>
          )}
        </div>
        )}

        {form.type === 'MAX_HOURS' && (
          <MaxHoursFields form={form} setForm={setForm} />
        )}

        {form.type === 'DATE_RESTRICTION' && (
          <DateRestrictionFields form={form} setForm={setForm} />
        )}

        {form.type === 'TIME_WINDOW' && (
          <TimeWindowFields form={form} setForm={setForm} />
        )}

        {form.type === 'CAST_CONFLICT' && (
          <CastConflictFields form={form} setForm={setForm} castMembers={castMembers} />
        )}

        {form.type === 'CAST_SCENE_FLAG' && (
          <CastSceneFlagFields form={form} setForm={setForm} castMembers={castMembers} />
        )}

        {error && (
          <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-950/40 border border-rose-800 rounded-md px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
};
