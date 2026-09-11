import { useEffect, useRef } from 'react';
import { PanelRight, X } from 'lucide-react';
import { useProject, useIsCloudProject } from '../../store';
import { ScriptSceneText } from './ScriptSceneScript';
import { scriptSceneOf, normalizeSceneNumber, formatSceneHeading } from '../../lib/script';
import { usePersistState } from '../../lib/persist';
import { usePaneResize } from '../../lib/usePaneResize';
import { TEST_IDS } from '../../lib/testIds';

/**
 * Portable scene script pane (roadmap 132 Part A) — a read-only, collapsible,
 * resizable preview of one scene's retained screenplay body. Docks on the RIGHT
 * of the Sheet and Glide Breakdown surfaces and follows their selection. Renders
 * via the shared `ScriptSceneText` (light theme) — never a second renderer.
 *
 * The persisted pref is shared by any host that renders the pane; it is a view
 * preference, not project data.
 */
export const SCRIPT_PANE_MIN_WIDTH = 260;
export const SCRIPT_PANE_MAX_WIDTH = 720;

interface ScriptPanePref {
  /** `null` = the user has never toggled this host; fall back to the default. */
  sheetOpen: boolean | null;
  glideOpen: boolean | null;
  width: number;
}

/**
 * Pane view pref, per host. The Glide Breakdown defaults **collapsed**; the
 * Sheet defaults **open when a script is imported** (an explicit user toggle
 * always wins afterwards).
 */
export function useScriptPanePref(host: 'sheet' | 'glide') {
  const { state } = useProject();
  const hasScript = !!state.present.scriptDocument?.scenes?.length;
  const [pref, setPref] = usePersistState<ScriptPanePref>('lemon_schedule_script_pane', { sheetOpen: null, glideOpen: null, width: 440 });
  const stored = host === 'sheet' ? pref.sheetOpen : pref.glideOpen;
  const open = stored ?? (host === 'sheet' ? hasScript : false);
  const setOpen = (v: boolean) => setPref(p => (host === 'sheet' ? { ...p, sheetOpen: v } : { ...p, glideOpen: v }));
  const setWidth = (w: number) => setPref(p => ({ ...p, width: w }));
  return { open, setOpen, width: pref.width, setWidth };
}

/** Toolbar icon-button that shows/hides the pane (icon-only stays bespoke). */
export function ScriptPaneToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const isCloud = useIsCloudProject();
  return (
    <button
      type="button"
      onClick={onToggle}
      title={open ? 'Hide script pane' : 'Show script pane'}
      aria-pressed={open}
      className={`p-1.5 rounded-md transition-colors ${open ? (isCloud ? 'bg-blue-950 text-blue-50' : 'bg-zinc-900 text-white') : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'}`}
    >
      <PanelRight className="h-4 w-4" />
    </button>
  );
}

export function SceneScriptPane({ sceneNumber, open, onClose, width, onWidthChange }: {
  sceneNumber?: string;
  open: boolean;
  onClose: () => void;
  width: number;
  onWidthChange: (w: number) => void;
}) {
  const { state } = useProject();
  const doc = state.present.scriptDocument;
  const scene = sceneNumber ? scriptSceneOf(doc, sceneNumber) : undefined;
  const liveScene = sceneNumber
    ? state.present.scenes.find(s => normalizeSceneNumber(s.sceneNumber) === normalizeSceneNumber(sceneNumber))
    : undefined;
  const heading = !sceneNumber ? '' : (liveScene && (liveScene.intExt || liveScene.set)
    ? formatSceneHeading(liveScene.intExt, liveScene.set, liveScene.dayNight)
    : (scene?.blocks.find(b => b[0] === 'heading')?.[1] || ''));

  const bodyRef = useRef<HTMLDivElement>(null);
  // Follow the selection: start each newly-selected scene at the top so its
  // content is never left scrolled underneath the viewport.
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [sceneNumber]);

  const onHandlePointerDown = usePaneResize({
    width,
    min: SCRIPT_PANE_MIN_WIDTH,
    max: SCRIPT_PANE_MAX_WIDTH,
    edge: 'left',
    onChange: onWidthChange,
  });

  if (!open) return null;

  return (
    <div
      data-testid={TEST_IDS.scriptPane}
      className="flex h-full min-h-0 shrink-0 border-l border-zinc-200 bg-white"
      style={{ width }}
    >
      {/* Real flex item (not an overlapping absolute strip) so the Glide grid
          can never steal the hit-test / drag gesture. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize script pane"
        onPointerDown={onHandlePointerDown}
        className="w-1.5 shrink-0 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-blue-400/50 active:bg-blue-400/70"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-2">
          <span className="truncate font-mono text-xs font-semibold text-zinc-700">
            {sceneNumber || '—'}{heading ? `  ${heading}` : ''}
          </span>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-400">Preview</span>
          <button
            type="button"
            onClick={onClose}
            title="Hide script pane"
            className="ml-auto rounded p-1 text-zinc-500 hover:bg-zinc-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div ref={bodyRef} className="flex-1 overflow-auto px-4 py-3 select-text">
          {scene
            ? <ScriptSceneText scene={scene} theme="light" />
            : <p className="text-xs italic text-zinc-400">No script retained for this scene.</p>}
        </div>
      </div>
    </div>
  );
}
