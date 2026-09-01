import { test, expect } from '@playwright/test';
import { openSeededProject, seedLeadCast } from './helpers';

// Roadmap 44 — linked elements: one-way anchor-based links. Adding the
// anchor to a scene (any write path — Scene Sheet here) adds its linked
// elements automatically; removing an anchor with remaining links asks
// first (cancel keeps it; confirm cascades). The Link Manager (Element
// Manager → Links) manages links and retroactively applies them.

// Anchor: the seed's lead cast member (guaranteed present + widely cast).
async function seedRibbonElement(page: any) {
  await page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    const p = b.getProject();
    for (const name of ['LINKED RIBBON', 'SECOND RIBBON']) {
      if (!(p.breakdownElements?.props || []).some((e: any) => e.name === name)) {
        b.dispatch({ type: 'ADD_ELEMENT', payload: { category: 'props', element: { id: name, name } } });
      }
    }
  });
}

async function seedLinks(page: any, anchorId: string) {
  await seedRibbonElement(page);
  await page.evaluate((aId) => {
    const b = (window as any).__lemonSchedule;
    b.dispatch({
      type: 'UPDATE_PROJECT',
      payload: {
        elementLinks: [
          { id: 'link-1', anchorCategory: 'cast', anchorValue: String(aId), linkedCategory: 'props', linkedValue: 'LINKED RIBBON' },
        ],
      },
    });
  }, anchorId);
  return { anchorId };
}

// Scene WITHOUT the anchor (clean propagation target) — returns its index and cast.
async function findScenes(page: any, anchorId: string) {
  return page.evaluate((aId) => {
    const b = (window as any).__lemonSchedule;
    const p = b.getProject();
    const contains = (s: any) => (s.cast || '').split(',').map((x: string) => x.trim()).includes(aId);
    const idx = p.scenes.findIndex((s: any) => !contains(s));
    if (idx === -1) throw new Error('seed: no scene without anchor');
    return { index: idx, id: p.scenes[idx].id, cast: p.scenes[idx].cast || '' };
  }, anchorId);
}

async function gotoSheet(page: any, sceneIndex: number) {
  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.getByRole('button', { name: 'Sheet', exact: true }).click();
  // The Scene Sheet's nav input lives in the top header (header-portal mode).
  const navInput = page.locator('input[class*="w-10"]').first();
  await navInput.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.type(String(sceneIndex + 1));
  await page.keyboard.press('Enter');
  await expect(page.locator('input[class*="w-10"]').first()).toHaveValue(String(sceneIndex + 1), { timeout: 5000 });
}

/** Full-value replace of the Cast box via select-all + insertText (one input
 *  event — EntityDropdown commits on Tab with the sorted value, so a single
 *  deterministic commit per call). */
async function setCast(page: any, value: string) {
  const castBox = page.locator('div.rounded.overflow-hidden', { has: page.getByText('Cast', { exact: true }) }).first();
  const castInput = castBox.locator('input').first();
  await castInput.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.insertText(value);
  await page.keyboard.press('Tab');
}

async function sceneCast(page: any, id: string) {
  return page.evaluate((sceneId) => {
    const b = (window as any).__lemonSchedule;
    const s = b.getProject().scenes.find((x: any) => x.id === sceneId);
    return { cast: s?.cast || '', props: s?.props || '' };
  }, id);
}

test('scene sheet: adding the anchor adds its linked elements', async ({ page }) => {
  await openSeededProject(page);
  const anchor = await seedLeadCast(page);
  const { anchorId } = await seedLinks(page, anchor.id);
  const target = await findScenes(page, anchorId);

  await gotoSheet(page, target.index);
  const withAnchor = target.cast ? `${target.cast}, ${anchorId}` : String(anchorId);
  await setCast(page, withAnchor);

  await page.waitForFunction(({ id, aId }) => {
    const b = (window as any).__lemonSchedule;
    const s = b.getProject().scenes.find((x: any) => x.id === id);
    return !!s && (s.cast || '').split(',').map((x: string) => x.trim()).includes(String(aId));
  }, { id: target.id, aId: anchorId });

  // Linked element landed in the props field of the same scene.
  const scene = await sceneCast(page, target.id);
  expect(scene.props.split(',').map((x: string) => x.trim())).toContain('LINKED RIBBON');
});

