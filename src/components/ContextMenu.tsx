import { ContextMenu as KitContextMenu, ContextMenuItem, ContextMenuDivider } from '@gabriel/ui-kit';
import type { ContextMenuProps } from '@gabriel/ui-kit';
import { overlayMorphOptIn } from '../lib/overlayMotion';

/* The context-menu morph (press-point-anchored scale+fade, same motion
   language as the modal FLIP) is on in the kit by default; this shim
   carries the app's opt-out flag (localStorage lemon_schedule_modal_morph
   === '0', documented in docs/DESIGN-LANGUAGE.md §Modal anatomy & rules). */
export function ContextMenu(props: ContextMenuProps) {
  return <KitContextMenu {...props} morph={props.morph ?? overlayMorphOptIn()} />;
}

export default ContextMenu;

export { ContextMenuItem, ContextMenuDivider };
