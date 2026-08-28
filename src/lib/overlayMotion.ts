/** App-side opt-in for the overlay morphs (menus, submenus, context menus,
 *  entity/select dropdown panels — the modal FLIP language, shared from the
 *  ui-kit). The kit components stay key-agnostic; app shims and panels pass
 *  this in (the Modal shim pattern). One key rules modals AND every overlay:
 *  localStorage lemon_schedule_modal_morph === '0' disables all of it.
 *  prefers-reduced-motion is handled by the kit's overlayMorphEnabled. */
export function overlayMorphOptIn(): boolean {
  try { return localStorage.getItem('lemon_schedule_modal_morph') !== '0'; } catch { return true; }
}