test('scene sheet: removing an anchor with links warns — cancel keeps it, confirm cascades', async ({ page }) => {
  await openSeededProject(page);
  const anchor = await seedLeadCast(page);
  const { anchorId } = await seedLinks(page, anchor.id);
  const target = await findScenes(page, anchorId);

  await gotoSheet(page, target.index);
  const withAnchor = target.cast ? `${target.cast}, ${anchorId}` : String(anchorId);
  await setCast(page, withAnchor);
  await page.waitForFunction(({ id, aId }) => {
    const b = (window as any).__lemonSchedule;
    const s = b.getProject().scenes.find((x: any) => x.id === id);
    return !!s && (s.cast || '').split(',').map((x: string) => x.trim()).includes(String(aId));
  }, { id: target.id, aId: anchorId });

  const applied = await sceneCast(page, target.id);
  expect(applied.cast.split(',').map((x: string) => x.trim())).toContain(String(anchorId));
  expect(applied.props.split(',').map((x: string) => x.trim())).toContain('LINKED RIBBON');

  const suffix = `, ${anchorId}`;
  const anchorless = applied.cast.endsWith(suffix)
    ? applied.cast.slice(0, -suffix.length).trimEnd()
    : applied.cast.split(',').map((x: string) => x.trim()).filter(x => x !== anchorId).join(', ');

  // Cancel keeps the anchor (the edit is not applied at all).
  await setCast(page, anchorless);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog).toContainText('linked elements');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  const afterCancel = await sceneCast(page, target.id);
  expect(afterCancel.cast.split(',').map((x: string) => x.trim())).toContain(String(anchorId));
  expect(afterCancel.props.split(',').map((x: string) => x.trim())).toContain('LINKED RIBBON');

  // Confirm cascades: anchor AND its linked element are removed.
  await setCast(page, anchorless);
  await expect(page.getByRole('dialog')).toContainText('linked elements');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.waitForFunction(({ id, aId }) => {
    const b = (window as any).__lemonSchedule;
    const s = b.getProject().scenes.find((x: any) => x.id === id);
    return !!s && !(s.cast || '').split(',').map((x: string) => x.trim()).includes(String(aId));
  }, { id: target.id, aId: anchorId });

  const afterConfirm = await sceneCast(page, target.id);
  expect(afterConfirm.props.split(',').map((x: string) => x.trim())).not.toContain('LINKED RIBBON');
});

