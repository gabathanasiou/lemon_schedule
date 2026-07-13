import React, { useState, useEffect } from 'react';
import { ProjectRule, Scene, CastMember } from '../../types';
import { generateUUID, getUniqueCastIds, cn } from '../../lib/utils';
import {
  RULE_TYPE_META, RuleFormState, RuleType, blankRuleForm, formFromRule,
} from './ruleMeta';
import { MaxHoursFields, DateRestrictionFields, TimeWindowFields, CastConflictFields, CastSceneFlagFields } from './RuleFormFields';
import { X, AlertCircle, Info, Trash2 } from 'lucide-react';
import { EntityDropdown } from '../EntityDropdown';
import { IS_COARSE } from '../../lib/device';
import { useCurrentWindow } from '../../lib/popoutTarget';

const RFM_HEADER_PX = IS_COARSE ? 'px-7' : 'px-6';
const RFM_HEADER_PY = IS_COARSE ? 'py-5' : 'py-4';
const RFM_TITLE = IS_COARSE ? 'text-lg' : 'text-base';
const RFM_SUBTITLE = IS_COARSE ? 'text-sm' : 'text-xs';
const RFM_CLOSE = IS_COARSE ? 'w-5 h-5' : 'w-4 h-4';
const RFM_BODY_PAD = IS_COARSE ? 'p-7' : 'p-6';
const RFM_BODY_GAP = IS_COARSE ? 'space-y-7' : 'space-y-6';
const RFM_LABEL = IS_COARSE ? 'text-xs' : 'text-[10px]';
const RFM_TYPE_ICON = IS_COARSE ? 'w-5 h-5' : 'w-4 h-4';
const RFM_TYPE_TITLE = IS_COARSE ? 'text-sm' : 'text-xs';
const RFM_TYPE_DESC = IS_COARSE ? 'text-xs' : 'text-[10px]';
const RFM_FOOTER_PX = IS_COARSE ? 'px-7' : 'px-6';
const RFM_FOOTER_PY = IS_COARSE ? 'py-5' : 'py-4';
const RFM_FOOTER_BTN = IS_COARSE ? 'px-5 py-3 text-base' : 'px-4 py-2 text-sm';
const RFM_ERROR = IS_COARSE ? 'text-sm' : 'text-xs';

interface RuleFormModalProps {
  open: boolean;
  initial: ProjectRule | null;
  scenes: Scene[];
  castMembers: CastMember[];
  onClose: () => void;
  onSave: (rules: ProjectRule[]) => void;
  onDelete?: () => void;
}

export const RuleFormModal: React.FC<RuleFormModalProps> = ({
  open, initial, scenes, castMembers, onClose, onSave, onDelete,
}) => {
  const [form, setForm] = useState<RuleFormState>(blankRuleForm());
  const [error, setError] = useState('');
  const currentWindow = useCurrentWindow();

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    currentWindow.addEventListener('keydown', onKey);
    return () => currentWindow.removeEventListener('keydown', onKey);
  }, [open, onClose, currentWindow]);

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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between ${RFM_HEADER_PX} ${RFM_HEADER_PY} border-b border-zinc-200`}>
          <div>
            <h2 className={`text-zinc-900 font-bold ${RFM_TITLE}`}>
              {initial ? 'Edit Rule' : 'New Rule'}
            </h2>
            <p className={`text-zinc-500 ${RFM_SUBTITLE} mt-0.5`}>
              {initial ? 'Update this rule\'s parameters.' : 'Add a rule to flag cast violations.'}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 p-1 rounded">
            <X className={RFM_CLOSE} />
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto ${RFM_BODY_PAD} ${RFM_BODY_GAP}`}>
          <div>
            <label className={`${RFM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider mb-2 block`}>
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
                      <Icon className={cn(RFM_TYPE_ICON, selected ? m.text : 'text-zinc-400')} />
                      <span className={cn(
                        `${RFM_TYPE_TITLE} font-bold`,
                        selected ? m.text : 'text-zinc-700'
                      )}>
                        {m.label}
                      </span>
                    </div>
                    <p className={`${RFM_TYPE_DESC} text-zinc-500 leading-snug`}>
                      {m.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {form.type !== 'CAST_SCENE_FLAG' && form.type !== 'CAST_CONFLICT' && (
          <div>
            <label className={`${RFM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider mb-2 block`}>
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
              <p className="text-[10px] text-amber-600 mt-1.5 flex items-center gap-1">
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
            <div className={`flex items-center gap-2 text-rose-600 ${RFM_ERROR} bg-rose-50 border border-rose-200 rounded-md px-3 py-2`}>
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}
        </div>

        <div className={`flex items-center justify-between gap-2 ${RFM_FOOTER_PX} ${RFM_FOOTER_PY} border-t border-zinc-200 bg-zinc-50`}>
          {initial && onDelete ? (
            <button
              onClick={onDelete}
              className={`${RFM_FOOTER_BTN} rounded-md font-medium text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-1.5`}
            >
              <Trash2 className="w-4 h-4" />
              Delete Rule
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className={`${RFM_FOOTER_BTN} rounded-md font-medium text-zinc-700 hover:bg-zinc-200 transition-colors`}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className={`${RFM_FOOTER_BTN} rounded-md font-semibold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5`}
            >
              {initial ? 'Save Changes' : 'Add Rule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
