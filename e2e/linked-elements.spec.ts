import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

// Roadmap 44 — linked elements: one-way anchor-based links. Adding the
// anchor to a scene (any write path — Scene Sheet here) adds its linked
// elements automatically; removing an anchor with remaining links asks
// first (cancel keeps it; confirm cascades). The Link Manager (Element
// Manager → Links) manages links and retroactively applies them.

// Anchor: cast member 1 (FISHERMAN — guaranteed present in the seed).
async function seedRibbonElement(page: any) {
  await page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    const p = b.getProject();
    if (!(p.breakdownElements?.props || []).some((e: any) => e.name === 'LINKED RIBBON')) {
      b.dispatch({ type: 'ADD_ELEMENT', payload: { category: 'props', element: { id: 'LINKED RIBBON', name: 'LINKED RIBBON' } } });
    }
  });
}

async function seedLinks(page: any) {
  await seedRibbonElement(page);
  await page.evaluate(() => {
    const b = (window as any).__lemonSchedule;
    b.dispatch({
      type: 'UPDATE_PROJECT',
      payload: {
        elementLinks: [
          { id: 'link-1', anchorCategory: 'cast', anchorValue: '1', linkedCategory: 'props', linkedValue: 'LINKED RIBBON' },
        ],
      },
    });
  });
  return { anchorId: '1' };
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
  const { anchorId } = await seedLinks(page);
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
  const { anchorId } = await seedLinks(page);
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

test('link manager: add a link and retroactively apply to existing scenes', async ({ page }) => {
  await openSeededProject(page);
  await seedRibbonElement(page);
  const anchorId = '1';

  // Find a scene with the anchor but no props yet (clean retroactive target).
  const target = await page.evaluate((aId) => {
    const b = (window as any).__lemonSchedule;
    const p = b.getProject();
    const s = p.scenes.find((x: any) =>
      (x.cast || '').split(',').map((c: string) => c.trim()).includes(String(aId)) && !x.props);
    if (!s) throw new Error('seed: no scene with anchor and empty props');
    return { id: s.id };
  }, anchorId);

  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.getByRole('button', { name: 'Element Manager' }).click();
  await page.getByRole('button', { name: 'Links', exact: true }).click();

  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Element Links');

  // Draft row: anchor = FISHERMAN (cast), linked = LINKED RIBBON (props).
  await modal.locator('button', { hasText: 'Select...' }).first().click();
  await page.getByText('FISHERMAN', { exact: true }).last().click();
  await modal.locator('button', { hasText: 'Select...' }).first().click();
  await page.getByText('LINKED RIBBON', { exact: true }).last().click();

  // Apply retroactively: every scene containing the anchor gains the linked props.
  await modal.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(modal.getByText(/Applied: linked element added to/)).toBeVisible();

  const applied = await page.evaluate(({ id, aId }) => {
    const b = (window as any).__lemonSchedule;
    const p = b.getProject();
    const s = p.scenes.find((x: any) => x.id === id);
    return {
      anchorScenes: p.scenes.filter((x: any) => (x.cast || '').split(',').map((c: string) => c.trim()).includes(String(aId))).length,
      anchoredSceneProps: s?.props || '',
    };
  }, { id: target.id, aId: anchorId });

  expect((applied.anchoredSceneProps || '').split(',').map((x: string) => x.trim())).toContain('LINKED RIBBON');
  expect(applied.anchorScenes).toBeGreaterThan(0);

  // Link persisted on the project.
  const links = await page.evaluate(() => {
    return (window as any).__lemonSchedule.getProject().elementLinks || [];
  });
  expect(links.some((l: any) => l.anchorCategory === 'cast' && l.anchorValue === '1' && l.linkedCategory === 'props')).toBe(true);
});