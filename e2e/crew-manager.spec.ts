import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';

test.describe('Crew Manager', () => {
  test.describe.configure({ mode: 'serial' });

  test('roles sidebar + member table mirror the element manager UX', async ({ page }) => {
    await openSeededProject(page);

    await page.getByRole('button', { name: 'Production' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Crew' }).click();
    await page.waitForTimeout(500);

    // Roles sidebar with seeded roles, counts, and add button
    await expect(page.getByText('Roles', { exact: true })).toBeVisible();
    const directorRow = page.locator('button', { hasText: 'Director' }).first();
    await expect(directorRow).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Role' })).toBeVisible();

    // Select a role -> header shows its label + member count
    await directorRow.click();
    await expect(page.getByRole('button', { name: 'Add Member' })).toBeVisible();
    await expect(page.getByText('0 members', { exact: true })).toBeVisible();

    // Add a member: "Add Member" appends a blank row (element-manager style)
    await page.getByRole('button', { name: 'Add Member' }).click();
    const nameInput = page.getByPlaceholder('Name');
    await expect(nameInput).toHaveCount(1);
    await nameInput.fill('Jane Doe');
    await nameInput.press('Enter');
    await expect(page.getByPlaceholder('Name')).toHaveValue('Jane Doe');

    // Edit phone and email cells (commit on blur)
    await page.getByPlaceholder('Phone').fill('555-0123');
    await page.getByPlaceholder('Phone').press('Enter');
    await expect(page.getByPlaceholder('Phone')).toHaveValue('555-0123');
    await page.getByPlaceholder('Email').fill('jane@studio.test');
    await page.getByPlaceholder('Email').press('Enter');
    await expect(page.getByPlaceholder('Email')).toHaveValue('jane@studio.test');

    // Sidebar count updates
    await expect(page.getByText('1 member', { exact: true })).toBeVisible();

    // A blank appended row discards itself (Escape) without creating a member
    await page.getByRole('button', { name: 'Add Director' }).click();
    await expect(page.getByPlaceholder('Name')).toHaveCount(2);
    await page.getByPlaceholder('Name').last().press('Escape');
    await expect(page.getByPlaceholder('Name')).toHaveCount(1);
    await expect(page.getByText('1 member', { exact: true })).toBeVisible();

    // Delete the member -> count drops back to zero
    const janeRow = page.getByPlaceholder('Name').first().locator('xpath=ancestor::tr');
    await janeRow.locator('button[title="Delete member"]').click();
    await expect(page.getByText('0 members', { exact: true })).toBeVisible();
    await expect(page.getByText('No members in this role yet.')).toBeVisible();

    // Add a custom role via the modal; it becomes the active selection
    await page.getByRole('button', { name: 'Add Role' }).click();
    const roleInput = page.getByRole('dialog').getByRole('textbox');
    await roleInput.fill('Sound Designer');
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('button.bg-zinc-900', { hasText: 'Sound Designer' })).toBeVisible();
    await expect(page.getByText('0 members', { exact: true })).toBeVisible();

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
});
