import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FixtureContext, SurfaceRender } from '../types';
import { meta } from '../surfaces/script';
import SceneCutModal from '../../../components/script/SceneCutModal';
import SceneDuplicateModal from '../../../components/script/SceneDuplicateModal';
import SplitBreakModal from '../../../components/script/SplitBreakModal';
import SplitManagerModal from '../../../components/script/SplitManagerModal';
import ScriptUpdateModal from '../../../components/ScriptUpdateModal';
import { NewCastNamingModal, type NewCastNamingEntry } from '../../../components/elements/NewCastNamingModal';
import { ELEMENT_CATEGORIES, getFieldItems } from '../../../lib/categories';
import { formatSceneHeading, normalizeSceneNumber, scriptSceneOf } from '../../../lib/script';
import { nextLetterSceneNumber } from '../../../lib/sceneNumbering';
import { buildSceneDuplicate } from '../../../lib/sceneDuplicates';
import { splitGroups, type SplitGroup } from '../../../lib/splitGroups';
import { isLabSandboxProject } from '../../../lib/labState';
import type { ImportCharacter, ImportResult, ParsedScene } from '../../../lib/import';
import type { Project, Scene, ScriptBlock, ScriptDocument } from '../../../types';

/**
 * Script fixture batch (roadmap 374). The script modals read the retained
 * screenplay body / split groups from the store, so a project that never
 * imported a screenplay has nothing to show. When (and only when) the active
 * project has no `scriptDocument`, these fixtures seed a small sample document
 * for the first scenes — one undoable `UPDATE_SCRIPT_DOCUMENT`; a real
 * document is never rewritten. `split-manager` / `split-break` also add ONE
 * preview split group through the canonical duplicate builder when the project
 * has none (`BATCH_START` + `ADD_SCENE`, one undo step) so the list and the
 * Move-break tool can be reviewed with real bodies. A project's own split
 * groups are always used as-is.
 */

type Id = (typeof meta)[number]['id'];

const SAMPLE_SCRIPT_NAME = 'modals-studio-sample.fountain';
/** Scenes given a retained body in the seeded sample document. */
const SAMPLE_SCENE_COUNT = 4;

const PreviewNote: React.FC<{ text: string }> = ({ text }) => (
  <div className="mx-auto mt-10 max-w-md rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-3 text-[11px] leading-relaxed text-[color:var(--ui-text-muted)]">
    {text}
  </div>
);

/** A short screenplay body built from the scene's own heading/description. */
function bodyBlocks(scene: Scene): ScriptBlock[] {
  return [
    ['heading', formatSceneHeading(scene.intExt, scene.set, scene.dayNight)],
    ['action', scene.description || 'Snow falls over the town square.'],
    ['character', 'GEORGE'],
    ['dialogue', 'You see, I never think of myself as a man of destiny.'],
    ['action', 'A bell rings somewhere in the distance.'],
    ['character', 'MARY'],
    ['dialogue', 'George Bailey, you are the richest man in town.'],
    ['action', 'The doors swing open and the crowd spills into the street.'],
  ];
}

function buildSampleDocument(project: Project): ScriptDocument {
  return {
    format: 'fountain',
    name: SAMPLE_SCRIPT_NAME,
    scenes: project.scenes.slice(0, SAMPLE_SCENE_COUNT).map(scene => ({
      sceneNumber: scene.sceneNumber,
      blocks: bodyBlocks(scene),
    })),
  };
}

/** Seed the sample retained body when the project has none (one undoable
 *  update; driven to a no-op for a real document and after an Undo). */
