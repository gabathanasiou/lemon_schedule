import React, { useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import type { DayElementEntry } from '../../../../lib/dayView';
import { computeElementCallChain, getCallTimeSettings } from '../../../../lib/callTimes';
import { CAT_ICONS, getCustomIcon, getLabel } from '../../../../lib/categories';
import { ELEMENT_CATEGORIES } from '../../../../lib/categories';
import TimeField from '../../../TimeField';
import GroupedSelect, { GroupedSelectItem } from '../GroupedSelect';
import type { ElementCallTimes } from '../../../../types';

const TH = 'text-[10px] font-semibold text-zinc-500 uppercase tracking-wider text-left px-2 py-1.5 whitespace-nowrap';
const TD = 'px-2 py-1 align-middle';

const CallTimesSection: React.FC<DaySectionProps> = ({ day, project, patchMeta, readOnly }) => {
  const settings = useMemo(() => getCallTimeSettings(project), [project]);
  const [extraCategories, setExtraCategories] = useState<string[]>([]);

  const presentCategories = useMemo(() => {
    const cats = new Set<string>();
    if (day.cast.length) cats.add('cast');
    for (const k of Object.keys(day.elements)) if ((day.elements[k] || []).length) cats.add(k);
    return Array.from(cats);
  }, [day]);

  const shown = useMemo(() => {
    const all = [...presentCategories];
    for (const c of extraCategories) if (!all.includes(c)) all.push(c);
    return all.filter(c => (settings.categoryStages[c] || []).length > 0);
  }, [presentCategories, extraCategories, settings]);

  const categoryLabel = (key: string) => getLabel(key, key, project.categoryLabels);
  const iconFor = (key: string) => {
    const custom = (project.customCategories || []).find(c => c.key === key);
    if (custom?.icon) return getCustomIcon(custom.icon);
    return CAT_ICONS[key] || Clock;
  };

  const addable: GroupedSelectItem[] = useMemo(() =>
    [...ELEMENT_CATEGORIES.map(c => ({ id: c.key, name: c.label })), ...(project.customCategories || []).map(c => ({ id: c.key, name: c.label }))]
      .filter(c => c.id !== 'cast' && !shown.includes(c.id)), [shown, project.customCategories]);

  const setStage = (category: string, entry: DayElementEntry, stageKey: string, raw: string) => {
    const catCalls = { ...(day.meta.elementCalls?.[category] || {}) };
    const current: ElementCallTimes = { ...(catCalls[entry.key] || {}) };
    const value = raw.trim();
    if (value) (current as any)[stageKey] = value;
    else delete (current as any)[stageKey];
    if (Object.keys(current).length > 0) catCalls[entry.key] = current;
    else delete catCalls[entry.key];
    const next = { ...(day.meta.elementCalls || {}) };
    if (Object.keys(catCalls).length > 0) next[category] = catCalls;
    else delete next[category];
    patchMeta({ elementCalls: Object.keys(next).length ? next : undefined });
  };

  return (
    <div className="space-y-4">
      {shown.length === 0 && <p className="text-xs text-zinc-400">No elements on this day.</p>}
      {shown.map(category => {
        const Icon = iconFor(category);
        const entries = category === 'cast' ? day.cast : (day.elements[category] || []);
        const stageKeys = settings.categoryStages[category] || [];
        const stageDefs = stageKeys.map(k => settings.stages.find(s => s.key === k)!).filter(Boolean);
        return (
          <div key={category} className="rounded-lg border border-zinc-200 overflow-hidden">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 border-b border-zinc-200">
              <Icon className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-[11px] font-semibold text-zinc-700">{categoryLabel(category)}</span>
              <span className="text-[10px] text-zinc-400">{entries.length}</span>
            </div>
            {entries.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-zinc-400">No elements.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" data-calltimes-table>
                  <thead>
                    <tr className="border-b border-zinc-200 bg-white">
                      <th className={`${TH} w-10 text-center`}>ID</th>
                      <th className={TH}>Character</th>
                      <th className={`${TH} w-12 text-center`} title="Day state (Start/Work/Finish)">SWF</th>
                      {stageDefs.map(def => (
                        <th key={def.key} className={`${TH} text-center`} title={def.label}>{def.abbrev || def.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(entry => {
                      const overrides = day.meta.elementCalls?.[category]?.[entry.key];
                      const chain = computeElementCallChain(settings.stages, stageKeys, entry.firstCallTime, overrides);
                      return (
                        <tr key={entry.key} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                          <td className={`${TD} text-center text-xs text-zinc-400 tabular-nums`}>{entry.boardId || ''}</td>
                          <td className={`${TD} text-xs text-zinc-800 whitespace-nowrap max-w-[16rem] truncate`}>{entry.name}</td>
                          <td className={`${TD} text-center`}>
                            <span className={`inline-flex items-center justify-center min-w-[20px] px-1 py-0.5 rounded text-[10px] font-bold ${entry.code === 'W' ? 'bg-zinc-200 text-zinc-700' : 'bg-amber-100 text-amber-700'}`}>{entry.code || '—'}</span>
                          </td>
                          {stageDefs.map(def => (
                            <td key={def.key} className={`${TD} text-center`}>
                              <TimeField
                                value={(overrides?.[def.key as keyof ElementCallTimes] as string | undefined) || ''}
                                resolvedTime={chain[def.key]?.time}
                                onChange={raw => setStage(category, entry, def.key, raw)}
                                onReset={() => setStage(category, entry, def.key, '')}
                                readOnly={readOnly}
                                className="w-24 justify-center"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-zinc-400">Calculated from Call Times settings · overrides show a reset button.</p>
        {!readOnly && addable.length > 0 && (
          <GroupedSelect
            className="w-56"
            items={addable}
            mode="single"
            selectedIds={[]}
            placeholder="Add category…"
            onChange={ids => { if (ids[0]) setExtraCategories(prev => [...prev, ids[0]]); }}
          />
        )}
      </div>
    </div>
  );
};

export const CallTimesIcon = Clock;

export default CallTimesSection;
