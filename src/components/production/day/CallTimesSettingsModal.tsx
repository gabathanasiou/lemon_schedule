import React, { useMemo, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, GripVertical, Plus, X } from 'lucide-react';
import { useProject } from '../../../store';
import { getCallTimeSettings } from '../../../lib/callTimes';
import { CREW_DEPARTMENTS } from '../../../lib/crewCatalog';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon, getLabel } from '../../../lib/categories';
import type { CallStageDef, CallTimeSettings, CrewTemplate } from '../../../types';
import TimeField from '../../TimeField';
import GroupedSelect, { GroupedSelectItem } from './GroupedSelect';
import { CategoryDropdown } from '../../rules/CategoryDropdown';
import Modal, { ModalFooter } from '../../Modal';
import ModalFooterButton from '../../ModalFooterButton';
import { CommitInput } from '../../CommitInput';
import Button from '../../Button';
import { ruleModalSizes } from '../../rules/ColorRuleFormParts';

/**
 * Call Times modal (roadmap 103) — the optional 1st-AD helper settings + the
 * project-level usual-crew template. Formerly the Production tab's Call Times
 * sub-tab; now a draggable kit `Modal` opened from the Day Manager header.
 * Pure form over `productionInfo.callTimes` and `project.crewTemplate`.
 *
 * Roadmap 110: the four concerns live on their own tabs (stages / category
 * defaults / department precalls / usual crew); the stage list is a contained
 * ImportDialog-style table; category defaults are per-category stage dropdowns
 * with a remove X (cast is locked — it is always staged). Stage drag-reorder
 * is roadmap 104.
 */
const PLAIN_DARK_INPUT = 'w-full px-1.5 py-0.5 rounded bg-transparent text-xs text-left text-zinc-100 placeholder:text-zinc-500 outline-none cursor-text transition-colors hover:bg-zinc-800 hover:ring-1 hover:ring-zinc-700 focus:bg-zinc-800 focus:ring-2 focus:ring-zinc-600 disabled:opacity-50';
/** Contained grouped list — the ImportDialog "Board ID Assignment" table
 *  language (bordered container, header row, zebra rows). */
const CONTAINER = 'rounded-lg border border-zinc-800 overflow-hidden';

type TabKey = 'stages' | 'categories' | 'precalls' | 'crew';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'stages', label: 'Call stages' },
  { key: 'categories', label: 'Category defaults' },
  { key: 'precalls', label: 'Department precalls' },
  { key: 'crew', label: 'Usual crew' },
];

const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] text-zinc-500 leading-relaxed">{children}</p>
);

/** One draggable call-stage row (roadmap 104) — the table row is the sortable
 *  node; the grip reorders via dnd-kit, the fields edit in place. */
interface StageRowProps {
  stage: CallStageDef;
  index: number;
  count: number;
  readOnly?: boolean;
  onChange: (index: number, patch: Partial<CallStageDef>) => void;
  onRemove: (index: number) => void;
}

const StageRow: React.FC<StageRowProps> = ({ stage, index, count, readOnly, onChange, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.key });
  const isLast = index === count - 1;

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 30 : undefined }}
      className={`border-b border-zinc-800/50 last:border-b-0 ${index % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/50'} ${isDragging ? 'opacity-80 shadow-lg' : ''}`}
    >
      <td className="pl-1 pr-0 py-1.5 w-8">
        <button
          type="button"
          disabled={readOnly}
          {...attributes}
          {...listeners}
          aria-label={`Drag ${stage.label} to reorder`}
          title="Drag to reorder"
          className={`flex mx-auto p-1 rounded text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 transition-colors ${readOnly ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing'}`}
          style={{ touchAction: 'none' }}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      </td>
      <td className="px-3 py-2 text-zinc-300 text-xs font-mono w-10">{index + 1}</td>
      <td className="px-3 py-1.5">
        <CommitInput
          value={stage.label}
          onCommit={v => onChange(index, { label: v })}
          readOnly={readOnly}
          className={PLAIN_DARK_INPUT}
        />
      </td>
      <td className="px-3 py-1.5 w-32">
        {isLast ? (
          <span className="block text-center text-[11px] text-zinc-500">anchor</span>
        ) : (
          <TimeField
            value={stage.lead || ''}
            onChange={v => onChange(index, { lead: v || undefined })}
            readOnly={readOnly}
            placeholder="-1h"
            className="w-full"
            theme="dark"
            hideOverrideDot
          />
        )}
      </td>
      <td className="px-2 py-1.5 w-10">
        <button
          type="button"
          disabled={readOnly || count <= 1}
          onClick={() => onRemove(index)}
          className="flex mx-auto p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 disabled:opacity-30 transition-colors"
          aria-label={`Remove ${stage.label}`}
          title="Remove stage"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
};