test('link manager: anchor card links multiple elements and applies retroactively', async ({ page }) => {
  await openSeededProject(page);
  await seedRibbonElement(page);
  const anchor = await seedLeadCast(page);
  const anchorId = anchor.id;
  // The seed ships its own links — clear them so exactly one anchor card exists.
  await page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    b.dispatch({ type: 'UPDATE_PROJECT', payload: { elementLinks: [] } });
  });

  // Find a scene with the anchor and clear its props (clean retroactive target).
  const target = await page.evaluate((aId) => {
    const b = (window as any).__lemonSchedule;
    const p = b.getProject();
    const s = p.scenes.find((x: any) =>
      (x.cast || '').split(',').map((c: string) => c.trim()).includes(String(aId)));
    if (!s) throw new Error('seed: no scene with anchor');
    b.dispatch({ type: 'UPDATE_SCENE', payload: { id: s.id, props: '' } });
    return { id: s.id };
  }, anchorId);

  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.getByRole('button', { name: 'Element Manager' }).click();
  await page.getByRole('button', { name: 'Links', exact: true }).click();

  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Element Links');

  // Day-status-modal style rows: type to filter, CLICK the item (mouse).
  const elementInput = modal.locator('[data-el-dropdown] input');
  await elementInput.nth(0).click();
  await page.keyboard.type(anchor.name.slice(0, 4));
  await page.getByText(anchor.name, { exact: true }).last().click();
  await expect(elementInput.nth(0)).toHaveValue(String(anchorId));

  // Linked row = multi-select per category: pick BOTH ribbon props in it.
  await elementInput.nth(1).click();
  await page.keyboard.type('linked');
  await page.getByText('LINKED RIBBON', { exact: true }).last().click();
  await expect(elementInput.nth(1)).toHaveValue(/LINKED RIBBON/);
  await elementInput.nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.type(', second');
  await page.getByText('SECOND RIBBON', { exact: true }).last().click();
  await expect(elementInput.nth(1)).toHaveValue(/SECOND RIBBON/);
  await expect(elementInput.nth(1)).toHaveValue(/LINKED RIBBON/);

  // One linked row per category: Add pre-fills the NEXT unused category
  // (cast + sets skipped → Background Actors), so a duplicate Props row
  // can't be created by adding.
  await modal.getByRole('button', { name: 'Add Linked Element' }).first().click();
  await expect(modal.getByRole('button', { name: 'Background Actors', exact: true })).toBeVisible();

  // Used categories are DISABLED in the linked row's category menu…
  await modal.getByRole('button', { name: 'Background Actors', exact: true }).click();
  const propsItem = page.locator('[role="menuitem"]').filter({ hasText: /^Props$/ });
  await expect(propsItem).toHaveAttribute('aria-disabled', 'true');
  // …and Sets is anchor-only — never offered as a linked category.
  await expect(page.locator('[role="menuitem"]').filter({ hasText: /^Sets$/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();

  // Apply the whole card: both linked elements land in every scene with the anchor.
  await modal.getByRole('button', { name: 'Apply linked elements to existing scenes' }).click();
  await expect(modal.getByText(/Applied: linked elements added to/)).toBeVisible();

  const applied = await page.evaluate(({ id, aId }) => {
    const b = (window as any).__lemonSchedule;
    const p = b.getProject();
    const s = p.scenes.find((x: any) => x.id === id);
    return {
      anchorScenes: p.scenes.filter((x: any) => (x.cast || '').split(',').map((c: string) => c.trim()).includes(String(aId))).length,
      anchoredSceneProps: s?.props || '',
      links: p.elementLinks || [],
    };
  }, { id: target.id, aId: anchorId });

  expect((applied.anchoredSceneProps || '').split(',').map((x: string) => x.trim())).toContain('LINKED RIBBON');
  expect((applied.anchoredSceneProps || '').split(',').map((x: string) => x.trim())).toContain('SECOND RIBBON');
  expect(applied.anchorScenes).toBeGreaterThan(0);

  // Both links persisted under the same anchor.
  const anchorLinks = applied.links.filter((l: any) => l.anchorCategory === 'cast' && l.anchorValue === String(anchorId));
  expect(anchorLinks).toHaveLength(2);
  expect(anchorLinks.map((l: any) => l.linkedCategory)).toEqual(['props', 'props']);

  // Close + reopen: flat storage regroups into ONE Props row again (the
  // per-value rows bug — four links must not reopen as four rows).
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(modal).toBeHidden();
  await page.getByRole('button', { name: 'Links', exact: true }).click();
  await expect(modal).toBeVisible();
  await expect(elementInput).toHaveCount(2);
  await expect(elementInput.nth(0)).toHaveValue('1');
  await expect(elementInput.nth(1)).toHaveValue(/LINKED RIBBON/);
  await expect(elementInput.nth(1)).toHaveValue(/SECOND RIBBON/);

  // A gibberish query shows the synthetic "Add" row (day-modal behavior)…
  await elementInput.nth(1).click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.type('zzz');
  await expect(page.getByText(/Add "zzz"/)).toBeVisible();
  // …and Escape dismisses ONLY the dropdown — the modal stays open.
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
});

test('anchored elements show an anchor icon in pickers (link manager + scene sheet)', async ({ page }) => {
  await openSeededProject(page);
  await seedRibbonElement(page);
  const anchor = await seedLeadCast(page);
  await page.evaluate((aId) => {
    const b = (window as any).__lemonSchedule;
    b.dispatch({
      type: 'UPDATE_PROJECT',
      payload: {
        elementLinks: [
          { id: 'link-1', anchorCategory: 'cast', anchorValue: String(aId), linkedCategory: 'props', linkedValue: 'LINKED RIBBON' },
        ],
      },
    });
  }, anchor.id);

  // Link Manager: the anchor picker shows the icon next to the anchor member…
  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.getByRole('button', { name: 'Element Manager' }).click();
  await page.getByRole('button', { name: 'Links', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  const elementInput = modal.locator('[data-el-dropdown] input');

  await elementInput.nth(0).click();
  await page.keyboard.type(anchor.name.slice(0, 4));
  const anchorRow = page.getByText(anchor.name, { exact: true }).last();
  await expect(anchorRow).toBeVisible();
  await expect(anchorRow.locator('xpath=ancestor::button').locator('svg.lucide-anchor')).toBeVisible();
  await page.keyboard.press('Escape');

  // …and the linked row (props, no anchor there) shows none.
  await elementInput.nth(1).click();
  await page.keyboard.type('linked');
  const linkedRow = page.getByText('LINKED RIBBON', { exact: true }).last();
  await expect(linkedRow).toBeVisible();
  await expect(linkedRow.locator('xpath=ancestor::button').locator('svg.lucide-anchor')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(modal).toBeHidden();

  // Scene Sheet cast picker: the anchored cast member carries the icon too.
  await gotoSheet(page, 0);
  const castBox = page.locator('div.rounded.overflow-hidden', { has: page.getByText('Cast', { exact: true }) }).first();
  const castInput = castBox.locator('input').first();
  await castInput.click();
  await page.keyboard.type(anchor.name.slice(0, 4));
  const sheetRow = page.getByText(anchor.name, { exact: true }).last();
  await expect(sheetRow).toBeVisible();
  await expect(sheetRow.locator('xpath=ancestor::button').locator('svg.lucide-anchor')).toBeVisible();
});