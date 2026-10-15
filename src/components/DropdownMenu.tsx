import { DropdownMenu as KitDropdownMenu, ItemManagerDropdown as KitItemManagerDropdown, DropdownThemeContext, useDropdownTheme, getDropdownClasses, SubmenuContext } from '@gabriel/ui-kit';
import type { DropdownMenuProps, ItemManagerDropdownProps, DropdownTheme } from '@gabriel/ui-kit';
import { overlayMorphOptIn } from '../lib/overlayMotion';
import { useLocalOverlaySignal } from '../lib/localOverlaySignal';

/* The menu morph (trigger-anchored scale+fade, same motion language as the
   modal FLIP) is on in the kit by default; this shim carries the app's
   opt-out flag (localStorage lemon_schedule_modal_morph === '0', documented
   in docs/DESIGN-LANGUAGE.md §Modal anatomy & rules) so one key disables
   modals AND every overlay morph. Submenus inherit via SubmenuContext.
   The shim also feeds the local-overlay signal (roadmap 240) while open. */
export default function DropdownMenu(props: DropdownMenuProps) {
  useLocalOverlaySignal('menu', props.open);
  return <KitDropdownMenu {...props} morph={props.morph ?? overlayMorphOptIn()} />;
}

export function ItemManagerDropdown(props: ItemManagerDropdownProps) {
  useLocalOverlaySignal('menu', props.open);
  return <KitItemManagerDropdown {...props} morph={props.morph ?? overlayMorphOptIn()} />;
}

export { DropdownThemeContext, useDropdownTheme, getDropdownClasses, SubmenuContext };
export type { DropdownTheme };
