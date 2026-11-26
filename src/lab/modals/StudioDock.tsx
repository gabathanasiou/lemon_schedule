import React from 'react';
import { ChevronLeft, ChevronRight, CornerDownLeft, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { SearchMenu, Seg } from '@gabriel/ui-kit';
import type { SearchMenuGroup, SearchMenuItem } from '@gabriel/ui-kit';
import Button from '../../components/Button';
import { SURFACE_GROUPS, type ModalSurfaceMeta } from './types';

/** The studio's floating chrome. It sits ABOVE the live modal (z 10001, the
 *  same layer as kit menus — menu portals render later, so they still win) and
 *  only its own surface takes pointer events, leaving the rest of the modal
 *  fully usable. All controls are kit primitives (Button / Seg / SearchMenu /
 *  SearchMenu) — the studio has no bespoke widgets. */

export const STUDIO_WIDTHS = [
  { v: 'auto', l: 'Auto' },
  { v: '240', l: '240' },
  { v: '300', l: '300' },
  { v: '360', l: '360' },
  { v: '400', l: '400' },
  { v: '560', l: '560' },
  { v: 'wide', l: 'Wide' },
] as const;

export const STUDIO_SCALES = [
  { v: '100', l: '100%' },
  { v: '125', l: '125%' },
  { v: '150', l: '150%' },
] as const;

export type StudioWidth = (typeof STUDIO_WIDTHS)[number]['v'];

/** CSS max-width per width preset; `auto` keeps the modal's own width. */
export const STUDIO_WIDTH_CSS: Record<StudioWidth, string | null> = {
  auto: null,
  240: '240px',
  300: '300px',
  360: '360px',
  400: '400px',
  560: '560px',
  wide: 'min(96vw, 80rem)',
};

interface StudioDockProps {
  surfaces: ModalSurfaceMeta[];
  surface: ModalSurfaceMeta;
  index: number;
  total: number;
  projectTitle: string | null;
  projectId: string | null;
  projectList: { id: string; title: string }[];
  theme: 'light' | 'dark';
  width: StudioWidth;
  scale: number;
  closed: boolean;
  replayable: boolean;
  bridgeAvailable: boolean;
  bridgeEnabled: boolean;
  bridgeStatus: string;
  demoBusy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSelect: (surfaceId: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onTheme: (theme: 'light' | 'dark') => void;
  onWidth: (width: StudioWidth) => void;
  onScale: (scale: number) => void;
  onOpenProject: (id: string) => void;
  onDemo: () => void;
  onReopen: () => void;
  onReplay: () => void;
  onToggleBridge: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function StudioDock({
  surfaces, surface, index, total, projectTitle, projectId, projectList,
  theme, width, scale, closed, replayable, bridgeAvailable, bridgeEnabled, bridgeStatus, demoBusy,
  canUndo, canRedo,
  onSelect, onPrev, onNext, onTheme, onWidth, onScale, onOpenProject, onDemo, onReopen,
  onReplay, onToggleBridge, onUndo, onRedo,
}: StudioDockProps) {
  const [dockEl, setDockEl] = React.useState<HTMLDivElement | null>(null);
  const groups: SearchMenuGroup[] = SURFACE_GROUPS
    .filter((g) => surfaces.some((s) => s.group === g))
    .map((g) => ({
      key: g,
      label: g,
      count: surfaces.filter((s) => s.group === g).length,
    }));
  const items: SearchMenuItem[] = surfaces.map((s) => ({
    id: s.id,
    label: s.title,
    group: s.group,
    detail: s.kind === 'dialog' ? 'Dialog' : undefined,
    keywords: s.note,
  }));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[10001] flex justify-center p-3 print:hidden">
      <div ref={setDockEl} data-modals-studio-ui="" className="pointer-events-auto flex w-fit max-w-[min(96vw,980px)] flex-col gap-1.5 rounded-xl border border-[color:var(--ui-border-strong)] bg-[var(--ui-modal-header-base)] px-3 py-2 shadow-2xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="select-none text-[9px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-faint)]">
            Modals studio
          </span>
          <Button theme="dark" variant="subtle" iconOnly size="minimal" aria-label="Previous surface" title="Previous (←)" onClick={onPrev}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-[42px] text-center text-[10px] tabular-nums text-[color:var(--ui-text-muted)]">
            {index + 1} / {total}
          </span>
          <Button theme="dark" variant="subtle" iconOnly size="minimal" aria-label="Next surface" title="Next (→)" onClick={onNext}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <span className="mx-1 h-4 w-px bg-[var(--ui-border)]" aria-hidden />
          <SearchMenu
            items={items}
            groups={groups}
            mode="expandable"
            triggerLabel={surface.title}
            triggerVariant="outline"
            theme="dark"
            expandableGroups
            groupExpandMode="single"
            selectedId={surface.id}
            onSelect={(item) => onSelect(item.id)}
            collapsedWidth={270}
            expandedWidth={270}
            panelWidth={380}
            portalTarget={dockEl}
          />
          <span className="hidden max-w-[280px] truncate text-[10px] text-[color:var(--ui-text-faint)] md:inline" title={surface.note}>
            {surface.note}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Button theme="dark" variant="subtle" iconOnly size="minimal" aria-label="Undo" title="Undo (studio edits apply to the project)" onClick={onUndo} disabled={!canUndo}>
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button theme="dark" variant="subtle" iconOnly size="minimal" aria-label="Redo" title="Redo" onClick={onRedo} disabled={!canRedo}>
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-[color:var(--ui-text-faint)]">Theme</span>
            <Seg theme="dark" dense value={theme} options={[{ v: 'dark', l: 'Dark' }, { v: 'light', l: 'Light' }]} onChange={(v) => onTheme(v as 'light' | 'dark')} ariaLabel="Modal theme" />
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-[color:var(--ui-text-faint)]">Width</span>
            <Seg theme="dark" dense value={width} options={STUDIO_WIDTHS.map((w) => ({ v: w.v, l: w.l }))} onChange={(v) => onWidth(v as StudioWidth)} ariaLabel="Modal width" />
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-[color:var(--ui-text-faint)]">Text</span>
            <Seg theme="dark" dense value={String(scale)} options={STUDIO_SCALES.map((s) => ({ v: s.v, l: s.l }))} onChange={(v) => onScale(Number(v))} ariaLabel="Text scale" />
          </span>
          <span className="mx-1 h-4 w-px bg-[var(--ui-border)]" aria-hidden />
          <Button
            theme="dark"
            variant={bridgeEnabled ? 'outline' : 'subtle'}
            size="minimal"
            onClick={onToggleBridge}
            disabled={!bridgeAvailable}
            title={bridgeAvailable ? 'Local MCP bridge — enable so the agent can read get_lab_state' : 'The agent bridge is only available on loopback'}
          >
            <span
              className={`mr-1 h-1.5 w-1.5 rounded-full ${
                bridgeStatus === 'connected' ? 'bg-emerald-400' : bridgeStatus === 'connecting' ? 'bg-amber-400' : 'bg-zinc-500'
              }`}
            />
            MCP {bridgeEnabled ? bridgeStatus : 'off'}
          </Button>
          <span className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-[color:var(--ui-text-faint)]">Project</span>
            <SearchMenu
              items={projectList.map((p) => ({ id: p.id, label: p.title }))}
              mode="expandable"
              triggerLabel={projectTitle || 'Open project'}
              triggerVariant="outline"
              theme="dark"
              browseAll
              selectedId={projectId ?? undefined}
              onSelect={(item) => onOpenProject(item.id)}
              collapsedWidth={200}
              expandedWidth={200}
              panelWidth={300}
              emptyTitle="No local projects"
              emptyHint="Create one in the app, or load the demo."
              footerActions={[{
                label: demoBusy ? 'Loading demo project…' : 'Load demo project',
                onClick: () => onDemo(),
              }]}
              portalTarget={dockEl}
            />
          </span>
          {closed && (
            <Button theme="dark" variant="outline" size="minimal" onClick={onReopen}>
              <RotateCcw className="mr-1 h-3 w-3" /> Re-open
            </Button>
          )}
          {replayable && (
            <Button theme="dark" variant="outline" size="minimal" onClick={onReplay} title="Trigger the dialog again">
              <RotateCcw className="mr-1 h-3 w-3" /> Replay dialog
            </Button>
          )}
          <a
            href={window.location.pathname}
            className="ml-auto inline-flex items-center gap-1 text-[10px] text-[color:var(--ui-text-muted)] underline-offset-2 hover:underline"
            title="Leave the studio"
          >
            <CornerDownLeft className="h-3 w-3" /> Back to app
          </a>
        </div>
      </div>
    </div>
  );
}
