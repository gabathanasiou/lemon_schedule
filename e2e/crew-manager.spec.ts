import { test, expect } from '@playwright/test';
import { openSeededProject, nameCell, bridgeProject } from './helpers';

test.describe('Crew Manager', () => {
  test.describe.configure({ mode: 'serial' });

  test('commit-on-blur editing: add, undo, merge, sort, trash restore', async ({ page }) => {
    await openSeededProject(page);

    await page.getByRole('button', { name: 'Production' }).click();
        await page.getByRole('button', { name: 'Crew', exact: true }).click();
    // Roles sidebar with seeded roles, counts, and add button — no Save button
    await expect(page.getByText('Roles', { exact: true })).toBeVisible();
    const directorRow = page.locator('button', { hasText: 'Director' }).first();
    await expect(directorRow).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Role' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Revert', exact: true })).toHaveCount(0);

    // Select a role -> sidebar shows its member count
    await directorRow.click();
    await expect(page.getByRole('button', { name: 'Add Member' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Director 0', exact: true })).toBeVisible();

    // Add a member: a blank local row; naming it commits on Enter
    await page.getByRole('button', { name: 'Add Member' }).click();
    const nameInput = page.getByPlaceholder('Name').last();
    await nameInput.fill('Jane Doe');
    await nameInput.press('Enter');
    await expect(nameCell(page, 'JANE DOE')).toBeVisible();
    let project = await bridgeProject(page);
    expect(JSON.stringify(project.crew)).toContain('JANE DOE');

    // Phone commits on Enter; switching roles and back reloads from the store
    await page.getByPlaceholder('Phone').fill('555-0123');
    await page.getByPlaceholder('Phone').press('Enter');
    await page.locator('button', { hasText: 'Producer' }).first().click();
    await page.locator('button', { hasText: 'Director' }).first().click();
        await expect(nameCell(page, 'JANE DOE')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Director 1', exact: true })).toBeVisible();
    await expect(page.locator('input[value="555-0123"]')).toBeVisible();

    // Another phone edit, committed on Enter — Cmd+Z undoes the COMMITTED edit
    await page.getByPlaceholder('Phone').fill('555-9999');
    await page.getByPlaceholder('Phone').press('Enter');
    await expect(page.locator('input[value="555-9999"]')).toBeVisible();
    await page.keyboard.press('Meta+z');
    await expect(page.locator('input[value="555-0123"]')).toBeVisible();

    // Merge on commit: a second member with the same name asks to merge
    await page.getByRole('button', { name: 'Add Member' }).click();
    const second = page.getByPlaceholder('Name').last();
    await second.fill('jane doe');
    await second.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('dialog')).toContainText('Merge Members');
    await page.getByRole('button', { name: 'Merge', exact: true }).click();
        await expect(nameCell(page, 'JANE DOE')).toBeVisible();
        await expect(nameCell(page, 'jane doe')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Director 1', exact: true })).toBeVisible();

    // Sort menu works
    await page.getByRole('button', { name: 'Sort ▾' }).click();
    await page.getByRole('menuitem', { name: 'By Phone' }).click();

    // Delete member -> the removal commits at once; crew trash has it
    await page.locator('button[title="Delete member"]').click();
        await expect(page.getByRole('button', { name: 'Director 0', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Trash...' }).click();
    await expect(page.getByRole('heading', { name: 'Trash' })).toBeVisible();
    const crewSection = page.locator('[data-trash-section="crew"]');
    await expect(crewSection).toBeVisible();
    const janeTrashRow = crewSection.locator('[data-trash-item="crew"]').filter({ hasText: 'JANE DOE' });
    await expect(janeTrashRow).toBeVisible();
    await janeTrashRow.getByTitle('Restore').click();
        await expect(janeTrashRow).toHaveCount(0);
    await page.keyboard.press('Escape');
        await expect(nameCell(page, 'JANE DOE')).toBeVisible();

    // Add a custom role via the modal; it becomes the active selection
    await page.getByRole('button', { name: 'Add Role' }).click();
    const roleInput = page.getByRole('dialog').getByRole('textbox');
    await roleInput.fill('Sound Designer');
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('button.bg-zinc-900', { hasText: 'Sound Designer' })).toBeVisible();

    // Rename the custom role via the modal
    const sdRow = page.locator('button', { hasText: 'Sound Designer' }).first();
    await sdRow.hover();
    await sdRow.locator('button[title="Rename role"]').click();
    const renameInput = page.getByRole('dialog').getByRole('textbox');
    await expect(renameInput).toHaveValue('Sound Designer');
    await renameInput.fill('Sound Design');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('button.bg-zinc-900', { hasText: 'Sound Design' })).toBeVisible();

    // Delete the custom role -> confirm dialog, role disappears from sidebar
    const sdRow2 = page.locator('button', { hasText: 'Sound Design' }).first();
    await sdRow2.hover();
    await sdRow2.locator('button[title="Delete role"]').click();
    await expect(page.getByRole('dialog')).toContainText('Delete "Sound Design"?');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('button', { hasText: 'Sound Design' })).toHaveCount(0);
  });

  test('a typed name commits on blur — no prompt, no Save', async ({ page }) => {
    await openSeededProject(page);

    await page.getByRole('button', { name: 'Production' }).click();
        await page.getByRole('button', { name: 'Crew', exact: true }).click();

    await page.locator('button', { hasText: 'Director' }).first().click();
    await page.getByRole('button', { name: 'Add Member' }).click();
    await page.getByPlaceholder('Name').last().fill('Blur Committed');

    // Clicking another sub-tab blurs the field (commit) — no prompt appears.
    await page.getByRole('button', { name: 'Day Manager', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Back to Crew: the member was committed by the blur.
    await page.getByRole('button', { name: 'Crew', exact: true }).click();
        await page.locator('button', { hasText: 'Director' }).first().click();
    await expect(nameCell(page, 'BLUR COMMITTED')).toBeVisible();
    const project = await bridgeProject(page);
    expect(JSON.stringify(project.crew)).toContain('BLUR COMMITTED');
  });
});
