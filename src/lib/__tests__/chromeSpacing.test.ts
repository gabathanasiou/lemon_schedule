import { describe, it, expect } from 'vitest';
import {
  CHROME_BAR_INSET,
  CHROME_BAR_INSET_PX,
  CHROME_CLUSTER_GAP,
  CHROME_CLUSTER_GAP_PX,
  CHROME_ITEM_GAP,
  CHROME_ITEM_GAP_PX,
  CHROME_TAB_GAP,
  CHROME_TAB_GAP_PX,
} from '../chromeSpacing';

// Roadmap 264: the scale's pixel twins feed the icon-dock math
// (AppHeader.syncTabLayout / PageToolbar.syncTabsDock) and the chrome audit —
// they must track the class strings exactly, so a spacing change can never
// silently desync the measurement from the rendered bars.
describe('chrome spacing scale', () => {
  it('derives the pixel twins from the Tailwind spacing unit (0.25rem = 4px)', () => {
    expect({
      rail: CHROME_BAR_INSET_PX,
      cluster: CHROME_CLUSTER_GAP_PX,
      item: CHROME_ITEM_GAP_PX,
      tab: CHROME_TAB_GAP_PX,
    }).toEqual({ rail: 16, cluster: 16, item: 8, tab: 4 });
  });

  it('keeps every constant on the Tailwind spacing scale', () => {
    for (const cls of [CHROME_BAR_INSET, CHROME_CLUSTER_GAP, CHROME_ITEM_GAP, CHROME_TAB_GAP]) {
      expect(cls).toMatch(/^(px|gap)-\d+$/);
    }
  });
});
