import { useEffect } from 'react';
import { useProjectTheme } from '../store';
import { PROJECT_CHROME } from './projectTheme';
import { usePhoneDevice } from './device';

/**
 * Keeps the browser / status-bar chrome in step with the project-chrome bar
 * (roadmap 265; root channel 271).
 *
 * Two channels:
 * 1. `meta[name="theme-color"]` — boot-screen / Android / Chrome tint (iOS
 *    ignores it since Safari 26; kept for the other engines). Uses
 *    `PROJECT_CHROME[...].barHex`.
 * 2. The ROOT background (`html` + `body`) — the iPadOS Safari toolbar and
 *    Home-Screen status bar take the PAGE background colour. WebKit's
 *    fixed/sticky edge sampling (`LocalFrameView::fixedContainerEdges` — the
 *    app header is the qualifying top-edge element, see AppHeader.tsx) hands
 *    the iPhone the header colour, but the iPad top chrome does not honour
 *    it; it shows the page colour instead (`#f4f4f5` read as the white/grey
 *    bar). The app shell paints over the root, so the synced colour is only
 *    visible in Safari's own bands.
 *
 * Channel 2 takes the header's OWN painted colour (`getComputedStyle` of
 * `[data-chrome-bar="app-header"]`) — exact by construction: the Tailwind v4
 * palette is oklch, so a parallel hex token can sit a step off the header's
 * pixels. `barHex` is the fallback while no header is mounted (boot screen).
 *
 * Phones (roadmap 267) skip the root sync: the full-bleed shell already puts
 * the header colour under the glass status bar, and `#f4f4f5` is the
 * deliberate canvas for Safari's residual band below the floating toolbar.
 *
 * Never add the deprecated `apple-mobile-web-app-status-bar-style` meta or
 * `black-translucent` — the system bar sits ABOVE the page by design.
 * `viewport-fit=cover` is phone-any-orientation-only and set at boot
 * (main.tsx, roadmap 267), never here.
 */
export function useStatusBarTheme(): void {
  const theme = useProjectTheme();
  const phoneDevice = usePhoneDevice();
  useEffect(() => {
    const barHex = PROJECT_CHROME[theme].barHex;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', barHex);
    const html = document.documentElement;
    if (phoneDevice) {
      /* Leave the `#f4f4f5` canvas (index.css) in place — see above. */
      html.style.removeProperty('background-color');
      document.body.style.removeProperty('background-color');
      return;
    }
    const header = document.querySelector('[data-chrome-bar="app-header"]');
    const barColor = header ? getComputedStyle(header).backgroundColor : barHex;
    html.style.backgroundColor = barColor;
    document.body.style.backgroundColor = barColor;
  }, [theme, phoneDevice]);
}
