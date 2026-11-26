import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import { formatSceneHeading } from '../../lib/script';
import type { Scene } from '../../types';

function sceneLabel(scene: Scene): string {
  const heading = formatSceneHeading(scene.intExt, scene.set, scene.dayNight);
  return [scene.sceneNumber, heading].filter(Boolean).join('  ');
}

interface SceneNumberCollisionModalProps {
  open: boolean;
  /** The scene whose number was just edited. */
  scene: Scene | null;
  /** The scene already holding that number. */
  collision: Scene | null;
  onCancel: () => void;
  onSwap: () => void;
}

/** Visual half of the scene-number collision guard — the hook
 *  (`useSceneNumberCollisionGuard`) keeps the state and swap flow. */
export default function SceneNumberCollisionModal({
  open,
  scene,
  collision,
  onCancel,
  onSwap,
}: SceneNumberCollisionModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Scene number already used"
      width="max-w-md"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onCancel}>Cancel</ModalFooterButton>
          <ModalFooterButton variant="hero" onClick={onSwap}>Swap numbers</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-5 py-4 space-y-3">
        <p className="text-sm text-[color:var(--ui-text)]">
          Scene <span className="font-semibold text-[color:var(--ui-text-strong)]">{collision?.sceneNumber}</span> is already used by{' '}
          <span className="font-semibold text-[color:var(--ui-text-strong)]">{collision ? sceneLabel(collision) : ''}</span>.
        </p>
        <p className="text-sm text-[color:var(--ui-text-muted)]">
          Two scenes can’t share a number — they would both show the same script. Swap the two numbers so{' '}
          <span className="text-[color:var(--ui-input-text)]">{scene ? sceneLabel(scene) : ''}</span> takes{' '}
          <span className="text-[color:var(--ui-input-text)]">{collision?.sceneNumber}</span>, or cancel and pick a free number.
        </p>
      </div>
    </Modal>
  );
}
