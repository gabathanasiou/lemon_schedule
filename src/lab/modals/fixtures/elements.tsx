import React, { useEffect, useMemo, useState } from 'react';
import type { Link, Project, ProjectElement } from '../../../types';
import type { LabSelection } from '../../../lib/labState';
import { ELEMENT_CATEGORIES, getLabel, isMultiValue } from '../../../lib/categories';
import { boardIdOf, boardLabel, elementKey, elementMatchId, getCategoryElements } from '../../../lib/elements';
import { crewLinkViews } from '../../../lib/crewLinks';
import { ElementViewModal } from '../../../components/elements/ElementViewModal';
import { LinkManagerModal } from '../../../components/elements/LinkManagerModal';
import { CrewLinkManagerModal } from '../../../components/crew/CrewLinkManagerModal';
import { MergeRowsModal } from '../../../components/elements/MergeRowsModal';
import type { MergeGroup } from '../../../components/elements/MergeRowsModal';
import {
  AddCustomCategoryModal,
  EditBuiltinLabelModal,
  EditCustomCategoryModal,
  LabelModal,
} from '../../../components/elements/CategoryModals';
import { LocationPickerModal } from '../../../components/location/LocationPickerModal';
import TrashModal from '../../../components/TrashModal';
import { meta } from '../surfaces/elements';
import type { FixtureContext, FixturePicks, SurfaceRender } from '../types';

type Id = (typeof meta)[number]['id'];

/** Publish what the fixture is pointed at for the studio's MCP reader. */
function useLabSelection(ctx: FixtureContext, selection: LabSelection | undefined) {
  const select = ctx.select;
  const kind = selection?.kind;
  const id = selection?.id;
  const label = selection?.label;
  useEffect(() => {
    select?.(kind ? { kind, id, label } : undefined);
    return () => select?.(undefined);
  }, [select, kind, id, label]);
}

// ---- Element view -----------------------------------------------------------

/** The Element Manager's manager-row key: cast Board ID / the element id
 *  (name only when the element has no id). Never the display label. */
function viewKeyOf(element: ProjectElement): string {
  return elementKey(element);
}

function elementSelection(project: Project, category: string, element: ProjectElement): LabSelection {
  return {
    kind: category === 'cast' ? 'cast' : 'element',
    id: element.id,
    label: boardLabel(boardIdOf(element, category), element.name || element.id),
  };
}

function findElement(project: Project, category: string, value: string): ProjectElement | undefined {
  const needle = value.trim();
  const list = getCategoryElements(project, category);
  return list.find(e => elementMatchId(e, category) === needle)
    ?? list.find(e => String(e.id) === needle)
    ?? list.find(e => (e.name || '').toLowerCase() === needle.toLowerCase());
}

function firstCategoryWithElements(project: Project): string {
  const entry = Object.entries(project.breakdownElements || {}).find(([, list]) => (list || []).length > 0);
  if (entry) return entry[0];
  if ((project.castMembers || []).length > 0) return 'cast';
  return ELEMENT_CATEGORIES[0].key;
}

/** Cast first — it is the panel's richest case (performer + booking rows, and
 *  the seeded project links real props to the cast). Falls back to the
 *  project-derived element pick, then to the first category with elements. */
function pickElementView(project: Project, picks: FixturePicks): { category: string; element?: ProjectElement } {
  if (picks.cast) {
    const list = getCategoryElements(project, 'cast');
    const element = list.find(e => String(e.id) === picks.cast!.id) ?? list[0];
    return { category: 'cast', element };
  }
  if (picks.element) {
    const list = getCategoryElements(project, picks.element.category);
    const element = findElement(project, picks.element.category, picks.element.key) ?? list[0];
    return { category: picks.element.category, element };
  }
  const category = firstCategoryWithElements(project);
  return { category, element: getCategoryElements(project, category)[0] };
}

const ElementViewFixture: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  const { category, element } = pickElementView(project, ctx.picks);
  useLabSelection(ctx, element ? elementSelection(project, category, element) : undefined);
  return (
    <ElementViewModal
      category={category}
      rowKey={element ? viewKeyOf(element) : ''}
      onClose={ctx.close}
    />
  );
};

// ---- Links ------------------------------------------------------------------

function firstElementAnchor(project: Project): Link | undefined {
  return (project.links || []).find(link =>
    link.anchorKind === 'element' && !!link.anchorCategory && !!link.anchorValue);
}

const LinkManagerFixture: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  const anchor = firstElementAnchor(project);
  const anchorElement = anchor?.anchorCategory
    ? findElement(project, anchor.anchorCategory, anchor.anchorValue)
    : undefined;
  // The app opens the manager for the Element Manager's current category; the
  // studio uses the first real anchor card's category so the seeded links show.
  const category = anchor?.anchorCategory
    || ctx.picks.element?.category
    || (ctx.picks.cast ? 'cast' : 'props');
  useLabSelection(ctx, anchor && anchorElement && anchor.anchorCategory
    ? elementSelection(project, anchor.anchorCategory, anchorElement)
    : undefined);
  return <LinkManagerModal initialAnchorCategory={category} onClose={ctx.close} />;
};

