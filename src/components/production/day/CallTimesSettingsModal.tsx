import React, { useMemo } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, GripVertical } from 'lucide-react';
import { useProject } from '../../../store';
import { getCallTimeSettings } from '../../../lib/callTimes';
import { CREW_DEPARTMENTS } from '../../../lib/crewCatalog';
import { ELEMENT_CATEGORIES, getLabel } from '../../../lib/categories';
import type { CallStageDef, CallTimeSettings, CrewTemplate } from '../../../types';
import TimeField from '../../TimeField';
import GroupedSelect, { GroupedSelectItem } from './GroupedSelect';
import Modal, { ModalFooter } from '../../Modal';
import ModalFooterButton from '../../ModalFooterButton';
import { CommitInput } from '../../CommitInput';
import { ruleModalSizes } from '../../rules/ColorRuleFormParts';

/**
 * Call Times modal (roadmap 103) — the optional 1st-AD helper settings + the
 * project-level usual-crew template. Formerly the Production tab's Call Times
 * sub-tab; now a draggable kit `Modal` opened from the Day Manager header.
 * Pure form over `productionInfo.callTimes` and `project.crewTemplate`. Stage
 * drag-reorder is roadmap 104 (replaces these up/down buttons).
 */
const INPUT_DARK = 'bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400 disabled:opacity-50';

const SectionTitle: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="mb-3">
    <div className="flex items-center gap-1.5">
      <Clock className="w-3 h-3 text-zinc-500" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{title}</span>
    </div>
    {hint && <p className="text-[11px] text-zinc-500 mt-1">{hint}</p>}
  </div>
);

/** One draggable call-stage row (roadmap 104) — grip on the left reorders via
 *  dnd-kit; the fields (label / lead / remove) sit on the rest of the row so
 *  editing never starts a drag. */
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
  const { CREM_TEXT } = ruleModalSizes();

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 30 : undefined }}
      className={`flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1 ${isDragging ? 'opacity-80 shadow-lg' : ''}`}
    >
      <button
        type="button"
        disabled={readOnly}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${stage.label} to reorder`}
        title="Drag to reorder"
        className={`shrink-0 text-zinc-600 hover:text-zinc-200 transition-colors ${readOnly ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing'}`}
        style={{ touchAction: 'none' }}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <span className="text-[10px] text-zinc-500 w-4 text-right shrink-0">{index + 1}</span>
      <CommitInput
        value={stage.label}
        onCommit={v => onChange(index, { label: v })}
        readOnly={readOnly}
        className={`${INPUT_DARK} flex-1`}
      />
      {!isLast ? (
        <TimeField value={stage.lead || ''} onChange={v => onChange(index, { lead: v || undefined })} readOnly={readOnly} placeholder="-1h" className="w-24 shrink-0" theme="dark" />
      ) : (
        <span className={`${CREM_TEXT} text-zinc-500 w-24 shrink-0 text-center`}>anchor</span>
      )}
      <button type="button" disabled={readOnly || count <= 1} onClick={() => onRemove(index)} className="text-xs text-zinc-500 hover:text-rose-400 disabled:opacity-30 shrink-0" aria-label={`Remove ${stage.label}`}>✕</button>
    </div>
  );
};

export const CallTimesSettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const sizes = ruleModalSizes();
  const { CREM_TEXT } = sizes;
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onStageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = settings.stages.findIndex(s => s.key === active.id);
    const to = settings.stages.findIndex(s => s.key === over.id);
    if (from < 0 || to < 0) return;
    setCallTimes({ stages: arrayMove(settings.stages, from, to) });
  };

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
    <Modal open onClose={onClose} title="Call Times" icon={<Clock className="w-4 h-4" />} width="max-w-2xl"
      footer={
        <ModalFooter>
          <ModalFooterButton onClick={onClose}>Close</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className={sizes.CREM_BODY}>
        <div>
          <SectionTitle title="Call stages" hint="Drag to reorder earliest → latest; the last stage (On Set) anchors to the element's first scene. A lead is relative to the NEXT stage." />
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onStageDragEnd}>
            <SortableContext items={settings.stages.map(s => s.key)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
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
              </div>
            </SortableContext>
          </DndContext>
          <button type="button" disabled={readOnly} onClick={addStage} className="text-xs font-medium text-zinc-400 hover:text-zinc-100">+ Add stage</button>
        </div>

        <div className="mt-5">
          <SectionTitle title="Category defaults" hint="Which stages apply to each element category." />
          <div className="space-y-2">
            {Object.entries(settings.categoryStages).map(([category, keys]) => (
              <div key={category} className="flex items-center gap-2 flex-wrap">
                <span className={`${CREM_TEXT} text-zinc-300 w-44 shrink-0`}>{getLabel(category, category, project.categoryLabels)}</span>
                {settings.stages.map(stage => {
                  const on = keys.includes(stage.key);
                  return (
                    <button
                      key={stage.key}
                      type="button"
                      disabled={readOnly}
                      onClick={() => setCallTimes({ categoryStages: { ...settings.categoryStages, [category]: on ? keys.filter(k => k !== stage.key) : [...keys, stage.key] } })}
                      className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${on ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'bg-transparent text-zinc-400 border-zinc-700 hover:bg-zinc-800'}`}
                    >
                      {stage.label}
                    </button>
                  );
                })}
              </div>
            ))}
            {categoryItems.length > 0 && (
              <GroupedSelect
                theme="dark"
                className="w-64"
                items={categoryItems}
                mode="single"
                selectedIds={[]}
                placeholder="Add category…"
                onChange={ids => { if (ids[0]) setCallTimes({ categoryStages: { ...settings.categoryStages, [ids[0]]: ['onSet'] } }); }}
              />
            )}
          </div>
        </div>

        <div className="mt-5">
          <SectionTitle title="Department precalls" hint="Default call for a whole department, relative to the general call (e.g. -30m)." />
          <div className="space-y-1.5">
            {CREW_DEPARTMENTS.map(dept => (
              <div key={dept.name} className="flex items-center gap-2">
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

        <div className="mt-5">
          <SectionTitle title="Usual crew" hint="The default day crew when a day has no explicit list." />
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
      </div>
    </Modal>
  );
};

export default CallTimesSettingsModal;
