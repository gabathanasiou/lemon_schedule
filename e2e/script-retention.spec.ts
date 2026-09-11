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

// A tagged Final Draft run (roadmap 132 Part B): the tagged words belong to the
// screenplay prose AND resolve to a breakdown element. Regression guard for the
// old bug that dropped TagNumber text from the retained body.
const FDX_TAGGED = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
<Content>
<Title>THE TAGGED TEST</Title>
<Paragraph Type="Scene Heading" Number="1"><Text>INT. KITCHEN - DAY</Text><SceneProperties Length="1.0"/></Paragraph>
<Paragraph Type="Action"><Text>AMY picks up the </Text><Text TagNumber="1">revolver</Text><Text> and leaves.</Text></Paragraph>
</Content>
<TagData>
<TagCategories><TagCategory Id="C1" Name="Props"/></TagCategories>
<TagDefinitions><TagDefinition Id="D1" CatId="C1" Label="PROP"/></TagDefinitions>
<Tags><Tag Number="1" DefId="D1"/></Tags>
</TagData>
</FinalDraft>`;

// Final Draft inline styles on <Text> runs (roadmap 132 Part B): bold/italic/
// underline must survive import and render in the preview.
const FDX_STYLED = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
<Content>
<Paragraph Type="Scene Heading" Number="1"><Text>INT. ROOM - DAY</Text><SceneProperties Length="1.0"/></Paragraph>
<Paragraph Type="Action"><Text>He </Text><Text Style="Italic">runs</Text><Text> and </Text><Text Style="Bold">slams</Text><Text> the </Text><Text Style="Underline">door</Text><Text>.</Text></Paragraph>
</Content>
</FinalDraft>`;

function writeFdx(name: string, xml: string): string {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, xml);
  return p;
}

async function importFile(page: import('@playwright/test').Page, filePath: string) {
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
  await page.getByRole('menuitem', { name: /\.fdx, \.fountain, \.csv/ }).click();
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
  const submit = page.getByRole('button', { name: /(?:Import|Update) \d+ Scenes/ });
  await expect(submit).toBeVisible({ timeout: 8000 });
  await submit.click();
}

const bridgeProject = (page: import('@playwright/test').Page): Promise<Project> =>
  page.evaluate(() => (window as any).__lemonSchedule.getProject());

test.describe('script body retention (roadmap 123 Phase 0)', () => {
  test('FDX import retains the screenplay body + baseline, persists, and undoes as one batch', async ({ page }) => {
    await openSeededProject(page);
    await importFile(page, writeFdx('lemon-script-a.fdx', FDX_A));
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
    await importFile(page, writeFdx('lemon-script-a2.fdx', FDX_A));
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 2)");

    await importFile(page, writeFdx('lemon-script-b.fdx', FDX_B));
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 1)");

    const project = await bridgeProject(page);
    expect(project.scriptDocument.scenes[0].blocks[0]).toEqual(['heading', 'EXT. FIELD - DAY']);
    // The baseline is the PREVIOUS body (the conflict reference for item 38).
    expect(project.scriptBaseline.scenes).toHaveLength(2);
    expect(project.scriptBaseline.scenes[0].blocks[0]).toEqual(['heading', 'INT. KITCHEN - DAY']);
  });

  test('tagged FDX runs stay in the retained body (roadmap 132 Part B)', async ({ page }) => {
    await openSeededProject(page);
    await importFile(page, writeFdx('lemon-script-tagged.fdx', FDX_TAGGED));
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 1)");

    const project = await bridgeProject(page);
    const action = project.scriptDocument.scenes[0].blocks.find((b: any) => b[0] === 'action');
    // The tagged word is prose — it must NOT vanish from the page.
    expect(action[1]).toBe('AMY picks up the revolver and leaves.');
    // …and it still resolves to a breakdown element.
    expect(project.scenes.some((s: any) => /revolver/i.test(s.props || ''))).toBe(true);
  });
});

test.describe('Script sub-tab (roadmap 123 Phase 1)', () => {
  test('renders the retained screenplay scene by scene', async ({ page }) => {
    await openSeededProject(page);
    await importFile(page, writeFdx('lemon-script-view.fdx', FDX_A));
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 2)");

    await page.getByRole('button', { name: 'Script', exact: true }).click();

    const view = page.getByTestId('script-view');
    await expect(view).toBeVisible();
    // The script name + imported file (version) is shown in the toolbar.
    await expect(page.getByText('THE TEST').first()).toBeVisible();
    await expect(page.getByText('lemon-script-view.fdx')).toBeVisible();
    await expect(page.getByTestId('script-scene')).toHaveCount(2);
    await expect(view).toContainText('INT. KITCHEN - DAY');
    await expect(view).toContainText('AMY pours coffee.');
    await expect(view).toContainText('EXT. STREET - NIGHT');
  });

  test('renders Final Draft bold/italic/underline runs', async ({ page }) => {
    await openSeededProject(page);
    await importFile(page, writeFdx('lemon-script-styled.fdx', FDX_STYLED));
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 1)");

    await page.getByRole('button', { name: 'Script', exact: true }).click();

    const view = page.getByTestId('script-view');
    await expect(view.locator('strong')).toHaveText('slams');
    await expect(view.locator('em')).toHaveText('runs');
    await expect(view.locator('u')).toHaveText('door');
  });
});

test.describe('Scene script pane (roadmap 132 Part A)', () => {
  test('Sheet defaults open with a script, Glide defaults collapsed; resizes', async ({ page }) => {
    await openSeededProject(page);
    await importFile(page, writeFdx('lemon-script-pane.fdx', FDX_A));
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 2)");
    const pane = page.getByTestId('script-pane');

    // Sheet: a script exists → the pane defaults OPEN.
    await page.getByRole('button', { name: 'Sheet', exact: true }).click();
    await expect(pane).toBeVisible();
    await page.getByTitle('Hide script pane').first().click();
    await expect(pane).toHaveCount(0);

    // Glide: defaults COLLAPSED.
    await page.getByRole('button', { name: 'Glide Breakdown', exact: true }).click();
    await expect(pane).toHaveCount(0);
    await page.getByTitle('Show script pane').click();
    await expect(pane).toBeVisible();

    // Drag-resize (the Glide grid must not hijack the gesture).
    const before = (await pane.boundingBox())!.width;
    const handle = pane.getByRole('separator');
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x - 100, hb.y + hb.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await pane.boundingBox())!.width).toBeGreaterThan(before + 50);
  });
});

test.describe('Script viewer tools (roadmap 123 Phase 1)', () => {
  test('search highlights, set navigator, eighths ruler and update button', async ({ page }) => {
    await openSeededProject(page);
    await importFile(page, writeFdx('lemon-script-tools.fdx', FDX_A));
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 2)");
    await page.getByRole('button', { name: 'Script', exact: true }).click();

    // Eighths ruler is visible on the right.
    await expect(page.getByTestId('script-eighths')).toBeVisible();

    // Scene sidebar lists every scene (number · INT/EXT · set) and is clickable.
    await expect(page.locator('[data-sidebar-row="0"]')).toBeVisible();
    await expect(page.locator('[data-sidebar-row="1"]')).toBeVisible();

    // Full-text search highlights matches inline + reports the scene count.
    await page.getByLabel('Search script').fill('coffee');
    await expect(page.locator('mark')).toHaveCount(1);
    await expect(page.getByText('1/1')).toBeVisible();

    // "Update script" opens the same file chooser as File ▸ Import ▸ Update.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Update script' }).click(),
    ]);
    expect(chooser).toBeTruthy();
  });
});
