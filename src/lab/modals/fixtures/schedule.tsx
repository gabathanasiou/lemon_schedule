import React, { useEffect, useMemo, useState } from 'react';
import type { FixtureContext, SurfaceRender } from '../types';
import { meta } from '../surfaces/schedule';
import type { Project, RuleViolation, Scene } from '../../../types';
import AddBannerModal from '../../../components/AddBannerModal';
import BannerColorModal from '../../../components/schedule/BannerColorModal';
import BannerDeleteModal, { type BannerDeleteEntry } from '../../../components/schedule/BannerDeleteModal';
import AutoDaybreakModal from '../../../components/schedule/AutoDaybreakModal';
import StripboardPrepareModal from '../../../components/schedule/StripboardPrepareModal';
import DeleteScenesModal from '../../../components/schedule/DeleteScenesModal';
import CsvImportConfirmModal from '../../../components/import/CsvImportConfirmModal';
import SceneNumberCollisionModal from '../../../components/schedule/SceneNumberCollisionModal';
import { NewSceneModal } from '../../../components/NewSceneModal';
import { CustomOrderSortModal } from '../../../components/CustomOrderSortModal';
import { ViolationModal, ShootViolationsModal } from '../../../components/ViolationModal';
import { createBlankScene } from '../../../lib/sceneFactory';
import { computeSectionViolationMap } from '../../../lib/rulesEngine';
import { useDaybreakSections } from '../../../lib/useDaybreakSections';
import { addDays } from '../../../lib/daybreakUtils';
import { getNoteBannerColors } from '../../../lib/ribbonUtils';
import { isEmptyDayMeta } from '../../../lib/dayMeta';
import { formatDateLong, formatDuration, parseDuration } from '../../../lib/utils';

type Id = (typeof meta)[number]['id'];

/** The active schedule version — every fixture reads the project it shows. */
function activeVersionOf(ctx: FixtureContext) {
  const project = ctx.project!;
  return project.versions.find(v => v.id === project.activeVersionId) ?? project.versions[0];
}

const BannerAddPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const { productionSections } = useDaybreakSections();
  return (
    <AddBannerModal
      open
      dayCount={Math.max(1, productionSections.length)}
      onClose={ctx.close}
      onAdd={() => { /* preview: the modal's real close runs after onAdd */ }}
    />
  );
};

const BannerColorPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  const version = activeVersionOf(ctx);
  const palette = project.colorPalette;
  const nb = getNoteBannerColors(palette);
  const noteRow = version?.rows.find(r => r.type === 'NOTE' && r.containerId != null);
  const [state, setState] = useState({
    rowId: noteRow?.id ?? '',
    bg: noteRow?.noteColor || nb.background,
    text: noteRow?.noteTextColor || nb.color,
    noteText: noteRow?.noteText || 'COMPANY MOVE',
  });

  return (
    <BannerColorModal
      state={state}
      onChange={setState}
      onClose={ctx.close}
      onApply={() => {
        if (version && state.rowId) {
          const rows = version.rows.map(r => r.id === state.rowId
            ? { ...r, noteColor: state.bg, noteTextColor: state.text, noteText: state.noteText }
            : r);
          ctx.dispatch({ type: 'UPDATE_VERSION', payload: { id: version.id, rows } });
        }
        ctx.close();
      }}
      palette={palette}
    />
  );
};

/** Group the real note banners the way ScheduleTab's delete checklist does. */
function noteBannerEntries(project: Project): BannerDeleteEntry[] {
  const version = project.versions.find(v => v.id === project.activeVersionId) ?? project.versions[0];
  const nb = getNoteBannerColors(project.colorPalette);
  const map = new Map<string, BannerDeleteEntry>();
  for (const r of version?.rows ?? []) {
    if (r.containerId == null || r.type !== 'NOTE') continue;
    const label = (r.noteText || '').trim().toUpperCase() || '(UNTITLED NOTE)';
    const bg = r.noteColor || nb.background;
    const key = `${label}||${bg}`;
    const existing = map.get(key);
    if (existing) existing.count++;
    else map.set(key, { key, label, bg, fg: r.noteTextColor || nb.color, count: 1 });
  }
  const entries = [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return entries.length > 0 ? entries : [{ key: 'NOTE||', label: '(UNTITLED NOTE)', bg: nb.background, fg: nb.color, count: 1 }];
}

const BannerDeletePreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  const entries = useMemo(() => noteBannerEntries(project), [project]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  return (
    <BannerDeleteModal
      state={{ type: 'NOTE' }}
      onClose={ctx.close}
      entries={entries}
      checked={checked}
      onCheckedChange={setChecked}
      onDelete={ctx.close}
    />
  );
};

const AutoDaybreakPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const [raw, setRaw] = useState('8h');
  return (
    <AutoDaybreakModal
      state={{ mode: 'duration' }}
      onClose={ctx.close}
      raw={raw}
      onRawChange={setRaw}
      normalizeRaw={v => {
        const minutes = parseDuration(v);
        return minutes > 0 ? formatDuration(minutes) : v;
      }}
      onConfirm={ctx.close}
    />
  );
};

const StripboardPreparePreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  const rows = activeVersionOf(ctx)?.rows ?? [];
  const [notesAction, setNotesAction] = useState<'boneyard' | 'delete'>('boneyard');
  const [breaksAction, setBreaksAction] = useState<'boneyard' | 'delete'>('boneyard');
  return (
    <StripboardPrepareModal
      state={{ mode: 'duration', threshold: 480 }}
      onClose={ctx.close}
      onPlace={ctx.close}
      notesAction={notesAction}
      onNotesAction={setNotesAction}
      breaksAction={breaksAction}
      onBreaksAction={setBreaksAction}
      daybreakCount={rows.filter(r => r.type === 'DAYBREAK' && !r.pinned).length}
      daybreakDetailCount={rows.filter(r => r.type === 'DAYBREAK' && !r.pinned && !isEmptyDayMeta(r.daybreakMeta)).length}
      noteCount={rows.filter(r => r.containerId != null && r.type === 'NOTE').length}
      breakCount={rows.filter(r => r.containerId != null && r.type === 'BREAK').length}
    />
  );
};

const SceneSortPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const sets = useMemo(() => {
    const values = new Set<string>();
    for (const scene of ctx.project!.scenes) {
      const set = (scene.set || '').trim();
      if (set) values.add(set);
    }
    const list = [...values].sort((a, b) => a.localeCompare(b)).slice(0, 20);
    return list.length > 0 ? list : ['INT. KITCHEN', 'EXT. STREET', 'INT. OFFICE'];
  }, [ctx.project]);
  return (
    <CustomOrderSortModal
      open
      onClose={ctx.close}
      title="Sort by Set"
      options={sets}
      onSort={() => { /* preview: the real Sort button closes the modal */ }}
    />
  );
};

interface ViolationDay {
  label: string;
  date: string;
  violations: RuleViolation[];
}

/** Real rule violations for every scheduled day (the shared rules engine). */
function useViolationDays(): ViolationDay[] {
  const { sections, sectionDateMap, activeVersion, project } = useDaybreakSections();
  return useMemo(() => {
    const rules = project.rules || [];
    if (!activeVersion || rules.length === 0) return [];
    const map = computeSectionViolationMap(
      activeVersion.rows,
      sections,
      sectionDateMap,
      rules,
      project.scenes,
      project.castMembers || [],
    );
    const days: ViolationDay[] = [];
    for (const section of sections) {
      const date = sectionDateMap.get(section.index);
      if (!date) continue;
      const violations = map.get(date);
      if (violations && violations.length > 0) {
        days.push({ label: `DAY #${section.chronoDay || section.index + 1}`, date, violations });
      }
    }
    return days;
  }, [sections, sectionDateMap, activeVersion, project]);
}

/** Valid sample violations when the project has no rules (or none tripped). */
function sampleViolationDays(ctx: FixtureContext): ViolationDay[] {
  const project = ctx.project!;
  const cast = project.castMembers.filter(c => c.name?.trim());
  const sceneIds = project.scenes.slice(0, 3).map(s => s.id);
  const first: RuleViolation[] = [];
  if (cast[0]) {
    const name = `${cast[0].id}. ${cast[0].name}`;
    first.push({
      ruleId: 'lab-max-hours',
      ruleType: 'MAX_HOURS',
      castId: cast[0].id,
      message: `${name}: Can only work 8h (scheduled 10h 15m)`,
      detail: 'Can only work 8h (scheduled 10h 15m)',
      containerId: 0,
      sceneIds,
    });
  }
  if (cast[1]) {
    first.push({
      ruleId: 'lab-cast-flag',
      ruleType: 'CAST_SCENE_FLAG',
      message: `Scene includes flagged cast: ${cast[1].id}. ${cast[1].name}`,
      containerId: 0,
      sceneIds: sceneIds.slice(0, 2),
    });
  }
  if (first.length === 0) {
    first.push({
      ruleId: 'lab-date-restriction',
      ruleType: 'DATE_RESTRICTION',
      message: 'Cast unavailable on this date',
      detail: 'Unavailable on this date',
      containerId: 0,
      sceneIds,
    });
  }
  const start = ctx.calendar?.productionStart || new Date().toISOString().slice(0, 10);
  return [
    { label: 'DAY #1', date: start, violations: first },
    {
      label: 'DAY #2',
      date: addDays(start, 1),
      violations: [{
        ruleId: 'lab-time-window',
        ruleType: 'TIME_WINDOW',
        castId: cast[0]?.id,
        message: `${cast[0] ? `${cast[0].id}. ${cast[0].name}: ` : ''}Only available 07:00-15:00`,
        detail: 'Only available 07:00-15:00',
        containerId: 0,
        sceneIds: sceneIds.slice(0, 2),
      }],
    },
  ];
}

const ViolationsPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const real = useViolationDays();
  const days = real.length > 0 ? real : sampleViolationDays(ctx);
  const active = days[0];
  useEffect(() => {
    if (active) ctx.select({ kind: 'day', id: active.date, label: active.label });
    // The surface publishes the day it is showing once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ViolationModal
      open
      onClose={ctx.close}
      title={`${active.label} Violations`}
      subtitle={formatDateLong(active.date)}
      violations={active.violations}
      castMembers={ctx.project!.castMembers}
    />
  );
};

const ShootViolationsPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const real = useViolationDays();
  const days = real.length > 0 ? real : sampleViolationDays(ctx);
  useEffect(() => {
    if (days[0]) ctx.select({ kind: 'day', id: days[0].date, label: `${days.length} day${days.length === 1 ? '' : 's'}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ShootViolationsModal
      open
      onClose={ctx.close}
      dayViolations={days.map(d => ({ dayLabel: d.label, dateStr: formatDateLong(d.date), violations: d.violations }))}
      castMembers={ctx.project!.castMembers}
    />
  );
};

/** Two real scenes (or the blank factory when the project is empty). */
function collisionPair(project: Project): { scene: Scene; collision: Scene } {
  const numbered = project.scenes.filter(s => s.sceneNumber?.trim());
  const scene = numbered[0] ?? createBlankScene({ sceneNumber: '12A', intExt: 'INT', set: 'KITCHEN', dayNight: 'DAY' });
  const collision = numbered[1] ?? createBlankScene({ sceneNumber: '12', intExt: 'EXT', set: 'STREET', dayNight: 'NIGHT' });
  return { scene, collision };
}

const SceneCollisionPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const { scene, collision } = useMemo(() => collisionPair(ctx.project!), [ctx.project]);
  useEffect(() => {
    ctx.select({ kind: 'scene', id: scene.id, label: `Scene ${scene.sceneNumber}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <SceneNumberCollisionModal
      open
      scene={scene}
      collision={collision}
      onCancel={ctx.close}
      onSwap={ctx.close}
    />
  );
};

const DeleteScenesPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const scene = ctx.project!.scenes[0];
  useEffect(() => {
    if (scene) ctx.select({ kind: 'scene', id: scene.id, label: `Scene ${scene.sceneNumber}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <DeleteScenesModal
      open
      label={scene?.sceneNumber?.trim() || '12A'}
      plural={false}
      onClose={ctx.close}
      onConfirm={ctx.close}
    />
  );
};

const CsvImportPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const crewCount = Object.values(ctx.project!.crew || {}).reduce((n, people) => n + people.length, 0);
  return (
    <CsvImportConfirmModal
      open
      title="Import Crew CSV"
      result={{ count: crewCount || 3, newCategories: [{ key: 'lab-new-department', label: 'Lab New Department' }] }}
      fileName="crew.csv"
      importNoun="crew members"
      importSummary="Members matching an existing role + name have their phone/email updated (non-empty values only); everyone else is added."
      onClose={ctx.close}
      onImport={ctx.close}
    />
  );
};

export const render: Record<Id, SurfaceRender> = {
  'banner-add': ctx => <BannerAddPreview ctx={ctx} />,
  'banner-edit-color': ctx => <BannerColorPreview ctx={ctx} />,
  'banner-delete': ctx => <BannerDeletePreview ctx={ctx} />,
  'auto-daybreak': ctx => <AutoDaybreakPreview ctx={ctx} />,
  'stripboard-prepare': ctx => <StripboardPreparePreview ctx={ctx} />,
  'scene-new': ctx => <NewSceneModal onClose={ctx.close} />,
  'scene-sort': ctx => <SceneSortPreview ctx={ctx} />,
  violations: ctx => <ViolationsPreview ctx={ctx} />,
  'shoot-violations': ctx => <ShootViolationsPreview ctx={ctx} />,
  'scene-collision': ctx => <SceneCollisionPreview ctx={ctx} />,
  'delete-scenes': ctx => <DeleteScenesPreview ctx={ctx} />,
  'csv-import': ctx => <CsvImportPreview ctx={ctx} />,
};
