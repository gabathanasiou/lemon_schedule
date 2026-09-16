import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useProject } from '../../store';
import { FloatingTooltip } from '../FloatingTooltip';
import { ScriptSceneText } from './ScriptSceneScript';
import { scriptSceneOf } from '../../lib/script';
import type { Scene } from '../../types';

/**
 * Portable scene-body hover preview (roadmap 123 Phase 3). The SAME retained
 * screenplay renderer as the persistent `SceneScriptPane` — a hover surface just
 * mounts this provider and calls `show(scene)` / `hide()`; never a second
 * preview component.
 */

interface SceneScriptPreviewCtx {
  show: (scene: Scene) => void;
  hide: () => void;
}

const Ctx = createContext<SceneScriptPreviewCtx>({ show: () => {}, hide: () => {} });

/** Stable callbacks (safe to read in per-row components). */
export const useSceneScriptPreview = (): SceneScriptPreviewCtx => useContext(Ctx);

export function SceneScriptPreviewProvider({ children }: { children: React.ReactNode }) {
  const { state } = useProject();
  const doc = state.present.scriptDocument;
  const [scene, setScene] = useState<Scene | null>(null);
  const show = useCallback((s: Scene) => setScene(s), []);
  const hide = useCallback(() => setScene(null), []);
  const value = useMemo(() => ({ show, hide }), [show, hide]);

  const bodyScene = scene ? scriptSceneOf(doc, scene.sceneNumber) : undefined;
  const hasText = !!bodyScene && bodyScene.blocks.some(([t]) => t === 'action' || t === 'dialogue' || t === 'dual_left' || t === 'dual_right' || t === 'shot');

  return (
    <Ctx.Provider value={value}>
      {children}
      <FloatingTooltip open={!!scene && hasText}>
        <div className="w-[30rem] max-w-[70vw] rounded-lg border border-zinc-800 bg-zinc-950/95 px-3 py-2 shadow-2xl backdrop-blur-md">
          {bodyScene && <ScriptSceneText scene={bodyScene} theme="dark" fontClass="text-[11px] leading-[1.45]" sceneNumber={scene?.sceneNumber} />}
        </div>
      </FloatingTooltip>
    </Ctx.Provider>
  );
}
