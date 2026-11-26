import { useEffect, useMemo, useState } from 'react';
import { useDaybreakSections } from '../../../lib/useDaybreakSections';
import { computeSectionViolationMap, rulesRelevantToDay } from '../../../lib/rulesEngine';
import { getAttachableDayTypes, getDayTypes, iconForType } from '../../../lib/dayTypes';
import { boardLabelForDisplay } from '../../../lib/elements';
import { DEFAULT_COLOR_PALETTE } from '../../../lib/ribbonUtils';
import { findEntry, updateSceneColor } from '../../../lib/paletteOps';
import type { ColorRule, Project, ProjectRule } from '../../../types';
import { EventModal } from '../../../components/calendar/EventModal';
import { EventAdderModal } from '../../../components/calendar/EventAdderModal';
import { DayEventsModal } from '../../../components/calendar/DayEventsModal';
import { ProductionDatesModal } from '../../../components/calendar/ProductionDatesModal';
import { AddDayTypeModal, EditDayTypeModal } from '../../../components/calendar/DayTypeModals';
import { ColorRuleEditModal } from '../../../components/ColorRuleEditModal';
import { RuleEditorModal } from '../../../components/rules/RuleEditorModal';
import { PaletteColorModal } from '../../../components/colors/PaletteColorModal';
import { SceneCellEditModal } from '../../../components/colors/SceneCellEditModal';
import { meta } from '../surfaces/calendar';
import type { FixtureContext, SurfaceRender } from '../types';

type Id = (typeof meta)[number]['id'];

/** The studio's day pick, falling back only when the project has no window. */
function pickedDate(ctx: FixtureContext): string {
  return ctx.picks.dayDate || ctx.calendar?.productionStart || new Date().toISOString().slice(0, 10);
}

function castLabel(project: Project, id: string): string {
  const member = (project.castMembers || []).find(c => c.id === id);
  return member ? boardLabelForDisplay(member.id, member.name, 'cast') : id;
}

/** One real element to point the event editor at: a real cast member first,
 *  then the studio's element pick, then any breakdown element. */
function eventTarget(ctx: FixtureContext): { category: string; key: string; kind: 'cast' | 'element'; label: string } | null {
  const project = ctx.project!;
  const cast = (ctx.picks.cast && project.castMembers.find(c => c.id === ctx.picks.cast!.id))
    || project.castMembers.find(c => c.name?.trim());
  if (cast) return { category: 'cast', key: cast.id, kind: 'cast', label: castLabel(project, cast.id) };
  if (ctx.picks.element) {
    const pick = ctx.picks.element;
    return { category: pick.category, key: pick.key, kind: 'element', label: pick.label };
  }
  const entry = Object.entries(project.breakdownElements || {}).find(([, elements]) => elements.length > 0);
  if (entry) return { category: entry[0], key: entry[1][0].name, kind: 'element', label: entry[1][0].name };
  return null;
}

function firstRuleCastId(rule: ProjectRule): string | undefined {
  if (rule.type === 'CAST_CONFLICT') return rule.castIds[0] || rule.conflictCastIds[0];
  if (rule.type === 'CAST_SCENE_FLAG') return rule.castIds[0];
  return rule.castId;
}

const EventEditorFixture = ({ ctx }: { ctx: FixtureContext }) => {
  const project = ctx.project!;
  const target = eventTarget(ctx);
  const date = pickedDate(ctx);
  const status = getAttachableDayTypes(project)[0]?.key || 'travel';

  useEffect(() => {
    if (!target) return;
    ctx.select(target.kind === 'cast'
      ? { kind: 'cast', id: target.key, label: target.label }
      : { kind: 'element', id: target.key, label: target.label });
  }, [ctx.select, target?.kind, target?.key, target?.label]);

  return (
    <EventModal
      dateKey={date}
      statusKey={status}
      category={target?.category || 'cast'}
      elementKey={target?.key || ''}
      editableElement
      onClose={ctx.close}
    />
  );
};

const EventAdderFixture = ({ ctx }: { ctx: FixtureContext }) => {
  const project = ctx.project!;
  const date = pickedDate(ctx);
  const status = getAttachableDayTypes(project)[0]?.key;

  useEffect(() => {
    ctx.select({ kind: 'day', id: date, label: date });
  }, [ctx.select, date]);

  return <EventAdderModal date={date} status={status} onClose={ctx.close} />;
};

