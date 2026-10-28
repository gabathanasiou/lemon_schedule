import { test, expect, Page } from '@playwright/test';
import { openSeededProject, seedLeadCast } from './helpers';

// Roadmap 11 — crew ↔ elements. Layer 1: a crew POSITION maps to element
// CATEGORIES (defaults ship, editable) and makes crew rule-bearing for report
// scoping. Layer 2: a specific crew PERSON links to elements or another crew
// person (driver → director, chaperone → a young cast member), managed from
// both the Crew Links manager and the Element Manager's "Linked crew" view.
// A linked target who isn't on the day raises a warning in the Day Manager.

/** Two crew people in a dedicated role — seed-agnostic (created if absent). */
async function seedCrew(page: Page) {
  return page.evaluate(() => {
    const b: any = (window as any).__lemonSchedule;
    const ensureRole = (key: string, label: string) => {
      if (!b.getProject().crewRoles.some((r: any) => r.key === key)) {
        b.dispatch({ type: 'ADD_CREW_ROLE', payload: { role: { key, label } } });
      }
    };
    ensureRole('zzzRole', 'ZZZ Role');
    const has = (id: string) => Object.values(b.getProject().crew || {}).some((l: any) => (l || []).some((x: any) => x.id === id));
    if (!has('zzz-crew-a')) b.dispatch({ type: 'ADD_CREW_PERSON', payload: { role: 'zzzRole', person: { id: 'zzz-crew-a', name: 'ZZZ ALPHA' } } });
    if (!has('zzz-crew-b')) b.dispatch({ type: 'ADD_CREW_PERSON', payload: { role: 'zzzRole', person: { id: 'zzz-crew-b', name: 'ZZZ BETA' } } });
    return { a: 'zzz-crew-a', b: 'zzz-crew-b' };
  });
}

async function openCrewLinks(page: Page) {
  await page.getByRole('button', { name: 'Production' }).click();
  await page.getByRole('button', { name: 'Crew', exact: true }).click();
  await page.getByRole('button', { name: 'Links', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toContainText('Crew Links');
  return modal;
}

test('positions: defaults ship and toggling a category persists', async ({ page }) => {
  await openSeededProject(page);
  const modal = await openCrewLinks(page);
  await modal.getByRole('tab', { name: 'Positions' }).click();

  // Defaults: Makeup maps to the Makeup & Hair element category.
  const makeupRow = modal.locator('[data-position="makeup"]');
  const categories = makeupRow.locator('[data-picker-field] button');
  await expect(makeupRow).toBeVisible();
  await expect(categories).toContainText('1 selected');

  // Toggle Props on — the mapping is stored explicitly on the role when the
  // picker closes (value fields commit on close, Escape cancels the draft).
  await categories.click();
  await page.locator('[data-search-item="props"]').click();
  await modal.getByRole('heading', { name: 'Crew Links' }).click();
  await expect(categories).toContainText('2 selected');
  await expect.poll(() => page.evaluate(() => {
    const p = (window as any).__lemonSchedule.getProject();
    return (p.crewRoles.find((r: any) => r.key === 'makeup') || {}).categories || null;
  })).toContain('props');
});

test('crew links: seeded person→element and person→crew show on both sides, unlink removes', async ({ page }) => {
  await openSeededProject(page);
  const crew = await seedCrew(page);
  const anchor = await seedLeadCast(page);
  await page.evaluate(({ a, b, anchorId }) => {
    (window as any).__lemonSchedule.dispatch({
      type: 'UPDATE_PROJECT',
      payload: {
        links: [
          { id: 'zzz-cl-1', anchorKind: 'element', anchorCategory: 'cast', anchorValue: String(anchorId), linkedKind: 'crew', linkedValue: a },
          { id: 'zzz-cl-2', anchorKind: 'crew', anchorValue: a, linkedKind: 'crew', linkedValue: b },
        ],
      },
    });
  }, { a: crew.a, b: crew.b, anchorId: anchor.id });

  // Crew Links → People: the person card shows both targets.
  const modal = await openCrewLinks(page);
  await expect(modal).toContainText('ZZZ ALPHA');
  await expect(modal.locator('[data-el-dropdown] input').first()).toHaveValue(String(anchor.id));
  // The linked row summarizes the selection ("1 selected"); the person is the
  // value behind it.
  const alphaCard = modal.locator('[data-crew-link-card]').filter({ hasText: 'ZZZ ALPHA' });
  await expect(alphaCard.locator('[data-picker-field] button')).toContainText('1 selected');
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(modal).toBeHidden();

  // Element View → Links → Crew attached: the same record; unlink removes it.
  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.getByRole('button', { name: 'Element Manager' }).click();
  const row = page.locator('tr', { hasText: anchor.name }).first();
  await row.getByTitle(/^Element view/).click();
  const emModal = page.getByRole('dialog');
  await emModal.getByRole('tab', { name: 'Links' }).click();
  const crewRow = emModal.locator('[data-link-row="crew"]');
  await expect(crewRow).toContainText('1 selected');
  // Button picker: the search lives in the panel (typing never edits the
  // value). Its role subtitle is searchable, so "ZZZ Role" finds its people.
  // Untick the person, then click away to commit the draft.
  await crewRow.locator('[data-picker-field] button').click();
  const crewField = crewRow.locator('[data-picker-field] input');
  await crewField.press('End');
  await crewField.pressSequentially('ZZZ Role');
  await expect(page.locator('[data-search-item]').filter({ hasText: 'ZZZ ALPHA' })).toBeVisible();
  await page.locator('[data-search-item]').filter({ hasText: 'ZZZ ALPHA' }).click();
  await emModal.getByRole('tab', { name: 'Links' }).click();
  await expect.poll(() => page.evaluate(() =>
    ((window as any).__lemonSchedule.getProject().links || []).some((l: any) => l.id === 'zzz-cl-1'),
  )).toBe(false);
});

test('day manager: warns when a linked crew target is not on the day', async ({ page }) => {
  await openSeededProject(page);
  const crew = await seedCrew(page);
  await page.evaluate(({ a, b }) => {
    const w: any = (window as any).__lemonSchedule;
    w.dispatch({ type: 'UPDATE_PROJECT', payload: { links: [{ id: 'zzz-cl-2', anchorKind: 'crew', anchorValue: a, linkedKind: 'crew', linkedValue: b }] } });
    const p = w.getProject();
    const v = p.versions.find((x: any) => x.id === p.activeVersionId);
    const gov = v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned) || v.rows.find((r: any) => r.type === 'DAYBREAK');
    w.dispatch({ type: 'UPDATE_ROW', payload: { versionId: v.id, rowId: gov.id, updates: { daybreakMeta: { crewIds: [a] } } } });
  }, { a: crew.a, b: crew.b });

  await page.getByRole('button', { name: 'Production' }).click();
  await page.getByRole('button', { name: 'Day Manager', exact: true }).click();
  await expect(page.locator('[data-day-manager]')).toBeVisible({ timeout: 8000 });
  // Day Manager lands on Overview (roadmap 315); the warning lives in Crew.
  await page.locator('[data-day-tab="crew"]').click();
  const warning = page.locator('[data-crew-link-warnings]');
  await expect(warning).toContainText('ZZZ BETA');
  await expect(warning).toContainText('not on this day');
});
