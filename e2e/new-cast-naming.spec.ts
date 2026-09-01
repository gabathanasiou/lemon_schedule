import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

// Roadmap 86 — naming new cast members right after they're added through an
// element dropdown. The Scene Sheet cast field is the deterministic harness
// (same EntityDropdown commit path as the stripboard + Glide): typing a
// brand-new cast id and committing must open the naming modal, where the user
// can name it or undo the add per entry. Cancel leaves the member blank (the
// pre-feature behavior).

async function gotoSheet(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.getByRole('button', { name: 'Sheet', exact: true }).click();
  const navInput = page.locator('input[class*="w-10"]').first();
  await navInput.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await expect(navInput).toHaveValue('1', { timeout: 5000 });
}

/** Full-value replace of the Cast box via select-all + insertText (one input
 *  event — EntityDropdown commits on Tab with the sorted value). */
async function setCast(page: import('@playwright/test').Page, value: string) {
  const castBox = page.locator('div.rounded.overflow-hidden', { has: page.getByText('Cast', { exact: true }) }).first();
  const castInput = castBox.locator('input').first();
  await castInput.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.insertText(value);
  await page.keyboard.press('Tab');
}

/** A cast id the seed is guaranteed not to have (max numeric id + 1). */
async function nextCastId(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    const cast: any[] = b.getProject().castMembers || [];
    let max = 0;
    for (const m of cast) { const n = parseInt(String(m.id), 10); if (!isNaN(n) && n > max) max = n; }
    return String(max + 1);
  });
}

async function castMembers(page: import('@playwright/test').Page): Promise<{ id: string; name: string }[]> {
  return page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    return (b.getProject().castMembers || []).map((m: any) => ({ id: String(m.id), name: m.name || '' }));
  });
}

async function sceneCast(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    return b.getProject().scenes[0]?.cast || '';
  });
}

const dialog = (page: import('@playwright/test').Page) => page.getByRole('dialog');
const modal = (page: import('@playwright/test').Page) => page.locator('[data-testid="new-cast-name-modal"]');

test.describe('new cast naming modal', () => {
  test('typing a new cast id opens the modal; Save names the member (uppercased)', async ({ page }) => {
    await openSeededProject(page);
    await gotoSheet(page);
    const id = await nextCastId(page);
    await setCast(page, id);

    await expect(modal(page)).toBeVisible({ timeout: 5000 });
    await expect(dialog(page)).toContainText(id);

    const input = modal(page).locator('[data-testid="new-cast-name-input"]').first();
    await input.click();
    await page.keyboard.type('GEORGE NAMED');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(modal(page)).toBeHidden({ timeout: 5000 });
    const members = await castMembers(page);
    const added = members.find(m => m.id === id);
    expect(added).toBeTruthy();
    expect(added!.name).toBe('GEORGE NAMED');
    expect((await sceneCast(page)).split(',').map((x: string) => x.trim())).toContain(id);
  });

  test('per-entry undo removes the cast member and strips it from the scene', async ({ page }) => {
    await openSeededProject(page);
    await gotoSheet(page);
    const id = await nextCastId(page);
    await setCast(page, id);

    await expect(modal(page)).toBeVisible({ timeout: 5000 });
    await modal(page).locator('[data-testid="new-cast-name-undo"]').first().click();

    await expect(modal(page)).toBeHidden({ timeout: 5000 });
    const members = await castMembers(page);
    expect(members.find(m => m.id === id)).toBeUndefined();
    expect((await sceneCast(page)).split(',').map((x: string) => x.trim())).not.toContain(id);
  });

  test('Cancel leaves the member blank (pre-feature behavior)', async ({ page }) => {
    await openSeededProject(page);
    await gotoSheet(page);
    const id = await nextCastId(page);
    await setCast(page, id);

    await expect(modal(page)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(modal(page)).toBeHidden({ timeout: 5000 });
    const members = await castMembers(page);
    expect(members.find(m => m.id === id)?.name).toBe('');
  });

  test('an existing cast id does not open the modal; non-cast categories never do', async ({ page }) => {
    await openSeededProject(page);
    await gotoSheet(page);

    // Re-add an existing member — no naming modal.
    const existing = await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      return String((b.getProject().castMembers || [])[0].id);
    });
    await setCast(page, existing);
    await expect(modal(page)).toBeHidden({ timeout: 3000 });

    // Add a brand-new prop (name-keyed) — no naming modal either.
    const propsBox = page.locator('div.rounded.overflow-hidden', { has: page.getByText('Props', { exact: true }) }).first();
    const propsInput = propsBox.locator('input').first();
    await propsInput.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.insertText('BRAND NEW PROP');
    await page.keyboard.press('Tab');
    await expect(modal(page)).toBeHidden({ timeout: 3000 });
  });
});
