import React, { useState } from 'react';
import { useProject } from '../store';
import { ProjectRule } from '../types';
import { generateUUID } from '../lib/utils';
import { Plus, Trash2, X } from 'lucide-react';

export const RulesTab: React.FC = () => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const rules = project.rules || [];

  const [newType, setNewType] = useState<'MAX_HOURS' | 'DATE_RESTRICTION' | 'TIME_WINDOW'>('MAX_HOURS');
  const [castId, setCastId] = useState('');
  const [maxHours, setMaxHours] = useState('8');
  const [dates, setDates] = useState<string[]>([]);
  const [dateInput, setDateInput] = useState('');
  const [date, setDate] = useState('');
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');

  const addDate = () => {
    if (!dateInput) return;
    if (!dates.includes(dateInput)) setDates([...dates, dateInput]);
    setDateInput('');
  };

  const removeDate = (d: string) => setDates(dates.filter(x => x !== d));

  const addRule = () => {
    if (!castId.trim()) return;
    let rule: ProjectRule;
    if (newType === 'MAX_HOURS') {
      const h = parseFloat(maxHours) || 8;
      rule = { id: generateUUID(), type: 'MAX_HOURS', castId: castId.trim(), maxHours: h, dates: dates.length > 0 ? dates : undefined };
    } else if (newType === 'TIME_WINDOW') {
      if (!date) return;
      rule = {
        id: generateUUID(), type: 'TIME_WINDOW', castId: castId.trim(), date,
        windowStart: windowStart || undefined,
        windowEnd: windowEnd || undefined,
      };
    } else {
      if (!date) return;
      rule = { id: generateUUID(), type: 'DATE_RESTRICTION', castId: castId.trim(), date };
    }
    dispatch({ type: 'ADD_RULE', payload: rule });
    setCastId('');
    setDates([]);
    setDate('');
    setWindowStart('');
    setWindowEnd('');
  };

  const ruleLabel = (r: ProjectRule) => {
    if (r.type === 'MAX_HOURS') {
      const d = r.dates?.length ? ` (${r.dates.length === 1 ? r.dates[0] : `${r.dates.length} dates`})` : ' (All days)';
      return `Cast ${r.castId}: max ${r.maxHours}h/day${d}`;
    }
    if (r.type === 'TIME_WINDOW') {
      const w = r.windowStart && r.windowEnd
        ? `${r.windowStart}–${r.windowEnd}`
        : r.windowStart ? `after ${r.windowStart}`
        : `before ${r.windowEnd}`;
      return `Cast ${r.castId}: only ${w} on ${r.date}`;
    }
    return `Cast ${r.castId}: cannot work on ${r.date}`;
  };

  return (
    <div className="flex-1 flex flex-col overflow-auto bg-white">
      <div className="max-w-2xl mx-auto w-full p-8">
        <h2 className="text-xl font-bold mb-6">Production Rules</h2>
        <p className="text-sm text-zinc-500 mb-8">
          Rules apply globally across all schedule versions. Violations show as red flags on day headers and scene strips.
        </p>

        {/* Add rule form */}
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 mb-8">
          <h3 className="text-sm font-semibold mb-3">Add Rule</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-500 uppercase font-semibold">Type</label>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value as any)}
                className="border border-zinc-300 rounded px-2 py-1.5 text-sm bg-white"
              >
                <option value="MAX_HOURS">Max Hours/Day</option>
                <option value="DATE_RESTRICTION">Date Restriction</option>
                <option value="TIME_WINDOW">Time Window</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-500 uppercase font-semibold">Cast ID</label>
              <input
                value={castId}
                onChange={e => setCastId(e.target.value)}
                placeholder="e.g. 1, JOHN"
                className="border border-zinc-300 rounded px-2 py-1.5 text-sm w-32"
              />
            </div>

            {newType === 'MAX_HOURS' ? (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 uppercase font-semibold">Max Hours</label>
                  <input
                    value={maxHours}
                    onChange={e => setMaxHours(e.target.value)}
                    className="border border-zinc-300 rounded px-2 py-1.5 text-sm w-20"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 uppercase font-semibold">Only on dates</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={dateInput}
                      onChange={e => setDateInput(e.target.value)}
                      className="border border-zinc-300 rounded px-2 py-1.5 text-sm"
                    />
                    <button
                      onClick={addDate}
                      className="bg-zinc-200 text-zinc-700 px-2 py-1.5 rounded text-sm hover:bg-zinc-300"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {dates.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {dates.map(d => (
                        <span key={d} className="flex items-center gap-0.5 bg-white border border-zinc-300 rounded px-1.5 py-0.5 text-[10px]">
                          {d}
                          <button onClick={() => removeDate(d)} className="text-zinc-400 hover:text-red-500"><X className="w-2.5 h-2.5" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : newType === 'TIME_WINDOW' ? (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 uppercase font-semibold">Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="border border-zinc-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold">From</label>
                    <input type="time" value={windowStart} onChange={e => setWindowStart(e.target.value)}
                      className="border border-zinc-300 rounded px-2 py-1.5 text-sm w-28" />
                  </div>
                  <span className="text-zinc-400 text-sm pb-1.5">to</span>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold">To</label>
                    <input type="time" value={windowEnd} onChange={e => setWindowEnd(e.target.value)}
                      className="border border-zinc-300 rounded px-2 py-1.5 text-sm w-28" />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-500 uppercase font-semibold">Restricted Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="border border-zinc-300 rounded px-2 py-1.5 text-sm"
                />
              </div>
            )}

            <button
              onClick={addRule}
              className="bg-black text-white px-4 py-1.5 rounded text-sm font-semibold flex items-center gap-1.5 hover:bg-zinc-800"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>

        {/* Existing rules */}
        {rules.length === 0 ? (
          <div className="text-center text-zinc-400 py-12">No rules defined yet.</div>
        ) : (
          <div className="space-y-2">
            {rules.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-white border border-zinc-200 rounded px-4 py-3 group">
                <div>
                  <span className="text-xs font-mono bg-zinc-100 px-1.5 py-0.5 rounded mr-2">
                    {r.type === 'MAX_HOURS' ? 'MAX HOURS' : r.type === 'TIME_WINDOW' ? 'TIME WINDOW' : 'DATE RESTRICTION'}
                  </span>
                  <span className="text-sm">{ruleLabel(r)}</span>
                </div>
                <button
                  onClick={() => dispatch({ type: 'DELETE_RULE', payload: r.id })}
                  className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
