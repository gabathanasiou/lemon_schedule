import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DialogProvider, ThemeProvider, ThemeScope } from '@gabriel/ui-kit';
import Button from '../../components/Button';
import { useProject, useProjectTheme } from '../../store';
import { projectModalThemeOf } from '../../lib/projectTheme';
import type { CalendarVersion, Project } from '../../types';
import { setLabState, markLabSandboxProject, type LabSelection } from '../../lib/labState';
import { setModalThemeOverride } from '../../lib/modalDevTheme';
import { useAgentBridge } from '../../lib/useAgentBridge';
import { SURFACES, surfaceById, surfaceRenderer } from './registry';
import { StudioDock, STUDIO_WIDTH_CSS, type StudioWidth } from './StudioDock';
import type { FixtureContext, FixturePicks } from './types';

/**
 * Modals Studio (roadmap 374) — DEV-only.
 *
 * Route: `#/lab/modals` / `#/lab/modals/<surface-id>`. The dynamic import in
 * `App.tsx` is gated by `import.meta.env.DEV`, so production carries no studio
 * chunk. The REAL modal renders full-screen exactly as in the app; the kit
 * dock floats above it (only the dock takes pointer events), and every
 * surface is registered in `registry.ts` — the unit suite fails when a new
 * modal file is unmapped.
 */

const HASH_PREFIX = '#/lab/modals';

function surfaceIdFromHash(): string | null {
  const hash = window.location.hash;
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const id = hash.slice(HASH_PREFIX.length).replace(/^\//, '');
  return id || null;
}

function derivePicks(project: Project, calendar: CalendarVersion | undefined): FixturePicks {
  const cast = project.castMembers.find((c) => c.name?.trim());
  const scene = project.scenes[0];
  const categoryEntry = Object.entries(project.breakdownElements || {}).find(([, items]) => items.length > 0);
  const crewRole = (project.crewRoles || []).find((role) => (project.crew?.[role.key] || []).length > 0);
  const person = crewRole ? project.crew?.[crewRole.key]?.[0] : undefined;
  const location = project.locations?.[0];
  const report = project.reportDesigns?.[0];
  const budgetLine = project.budget?.versions?.[0]?.lines?.[0];
  return {
    cast: cast ? { id: cast.id, label: `${cast.id}. ${cast.name}` } : undefined,
    scene: scene ? { id: scene.id, number: scene.sceneNumber } : undefined,
    element: categoryEntry
      ? { category: categoryEntry[0], key: categoryEntry[1][0].name, label: categoryEntry[1][0].name }
      : undefined,
    crew: person && crewRole ? { id: person.id, label: person.name } : undefined,
    location: location ? { id: location.id, label: location.name } : undefined,
    reportDesign: report ? { id: report.id, name: report.name } : undefined,
    budgetLine: budgetLine ? { id: budgetLine.id, label: budgetLine.description || budgetLine.id } : undefined,
    dayDate: calendar?.productionStart,
    daySectionIndex: undefined,
  };
}

const ProjectGate: React.FC<{
  notes: string;
  onDemo: () => void;
  demoBusy: boolean;
  demoError: string | null;
}> = ({ notes, onDemo, demoBusy, demoError }) => (
  <div className="flex min-h-screen items-center justify-center bg-[var(--ui-modal-header-base)] p-6">
    <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] p-6">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ui-text-faint)]">Modals studio</div>
        <h1 className="mt-1 text-sm font-semibold text-[color:var(--ui-text-strong)]">Pick a project to preview library modals</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--ui-text-muted)]">
          Project-independent surfaces (Help, Account, Project Manager, dialogs) still preview without one.
        </p>
      </div>
      <p className="text-[11px] text-[color:var(--ui-text-faint)]">{notes}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button theme="dark" variant="primary" onClick={onDemo} disabled={demoBusy}>
          {demoBusy ? 'Loading demo…' : 'Open the demo project'}
        </Button>
        <a href={window.location.pathname} className="text-[11px] text-[color:var(--ui-text-muted)] underline-offset-2 hover:underline">
          Back to app
        </a>
      </div>
      {demoError && <p className="text-[11px] text-[color:var(--ui-danger-text)]">{demoError}</p>}
    </div>
  </div>
);