function crewPersonName(project: Project, personId: string): string | undefined {
  for (const role of project.crewRoles || []) {
    const person = (project.crew?.[role.key] || []).find(p => p.id === personId);
    if (person) return person.name || '(unnamed)';
  }
  return undefined;
}

const CrewLinksFixture: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  // This manager takes no initial-anchor prop — it reads the project's crew
  // links directly (element→crew or crew→crew). Empty until the project has one.
  const view = crewLinkViews(project.links).find(link => link.personId);
  const personName = view ? crewPersonName(project, view.personId) : undefined;
  useLabSelection(ctx, view && personName
    ? { kind: 'crew', id: view.personId, label: personName }
    : undefined);
  return <CrewLinkManagerModal onClose={ctx.close} />;
};

// ---- Merge elements ---------------------------------------------------------

const MERGE_INTRO =
  'The following elements now share a name. Merging collapses each set into a single element and updates every scene that references them.';

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sceneValues(category: string, raw: string | undefined, project: Project): string[] {
  if (!raw || !raw.trim()) return [];
  if (!isMultiValue(category, project.customCategories)) return [raw.trim()];
  return raw.split(',').map(value => value.trim()).filter(Boolean);
}

/** Category label + every category key the project actually has (built-in,
 *  custom, or present only in `breakdownElements`). */
function projectCategories(project: Project): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  const add = (key: string, label: string) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ key, label });
  };
  for (const category of ELEMENT_CATEGORIES) {
    add(category.key, getLabel(category.key, category.label, project.categoryLabels));
  }
  for (const category of project.customCategories || []) add(category.key, category.label);
  for (const key of Object.keys(project.breakdownElements || {})) add(key, getLabel(key, key, project.categoryLabels));
  return out;
}

function sceneNumbersFor(project: Project, category: string, names: string[]): string[] {
  const wanted = new Set(names.map(normalizeName));
  const castIds = new Set<string>();
  if (category === 'cast') {
    for (const element of getCategoryElements(project, category)) {
      if (wanted.has(normalizeName(element.name))) castIds.add(String(element.id));
    }
  }
  const numbers = new Set<string>();
  project.scenes.forEach((scene, index) => {
    const raw = category === 'cast'
      ? scene.cast
      : (scene as unknown as Record<string, string | undefined>)[category];
    const values = sceneValues(category, raw, project);
    const hit = category === 'cast'
      ? values.some(value => castIds.has(value))
      : values.some(value => wanted.has(normalizeName(value)));
    if (hit) numbers.add(scene.sceneNumber || String(index + 1));
  });
  return [...numbers];
}

function mergeItem(targetName: string, sourceNames: string[], sceneNumbers: string[]) {
  return {
    sourceNames: [...sourceNames.filter(name => name !== targetName), targetName],
    targetName,
    summary: `${sceneNumbers.length} ${sceneNumbers.length === 1 ? 'scene' : 'scenes'}`,
    detailLines: sceneNumbers.length > 0 ? [`Scenes: ${sceneNumbers.join(', ')}`] : undefined,
  };
}

function buildMergePreview(project: Project): { groups: MergeGroup[]; sample: boolean } {
  const categories = projectCategories(project);
  const groups: MergeGroup[] = [];
  const usedLabels = new Set<string>();
  const uniqueLabel = (label: string) => {
    let next = label;
    let n = 2;
    while (usedLabels.has(next)) next = `${label} (${n++})`;
    usedLabels.add(next);
    return next;
  };

  for (const category of categories) {
    const byName = new Map<string, ProjectElement[]>();
    for (const element of getCategoryElements(project, category.key)) {
      if (!(element.name || '').trim()) continue;
      const key = normalizeName(element.name);
      byName.set(key, [...(byName.get(key) || []), element]);
    }
    const merges = [...byName.values()]
      .filter(list => list.length > 1)
      .map(list => {
        const targetName = (list[0].name || '').trim();
        const sourceNames = [...new Set(list.map(element => (element.name || '').trim()))];
        return mergeItem(targetName, sourceNames, sceneNumbersFor(project, category.key, sourceNames));
      });
    if (merges.length > 0) groups.push({ label: uniqueLabel(category.label), merges });
  }

  if (groups.length > 0) return { groups, sample: false };

  // No case/space duplicates: show a valid sample built from a real element so
  // the confirmation body is not blank. Nothing is written to the project.
  const candidate = categories
    .filter(category => category.key !== 'cast')
    .map(category => ({ category, element: getCategoryElements(project, category.key)
      .find(element => /[a-z]/i.test(element.name || '')) }))
    .find(entry => entry.element);
  if (candidate?.element) {
    const targetName = (candidate.element.name || '').trim();
    const lower = targetName.toLowerCase();
    const variant = targetName === lower ? targetName.toUpperCase() : lower;
    const sceneNumbers = sceneNumbersFor(project, candidate.category.key, [targetName]);
    return {
      groups: [{
        label: candidate.category.label,
        merges: [mergeItem(targetName, [variant, targetName], sceneNumbers)],
      }],
      sample: true,
    };
  }

  return {
    groups: [{
      label: 'Props',
      merges: [mergeItem('"Bridal Suite" Sign', ['"Bridal suite" Sign', '"Bridal Suite" Sign'], ['1', '4', '7'])],
    }],
    sample: true,
  };
}

