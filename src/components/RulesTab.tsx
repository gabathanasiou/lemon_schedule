import React, { useState, useMemo } from 'react';
import { useProject } from '../store';
import { ProjectRule } from '../types';
import { cn } from '../lib/utils';
import { RULE_TYPE_META, RuleType, describeRule } from './rules/ruleMeta';
import { RuleCard } from './rules/RuleCard';
import { RuleFormModal } from './rules/RuleFormModal';
import { Plus, Search, Clock4, ChevronRight, ChevronDown } from 'lucide-react';

export const RulesTab: React.FC = () => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const rules = project.rules || [];
  const scenes = project.scenes;

  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<ProjectRule | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<RuleType | 'ALL'>('ALL');
  const [collapsedCasts, setCollapsedCasts] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const groups = new Map<string, ProjectRule[]>();
    for (const r of rules) {
      if (typeFilter !== 'ALL' && r.type !== typeFilter) continue;
      if (search) {
        const q = search.toLowerCase();
        const inCast = r.castId.toLowerCase().includes(q);
        const inDesc = describeRule(r).toLowerCase().includes(q);
        if (!inCast && !inDesc) continue;
      }
      if (!groups.has(r.castId)) groups.set(r.castId, []);
      groups.get(r.castId)!.push(r);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.localeCompare(b);
    });
  }, [rules, search, typeFilter]);

  const totalRules = rules.length;

  const toggleCastCollapse = (castId: string) => {
    setCollapsedCasts(prev => {
      const next = new Set(prev);
      if (next.has(castId)) next.delete(castId);
      else next.add(castId);
      return next;
    });
  };

  const handleAdd = () => {
    setEditingRule(null);
    setShowForm(true);
  };

  const handleEdit = (rule: ProjectRule) => {
    setEditingRule(rule);
    setShowForm(true);
  };

  const handleDelete = (rule: ProjectRule) => {
    if (confirm(`Delete this rule?\n\n${describeRule(rule)}`)) {
      dispatch({ type: 'DELETE_RULE', payload: rule.id });
    }
  };

  const handleSave = (rule: ProjectRule) => {
    if (editingRule) {
      dispatch({ type: 'UPDATE_RULE', payload: rule });
    } else {
      dispatch({ type: 'ADD_RULE', payload: rule });
    }
    setShowForm(false);
    setEditingRule(null);
  };

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden bg-zinc-200/50">
        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto w-full p-8 pb-32">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Production Rules</h1>
                <p className="text-sm text-zinc-500 mt-1 max-w-xl">
                  Track cast availability, working hours, and time constraints.
                  Violations flag red on day headers and scene strips in your schedule.
                </p>
              </div>
              <button
                onClick={handleAdd}
                className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                New Rule
              </button>
            </div>

            {totalRules > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by cast ID or rule..."
                    className="w-full bg-white border border-zinc-200 rounded-md pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900"
                  />
                </div>
                <div className="flex bg-white border border-zinc-200 rounded-md p-0.5">
                  <button
                    onClick={() => setTypeFilter('ALL')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                      typeFilter === 'ALL' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
                    )}
                  >
                    All
                  </button>
                  {(Object.keys(RULE_TYPE_META) as RuleType[]).map(t => {
                    const m = RULE_TYPE_META[t];
                    return (
                      <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        className={cn(
                          'px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1',
                          typeFilter === t ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
                        )}
                      >
                        <m.icon className="w-3 h-3" />
                        {m.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {totalRules === 0 ? (
              <div className="bg-white border-2 border-dashed border-zinc-200 rounded-xl p-12 text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-100 mx-auto mb-4 flex items-center justify-center">
                  <Clock4 className="w-5 h-5 text-zinc-400" />
                </div>
                <h3 className="text-zinc-900 font-semibold text-base mb-1">No rules defined yet</h3>
                <p className="text-sm text-zinc-500 max-w-md mx-auto mb-6">
                  Rules let you flag cast unavailability, hour limits, and time windows.
                  Violations will appear as red flags on your schedule and calendar.
                </p>
                <button
                  onClick={handleAdd}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add your first rule
                </button>
                <div className="mt-8 grid grid-cols-3 gap-3 max-w-xl mx-auto text-left">
                  {(Object.keys(RULE_TYPE_META) as RuleType[]).map(t => {
                    const m = RULE_TYPE_META[t];
                    const Icon = m.icon;
                    return (
                      <div key={t} className={cn('p-3 rounded-lg border', m.border, m.bg)}>
                        <Icon className={cn('w-4 h-4 mb-1.5', m.text)} />
                        <div className={cn('text-xs font-bold', m.text)}>{m.label}</div>
                        <p className="text-[10px] text-zinc-600 leading-snug mt-0.5">{m.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : grouped.length === 0 ? (
              <div className="bg-white border border-zinc-200 rounded-lg p-8 text-center text-zinc-500 text-sm">
                No rules match your filters.
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map(([castId, castRules]) => {
                  const isCollapsed = collapsedCasts.has(castId);
                  return (
                    <div key={castId}>
                      <button
                        onClick={() => toggleCastCollapse(castId)}
                        className="w-full flex items-center gap-2 mb-1.5 px-1 group"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700" />
                        )}
                        <span className="font-mono font-bold text-zinc-700 text-sm">Cast {castId}</span>
                        <span className="text-xs text-zinc-500">·</span>
                        <span className="text-xs text-zinc-500">
                          {castRules.length} {castRules.length === 1 ? 'rule' : 'rules'}
                        </span>
                      </button>
                      {!isCollapsed && (
                        <div className="space-y-1.5">
                          {castRules.map(rule => (
                            <RuleCard
                              key={rule.id}
                              rule={rule}
                              onEdit={() => handleEdit(rule)}
                              onDelete={() => handleDelete(rule)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <RuleFormModal
        open={showForm}
        initial={editingRule}
        scenes={scenes}
        onClose={() => { setShowForm(false); setEditingRule(null); }}
        onSave={handleSave}
      />
    </>
  );
};
