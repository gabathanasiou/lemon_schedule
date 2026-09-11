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

const FDX_DREAM = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Version="1">
<Content>
<Paragraph Type="Scene Heading" Number="1"><Text>INT. KITCHEN - DREAM</Text><SceneProperties Length="1.0"/></Paragraph>
<Paragraph Type="Action"><Text>Strange things.</Text></Paragraph>
</Content>
</FinalDraft>`;

const FDX_MAGIC = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Version="1">
<Content>
<Paragraph Type="Scene Heading" Number="1"><Text>INT. KITCHEN - MAGIC HOUR</Text><SceneProperties Length="1.0"/></Paragraph>
<Paragraph Type="Action"><Text>Golden light.</Text></Paragraph>
</Content>
</FinalDraft>`;

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

    // Scripts land in the shared review (rename + cast Board IDs) first.
    await expect(page.getByPlaceholder('Leave blank to keep current title')).toHaveValue('my-great-script');
    await page.getByRole('button', { name: 'Create Project' }).click();

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

  test('custom heading values (DREAM) prompt the mapper, then land in the Colors options', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
    await page.getByRole('menuitem', { name: /\.fdx, \.fountain, \.csv/ }).click();
    await page.locator('input[type="file"]').first().setInputFiles(writeFdx('dream.fdx', FDX_DREAM));

    // Mapping dialog appears with the unknown day/night, defaulting to "Add as new".
    await expect(page.getByText('Map script headings')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('DREAM', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Import 1 value/ }).click();

    // Now the normal review stage; import it.
    await expect(page.getByRole('button', { name: /Import 1 Scenes/ })).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: /Import 1 Scenes/ }).click();

    await page.waitForFunction(() => {
      const p = (window as any).__lemonSchedule.getProject();
      return (p.colorPalette?.dayNightOptions || []).includes('DREAM');
    });
    const project = await page.evaluate(() => (window as any).__lemonSchedule.getProject());
    expect(project.scenes[project.scenes.length - 1].dayNight).toBe('DREAM');
  });

  test('multi-word custom day/night (MAGIC HOUR) is detected and prompts', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
    await page.getByRole('menuitem', { name: /\.fdx, \.fountain, \.csv/ }).click();
    await page.locator('input[type="file"]').first().setInputFiles(writeFdx('magic.fdx', FDX_MAGIC));

    await expect(page.getByText('Map script headings')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('MAGIC HOUR', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Import 1 value/ }).click();
    await page.getByRole('button', { name: /Import 1 Scenes/ }).click();

    await page.waitForFunction(() => ((window as any).__lemonSchedule.getProject().colorPalette?.dayNightOptions || []).includes('MAGIC HOUR'));
    const scene = await page.evaluate(() => {
      const s = (window as any).__lemonSchedule.getProject().scenes;
      return s[s.length - 1];
    });
    expect(scene.dayNight).toBe('MAGIC HOUR');
    expect(scene.set).toBe('KITCHEN');
  });

  test('new-project import prompts for custom heading values before committing', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 8000 });

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Import', exact: true }).click(),
    ]);
    await chooser.setFiles(writeFdx('dream-new-project.fdx', FDX_DREAM));
    await page.getByRole('button', { name: 'Confirm' }).click(); // import-as-new-project

    // The mapper now prompts for the new-project path too (roadmap 127).
    await expect(page.getByText('Map script headings')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('DREAM', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Import 1 value/ }).click();

    // Then the shared review, then the project is created.
    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page.getByRole('button', { name: 'Breakdown', exact: true })).toBeVisible({ timeout: 10000 });
    const project = await page.evaluate(() => (window as any).__lemonSchedule.getProject());
    expect(project.scenes[0].dayNight).toBe('DREAM');
    expect(project.colorPalette.dayNightOptions).toContain('DREAM');
  });

  test('new-project mapping can match a custom value to an existing one', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 8000 });

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Import', exact: true }).click(),
    ]);
    await chooser.setFiles(writeFdx('dream-match.fdx', FDX_DREAM));
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText('Map script headings')).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: 'Replace with' }).click();
    // Pick NIGHT from the known day/night options.
    await page.getByRole('button', { name: 'DAY' }).click();
    await page.getByRole('menuitem', { name: 'NIGHT' }).click();
    await page.getByRole('button', { name: /Import 1 value/ }).click();
    await page.getByRole('button', { name: 'Create Project' }).click();

    await expect(page.getByRole('button', { name: 'Breakdown', exact: true })).toBeVisible({ timeout: 10000 });
    const project = await page.evaluate(() => (window as any).__lemonSchedule.getProject());
    expect(project.scenes[0].dayNight).toBe('NIGHT');
    expect(project.headingAliases?.dayNight?.DREAM).toBe('NIGHT');
    expect(project.colorPalette.dayNightOptions).not.toContain('DREAM');
  });
});
