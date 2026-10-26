import { Modal as KitModal, ModalFooter } from '@gabriel/ui-kit';
import type { ModalProps } from '@gabriel/ui-kit';
import { overlayMorphOptIn } from '../lib/overlayMotion';
import { useLocalOverlaySignal } from '../lib/localOverlaySignal';
import { projectModalThemeOf } from '../lib/projectTheme';
import { useProjectTheme } from '../store';

export { ModalFooter };
export type { ModalProps };

/* The Modal primitive (draggable, stacked morph/zoom/size transitions) lives
   in @gabriel/ui-kit — this shim carries the app's opt-out flag
   (localStorage lemon_schedule_modal_morph === '0', documented in
   docs/DESIGN-LANGUAGE.md §Modal anatomy & rules), feeds the local-overlay
   signal (roadmap 240), and maps the open project to the modal shell theme
   (roadmap 302: every app modal is a neutral surface; the project accent is
   chrome identity, not modal body colour). */
export default function Modal({ accent, surface, ...props }: ModalProps) {
  useLocalOverlaySignal('modal', props.open);
  const projectModalTheme = projectModalThemeOf(useProjectTheme());
  return (
    <KitModal
      {...props}
      accent={accent ?? projectModalTheme.accent}
      surface={surface ?? projectModalTheme.surface}
      morph={props.morph ?? overlayMorphOptIn()}
    />
  );
}