function usePreviewScriptDocument(ctx: FixtureContext): void {
  const project = ctx.project!;
  const seededFor = useRef<string | null>(null);
  const needsSample = !project.scriptDocument && project.scenes.length > 0;

  useEffect(() => {
    const live = ctx.project;
    if (!live || live.scriptDocument || live.scenes.length === 0) return;
    // Preview seeding is a SANDBOX privilege: the demo project the studio
    // imported, never the user's own project.
    if (!isLabSandboxProject(live.id)) return;
    // One seed per project per mount — undoing it stays undone.
    if (seededFor.current === live.id) return;
    seededFor.current = live.id;
    ctx.dispatch({ type: 'UPDATE_SCRIPT_DOCUMENT', payload: { document: buildSampleDocument(live) } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, needsSample]);
}

/** Publish the scene in view for `get_lab_state`. */
function useSelectScene(ctx: FixtureContext, scene: Scene | undefined): void {
  useEffect(() => {
    if (!scene) return;
    ctx.select({ kind: 'scene', id: scene.id, label: scene.sceneNumber });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.id, scene?.sceneNumber]);
}

/** The scene a cut should show: the studio's pick when it has a body, else the
 *  first scene that does. */
function cutSceneFor(project: Project, pickId: string | undefined): Scene | undefined {
  const pick = project.scenes.find(s => s.id === pickId);
  const doc = project.scriptDocument;
  if (pick && (!doc || scriptSceneOf(doc, pick.sceneNumber))) return pick;
  const withBody = doc ? project.scenes.find(s => scriptSceneOf(doc, s.sceneNumber)) : undefined;
  return withBody ?? pick ?? project.scenes[0];
}

/** The project's first split group, seeding one preview duplicate when it has
 *  none (real bodies included, one undo batch). */
function usePreviewSplitGroup(ctx: FixtureContext): SplitGroup | undefined {
  const project = ctx.project!;
  const group = useMemo(() => splitGroups(project.scenes)[0], [project.scenes]);
  /** One preview per project per mount — undoing it stays undone. */
  const seededFor = useRef<string | null>(null);
  const duplicatedFor = useRef<string | null>(null);

  useEffect(() => {
    const live = ctx.project;
    if (!live || splitGroups(live.scenes).length > 0 || live.scenes.length === 0) return;
    if (!isLabSandboxProject(live.id)) return;
    if (!live.scriptDocument) {
      if (seededFor.current === live.id) return;
      seededFor.current = live.id;
      ctx.dispatch({ type: 'UPDATE_SCRIPT_DOCUMENT', payload: { document: buildSampleDocument(live) } });
      return;
    }
    if (!live.scenes.some(s => !!scriptSceneOf(live.scriptDocument, s.sceneNumber))) return;
    if (duplicatedFor.current === live.id) return;
    duplicatedFor.current = live.id;
    // Same flow as SceneDuplicateModal's split mode: build, add the scene, and
    // insert its retained body after the parent body.
    const base = live.scenes.find(s => !!scriptSceneOf(live.scriptDocument, s.sceneNumber))!;
    const duplicate = buildSceneDuplicate(live, base, 'split');
    ctx.dispatch({ type: 'BATCH_START' });
    ctx.dispatch({ type: 'ADD_SCENE', payload: duplicate.scene });
    if (duplicate.scriptScene) {
      const doc = live.scriptDocument;
      const source = scriptSceneOf(doc, base.sceneNumber)!;
      const scenes = [...doc.scenes];
      scenes.splice(doc.scenes.indexOf(source) + 1, 0, duplicate.scriptScene);
      ctx.dispatch({ type: 'UPDATE_SCRIPT_DOCUMENT', payload: { document: { ...doc, scenes } } });
    }
    ctx.dispatch({ type: 'BATCH_COMMIT' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, !!project.scriptDocument, group?.original.id, project.scenes.length]);

  return group;
}

/** Scene fields → the import parser's shape. Cast ids resolve to names the way
 *  a screenplay would carry them; every element field round-trips unchanged so
 *  only the fixture's intended edit shows as a diff. */
function parsedFromScene(project: Project, scene: Scene, castNameById: Map<string, string>): ParsedScene {
  const taggedElements: Record<string, string[]> = {};
  for (const category of ELEMENT_CATEGORIES) {
    if (category.key === 'cast' || category.key === 'set') continue;
    const items = getFieldItems(category.key, ((scene as unknown as Record<string, string>)[category.key] as string) || '');
    if (items.length) taggedElements[category.key] = items;
  }
  for (const custom of project.customCategories || []) {
    const items = getFieldItems(custom.key, ((scene as unknown as Record<string, string>)[custom.key] as string) || '');
    if (items.length) taggedElements[custom.key] = items;
  }
  if (scene.location) taggedElements.location = [scene.location];
  if (scene.notes) taggedElements.notes = [scene.notes];
  if (scene.scriptDay) taggedElements.scriptDay = [scene.scriptDay];

  return {
    sceneNumber: scene.sceneNumber,
    scriptPageNumbers: scene.scriptPageNumbers,
    pageCount: scene.pageCount || undefined,
    pageCountDecimal: scene.pageCountDecimal || undefined,
    intExt: scene.intExt,
    set: scene.set,
    dayNight: scene.dayNight,
    description: scene.description,
    characters: getFieldItems('cast', scene.cast || '').map(id => castNameById.get(String(id)) || String(id)),
    taggedElements,
  };
}

const ADDED_BODY: ScriptBlock[] = [
  ['heading', formatSceneHeading('INT', 'BAILEY BUILDING', 'DAY')],
  ['action', 'George signs the ledger and looks up at the clock.'],
  ['character', 'GEORGE'],
  ['dialogue', 'I suppose it can wait until morning.'],
];

/** A revised screenplay: one modified scene (body + notes), one removed
 *  scene, one added scene — enough to walk the whole keep/take review. */
function buildScriptUpdate(project: Project): { result: ImportResult; fileName: string } | null {
  const doc = project.scriptDocument;
  if (!doc || project.scenes.length === 0) return null;

  const withBody = project.scenes.filter(s => !!scriptSceneOf(doc, s.sceneNumber));
  if (withBody.length === 0) return null;
  const modified = withBody[0];
  const removed = withBody.length > 1
    ? withBody[withBody.length - 1]
    : project.scenes.find(s => s.id !== modified.id);

  const castNameById = new Map((project.castMembers || []).map(m => [String(m.id), m.name]));
  const addedNumber = nextLetterSceneNumber(project.scenes, project.scenes[project.scenes.length - 1].sceneNumber);

  const scenes = project.scenes
    .filter(s => s.id !== removed?.id)
    .map(s => parsedFromScene(project, s, castNameById));

  const modifiedParsed = scenes.find(p => normalizeSceneNumber(p.sceneNumber) === normalizeSceneNumber(modified.sceneNumber));
  if (!modifiedParsed) return null;
  // A visible field change alongside the body edit (notes is a diffed value;
  // description rides the body fallback, so it would not show in the strip).
  const revisionNote = 'Revised: the bank examiner waits.';
  modifiedParsed.taggedElements = {
    ...modifiedParsed.taggedElements,
    notes: [modified.notes ? `${modified.notes}, ${revisionNote}` : revisionNote],
  };

  scenes.push({
    sceneNumber: addedNumber,
    pageCount: '1/8',
    pageCountDecimal: 0.125,
    intExt: 'INT',
    set: 'BAILEY BUILDING',
    dayNight: 'DAY',
    description: 'George signs the ledger and looks up at the clock.',
    characters: getFieldItems('cast', modified.cast || '').map(id => castNameById.get(String(id)) || String(id)),
    taggedElements: { props: ['Ledger'] },
  });

  const characterScenes = new Map<string, number[]>();
  scenes.forEach((parsed, i) => {
    for (const name of parsed.characters) {
      if (!characterScenes.has(name)) characterScenes.set(name, []);
      characterScenes.get(name)!.push(i);
    }
  });
  const characters: ImportCharacter[] = [...characterScenes.entries()].map(([name, indices]) => ({ name, scenes: indices }));

  const revised: ScriptDocument = {
    ...doc,
    scenes: [
      ...doc.scenes
        .filter(s => !removed || normalizeSceneNumber(s.sceneNumber) !== normalizeSceneNumber(removed.sceneNumber))
        .map(s => normalizeSceneNumber(s.sceneNumber) === normalizeSceneNumber(modified.sceneNumber)
          ? { ...s, blocks: [...s.blocks, ['action', 'The town waits for word from the bank.'] as ScriptBlock] }
          : s),
      { sceneNumber: addedNumber, blocks: ADDED_BODY.map(block => [...block] as ScriptBlock) },
    ],
  };

  return {
    result: { title: project.title, scenes, characters, unknownCategories: [], script: revised },
    fileName: 'revised-draft.fountain',
  };
}

const SceneCutPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  usePreviewScriptDocument(ctx);
  const scene = useMemo(
    () => cutSceneFor(project, ctx.picks.scene?.id),
    [project, ctx.picks.scene?.id],
  );
  useSelectScene(ctx, scene);

  if (!scene) return <PreviewNote text="This project has no scenes to cut." />;
  return <SceneCutModal sceneId={scene.id} initialSplitIndex={2} onClose={ctx.close} />;
};

const SceneDuplicatePreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  const scene = project.scenes.find(s => s.id === ctx.picks.scene?.id) ?? project.scenes[0];
  useSelectScene(ctx, scene);

  if (!scene) return <PreviewNote text="This project has no scenes to duplicate." />;
  return <SceneDuplicateModal scene={scene} onConfirm={() => {}} onClose={ctx.close} />;
};

const SplitManagerPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const group = usePreviewSplitGroup(ctx);
  useSelectScene(ctx, group?.original);
  return <SplitManagerModal onOpen={() => {}} onClose={ctx.close} />;
};

const SplitBreakPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const group = usePreviewSplitGroup(ctx);
  useSelectScene(ctx, group?.original);

  if (!group) return <PreviewNote text="This project has no split group, and no retained body to build a preview one from." />;
  return <SplitBreakModal group={group} onClose={ctx.close} />;
};

const ScriptUpdatePreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  usePreviewScriptDocument(ctx);
  const preview = useMemo(() => buildScriptUpdate(project), [project]);

  if (!preview) return <PreviewNote text="This project has no retained screenplay body to revise." />;
  return <ScriptUpdateModal result={preview.result} fileName={preview.fileName} onClose={ctx.close} />;
};

const NewCastNamingPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const [entries, setEntries] = useState<NewCastNamingEntry[]>([
    { id: '88', name: '', displayId: '88' },
    { id: 'typed-violet', name: 'VIOLET', nameTyped: true, displayId: '12' },
  ]);

  return (
    <NewCastNamingModal
      entries={entries}
      onChangeName={(id, name) => setEntries(prev => prev.map(e => (e.id === id ? { ...e, name } : e)))}
      onUndo={id => setEntries(prev => prev.filter(e => e.id !== id))}
      onSave={ctx.close}
      onCancel={ctx.close}
    />
  );
};

export const render: Record<Id, SurfaceRender> = {
  'scene-cut': (ctx) => <SceneCutPreview ctx={ctx} />,
  'scene-duplicate': (ctx) => <SceneDuplicatePreview ctx={ctx} />,
  'split-break': (ctx) => <SplitBreakPreview ctx={ctx} />,
  'split-manager': (ctx) => <SplitManagerPreview ctx={ctx} />,
  'script-update': (ctx) => <ScriptUpdatePreview ctx={ctx} />,
  'new-cast-naming': (ctx) => <NewCastNamingPreview ctx={ctx} />,
};