const ModalsLab: React.FC = () => {
  const { state, dispatch, activeCalendarVersion, projectList, openProject, importProjectFromData, undo, redo, canLocalUndo, canLocalRedo } = useProject();
  const project = state.present;
  const projectModalTheme = projectModalThemeOf(useProjectTheme());
  const agentBridge = useAgentBridge();
  const surfaces = SURFACES;

  const [surfaceId, setSurfaceId] = useState<string>(() => {
    const fromHash = surfaceIdFromHash();
    if (fromHash && surfaceById(fromHash)) return fromHash;
    return project ? surfaces[0]?.id : 'project-manager';
  });
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [width, setWidth] = useState<StudioWidth>('auto');
  const [scale, setScale] = useState(100);
  const [selection, setSelection] = useState<LabSelection | undefined>();
  const [closed, setClosed] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [gateNote, setGateNote] = useState('Open a local project from the Project picker, or load the seeded schedule below.');

  const surface = surfaceById(surfaceId) ?? surfaces[0];
  const index = surface ? surfaces.findIndex((s) => s.id === surface.id) : 0;

  const goTo = useCallback((id: string) => {
    setSurfaceId(id);
    setSelection(undefined);
    setClosed(false);
    setRunKey((n) => n + 1);
  }, []);

  const prev = useCallback(() => {
    if (!surfaces.length) return;
    const next = (index - 1 + surfaces.length) % surfaces.length;
    goTo(surfaces[next].id);
  }, [goTo, index, surfaces]);

  const next = useCallback(() => {
    if (!surfaces.length) return;
    goTo(surfaces[(index + 1) % surfaces.length].id);
  }, [goTo, index, surfaces]);

  // Deep link per surface (also the id the MCP reader sees).
  useEffect(() => {
    if (!surface) return;
    const target = `${HASH_PREFIX}/${surface.id}`;
    if (window.location.hash !== target) {
      window.history.replaceState(window.history.state, '', target);
    }
  }, [surface]);

  // Follow a manually pasted deep link (the app route only reads the hash on
  // mount, so the studio owns updates after that).
  useEffect(() => {
    const onHash = () => {
      const id = surfaceIdFromHash();
      if (id && id !== surfaceId && surfaceById(id)) goTo(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [goTo, surfaceId]);

  // Studio preview knobs (theme override + width/scale CSS).
  useEffect(() => {
    setModalThemeOverride(theme);
    return () => setModalThemeOverride(null);
  }, [theme]);

  const widthCss = STUDIO_WIDTH_CSS[width];
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.modalsStudio = '1';
    return () => { delete root.dataset.modalsStudio; };
  }, []);

  // Studio chrome must not read as an "outside click/press" to a Radix
  // modal/dialog (it would dismiss the surface being inspected). Own a
  // document listener registered BEFORE any surface's layer: events inside
  // the dock or its portaled menu stop here, after React's own handlers ran.
  useEffect(() => {
    const shielded = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest('[data-modals-studio-ui], .modals-studio-shield');
    const stop = (event: Event) => { if (shielded(event.target)) event.stopImmediatePropagation(); };
    const types = ['pointerdown', 'mousedown', 'touchstart', 'click', 'focusin'] as const;
    for (const type of types) document.addEventListener(type, stop);
    return () => { for (const type of types) document.removeEventListener(type, stop); };
  }, []);

  // Publish the active surface for the debug bridge / local MCP.
  useEffect(() => {
    if (!surface) {
      setLabState(null);
      return;
    }
    setLabState({
      surfaceId: surface.id,
      title: surface.title,
      group: surface.group,
      kind: surface.kind,
      index: index + 1,
      total: surfaces.length,
      project: project ? { id: project.id, title: project.title } : null,
      theme,
      width,
      scale,
      selection,
      hash: `${HASH_PREFIX}/${surface.id}`,
    });
  }, [surface, index, surfaces.length, project, theme, width, scale, selection]);

  useEffect(() => () => setLabState(null), []);

  // ←/→ walk the full list (arrow keys stay free inside modal fields).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); prev(); }
      if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next]);

  const picks = useMemo(
    () => (project ? derivePicks(project, activeCalendarVersion) : {}),
    [project, activeCalendarVersion],
  );

  const openDemo = useCallback(async () => {
    setDemoBusy(true);
    setDemoError(null);
    try {
      const seed = await import('../../../e2e/fixtures/seed.lemon?raw');
      const data = JSON.parse(seed.default);
      const id = importProjectFromData(data);
      markLabSandboxProject(id);
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : 'Could not load the demo project');
    } finally {
      setDemoBusy(false);
    }
  }, [importProjectFromData]);

  const onOpenProject = useCallback(async (id: string) => {
    try {
      await openProject(id);
    } catch (error) {
      setGateNote(error instanceof Error ? error.message : 'Could not open that project');
    }
  }, [openProject]);

  if (!surface) return null;

  const renderer = surfaceRenderer(surface.id);
  const fixtureCtx: FixtureContext = {
    project: project ?? null,
    dispatch,
    calendar: activeCalendarVersion,
    picks,
    theme,
    close: () => setClosed(true),
    select: setSelection,
    selection,
  };

  const needsProject = !surface.projectless && !project;
  const content = needsProject ? null : renderer?.(fixtureCtx);

  return (
    <ThemeScope mode="dark" surface="neutral" className="block min-h-screen">
      {/* A nested theme + dialog provider makes the studio's theme knob reach
          the confirm/prompt/alert ladder too (the app-root provider is above us
          and cannot see studio state; the kit DialogProvider takes its mode
          from the ambient ThemeProvider). */}
      <ThemeProvider mode={theme} surface="neutral">
      <DialogProvider accent={projectModalTheme.accent} surface={projectModalTheme.surface}>
      <style>{`
        html[data-modals-studio] .ui-modal {${widthCss ? ` max-width: ${widthCss} !important;` : ''}${scale !== 100 ? ` scale: ${scale / 100}; transform-origin: center center;` : ''}}
        html[data-modals-studio] .ui-modal-overlay { background: rgba(0,0,0,0.35); }
      `}</style>
      {needsProject ? (
        <ProjectGate
          notes={gateNote}
          onDemo={() => { void openDemo(); }}
          demoBusy={demoBusy}
          demoError={demoError}
        />
      ) : (
        <div className="min-h-screen bg-[var(--ui-modal-header-base)]">
          <div className="mx-auto max-w-2xl px-6 pt-16 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[color:var(--ui-text-faint)]">Modals studio</div>
            <h1 className="mt-2 text-lg font-semibold text-[color:var(--ui-text-strong)]">{surface.title}</h1>
            <p className="mt-2 text-xs leading-relaxed text-[color:var(--ui-text-muted)]">{surface.note}</p>
            <p className="mt-6 text-[11px] text-[color:var(--ui-text-faint)]">
              The real surface is open above this message — click into it, edit fields, and inspect it exactly as the app draws it.
            </p>
          </div>
          {!renderer && (
            <div className="mx-auto mt-6 max-w-md rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-200">
              No fixture is registered for <code>{surface.id}</code> — add one in <code>src/lab/modals/fixtures</code>.
            </div>
          )}
          {renderer && closed && (
            <div className="mx-auto mt-6 flex max-w-sm flex-col items-center gap-2 rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-4">
              <span className="text-[11px] text-[color:var(--ui-text-muted)]">Surface closed.</span>
              <Button theme="dark" variant="outline" size="minimal" onClick={() => { setClosed(false); setRunKey((n) => n + 1); }}>
                Re-open surface
              </Button>
            </div>
          )}
          {renderer && !closed && (
            <React.Suspense fallback={null}>
              <React.Fragment key={`${surface.id}:${runKey}`}>{content}</React.Fragment>
            </React.Suspense>
          )}
        </div>
      )}

      <StudioDock
        surfaces={surfaces}
        surface={surface}
        index={index}
        total={surfaces.length}
        projectTitle={project?.title ?? null}
        projectId={project?.id ?? null}
        projectList={projectList}
        theme={theme}
        width={width}
        scale={scale}
        closed={closed && surface.kind === 'modal'}
        replayable={surface.kind === 'dialog'}
        bridgeAvailable={agentBridge.available}
        bridgeEnabled={agentBridge.enabled}
        bridgeStatus={agentBridge.status}
        demoBusy={demoBusy}
        canUndo={canLocalUndo}
        canRedo={canLocalRedo}
        onSelect={goTo}
        onPrev={prev}
        onNext={next}
        onTheme={setTheme}
        onWidth={setWidth}
        onScale={setScale}
        onOpenProject={(id) => { void onOpenProject(id); }}
        onDemo={() => { void openDemo(); }}
        onReopen={() => { setClosed(false); setRunKey((n) => n + 1); }}
        onReplay={() => setRunKey((n) => n + 1)}
        onToggleBridge={() => { if (agentBridge.enabled) agentBridge.disable(); else agentBridge.enable(); }}
        onUndo={() => { undo(); }}
        onRedo={() => { redo(); }}
      />
      </DialogProvider>
      </ThemeProvider>
    </ThemeScope>
  );
};

export default ModalsLab;