const DayEventsFixture = ({ ctx }: { ctx: FixtureContext }) => {
  const project = ctx.project!;
  const { productionSections, sectionDateMap, activeVersion } = useDaybreakSections();
  const date = pickedDate(ctx);

  const violations = useMemo(() => {
    if (!activeVersion) return [];
    return computeSectionViolationMap(
      activeVersion.rows, productionSections, sectionDateMap,
      project.rules || [], project.scenes, project.castMembers || [],
    ).get(date) || [];
  }, [activeVersion, productionSections, sectionDateMap, project.rules, project.scenes, project.castMembers, date]);

  const rules = useMemo(() => rulesRelevantToDay(project.rules || [], date), [project.rules, date]);

  useEffect(() => {
    ctx.select({ kind: 'day', id: date, label: date });
  }, [ctx.select, date]);

  return <DayEventsModal dateKey={date} violations={violations} rules={rules} onClose={ctx.close} />;
};

const ProductionDatesFixture = ({ ctx }: { ctx: FixtureContext }) => (
  <ProductionDatesModal onClose={ctx.close} />
);

/** Add form is controlled by its host (DayTypesTab) — mirror those blank
 *  defaults here; Create/close only dismiss the preview (no project write). */
const DayTypeAddFixture = ({ ctx }: { ctx: FixtureContext }) => {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('Tag');
  const [color, setColor] = useState('');
  const [attachable, setAttachable] = useState(true);

  return (
    <AddDayTypeModal
      open
      onClose={ctx.close}
      name={name}
      onNameChange={setName}
      icon={icon}
      onIconChange={setIcon}
      color={color}
      onColorChange={setColor}
      attachable={attachable}
      onAttachableChange={setAttachable}
      onSubmit={ctx.close}
    />
  );
};

/** Edit form seeded from a real project type — a custom type when there is
 *  one, else the first user-markable built-in. */
const DayTypeEditFixture = ({ ctx }: { ctx: FixtureContext }) => {
  const project = ctx.project!;
  const dayTypes = useMemo(() => getDayTypes(project), [project]);
  const type = useMemo(
    () => dayTypes.find(t => !t.builtin) || dayTypes.find(t => t.markable !== false) || dayTypes[0],
    [dayTypes],
  );
  const [name, setName] = useState(type?.label || '');
  const [icon, setIcon] = useState(() => (type ? iconForType(project.dayTypes, type.key) || 'Tag' : 'Tag'));
  const [color, setColor] = useState(type?.color || '');
  const [attachable, setAttachable] = useState(type?.attachable !== false);

  useEffect(() => {
    if (type) ctx.select({ kind: 'day', id: type.key, label: type.label });
  }, [ctx.select, type?.key, type?.label]);

  return (
    <EditDayTypeModal
      open
      onClose={ctx.close}
      name={name}
      onNameChange={setName}
      icon={icon}
      onIconChange={setIcon}
      color={color}
      onColorChange={setColor}
      attachable={attachable}
      onAttachableChange={setAttachable}
      onSubmit={ctx.close}
    />
  );
};

/** A real colour rule when the palette has one, else the new-rule state. */
const ColorRuleFixture = ({ ctx }: { ctx: FixtureContext }) => {
  const project = ctx.project!;
  const rule = project.colorPalette?.colorRules?.[0] ?? null;

  const handleSave = (saved: ColorRule) => {
    const exists = (project.colorPalette?.colorRules || []).some(r => r.id === saved.id);
    ctx.dispatch({ type: exists ? 'UPDATE_COLOR_RULE' : 'ADD_COLOR_RULE', payload: saved });
  };

  const handleDelete = (id: string) => ctx.dispatch({ type: 'DELETE_COLOR_RULE', payload: id });

  useEffect(() => {
    const condition = rule?.conditions[0];
    if (condition) {
      ctx.select(condition.category === 'cast'
        ? { kind: 'cast', id: condition.elementId, label: rule!.name }
        : { kind: 'element', id: condition.elementId, label: rule!.name });
    }
  }, [ctx.select, rule]);

  return (
    <ColorRuleEditModal
      rule={rule}
      onSave={handleSave}
      onDelete={rule ? handleDelete : undefined}
      onClose={ctx.close}
    />
  );
};

/** The shared scheduling-rule editor over the project's first rule (or the
 *  new-rule state on an empty rules list). Save/Delete behave like the tabs. */
