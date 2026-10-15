import { ContextMenu as KitContextMenu, ContextMenuItem, ContextMenuDivider, ContextMenuSub } from '@gabriel/ui-kit';
import type { ContextMenuProps } from '@gabriel/ui-kit';
import { overlayMorphOptIn } from '../lib/overlayMotion';
import { useLocalOverlaySignal } from '../lib/localOverlaySignal';

/* The context-menu morph (press-point-anchored scale+fade, same motion
   language as the modal FLIP) is on in the kit by default; this shim
   carries the app's opt-out flag (localStorage lemon_schedule_modal_morph
   === '0', documented in docs/DESIGN-LANGUAGE.md §Modal anatomy & rules).
   The shim also feeds the local-overlay signal (roadmap 240) while open. */
export function ContextMenu(props: ContextMenuProps) {
  useLocalOverlaySignal('menu', props.open);
  return <KitContextMenu {...props} morph={props.morph ?? overlayMorphOptIn()} />;
}

export default ContextMenu;

export { ContextMenuItem, ContextMenuDivider, ContextMenuSub };
