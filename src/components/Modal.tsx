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
   (roadmap 302: every app modal is a dark neutral surface; the project accent
   is chrome identity, not modal body colour. The explicit dark default keeps
   modals stable inside a light page scope until light modals land in 310). */
export default function Modal({ accent, surface, theme, ...props }: ModalProps) {
  useLocalOverlaySignal('modal', props.open);
  const projectModalTheme = projectModalThemeOf(useProjectTheme());
  return (
    <KitModal
      {...props}
      theme={theme ?? modalThemeHarness() ?? 'dark'}
      accent={accent ?? projectModalTheme.accent}
      surface={surface ?? projectModalTheme.surface}
      morph={props.morph ?? overlayMorphOptIn()}
    />
  );
}

/** Roadmap 310 phase 3 — dev-only light-modal harness: `?modalTheme=light`
 *  (or `dark`) opens every app modal on that ladder so tokenised content can be
 *  checked without shipping a user-facing toggle. Honoured in dev builds and
 *  agent mode only (same gate as the debug bridge); an explicit `theme` prop
 *  always wins. */
function modalThemeHarness(): 'light' | 'dark' | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!import.meta.env.DEV && localStorage.getItem('LEMON_AGENT') !== '1') return undefined;
  const [value] = (new URLSearchParams(window.location.search).get('modalTheme') || '').split(',');
  return value === 'light' || value === 'dark' ? value : undefined;
}
