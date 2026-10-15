import React from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useProject } from '../store';
import { useUnsavedGuardState } from '../lib/unsavedGuard';

/**
 * The ONE undo/redo button pair for every chrome (AppHeader + the popout
 * VersionToolbar). Both buttons go through the project's shared `undo()` /
 * `redo()` — the SAME routing the Cmd+Z / Cmd+Shift+Z handlers use:
 *
 *   1. the element manager's unsaved local history, then
 *   2. for a SHARED project: the room (never the local transcript — it would
 *      silently diverge this window from every peer), else
 *   3. the local transcript.
 *
 * Enablement mirrors those same sources: local history OR a room that can take
 * the operation. Never fork this pair — a second copy drifts from the keyboard.
 */
export function UndoRedoButtons({ isCloudProject }: { isCloudProject: boolean }) {
  const { undo, redo, canRoomUndo, canRoomRedo, canLocalUndo, canLocalRedo } = useProject();
  const guardState = useUnsavedGuardState();
  const tone = isCloudProject
    ? 'text-white/70 hover:text-white hover:bg-blue-900/60'
    : 'text-zinc-400 hover:text-white hover:bg-zinc-800';
  const disabledClass = 'disabled:opacity-30 disabled:cursor-not-allowed';
  return (
    <div className="flex items-center gap-1 border border-white/10 rounded bg-white/5">
      <button
        onClick={undo}
        disabled={!canLocalUndo && !guardState.hasLocalUndo && !canRoomUndo}
        className={`p-1.5 rounded transition-colors ${disabledClass} ${tone}`}
        title="Undo (Cmd+Z)"
        data-presence-anchor="nav:undo"
      >
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={redo}
        disabled={!canLocalRedo && !guardState.hasLocalRedo && !canRoomRedo}
        className={`p-1.5 rounded transition-colors ${disabledClass} ${tone}`}
        title="Redo (Cmd+Shift+Z)"
        data-presence-anchor="nav:redo"
      >
        <Redo2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
