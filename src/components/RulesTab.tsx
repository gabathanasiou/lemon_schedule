import React, { useState, useMemo } from 'react';
import { useProject } from '../store';
import { ProjectRule } from '../types';
import { cn } from '../lib/utils';
import { RULE_TYPE_META, RuleType, describeRule, getRuleGroupKey, getRuleSearchText } from './rules/ruleMeta';
import { RuleCard } from './rules/RuleCard';
import { RuleEditorPanel } from './rules/RuleEditorPanel';
import { anchoredKeysFor } from '../lib/elementLinks';
import Modal from './Modal';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import { Plus, Search, Clock4, ChevronRight, ChevronDown, Users } from 'lucide-react';

export const RulesTab: React.FC = () => {
  const { state, dispatch, readOnly } = useProject();
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
  const [preseedCast, setPreseedCast] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<RuleType | 'ALL'>('ALL');
  const [collapsedCasts, setCollapsedCasts] = useState<Set<string>>(new Set());

  // The "sections" a rule can be added to = the cast members, in board order.
  const castSections = useMemo(() => {
    return [...castMembers].sort((a, b) => {
      const na = parseInt(a.id, 10), nb = parseInt(b.id, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.id.localeCompare(b.id);
    });
  }, [castMembers]);

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
      let key = getRuleGroupKey(r);
      // A rule whose cast isn't a real member (deleted/free-typed) has no
      // section — it lands under the "Other" divider.
      if (key !== 'Other' && !castMembers.some(c => c.id === key)) key = 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.localeCompare(b);
    });
  }, [rules, search, typeFilter, castMembers]);

  const totalRules = rules.length;

  const toggleCastCollapse = (castId: string) => {
    setCollapsedCasts(prev => {
      const next = new Set(prev);
      if (next.has(castId)) next.delete(castId);
      else next.add(castId);
      return next;
    });
  };

  const openNewRule = (castId?: string) => {
    setPreseedCast(castId ?? null);
    setEditingRule(null);
    setShowForm(true);
    setAddMenuOpen(false);
  };

  const handleAdd = () => {
    openNewRule();
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
              <DropdownMenu
                open={addMenuOpen}
                onOpenChange={setAddMenuOpen}
                width="w-72"
                theme="light"
                align="right"
                contentClassName="max-h-[min(60vh,360px)] overflow-y-auto"
                trigger={
                  <button
                    disabled={readOnly}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-sm shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    New Rule
                    <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                  </button>
                }
              >
                <DropdownItem onClick={() => openNewRule()} icon={<Plus className="w-3.5 h-3.5" />}>
                  New Rule…
                </DropdownItem>
                <DropdownDivider />
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Users className="w-3 h-3" />
                  Add to section
                </div>
                {castSections.map(c => (
                  <DropdownItem key={c.id} onClick={() => openNewRule(c.id)}>
                    <span className="text-zinc-400 shrink-0 tabular-nums">{c.id}.</span>
                    <span className="truncate flex-1">{c.name || '?'}</span>
                  </DropdownItem>
                ))}
                <DropdownDivider />
                <DropdownItem onClick={() => openNewRule()}>
                  Other…
                </DropdownItem>
              </DropdownMenu>
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
                  disabled={readOnly}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                  const isOther = castId === 'Other';
                  const isCollapsed = !isOther && collapsedCasts.has(castId);
                  return (
                    <div key={castId}>
                      {isOther ? (
                        <div className="flex items-center gap-2 mt-5 mb-2 px-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Other</span>
                          <div className="flex-1 h-px bg-zinc-300/80" />
                          <span className="text-xs text-zinc-500">
                            {castRules.length} {castRules.length === 1 ? 'rule' : 'rules'}
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => toggleCastCollapse(castId)}
                          className="w-full flex items-center gap-2 mb-1.5 px-1 group"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700" />
                          )}
                          <span className="font-mono font-bold text-zinc-700 text-sm">{resolveCastName(castId)}</span>
                          <span className="text-xs text-zinc-500">·</span>
                          <span className="text-xs text-zinc-500">
                            {castRules.length} {castRules.length === 1 ? 'rule' : 'rules'}
                          </span>
                        </button>
                      )}
                      {!isCollapsed && (
                        <div className="space-y-1.5">
                          {castRules.map(rule => (
                            <RuleCard
                              key={rule.id}
                              rule={rule}
                              castMembers={castMembers}
                              onEdit={readOnly ? () => {} : () => handleEdit(rule)}
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
              preseedCastId={editingRule ? undefined : preseedCast ?? undefined}
              scenes={scenes}
              castMembers={castMembers}
              anchoredKeys={anchoredKeysFor(project.elementLinks, 'cast')}
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
