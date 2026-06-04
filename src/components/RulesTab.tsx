import React, { useState } from 'react';
import { useProject } from '../store';
import { ProjectRule } from '../types';
import { generateUUID } from '../lib/utils';
import { Plus, Trash2 } from 'lucide-react';

export const RulesTab: React.FC = () => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const rules = project.rules || [];

  const [newType, setNewType] = useState<'MAX_HOURS' | 'DATE_RESTRICTION'>('MAX_HOURS');
  const [castId, setCastId] = useState('');
  const [maxHours, setMaxHours] = useState('8');
  const [days, setDays] = useState('');
  const [date, setDate] = useState('');

  const addRule = () => {
    if (!castId.trim()) return;
    let rule: ProjectRule;
    if (newType === 'MAX_HOURS') {
      const h = parseFloat(maxHours) || 8;
      const d = days.trim() ? days.split(',').map(Number).filter(n => !isNaN(n)) : undefined;
      rule = { id: generateUUID(), type: 'MAX_HOURS', castId: castId.trim(), maxHours: h, days: d };
    } else {
      if (!date) return;
      rule = { id: generateUUID(), type: 'DATE_RESTRICTION', castId: castId.trim(), date };
    }
    dispatch({ type: 'ADD_RULE', payload: rule });
    setCastId('');
    setDays('');
    setDate('');
  };

  const ruleLabel = (r: ProjectRule) => {
    if (r.type === 'MAX_HOURS') {
      const d = r.days?.length ? ` (Days: ${r.days.join(', ')})` : ' (All days)';
      return `Cast ${r.castId}: max ${r.maxHours}h/day${d}`;
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
                  <label className="text-[10px] text-zinc-500 uppercase font-semibold">Days (optional)</label>
                  <input
                    value={days}
                    onChange={e => setDays(e.target.value)}
                    placeholder="e.g. 1,2,3"
                    className="border border-zinc-300 rounded px-2 py-1.5 text-sm w-24"
                  />
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
                    {r.type === 'MAX_HOURS' ? 'MAX HOURS' : 'DATE RESTRICTION'}
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
