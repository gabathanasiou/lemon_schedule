import { useCallback } from 'react';
import { ElementLink, Scene } from '../types';
import type { CustomCategoryDef } from '../types';
import { useDialog } from '../components/Dialog';
import { cascadeRemoval, computePropagation, computeRemovedLinks } from './elementLinks';
import { getLabel, ELEMENT_CATEGORIES } from './categories';

/**
 * The scene write-path seam for element links (roadmap 44). Replace the raw
 * `UPDATE_SCENE` dispatch in every scene value commit (Scene Sheet fields,
 * Glide cells, stripboard row editing) with `tryCommitSceneEdit`:
 *
 * - ADDED anchors → their linked elements are added to the scene (one shared
 *   propagation helper — no per-view duplication).
 * - REMOVED anchors that still own links → a confirm dialog first; confirm
 *   cascades the linked values out of the scene, cancel keeps the anchor
 *   (the edit is not applied at all).
 *
 * Returns false when the edit was deferred to the confirm dialog; callers
 * should not dispatch themselves in that case.
 *
 * Multi-scene callers (Glide range fill) preview the removals for the WHOLE
 * batch with `collectRemovals`, fold them into their own confirm, then pass
 * `{ cascadeRemovals: true }` so the guard applies the cascade inline inside
 * the caller's batch — one prompt and one undo entry instead of a per-row
 * dialog dispatching outside the batch (roadmap 180).
 */

export interface SceneEditPreview {
  scene: Scene;
  updates: Record<string, any>;
}

function labelFor(category: string, customCategories: CustomCategoryDef[] | undefined): string {
  const builtin = ELEMENT_CATEGORIES.find(c => c.key === category);
  if (builtin) return getLabel(category, builtin.label, undefined);
  const custom = customCategories?.find(c => c.key === category);
  return custom?.label || category;
}

function linkLabels(links: ElementLink[], customCategories: CustomCategoryDef[] | undefined): string {
  return links.map(l => `${labelFor(l.linkedCategory, customCategories)} · ${l.linkedValue}`).join(', ');
}

export function useLinkedEditGuard(
  links: ElementLink[] | undefined,
  customCategories: CustomCategoryDef[] | undefined,
  dispatch: (a: any) => void,
) {
  const dialog = useDialog();
  const safeLinks = links || [];

  /** One-scene description of the linked elements a removal would cascade
   *  out, e.g. `Cast · 1 → Props · "Bridal Suite" Sign`. Empty when the edit
   *  removes no anchor with links. */
  const collectRemovals = useCallback((edits: SceneEditPreview[]): string[] => {
    const notes: string[] = [];
    for (const { scene, updates } of edits) {
      const after = { ...scene, ...updates } as Scene;
      for (const r of computeRemovedLinks(safeLinks, customCategories, scene, after)) {
        notes.push(`${labelFor(r.category, customCategories)} · ${r.value} → ${linkLabels(r.links, customCategories)}`);
      }
    }
    return notes;
  }, [safeLinks, customCategories]);

  const tryCommitSceneEdit = useCallback(async (
    scene: Scene,
    updates: Record<string, any>,
    opts?: { cascadeRemovals?: boolean },
  ): Promise<boolean> => {
    if (safeLinks.length === 0) {
      dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, ...updates } });
      return true;
    }
    const after = { ...scene, ...updates } as Scene;
    const extra = computePropagation(safeLinks, customCategories, scene, after);
    const finalUpdates = { ...updates, ...extra };
    const removed = computeRemovedLinks(safeLinks, customCategories, scene, after);
    if (removed.length === 0) {
      dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, ...finalUpdates } });
      return true;
    }
    if (opts?.cascadeRemovals) {
      const cascade = cascadeRemoval(customCategories, after, removed);
      dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, ...finalUpdates, ...cascade } });
      return true;
    }

    const removedList = removed
      .map(r => `${labelFor(r.category, customCategories)} · ${r.value}`)
      .join(', ');
    const affected = removed
      .map(r => linkLabels(r.links, customCategories))
      .join(', ');
    const ok = await dialog.confirm({
      title: 'Remove linked elements?',
      message: `Removing ${removedList} from this scene will also remove ${removed.length > 1 ? 'their' : 'its'} linked elements: ${affected}. These linked elements will be removed from the scene too.`,
      danger: true,
    });
    if (!ok) return false;
    const cascade = cascadeRemoval(customCategories, after, removed);
    dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, ...finalUpdates, ...cascade } });
    return true;
  }, [safeLinks, customCategories, dispatch, dialog]);

  return { tryCommitSceneEdit, collectRemovals };
}
