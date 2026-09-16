import { useCallback, useRef, useState } from 'react';
import { Scene } from '../types';
import { findSceneNumberCollision } from '../lib/sceneNumbering';
import { formatSceneHeading } from '../lib/script';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';

function sceneLabel(scene: Scene): string {
  const heading = formatSceneHeading(scene.intExt, scene.set, scene.dayNight);
  return [scene.sceneNumber, heading].filter(Boolean).join('  ');
}

interface Pending {
  scene: Scene;
  collision: Scene;
}

/**
 * Guards direct scene-number edits against the number-keyed script map: a
 * number already used by another scene would make both show that scene's
 * script, so the edit opens a warn + swap prompt instead of applying silently.
 *
 * Hosts call `trySetSceneNumber(scene, value)` and render `{modal}`:
 * - free number → dispatches `UPDATE_SCENE` immediately, returns true;
 * - collision  → opens the prompt (Cancel keeps the original), returns false.
 * Swap exchanges both numbers in one undo entry.
 */
export function useSceneNumberCollisionGuard(
  dispatch: (action: any) => void,
  scenes: Scene[],
) {
  const [pending, setPending] = useState<Pending | null>(null);
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;

  const trySetSceneNumber = useCallback((scene: Scene, newNumber: string): boolean => {
    const collision = findSceneNumberCollision(scenesRef.current, scene.id, newNumber);
    if (!collision) {
      dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, sceneNumber: newNumber } });
      return true;
    }
    setPending({ scene, collision });
    return false;
  }, [dispatch]);

  const cancel = useCallback(() => setPending(null), []);

  const swap = useCallback(() => {
    if (!pending) return;
    const a = scenesRef.current.find(s => s.id === pending.scene.id) ?? pending.scene;
    const b = scenesRef.current.find(s => s.id === pending.collision.id) ?? pending.collision;
    dispatch({ type: 'BATCH_START' });
    dispatch({ type: 'UPDATE_SCENE', payload: { id: a.id, sceneNumber: b.sceneNumber } });
    dispatch({ type: 'UPDATE_SCENE', payload: { id: b.id, sceneNumber: a.sceneNumber } });
    dispatch({ type: 'BATCH_COMMIT' });
    setPending(null);
  }, [dispatch, pending]);

  const modal = (
    <Modal
      open={!!pending}
      onClose={cancel}
      title="Scene number already used"
      width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={cancel}>Cancel</ModalFooterButton>
          <ModalFooterButton variant="hero" onClick={swap}>Swap numbers</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-5 py-4 space-y-3">
        <p className="text-sm text-zinc-300">
          Scene <span className="font-semibold text-white">{pending?.collision.sceneNumber}</span> is already used by{' '}
          <span className="font-semibold text-white">{pending ? sceneLabel(pending.collision) : ''}</span>.
        </p>
        <p className="text-sm text-zinc-400">
          Two scenes can’t share a number — they would both show the same script. Swap the two numbers so{' '}
          <span className="text-zinc-200">{pending ? sceneLabel(pending.scene) : ''}</span> takes{' '}
          <span className="text-zinc-200">{pending?.collision.sceneNumber}</span>, or cancel and pick a free number.
        </p>
      </div>
    </Modal>
  );

  return { trySetSceneNumber, modal };
}