export const CallTimesSettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const sizes = ruleModalSizes();
  const { CREM_TEXT } = sizes;
  const settings = useMemo(() => getCallTimeSettings(project), [project]);
  const template = project.crewTemplate || {};
  const [tab, setTab] = useState<TabKey>('stages');
  const [catOpen, setCatOpen] = useState(false);

  const setCallTimes = (patch: Partial<CallTimeSettings>) =>
    dispatch({ type: 'SET_PRODUCTION_INFO', payload: { callTimes: { ...settings, ...patch } } });
  const setTemplate = (patch: Partial<CrewTemplate>) =>
    dispatch({ type: 'UPDATE_PROJECT', payload: { crewTemplate: { ...template, ...patch } } });

  const setStage = (index: number, patch: Partial<CallStageDef>) =>
    setCallTimes({ stages: settings.stages.map((s, i) => i === index ? { ...s, ...patch } : s) });
  const removeStage = (index: number) => setCallTimes({ stages: settings.stages.filter((_, i) => i !== index) });
  const addStage = () => setCallTimes({ stages: [...settings.stages, { key: `stage${settings.stages.length + 1}`, label: 'New stage', lead: '-30m' }] });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onStageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = settings.stages.findIndex(s => s.key === active.id);
    const to = settings.stages.findIndex(s => s.key === over.id);
    if (from < 0 || to < 0) return;
    setCallTimes({ stages: arrayMove(settings.stages, from, to) });
  };

  const stageItems: GroupedSelectItem[] = useMemo(
    () => settings.stages.map(s => ({ id: s.key, name: s.label })),
    [settings.stages],
  );

  const setCategoryStages = (category: string, keys: string[]) =>
    setCallTimes({ categoryStages: { ...settings.categoryStages, [category]: keys } });

  // Configured = has at least one stage. An empty array is an explicit removal:
  // it overrides the built-in default on the settings merge, so the category
  // falls back to the Day Manager's stage-less DOOD grid (roadmap 107) and
  // reappears in the add list below.
  const configuredCategories = useMemo(
    () => Object.entries(settings.categoryStages).filter(([, keys]) => keys.length > 0),
    [settings.categoryStages],
  );

  const addCategoryKeys: { key: string; isCustom: boolean }[] = useMemo(() => {
    const keys: { key: string; isCustom: boolean }[] = [];
    const seen = new Set<string>();
    for (const c of ELEMENT_CATEGORIES) { if (!seen.has(c.key)) { seen.add(c.key); keys.push({ key: c.key, isCustom: false }); } }
    for (const c of project.customCategories || []) { if (!seen.has(c.key)) { seen.add(c.key); keys.push({ key: c.key, isCustom: true }); } }
    return keys;
  }, [project.customCategories]);

  const categoryLabelLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of ELEMENT_CATEGORIES) map[c.key] = getLabel(c.key, c.label, project.categoryLabels);
    for (const c of project.customCategories || []) map[c.key] = c.label;
    return map;
  }, [project.categoryLabels, project.customCategories]);

  const configuredKeySet = useMemo(
    () => new Set(configuredCategories.map(([key]) => key)),
    [configuredCategories],
  );

  const catIcon = (category: string, className: string) => {
    const custom = (project.customCategories || []).find(c => c.key === category);
    if (custom) {
      const I = getCustomIcon(custom.icon || 'Tag');
      return <I className={className} />;
    }
    const I = CAT_ICONS[category];
    return I ? <I className={className} /> : null;
  };

  const addCategory = (category: string) => {
    // New categories start on the anchor stage (the last one) — fall back to
    // the legacy 'onSet' key if the stage list has been customized.
    const anchor = settings.stages.some(s => s.key === 'onSet')
      ? 'onSet'
      : settings.stages[settings.stages.length - 1]?.key;
    setCategoryStages(category, anchor ? [anchor] : []);
  };

  const crewRoles = project.crewRoles || [];
  const crew = project.crew || {};
  const crewItems: GroupedSelectItem[] = useMemo(() => {
    const out: GroupedSelectItem[] = [];
    for (const role of crewRoles) for (const p of crew[role.key] || []) out.push({ id: p.id, name: p.name, group: role.label });
    return out;
  }, [crewRoles, crew]);

  return (
    <Modal open onClose={onClose} title="Call Times" icon={<Clock className="w-4 h-4" />} width="max-w-2xl"
      footer={
        <ModalFooter>
          <ModalFooterButton onClick={onClose}>Close</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className={sizes.CREM_BODY}>
        <div className="flex w-full border border-zinc-800 rounded p-0.5 bg-zinc-950">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${tab === t.key ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'stages' && (
          <div className="space-y-3">
            <Hint>Drag to reorder earliest → latest; the last stage (anchor) is the element's first scene. A lead is relative to the next stage.</Hint>
            <div className={CONTAINER}>
              <table className="w-full">
                <thead>
                  <tr className="bg-zinc-900 border-b border-zinc-800">
                    <th className="w-8" />
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-10">#</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Stage</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-32">Lead to next</th>
                    <th className="px-2 py-2 w-10" />
                  </tr>
                </thead>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onStageDragEnd}>
                  <SortableContext items={settings.stages.map(s => s.key)} strategy={verticalListSortingStrategy}>
                    <tbody>
                      {settings.stages.map((stage, i) => (
                        <StageRow
                          key={stage.key}
                          stage={stage}
                          index={i}
                          count={settings.stages.length}
                          readOnly={readOnly}
                          onChange={setStage}
                          onRemove={removeStage}
                        />
                      ))}
                    </tbody>
                  </SortableContext>
                </DndContext>
              </table>
            </div>
            <Button theme="dark" variant="subtle" onClick={addStage} disabled={readOnly} className="flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add stage
            </Button>
          </div>
        )}

        {tab === 'categories' && (
          <div className="space-y-3">
            <Hint>Which stages apply to each element category. Cast always carries every stage; other categories can be removed and fall back to the DOOD + first-scene view.</Hint>
            <div className={CONTAINER}>
              {configuredCategories.map(([category, keys], i) => (
                <div
                  key={category}
                  data-call-category={category}
                  className={`flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50 last:border-b-0 ${i % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/50'}`}
                >
                  <span className="flex items-center gap-1.5 w-44 shrink-0 min-w-0">
                    {catIcon(category, 'w-3.5 h-3.5 shrink-0 text-zinc-400')}
                    <span className={`${CREM_TEXT} text-zinc-300 truncate`}>{getLabel(category, category, project.categoryLabels)}</span>
                  </span>
                  <GroupedSelect
                    theme="dark"
                    className="flex-1 min-w-0"
                    items={stageItems}
                    mode="multi"
                    selectedIds={keys}
                    disabled={readOnly}
                    placeholder="No stages"
                    onChange={ids => setCategoryStages(category, ids)}
                  />
                  {category === 'cast' ? (
                    <span className="w-7 shrink-0" />
                  ) : (
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => setCategoryStages(category, [])}
                      className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 disabled:opacity-30 transition-colors shrink-0"
                      aria-label={`Remove ${getLabel(category, category, project.categoryLabels)} default`}
                      title="Remove category default"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!readOnly && (
              <CategoryDropdown
                value=""
                onChange={addCategory}
                allCategoryKeys={addCategoryKeys}
                categoryLabelLookup={categoryLabelLookup}
                customCategories={project.customCategories}
                disabledKeys={configuredKeySet}
                open={catOpen}
                onOpenChange={setCatOpen}
                btnClass="text-xs"
                minWidth="min-w-[200px]"
                placeholder="Add category…"
              />
            )}
          </div>
        )}

        {tab === 'precalls' && (
          <div className="space-y-3">
            <Hint>Default call for a whole department, relative to the general call (e.g. -30m).</Hint>
            <div className={CONTAINER}>
              {CREW_DEPARTMENTS.map((dept, i) => (
                <div
                  key={dept.name}
                  className={`flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50 last:border-b-0 ${i % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/50'}`}
                >
                  <span className={`${CREM_TEXT} text-zinc-300 flex-1`}>{dept.name}</span>
                  <TimeField
                    theme="dark"
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
            </div>
          </div>
        )}

        {tab === 'crew' && (
          <div className="space-y-3">
            <Hint>The default day crew when a day has no explicit list.</Hint>
            <GroupedSelect
              theme="dark"
              items={crewItems}
              mode="multi"
              selectedIds={template.crewIds || []}
              disabled={readOnly}
              placeholder="Full roster"
              onChange={ids => setTemplate({ crewIds: ids.length ? ids : undefined })}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default CallTimesSettingsModal;
