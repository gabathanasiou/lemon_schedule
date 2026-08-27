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
 */
export function useLinkedEditGuard(
  links: ElementLink[] | undefined,
  customCategories: CustomCategoryDef[] | undefined,
  dispatch: (a: any) => void,
) {
  const dialog = useDialog();
  const safeLinks = links || [];

  const tryCommitSceneEdit = useCallback(async (scene: Scene, updates: Record<string, any>): Promise<boolean> => {
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

    const labelFor = (category: string): string => {
      const builtin = ELEMENT_CATEGORIES.find(c => c.key === category);
      if (builtin) return getLabel(category, builtin.label, undefined);
      const custom = customCategories?.find(c => c.key === category);
      return custom?.label || category;
    };
    const linkLabels = (links: ElementLink[]) => links
      .map(l => `${labelFor(l.linkedCategory)} · ${l.linkedValue}`)
      .join(', ');
    const removedList = removed
      .map(r => `${labelFor(r.category)} · ${r.value}`)
      .join(', ');
    const affected = removed.map(r => linkLabels(r.links)).join(', ');
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

  return { tryCommitSceneEdit };
}