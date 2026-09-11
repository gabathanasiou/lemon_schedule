import { test, expect } from '@playwright/test';
import { openSeededProject } from './helpers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FDX = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Version="1">
<Content>
<Paragraph Type="Scene Heading" Number="1"><Text>INT. KITCHEN - DAY</Text><SceneProperties Length="1.0"/></Paragraph>
<Paragraph Type="Character"><Text>AMY</Text></Paragraph>
<Paragraph Type="Action"><Text>AMY waits.</Text></Paragraph>
</Content>
</FinalDraft>`;

function writeFdx(name: string, xml = FDX): string {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, xml);
  return p;
}

test.describe('new-project import parity (roadmap 126)', () => {
  test('PM Import accepts an FDX screenplay and names the project after the file', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 8000 });

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Import', exact: true }).click(),
    ]);
    await chooser.setFiles(writeFdx('my-great-script.fdx'));
    await page.getByRole('button', { name: 'Confirm' }).click(); // import-as-new-project

    await expect(page.getByRole('button', { name: 'Breakdown', exact: true })).toBeVisible({ timeout: 10000 });
    const project = await page.evaluate(() => (window as any).__lemonSchedule.getProject());
    expect(project.title).toBe('my-great-script');
    expect(project.scenes).toHaveLength(1);
    expect(project.scenes[0].set).toBe('KITCHEN');
    expect(project.scriptDocument.scenes).toHaveLength(1);
  });

  test('the ImportDialog prefills the project name from the filename when the script has no title', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
    await page.getByRole('menuitem', { name: /\.fdx, \.fountain, \.csv/ }).click();
    await page.locator('input[type="file"]').first().setInputFiles(writeFdx('untitled-thing.fdx'));
    const rename = page.getByPlaceholder('Leave blank to keep current title');
    await expect(rename).toHaveValue('untitled-thing');
  });
});
