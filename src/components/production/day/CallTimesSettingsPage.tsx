import React, { useMemo } from 'react';
import { useProject } from '../../../store';
import { getCallTimeSettings } from '../../../lib/callTimes';
import { CREW_DEPARTMENTS } from '../../../lib/crewCatalog';
import { ELEMENT_CATEGORIES, getLabel } from '../../../lib/categories';
import type { CallStageDef, CallTimeSettings, CrewPerson, CrewTemplate } from '../../../types';
import TimeField from '../../TimeField';
import GroupedSelect, { GroupedSelectItem } from './GroupedSelect';

/**
 * Production → Call Times (D2): the optional 1st-AD helper settings + the
 * project-level usual-crew template. Pure form over `productionInfo.callTimes`
 * and `project.crewTemplate`.
 */
const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="bg-white border border-zinc-200 rounded-xl shadow-sm p-4">
    <h2 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{title}</h2>
    {hint && <p className="text-[11px] text-zinc-400 mt-0.5 mb-2">{hint}</p>}
    <div className="mt-2 space-y-2">{children}</div>
  </section>
);

const INPUT = 'w-full px-2 py-1 text-xs bg-white border border-zinc-300 rounded outline-none focus:border-zinc-500';

const CallTimesSettingsPage: React.FC = () => {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const settings = useMemo(() => getCallTimeSettings(project), [project]);
  const template = project.crewTemplate || {};

  const setCallTimes = (patch: Partial<CallTimeSettings>) =>
    dispatch({ type: 'SET_PRODUCTION_INFO', payload: { callTimes: { ...settings, ...patch } } });
  const setTemplate = (patch: Partial<CrewTemplate>) =>
    dispatch({ type: 'UPDATE_PROJECT', payload: { crewTemplate: { ...template, ...patch } } });

  const setStage = (index: number, patch: Partial<CallStageDef>) =>
    setCallTimes({ stages: settings.stages.map((s, i) => i === index ? { ...s, ...patch } : s) });
  const removeStage = (index: number) => setCallTimes({ stages: settings.stages.filter((_, i) => i !== index) });
  const addStage = () => setCallTimes({ stages: [...settings.stages, { key: `stage${settings.stages.length + 1}`, label: 'New stage', lead: '-30m' }] });

  const categoryItems: GroupedSelectItem[] = useMemo(() =>
    [...ELEMENT_CATEGORIES.map(c => ({ id: c.key, name: c.label })), ...(project.customCategories || []).map(c => ({ id: c.key, name: c.label }))]
      .filter(c => !(c.id in settings.categoryStages)), [settings.categoryStages, project.customCategories]);

  const crewRoles = project.crewRoles || [];
  const crew = project.crew || {};
  const crewItems: GroupedSelectItem[] = useMemo(() => {
    const out: GroupedSelectItem[] = [];
    for (const role of crewRoles) for (const p of crew[role.key] || []) out.push({ id: p.id, name: p.name, group: role.label });
    return out;
  }, [crewRoles, crew]);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <Section title="Call stages" hint="Ordered earliest → latest; the last stage (On Set) anchors to the element's first scene. A lead is relative to the NEXT stage.">
          {settings.stages.map((stage, i) => (
            <div key={stage.key} className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 w-4 text-right">{i + 1}</span>
              <input value={stage.label} readOnly={readOnly} onChange={e => setStage(i, { label: e.target.value })} className={`${INPUT} flex-1`} />
              {i < settings.stages.length - 1 ? (
                <TimeField value={stage.lead || ''} onChange={v => setStage(i, { lead: v || undefined })} readOnly={readOnly} placeholder="-1h" className="w-28" />
              ) : (
                <span className="text-[11px] text-zinc-400 w-28 text-center">anchor</span>
              )}
              <button type="button" disabled={readOnly || settings.stages.length <= 1} onClick={() => removeStage(i)} className="text-xs text-zinc-400 hover:text-rose-600 disabled:opacity-30">✕</button>
            </div>
          ))}
          <button type="button" disabled={readOnly} onClick={addStage} className="text-xs font-medium text-zinc-600 hover:text-zinc-900">+ Add stage</button>
        </Section>

        <Section title="Category defaults" hint="Which stages apply to each element category.">
          {Object.entries(settings.categoryStages).map(([category, keys]) => (
            <div key={category} className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-zinc-600 w-40 shrink-0">{getLabel(category, category, project.categoryLabels)}</span>
              {settings.stages.map(stage => {
                const on = keys.includes(stage.key);
                return (
                  <button
                    key={stage.key}
                    type="button"
                    disabled={readOnly}
                    onClick={() => setCallTimes({ categoryStages: { ...settings.categoryStages, [category]: on ? keys.filter(k => k !== stage.key) : [...keys, stage.key] } })}
                    className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${on ? 'bg-zinc-800 text-white border-zinc-800' : 'bg-white text-zinc-500 border-zinc-300 hover:bg-zinc-100'}`}
                  >
                    {stage.label}
                  </button>
                );
              })}
            </div>
          ))}
          {categoryItems.length > 0 && (
            <GroupedSelect
              className="w-64"
              items={categoryItems}
              mode="single"
              selectedIds={[]}
              placeholder="Add category…"
              onChange={ids => { if (ids[0]) setCallTimes({ categoryStages: { ...settings.categoryStages, [ids[0]]: ['onSet'] } }); }}
            />
          )}
        </Section>

        <Section title="Department precalls" hint="Default call for a whole department, relative to the general call (e.g. -30m).">
          {CREW_DEPARTMENTS.map(dept => (
            <div key={dept.name} className="flex items-center gap-2">
              <span className="text-xs text-zinc-600 flex-1">{dept.name}</span>
              <TimeField
                value={template.departmentPrecalls?.[dept.name] || ''}
                onChange={v => {
                  const next = { ...(template.departmentPrecalls || {}) };
                  if (v.trim()) next[dept.name] = v.trim(); else delete next[dept.name];
                  setTemplate({ departmentPrecalls: Object.keys(next).length ? next : undefined });
                }}
                readOnly={readOnly}
                placeholder="-30m"
                className="w-28"
              />
            </div>
          ))}
        </Section>

        <Section title="Usual crew" hint="The default day crew when a day has no explicit list.">
          <GroupedSelect
            items={crewItems}
            mode="multi"
            selectedIds={template.crewIds || []}
            disabled={readOnly}
            placeholder="Full roster"
            onChange={ids => setTemplate({ crewIds: ids.length ? ids : undefined })}
          />
        </Section>
      </div>
    </div>
  );
};

export default CallTimesSettingsPage;