const RuleEditorFixture = ({ ctx }: { ctx: FixtureContext }) => {
  const project = ctx.project!;
  const rule = project.rules?.[0] ?? null;

  const handleSave = (rules: ProjectRule[]) => {
    for (const saved of rules) {
      ctx.dispatch({ type: rule && saved.id === rule.id ? 'UPDATE_RULE' : 'ADD_RULE', payload: saved });
    }
    ctx.close();
  };

  const handleDelete = rule
    ? () => { ctx.dispatch({ type: 'DELETE_RULE', payload: rule.id }); ctx.close(); }
    : undefined;

  useEffect(() => {
    const castId = rule ? firstRuleCastId(rule) : undefined;
    if (castId) ctx.select({ kind: 'cast', id: castId, label: castLabel(project, castId) });
  }, [ctx.select, rule]);

  return (
    <RuleEditorModal
      open
      initial={rule}
      onSave={handleSave}
      onDelete={handleDelete}
      onClose={ctx.close}
    />
  );
};

/** One palette slot — the picked scene's INT/EXT + DAY/NIGHT cell when it
 *  exists, else the palette's first cell. */
const PaletteColourFixture = ({ ctx }: { ctx: FixtureContext }) => {
  const project = ctx.project!;
  const palette = project.colorPalette || DEFAULT_COLOR_PALETTE;
  const scene = ctx.picks.scene ? project.scenes.find(s => s.id === ctx.picks.scene!.id) : undefined;

  const entry = useMemo(() => {
    const forScene = scene
      ? palette.sceneColors.find(c => c.intExt.toUpperCase() === (scene.intExt || '').toUpperCase()
        && c.dayNight.toUpperCase() === (scene.dayNight || '').toUpperCase())
      : undefined;
    return forScene || palette.sceneColors[0];
  }, [palette, scene]);

  const intExt = entry?.intExt || 'INT';
  const dayNight = entry?.dayNight || 'DAY';
  const label = `${intExt} ${dayNight}`;

  useEffect(() => {
    if (scene) ctx.select({ kind: 'scene', id: scene.id, label: `${scene.sceneNumber} — ${label}` });
  }, [ctx.select, scene?.id, scene?.sceneNumber, label]);

  return (
    <PaletteColorModal
      open
      label={label}
      background={entry?.background || '#ffffff'}
      text={entry?.text || '#000000'}
      onApply={(background, text) => {
        ctx.dispatch({ type: 'SET_COLOR_PALETTE', payload: updateSceneColor(palette, intExt, dayNight, background, text) });
      }}
      onReset={() => {
        const idx = findEntry(DEFAULT_COLOR_PALETTE.sceneColors, intExt, dayNight);
        return idx >= 0
          ? { background: DEFAULT_COLOR_PALETTE.sceneColors[idx].background, text: DEFAULT_COLOR_PALETTE.sceneColors[idx].text }
          : { background: '#ffffff', text: '#000000' };
      }}
      onClose={ctx.close}
    />
  );
};

/** The INT/EXT + DAY/NIGHT matrix cell editor over the palette's first cell. */
const SceneCellEditFixture = ({ ctx }: { ctx: FixtureContext }) => {
  const project = ctx.project!;
  const palette = project.colorPalette || DEFAULT_COLOR_PALETTE;
  const entry = palette.sceneColors[0] || { intExt: 'INT', dayNight: 'DAY', background: '#ffffff', text: '#000000' };

  return (
    <SceneCellEditModal
      open
      intExt={entry.intExt}
      dayNight={entry.dayNight}
      background={entry.background}
      text={entry.text}
      palette={palette}
      onApply={(background, text) => {
        ctx.dispatch({ type: 'SET_COLOR_PALETTE', payload: updateSceneColor(palette, entry.intExt, entry.dayNight, background, text) });
      }}
      onClose={ctx.close}
    />
  );
};

export const render: Record<Id, SurfaceRender> = {
  'event-editor': (ctx) => <EventEditorFixture ctx={ctx} />,
  'event-adder': (ctx) => <EventAdderFixture ctx={ctx} />,
  'day-events': (ctx) => <DayEventsFixture ctx={ctx} />,
  'production-dates': (ctx) => <ProductionDatesFixture ctx={ctx} />,
  'day-type-add': (ctx) => <DayTypeAddFixture ctx={ctx} />,
  'day-type-edit': (ctx) => <DayTypeEditFixture ctx={ctx} />,
  'color-rule': (ctx) => <ColorRuleFixture ctx={ctx} />,
  'rule-editor': (ctx) => <RuleEditorFixture ctx={ctx} />,
  'palette-colour': (ctx) => <PaletteColourFixture ctx={ctx} />,
  'scene-cell-edit': (ctx) => <SceneCellEditFixture ctx={ctx} />,
};
