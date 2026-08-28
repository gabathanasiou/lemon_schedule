import { Modal as KitModal, ModalFooter } from '@gabriel/ui-kit';
import type { ModalProps } from '@gabriel/ui-kit';

export { ModalFooter };
export type { ModalProps };

/* The Modal primitive (draggable, stacked morph/zoom/size transitions) lives
   in @gabriel/ui-kit — this shim only carries the app's opt-out flag
   (localStorage lemon_schedule_modal_morph === '0', documented in
   docs/DESIGN-LANGUAGE.md §Modal anatomy & rules). */
function morphEnabled(): boolean {
  try { return localStorage.getItem('lemon_schedule_modal_morph') !== '0'; } catch { return true; }
}

export default function Modal(props: ModalProps) {
  return <KitModal {...props} morph={props.morph ?? morphEnabled()} />;
}
