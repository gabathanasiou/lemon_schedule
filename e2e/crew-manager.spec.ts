import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

test.describe('Crew Manager', () => {
  test.describe.configure({ mode: 'serial' });

  test('buffered editing: save, merge, sort, undo, trash restore', async ({ page }) => {
    await openSeededProject(page);

    await page.getByRole('button', { name: 'Production' }).click();
        await page.getByRole('button', { name: 'Crew', exact: true }).click();
    // Roles sidebar with seeded roles, counts, and add button
    await expect(page.getByText('Roles', { exact: true })).toBeVisible();
    const directorRow = page.locator('button', { hasText: 'Director' }).first();
    await expect(directorRow).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Role' })).toBeVisible();

    // Select a role -> header shows its label + member count
    await directorRow.click();
    await expect(page.getByRole('button', { name: 'Add Member' })).toBeVisible();
    await expect(page.getByText('0 members', { exact: true })).toBeVisible();

    // Add a member: appends a blank row, edits buffer until Save
    await page.getByRole('button', { name: 'Add Member' }).click();
    await page.getByPlaceholder('Name').last().fill('Jane Doe');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.locator('input[value="Jane Doe"]')).toBeVisible();

    // Phone buffers, then save
    await page.getByPlaceholder('Phone').fill('555-0123');
    await page.getByRole('button', { name: 'Save', exact: true })    // Verify the save committed: switch role and back, buffer reloads from store
    await page.locator('button', { hasText: 'Producer' }).first().click();
    await page.locator('button', { hasText: 'Director' }).first().click();
        await expect(page.locator('input[value="Jane Doe"]')).toBeVisible();
    await expect(page.getByText('1 member', { exact: true })).toBeVisible();

    // Cmd+Z undoes the last buffered edit locally
    await page.getByPlaceholder('Phone').fill('555-9999');
    await expect(page.locator('input[value="555-9999"]')).toBeVisible();
    await page.keyboard.press('Meta+Z');
    await expect(page.locator('input[value="555-0123"]')).toBeVisible();

    // Merge on save: a second member with the same name merges
    await page.getByRole('button', { name: 'Add Member' }).click();
    await page.getByPlaceholder('Name').last().fill('jane doe');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('dialog')).toContainText('Merge Members');
    await page.getByRole('button', { name: 'Merge & Save' }).click();
        await expect(page.locator('input[value="Jane Doe"]')).toBeVisible();
    await expect(page.locator('input[value="jane doe"]')).toHaveCount(0);
    await expect(page.getByText('1 member', { exact: true })).toBeVisible();

    // Sort menu works
    await page.getByRole('button', { name: 'Sort ▾' }).click();
    await page.getByRole('menuitem', { name: 'By Phone' }).click();

    // Delete member -> save -> crew trash has it; restore brings it back
    await page.locator('button[title="Delete member"]').click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.getByText('0 members', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Trash...' }).click();
    const trashOverlay = page.locator('.fixed.inset-0.z-\\[9999\\]');
    await expect(trashOverlay.locator('h2', { hasText: 'Trash' })).toBeVisible();
    const janeTrashRow = trashOverlay.locator('div.flex.items-center.justify-between').filter({ hasText: 'Jane Doe' });
    await expect(janeTrashRow).toBeVisible();
    await janeTrashRow.getByTitle('Restore').click();
        await expect(janeTrashRow).toHaveCount(0);
    await trashOverlay.click({ position: { x: 10, y: 10 } });
        await expect(page.locator('input[value="Jane Doe"]')).toBeVisible();

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

  test('unsaved changes prompt before switching sub-tabs', async ({ page }) => {
    await openSeededProject(page);

    await page.getByRole('button', { name: 'Production' }).click();
        await page.getByRole('button', { name: 'Crew', exact: true }).click();
    
    await page.locator('button', { hasText: 'Director' }).first().click();
    await page.getByRole('button', { name: 'Add Member' }).click();
    await page.getByPlaceholder('Name').last().fill('Unsaved Person');

    // Switching to Project Details prompts before leaving
    await page.getByRole('button', { name: 'Project Details' }).click();
    await expect(page.getByRole('dialog')).toContainText('Unsaved Changes', { timeout: 5000 });
    await page.getByRole('button', { name: 'Confirm' }).click();
    // Save ran during the prompt -> back to Crew, the member persisted
    await page.getByRole('button', { name: 'Crew', exact: true }).click();
        await page.locator('button', { hasText: 'Director' }).first().click();
    await expect(page.locator('input[value="Unsaved Person"]')).toBeVisible();
  });
});
