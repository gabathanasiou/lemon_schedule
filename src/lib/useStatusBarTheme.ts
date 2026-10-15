import { useEffect } from 'react';
import { useProjectTheme } from '../store';
import { PROJECT_CHROME } from './projectTheme';

/**
 * Keeps `meta[name="theme-color"]` in step with the project-chrome bar — the
 * ONE hex source, `PROJECT_CHROME[...].barHex` (roadmap 265).
 *
 * Why: iOS 26+ deprecated `apple-mobile-web-app-status-bar-style`. A Home
 * Screen web app's opaque status bar takes the page colour, and Safari tints
 * the bar from the fixed/sticky element at the viewport's top edge (WebKit
 * `LocalFrameView::fixedContainerEdges` — the app header is that element, see
 * AppHeader.tsx). theme-color covers the opaque-bar case (plus Android/Chrome).
 * Never add the deprecated meta, `black-translucent`, or `viewport-fit=cover` —
 * the system bar sits ABOVE the page by design.
 */
export function useStatusBarTheme(): void {
  const theme = useProjectTheme();
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', PROJECT_CHROME[theme].barHex);
  }, [theme]);
}
