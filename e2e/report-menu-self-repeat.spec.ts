import { test, expect } from '@playwright/test';
import { loadSeedProject, seedProjectScript } from './helpers';

const BASE = process.env.PW_BASE_URL || 'http://localhost:3001';

async function openDesigner(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  }

async function openSeeded(page: import('@playwright/test').Page) {
  const seed = loadSeedProject();
  await page.addInitScript(seedProjectScript(seed));
  await page.goto(`${BASE}/lemon_schedule/`);
  const card = page.getByText(seed.data.title, { exact: true }).first();
  await card.click({ timeout: 8000 });
  }

test('repeat menu hides self-redundant days under a days parent', async ({ page }) => {
  await openSeeded(page);
  await openDesigner(page);

  // Top-level repeat, switch it to over Days.
  await page.getByRole('button', { name: 'Repeat', exact: true }).click();
    await page.getByRole('button', { name: 'Scenes', exact: true }).click();
  await page.locator('.ui-menu').getByText('Days', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Days', exact: true })).toBeVisible({ timeout: 3000 });

  // Nest another repeat inside the Days repeat.
  await page.getByRole('button', { name: 'Repeat', exact: true }).dragTo(page.locator('.repeat-drop-empty').last());
  
  // The child's menu offers the contextual scenes (of this day) + base
  // collections, but NOT Days — a Days repeat inside a Days repeat is
  // self-redundant and hidden.
  await page.getByRole('button', { name: 'Scenes (of this day)', exact: true }).click();
  const menu = page.locator('.ui-menu');
  await expect(menu.getByText('Scenes (of this day)', { exact: true })).toBeVisible({ timeout: 3000 });
  await expect(menu.getByText('Scenes', { exact: true })).toBeVisible();
  await expect(menu.getByText('Days', { exact: true })).toHaveCount(0);
  await expect(menu.getByText('Elements', { exact: true })).toBeVisible();
  await expect(menu.getByText('Categories', { exact: true })).toBeVisible();
  await expect(menu.getByText('Crew', { exact: true })).toBeVisible();
  await expect(menu.getByText('Violation Types', { exact: true })).toBeVisible();
});

test('repeat menu hides scenes under a scenes parent once the child is not over scenes', async ({ page }) => {
  await openSeeded(page);
  await openDesigner(page);

  // Top-level repeat defaults to Scenes — this is the parent.
  await page.getByRole('button', { name: 'Repeat', exact: true }).click();
  
  // Nest a repeat inside it (child defaults to Scenes too — that IS the
  // current value, so it stays listed as exempted).
  await page.getByRole('button', { name: 'Repeat', exact: true }).dragTo(page.locator('.repeat-drop-empty').last());
    await expect(page.getByRole('button', { name: 'Scenes (of this scene)', exact: true })).toBeVisible({ timeout: 3000 });

  // Switch the child to Days.
  await page.getByRole('button', { name: 'Scenes (of this scene)', exact: true }).click();
  await page.locator('.ui-menu').getByText('Days', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Days (of this scene)', exact: true })).toBeVisible({ timeout: 3000 });

  // Reopen: Scenes is now self-redundant (scenes under a scenes parent) and
  // must be hidden; Days is the current value and stays.
  await page.getByRole('button', { name: 'Days (of this scene)', exact: true }).click();
  const menu = page.locator('.ui-menu');
  await expect(menu.getByText('Days', { exact: true })).toBeVisible({ timeout: 3000 });
  await expect(menu.getByText('Scenes', { exact: true })).toHaveCount(0);
  await expect(menu.getByText('Elements (of this scene)', { exact: true })).toBeVisible();
});

test('repeat menu hides crew under a crew parent and keeps crew labels honest', async ({ page }) => {
  await openSeeded(page);
  await openDesigner(page);

  await page.getByRole('button', { name: 'Repeat', exact: true }).click();
    await page.getByRole('button', { name: 'Scenes', exact: true }).click();
  await page.locator('.ui-menu').getByText('Crew', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Crew', exact: true })).toBeVisible({ timeout: 3000 });

  // Nest a repeat inside the Crew repeat.
  await page.getByRole('button', { name: 'Repeat', exact: true }).dragTo(page.locator('.repeat-drop-empty').last());
  
  // Crew is non-rule-bearing: the child label has no "(of this crew member)"
  // decoration and its menu does NOT list Crew (self-redundant).
  await expect(page.getByRole('button', { name: 'Scenes', exact: true })).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('Scenes (of this crew member)', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Scenes', exact: true }).click();
  const menu = page.locator('.ui-menu');
  await expect(menu.getByText('Crew', { exact: true })).toHaveCount(0);
  await expect(menu.getByText('Days', { exact: true })).toBeVisible();
  await expect(menu.getByText('Scenes', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  // No "Only … in this crew member" scope checkbox either.
  await expect(page.getByText('Only scenes in this crew member', { exact: true })).toHaveCount(0);
});

test('elements submenu grays the parent own category under a cast parent', async ({ page }) => {
  await openSeeded(page);
  await openDesigner(page);

  await page.getByRole('button', { name: 'Repeat', exact: true }).click();
    await page.getByRole('button', { name: 'Scenes', exact: true }).click();
  await page.locator('.ui-menu').getByText('Elements', { exact: true }).click();
  await page.locator('.ui-menu').getByText('Cast', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Elements · Cast', exact: true })).toBeVisible({ timeout: 3000 });

  // Nest a repeat inside the Cast repeat.
  await page.getByRole('button', { name: 'Repeat', exact: true }).dragTo(page.locator('.repeat-drop-empty').last());
  
  // Child over Scenes (default) — open its Elements submenu: Cast is the
  // parent's own category ("cast of this cast member") and must be grayed.
  await page.getByRole('button', { name: 'Scenes (of this element)', exact: true }).click();
  await page.locator('.ui-menu').getByText('Elements', { exact: true }).click();
  const castItem = page.locator('.ui-menu').getByText('Cast', { exact: true }).locator('..');
  await expect(castItem).toBeVisible({ timeout: 3000 });
  await expect(castItem).toHaveClass(/opacity-30/);
  const propsItem = page.locator('.ui-menu').getByText('Props', { exact: true }).locator('..');
  await expect(propsItem).not.toHaveClass(/opacity-30/);
});

test('table over menu hides self-redundant collections under a days parent', async ({ page }) => {
  await openSeeded(page);
  await openDesigner(page);

  await page.getByRole('button', { name: 'Repeat', exact: true }).click();
    await page.getByRole('button', { name: 'Scenes', exact: true }).click();
  await page.locator('.ui-menu').getByText('Days', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Days', exact: true })).toBeVisible({ timeout: 3000 });

  // Nest a table inside the Days repeat.
  await page.getByRole('button', { name: 'Table', exact: true }).dragTo(page.locator('.repeat-drop-empty').last());
  
  // Nested table over menu: base collections minus self-redundant Days.
  await page.getByRole('button', { name: 'Scenes (of this day)', exact: true }).click();
  const menu = page.locator('.ui-menu');
  await expect(menu.getByText('Days', { exact: true })).toHaveCount(0);
  await expect(menu.getByText('Scenes', { exact: true })).toBeVisible();
  await expect(menu.getByText('Elements', { exact: true })).toBeVisible();
  await expect(menu.getByText('Crew', { exact: true })).toBeVisible();
  await expect(menu.getByText('Categories', { exact: true })).toBeVisible();
  await expect(menu.getByText('Violation Types', { exact: true })).toBeVisible();
});
