import React, { useState, useMemo } from 'react';
import { useProject } from '../store';
import { ProjectRule } from '../types';
import { cn } from '../lib/utils';
import { RULE_TYPE_META, RuleType, describeRule, getRuleGroupKey, getRuleSearchText } from './rules/ruleMeta';
import { RuleCard } from './rules/RuleCard';
import { RuleEditorPanel } from './rules/RuleEditorPanel';
import { anchoredKeysFor } from '../lib/elementLinks';
import Modal from './Modal';
import Button from './Button';
import { inputCls, Seg, ThemeScope } from '@gabriel/ui-kit';
import { Plus, Search, Clock4, ChevronRight, ChevronDown } from 'lucide-react';

export const RulesTab: React.FC = () => {
  const { state, dispatch, locked } = useProject();
  const project = state.present;
  const rules = project.rules || [];
  const scenes = project.scenes;
  const castMembers = project.castMembers || [];
  const productionStart = project.calendarVersions.find(v => v.id === project.activeCalendarVersionId)?.productionStart;

  const resolveCastName = (castId: string) => {
    const cm = castMembers.find(c => c.id === castId);
    return cm ? `${cm.id}. ${cm.name}` : castId;
  };

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
        const inCast = getRuleSearchText(r).toLowerCase().includes(q);
        const inDesc = describeRule(r).toLowerCase().includes(q);
        if (!inCast && !inDesc) continue;
      }
      const key = getRuleGroupKey(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
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
    dispatch({ type: 'DELETE_RULE', payload: rule.id });
  };

  const handleSave = (rules: ProjectRule[]) => {
    for (const r of rules) {
      dispatch({ type: editingRule && r.id === editingRule.id ? 'UPDATE_RULE' : 'ADD_RULE', payload: r });
    }
    setShowForm(false);
    setEditingRule(null);
  };

  return (
    <>
      <ThemeScope mode="light" surface="neutral" className="flex-1 flex flex-col overflow-hidden bg-[var(--ui-card-band)]">
        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto w-full p-8 pb-32">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-[color:var(--ui-text-strong)] tracking-tight">Production Rules</h1>
                <p className="text-sm text-[color:var(--ui-text-muted)] mt-1 max-w-xl">
                  Track cast availability, working hours, and time constraints.
                  Violations flag red on day headers and scene strips in your schedule.
                </p>
              </div>
              <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={handleAdd} disabled={locked} className="shrink-0">
                New Rule
              </Button>
            </div>

            {totalRules > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--ui-text-faint)]" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by cast ID or rule..."
                    className={`${inputCls('md')} w-full pl-8`}
                  />
                </div>
                <Seg
                  variant="track"
                  theme="light"
                  value={typeFilter}
                  options={[
                    { v: 'ALL', l: 'All' },
                    ...(Object.keys(RULE_TYPE_META) as RuleType[]).map(t => {
                      const m = RULE_TYPE_META[t];
                      return { v: t, l: m.short, icon: <m.icon className="w-3 h-3" /> };
                    }),
                  ]}
                  onChange={v => setTypeFilter(v as RuleType | 'ALL')}
                  ariaLabel="Filter rules by type"
                />
              </div>
            )}

            {totalRules === 0 ? (
              <div className="bg-[var(--ui-panel-bg)] border-2 border-dashed border-[color:var(--ui-border)] rounded-xl p-12 text-center">
                <div className="w-12 h-12 rounded-full bg-[var(--ui-card-band)] mx-auto mb-4 flex items-center justify-center">
                  <Clock4 className="w-5 h-5 text-[color:var(--ui-text-faint)]" />
                </div>
                <h3 className="text-[color:var(--ui-text-strong)] font-semibold text-base mb-1">No rules defined yet</h3>
                <p className="text-sm text-[color:var(--ui-text-muted)] max-w-md mx-auto mb-6">
                  Rules let you flag cast unavailability, hour limits, and time windows.
                  Violations will appear as red flags on your schedule and calendar.
                </p>
                <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={handleAdd} disabled={locked}>
                  Add your first rule
                </Button>
                <div className="mt-8 grid grid-cols-3 gap-3 max-w-xl mx-auto text-left">
                  {(Object.keys(RULE_TYPE_META) as RuleType[]).map(t => {
                    const m = RULE_TYPE_META[t];
                    const Icon = m.icon;
                    return (
                      <div key={t} className={cn('p-3 rounded-lg border', m.border, m.bg)}>
                        <Icon className={cn('w-4 h-4 mb-1.5', m.text)} />
                        <div className={cn('text-xs font-bold', m.text)}>{m.label}</div>
                        <p className="text-[10px] text-[color:var(--ui-text-muted)] leading-snug mt-0.5">{m.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : grouped.length === 0 ? (
              <div className="bg-[var(--ui-panel-bg)] border border-[color:var(--ui-border)] rounded-lg p-8 text-center text-[color:var(--ui-text-muted)] text-sm">
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
                          <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ui-text-faint)] group-hover:text-[color:var(--ui-text)]" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-[color:var(--ui-text-faint)] group-hover:text-[color:var(--ui-text)]" />
                        )}
                        <span className="font-mono font-bold text-[color:var(--ui-text)] text-sm">{resolveCastName(castId)}</span>
                        <span className="text-xs text-[color:var(--ui-text-muted)]">·</span>
                        <span className="text-xs text-[color:var(--ui-text-muted)]">
                          {castRules.length} {castRules.length === 1 ? 'rule' : 'rules'}
                        </span>
                      </button>
                      {!isCollapsed && (
                        <div className="space-y-1.5">
                          {castRules.map(rule => (
                            <RuleCard
                              key={rule.id}
                              rule={rule}
                              castMembers={castMembers}
                              onEdit={locked ? () => {} : () => handleEdit(rule)}
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
      </ThemeScope>

      {showForm && (
        <Modal
          open
          onClose={() => { setShowForm(false); setEditingRule(null); }}
          title={editingRule ? 'Edit Rule' : 'New Rule'}
          width="max-w-lg"
        >
          <div className="p-6">
            <RuleEditorPanel
              bare
              initial={editingRule}
              scenes={scenes}
              castMembers={castMembers}
              anchoredKeys={anchoredKeysFor(project.links, 'cast')}
              onSave={handleSave}
              onDelete={editingRule ? () => { handleDelete(editingRule); setShowForm(false); setEditingRule(null); } : undefined}
              onClose={() => { setShowForm(false); setEditingRule(null); }}
              productionStart={productionStart}
            />
          </div>
        </Modal>
      )}
    </>
  );
};
