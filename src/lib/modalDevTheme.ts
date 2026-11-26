/**
 * Dev-only modal theme override (roadmap 374). The Modals Studio previews the
 * SAME app modals at light/dark without reloading; the shim in
 * `src/components/Modal.tsx` consults this before the `?modalTheme=` harness.
 *
 * Always bundled (the shim reads it), but only the DEV-only studio writes it —
 * outside the studio it is null and the app behaves exactly as before.
 */

export type ModalThemeOverride = 'light' | 'dark' | null;

let override: ModalThemeOverride = null;

export function setModalThemeOverride(next: ModalThemeOverride): void {
  override = next;
}

export function getModalThemeOverride(): ModalThemeOverride {
  return override;
}
