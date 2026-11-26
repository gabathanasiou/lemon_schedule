import { useKitTheme } from '@gabriel/ui-kit';

/**
 * The ambient kit mode for app controls that still take an explicit
 * `light | dark` prop. Inside a modal the kit Modal publishes its mode to the
 * subtree, so a control without a forced theme follows the modal; on a dark
 * page/toolbar it stays dark.
 *
 * Use this when an adapter needs a VALUE (PickerField, SelectDropdown,
 * GroupedSelect); plain `DropdownMenu`/`SearchMenu` already inherit the scope
 * on their own. Never pass `'dark'` inside a modal-only component — the modal
 * may be previewed/driven in light mode (roadmap 374/302).
 */
export function useAmbientKitMode(): 'light' | 'dark' {
  return useKitTheme().mode;
}