const MergeRowsFixture: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  const { groups, sample } = useMemo(() => buildMergePreview(project), [project]);
  return (
    <MergeRowsModal
      title="Merge Elements"
      intro={sample ? `Preview sample — this project has no same-name duplicates. ${MERGE_INTRO}` : MERGE_INTRO}
      groups={groups}
      onCancel={ctx.close}
      onConfirm={ctx.close}
    />
  );
};

// ---- Category modals (controlled forms need local preview state) ------------

const AddCategoryFixture: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('Tag');
  const [multiValue, setMultiValue] = useState(true);
  return (
    <AddCustomCategoryModal
      open
      onClose={ctx.close}
      name={name}
      onNameChange={setName}
      catIcon={icon}
      onIconChange={setIcon}
      multiValue={multiValue}
      onMultiValueChange={setMultiValue}
      onSubmit={ctx.close}
    />
  );
};

const EditCategoryFixture: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const category = ctx.project!.customCategories?.[0];
  const [name, setName] = useState(category?.label || 'Period Vehicles');
  const [icon, setIcon] = useState(category?.icon || 'Tag');
  const [multiValue, setMultiValue] = useState(category?.multiValue ?? true);
  return (
    <EditCustomCategoryModal
      open
      onClose={ctx.close}
      name={name}
      onNameChange={setName}
      catIcon={icon}
      onIconChange={setIcon}
      multiValue={multiValue}
      onMultiValueChange={setMultiValue}
      onSubmit={ctx.close}
    />
  );
};

const RenameCategoryFixture: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  const custom = project.customCategories?.[0];
  const builtin = ELEMENT_CATEGORIES[0];
  const [name, setName] = useState(
    custom?.label || getLabel(builtin.key, builtin.label, project.categoryLabels),
  );
  return (
    <LabelModal
      open
      title="Rename Category"
      submitLabel="Save"
      onClose={ctx.close}
      name={name}
      onNameChange={setName}
      onSubmit={ctx.close}
    />
  );
};

const LabelEditFixture: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  const key = Object.keys(project.categoryLabels || {}).find(labelKey =>
    ELEMENT_CATEGORIES.some(category => category.key === labelKey)) || 'props';
  const builtin = ELEMENT_CATEGORIES.find(category => category.key === key);
  const [name, setName] = useState(getLabel(key, builtin?.label || key, project.categoryLabels));
  return (
    <EditBuiltinLabelModal
      open
      onClose={ctx.close}
      name={name}
      onNameChange={setName}
      onSubmit={ctx.close}
    />
  );
};

// ---- Location picker --------------------------------------------------------

const LocationPickerFixture: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  const location = ctx.picks.location
    ? (project.locations || []).find(candidate => candidate.id === ctx.picks.location!.id)
    : undefined;
  useLabSelection(ctx, location
    ? { kind: 'location', id: location.id, label: location.name }
    : undefined);
  return (
    <LocationPickerModal
      open
      onClose={ctx.close}
      onConfirm={ctx.close}
      initial={location
        ? { lat: location.lat, lng: location.lng, place: location.place, address: location.address }
        : null}
      locationTypes={project.locationTypes || []}
      defaultType={location?.type || project.locationTypes?.[0]?.key || 'set'}
      editing={!!location}
    />
  );
};

// ---- Trash ------------------------------------------------------------------

const TrashFixture: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => (
  <TrashModal open onClose={ctx.close} project={ctx.project!} dispatch={ctx.dispatch} />
);

export const render: Record<Id, SurfaceRender> = {
  'element-view': ctx => <ElementViewFixture key={ctx.project?.id} ctx={ctx} />,
  'link-manager': ctx => <LinkManagerFixture key={ctx.project?.id} ctx={ctx} />,
  'crew-links': ctx => <CrewLinksFixture key={ctx.project?.id} ctx={ctx} />,
  'merge-rows': ctx => <MergeRowsFixture key={ctx.project?.id} ctx={ctx} />,
  'category-add': ctx => <AddCategoryFixture key={ctx.project?.id} ctx={ctx} />,
  'category-edit': ctx => <EditCategoryFixture key={ctx.project?.id} ctx={ctx} />,
  'category-rename': ctx => <RenameCategoryFixture key={ctx.project?.id} ctx={ctx} />,
  'label-edit': ctx => <LabelEditFixture key={ctx.project?.id} ctx={ctx} />,
  'location-picker': ctx => <LocationPickerFixture key={ctx.project?.id} ctx={ctx} />,
  trash: ctx => <TrashFixture key={ctx.project?.id} ctx={ctx} />,
};
