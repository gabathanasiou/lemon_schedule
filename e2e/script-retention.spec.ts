import { test, expect } from '@playwright/test';
import { openSeededProject, waitForPersistedProject } from './helpers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Project = any;

const FDX_A = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
<Content>
<Title>THE TEST</Title>
<Paragraph Type="Scene Heading" Number="1"><Text>INT. KITCHEN - DAY</Text><SceneProperties Length="1.0"/></Paragraph>
<Paragraph Type="Action"><Text>AMY pours coffee.</Text></Paragraph>
<Paragraph Type="Character"><Text>AMY</Text></Paragraph>
<Paragraph Type="Parenthetical"><Text>(smiling)</Text></Paragraph>
<Paragraph Type="Dialogue"><Text>Good morning.</Text></Paragraph>
<Paragraph Type="Scene Heading" Number="2"><Text>EXT. STREET - NIGHT</Text><SceneProperties Length="1.0"/></Paragraph>
<Paragraph Type="Action"><Page Number="3"/><Text>BOB watches.</Text></Paragraph>
<Paragraph Type="Transition"><Text>CUT TO:</Text></Paragraph>
</Content>
</FinalDraft>`;

const FDX_B = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
<Content>
<Paragraph Type="Scene Heading" Number="1"><Text>EXT. FIELD - DAY</Text><SceneProperties Length="2.0"/></Paragraph>
<Paragraph Type="Action"><Text>GEORGE runs.</Text></Paragraph>
</Content>
</FinalDraft>`;

function writeFdx(name: string, xml: string): string {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, xml);
  return p;
}

async function importFile(page: import('@playwright/test').Page, filePath: string, sceneCount: number) {
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
  await page.getByRole('menuitem', { name: /\.fdx, \.fountain, \.csv/ }).click();
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
  await expect(page.getByRole('button', { name: new RegExp(`Import ${sceneCount} Scenes`) })).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: new RegExp(`Import ${sceneCount} Scenes`) }).click();
}

const bridgeProject = (page: import('@playwright/test').Page): Promise<Project> =>
  page.evaluate(() => (window as any).__lemonSchedule.getProject());

test.describe('script body retention (roadmap 123 Phase 0)', () => {
  test('FDX import retains the screenplay body + baseline, persists, and undoes as one batch', async ({ page }) => {
    await openSeededProject(page);
    await importFile(page, writeFdx('lemon-script-a.fdx', FDX_A), 2);
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 2)");

    // Persisted (round-tripped through the compressed localStorage codec).
    const persisted = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
      return (window as any).__lemonSchedule.decodeProject(localStorage.getItem(key)!);
    });
    expect(persisted.scriptDocument.format).toBe('fdx');
    expect(persisted.scriptDocument.titlePage).toMatchObject({ title: 'THE TEST' });

    const script = (await bridgeProject(page)).scriptDocument;
    expect(script.scenes.map((s: any) => s.sceneNumber)).toEqual(['1', '2']);
    expect(script.scenes[0].blocks).toEqual([
      ['heading', 'INT. KITCHEN - DAY'],
      ['action', 'AMY pours coffee.'],
      ['character', 'AMY'],
      ['parenthetical', '(smiling)'],
      ['dialogue', 'Good morning.'],
    ]);
    expect(script.scenes[1].blocks).toEqual([
      ['heading', 'EXT. STREET - NIGHT'],
      ['page_break', ''],
      ['action', 'BOB watches.'],
      ['transition', 'CUT TO:'],
    ]);

    // First import: the baseline is the body itself.
    const first = await bridgeProject(page);
    expect(first.scriptBaseline).toEqual(first.scriptDocument);

    // One undo entry for the whole import.
    await page.evaluate(() => (window as any).__lemonSchedule.undo());
    expect((await bridgeProject(page)).scriptDocument).toBeUndefined();
    await page.evaluate(() => (window as any).__lemonSchedule.redo());
    expect((await bridgeProject(page)).scriptDocument.scenes).toHaveLength(2);
  });

  test('a second import rotates the previous body into the baseline', async ({ page }) => {
    await openSeededProject(page);
    await importFile(page, writeFdx('lemon-script-a2.fdx', FDX_A), 2);
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 2)");

    await importFile(page, writeFdx('lemon-script-b.fdx', FDX_B), 1);
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 1)");

    const project = await bridgeProject(page);
    expect(project.scriptDocument.scenes[0].blocks[0]).toEqual(['heading', 'EXT. FIELD - DAY']);
    // The baseline is the PREVIOUS body (the conflict reference for item 38).
    expect(project.scriptBaseline.scenes).toHaveLength(2);
    expect(project.scriptBaseline.scenes[0].blocks[0]).toEqual(['heading', 'INT. KITCHEN - DAY']);
  });
});
