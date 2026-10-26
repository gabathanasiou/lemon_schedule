import React from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useProject } from '../store';

/**
 * The ONE undo/redo button pair for every chrome (AppHeader + the popout
 * VersionToolbar). Both buttons go through the project's shared `undo()` /
 * `redo()` — the SAME routing the Cmd+Z / Cmd+Shift+Z handlers use:
 *
 *   1. for a SHARED project: the room (per-user undo — never the local
 *      transcript, which would silently diverge this window from every peer),
 *   2. else the local transcript.
 *
 * Enablement mirrors those same sources. Every edit is dispatched when it
 * finishes (roadmap 250/251: commit on blur), so undo granularity is per
 * committed edit — there is no separate local history to consult.
 *
 * Colored by the ambient project-chrome scope (roadmap 311): the header's
 * `ProjectChromeScope` supplies the accent, so the pair carries no palette.
 */
export function UndoRedoButtons() {
  const { undo, redo, canRoomUndo, canRoomRedo, canLocalUndo, canLocalRedo } = useProject();
  const tone = 'text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-text-strong)] hover:bg-[var(--ui-accent-header-hover)]';
  const disabledClass = 'disabled:opacity-30 disabled:cursor-not-allowed';
  return (
    <div className="flex items-center gap-1 border border-white/10 rounded bg-white/5">
      <button
        onClick={undo}
        disabled={!canLocalUndo && !canRoomUndo}
        className={`p-1.5 rounded transition-colors ${disabledClass} ${tone}`}
        title="Undo (Cmd+Z)"
        data-presence-anchor="nav:undo"
      >
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={redo}
        disabled={!canLocalRedo && !canRoomRedo}
        className={`p-1.5 rounded transition-colors ${disabledClass} ${tone}`}
        title="Redo (Cmd+Shift+Z)"
        data-presence-anchor="nav:redo"
      >
        <Redo2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
