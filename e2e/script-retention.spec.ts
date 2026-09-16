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
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 1 && p.scriptAnnotations && p.scriptAnnotations.length === 1)");

    const project = await bridgeProject(page);
    const action = project.scriptDocument.scenes[0].blocks.find((b: any) => b[0] === 'action');
    // The tagged word is prose — it must NOT vanish from the page.
    expect(action[1]).toBe('AMY picks up the revolver and leaves.');
    // …and it still resolves to a breakdown element.
    expect(project.scenes.some((s: any) => /revolver/i.test(s.props || ''))).toBe(true);
    // …and seeds a RECOGNISED (dotted) tag span anchored to the phrase.
    const ann = project.scriptAnnotations[0];
    expect(ann).toMatchObject({ text: 'revolver', category: 'props', elementKey: 'revolver', recognized: true, blockIndex: 1 });
    expect(ann.sceneId).toBeTruthy();
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

test.describe('script tagging — selection menu (roadmap 136)', () => {
  test('highlight → Props writes the scene field and tags the span; hover badge; change category; remove', async ({ page }) => {
    await openSeededProject(page);
    await importFile(page, writeFdx('lemon-script-tag.fdx', FDX_A));
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 2)");
    await page.getByRole('button', { name: 'Script', exact: true }).click();

    // Select "coffee" in the action block — the category menu opens.
    await page.evaluate(() => {
      const block = Array.from(document.querySelectorAll('[data-script-block]'))
        .find(b => (b.textContent || '').includes('coffee')) as HTMLElement | undefined;
      if (!block) throw new Error('action block not found');
      const node = block.firstChild as Text;
      const idx = node.textContent!.indexOf('coffee');
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + 'coffee'.length);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      block.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    // The highlight stays selected while the menu is open.
    await expect(page.getByRole('menuitem', { name: 'Props' })).toBeVisible();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('coffee');
    await page.getByRole('menuitem', { name: 'Props' }).click();
    await waitForPersistedProject(page, "(p.scriptAnnotations && p.scriptAnnotations.length === 1)");
    const saved = (await bridgeProject(page)).scriptAnnotations[0];
    expect(saved).toMatchObject({ category: 'props', elementKey: 'COFFEE', text: 'coffee' });
    // The highlight became the element AND the scene field.
    const taggedScene = (await bridgeProject(page)).scenes.find((s: any) => s.id === saved.sceneId);
    expect(taggedScene.props).toContain('COFFEE');

    const span = page.locator(`[data-annotation-id="${saved.id}"]`);
    await expect(span).toHaveText('coffee');
    // Hover badge: category · element.
    await span.hover();
    await expect(page.getByTestId('script-tag-badge')).toContainText('Props');
    await expect(page.getByTestId('script-tag-badge')).toContainText('COFFEE');

    // Change category: the scene-field attachment swaps, never stacks.
    await span.click();
    await page.getByRole('menuitem', { name: 'Wardrobe' }).click();
    await page.waitForFunction(() => (window as any).__lemonSchedule.getProject().scriptAnnotations?.[0]?.category === 'wardrobe');
    const swapped = (await bridgeProject(page)).scenes.find((s: any) => s.id === saved.sceneId);
    expect(swapped.props).not.toContain('COFFEE');
    expect(swapped.wardrobe).toContain('COFFEE');

    // Remove.
    await span.click();
    await page.getByRole('menuitem', { name: 'Remove' }).click();
    await page.waitForFunction(() => !(window as any).__lemonSchedule.getProject().scriptAnnotations?.length);
    await expect(page.locator(`[data-annotation-id="${saved.id}"]`)).toHaveCount(0);
  });

  test('a recognised FDX tag commits through the menu; the Suggestions toggle gates derived spans', async ({ page }) => {
    await openSeededProject(page);
    await importFile(page, writeFdx('lemon-script-tagged-menu.fdx', FDX_TAGGED));
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptAnnotations && p.scriptAnnotations.length === 1)");
    await page.getByRole('button', { name: 'Script', exact: true }).click();

    // Recognised (dotted) imported tag — committing via the same menu makes it solid.
    const recognised = page.locator('[data-annotation-recognized="1"]');
    await expect(recognised).toHaveText('revolver');
    await recognised.click();
    await page.getByRole('menuitem', { name: 'Props' }).click();
    await page.waitForFunction(() => {
      const a = (window as any).__lemonSchedule.getProject().scriptAnnotations?.[0];
      return a && !a.recognized;
    });

    // Seed a known element + a body that mentions it → an ephemeral suggestion.
    await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const p = b.getProject();
      const scene = p.scenes[0];
      b.dispatch({ type: 'ADD_ELEMENT', payload: { category: 'props', element: { id: 'ZORB', name: 'ZORB' } } });
      b.dispatch({ type: 'SET_SCRIPT_DOCUMENT', payload: { document: { format: 'fdx', scenes: [
        { sceneNumber: scene.sceneNumber, blocks: [['heading', 'INT. X - DAY'], ['action', 'The ZORB is here.']] },
      ] } } });
    });

    const suggestion = page.locator('[data-annotation-recognized="1"]');
    await expect(suggestion).toHaveText('ZORB');
    // The suggestion is computed, never persisted.
    expect((await bridgeProject(page)).scriptAnnotations?.some((a: any) => a.id.startsWith('suggest:'))).toBeFalsy();

    // Toggle Suggestions off hides every non-committed span; on shows them again.
    await page.getByRole('button', { name: 'Suggestions' }).click();
    await expect(page.locator('[data-annotation-recognized="1"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Suggestions' }).click();
    await expect(page.locator('[data-annotation-recognized="1"]')).toHaveText('ZORB');
  });
});

test.describe('scene script hover preview (roadmap 123 Phase 3)', () => {
  test('hovering a scheduled scene card shows its action', async ({ page }) => {
    await openSeededProject(page);
    const info = await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const p = b.getProject();
      const v = p.versions.find((x: any) => x.id === p.activeVersionId) || p.versions[0];
      const row = v.rows.find((r: any) => r.type === 'SCENE' && r.containerId != null && r.containerId !== -1);
      const scene = p.scenes.find((s: any) => s.id === row.sceneId);
      b.dispatch({ type: 'SET_SCRIPT_DOCUMENT', payload: { document: { format: 'fdx', scenes: [
        { sceneNumber: scene.sceneNumber, blocks: [['heading', 'INT. X - DAY'], ['action', 'HOVER PREVIEW LINE.']] },
      ] } } });
      return { rowId: row.id };
    });
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await page.locator(`[data-row-id="${info.rowId}"]`).first().hover();
    await expect(page.getByText('HOVER PREVIEW LINE.')).toBeVisible();
  });
});

test.describe('annotation remap on update (roadmap 132 Part F)', () => {
  test('a tag re-anchors through a revised body instead of being lost', async ({ page }) => {
    await openSeededProject(page);
    await importFile(page, writeFdx('lemon-script-remap.fdx', FDX_A));
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 2)");

    // Seed a tag on "coffee" in scene 1's action block (10..16).
    const sceneId = await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const p = b.getProject();
      const live = [...p.scenes].reverse().find((s: any) => s.sceneNumber === '1');
      b.dispatch({ type: 'ADD_SCRIPT_ANNOTATION', payload: { annotation: {
        id: 'ann-coffee', sceneId: live.id, blockIndex: 1, start: 10, end: 16, text: 'coffee', category: 'props', elementKey: 'COFFEE',
      } } });
      return live.id;
    });

    // Update: the action is rewritten but keeps "coffee" (now at 17..23).
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
    await page.getByRole('menuitem', { name: /Update script/ }).click();
    const revised = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="1"><Content>
<Paragraph Type="Scene Heading" Number="1"><Text>INT. KITCHEN - DAY</Text><SceneProperties Length="1.0"/></Paragraph>
<Paragraph Type="Action"><Text>AMY slowly pours coffee.</Text></Paragraph>
<Paragraph Type="Scene Heading" Number="2"><Text>EXT. STREET - NIGHT</Text><SceneProperties Length="1.0"/></Paragraph>
<Paragraph Type="Action"><Text>BOB watches.</Text></Paragraph>
<Paragraph Type="Transition"><Text>CUT TO:</Text></Paragraph>
</Content></FinalDraft>`;
    const p = path.join(os.tmpdir(), 'lemon-script-remap-rev.fdx');
    fs.writeFileSync(p, revised);
    await page.locator('input[type="file"]').nth(1).setInputFiles(p);
    await page.getByRole('dialog').getByText(/Update Script/).waitFor();
    await page.getByRole('button', { name: /Accept all/ }).click();
    await page.getByRole('button', { name: /Apply \d+/ }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await page.waitForFunction(() => {
      const a = (window as any).__lemonSchedule.getProject().scriptAnnotations?.[0];
      return a && a.start === 17 && a.end === 23;
    });
    const saved = (await bridgeProject(page)).scriptAnnotations[0];
    expect(saved).toMatchObject({ id: 'ann-coffee', sceneId, text: 'coffee', blockIndex: 1, start: 17, end: 23 });
  });
});

test.describe('scene cut (roadmap 132 Part C)', () => {
  test('cuts a scene at a block boundary into a lettered boneyard scene, one undo', async ({ page }) => {
    await openSeededProject(page);
    await importFile(page, writeFdx('lemon-script-cut.fdx', FDX_A));
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 2)");
    await page.getByRole('button', { name: 'Script', exact: true }).click();

    const firstSection = page.getByTestId('script-scene').first();
    const parentNumber = (await firstSection.getAttribute('data-scene-number'))!;
    const before = await bridgeProject(page);
    // ScriptView maps a doc scene number to the LAST live scene with that number.
    const parent = [...before.scenes].reverse().find((s: any) => s.sceneNumber === parentNumber);
    const bodyBefore = before.scriptDocument.scenes.length;

    await firstSection.hover();
    await firstSection.getByRole('button', { name: 'Cut' }).click();
    await expect(page.getByTestId('scene-cut-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Cut scene' }).click();

    await page.waitForFunction((n) => (window as any).__lemonSchedule.getProject().scenes.length === n + 1, before.scenes.length);
    const after = await bridgeProject(page);
    const newScene = after.scenes.find((s: any) => !before.scenes.some((b: any) => b.id === s.id));
    const base = parentNumber.replace(/[A-Z]+$/i, '');
    expect(newScene.sceneNumber).toMatch(new RegExp(`^${base}[A-Z]$`));
    expect(newScene.cast).toBe(parent.cast); // inherits the parent's element fields

    // The body gained a scene (with a heading) right after the parent.
    expect(after.scriptDocument.scenes.length).toBe(bodyBefore + 1);
    const newBodyScene = after.scriptDocument.scenes.find((s: any) => s.sceneNumber === newScene.sceneNumber);
    expect(newBodyScene.blocks[0][0]).toBe('heading');

    // One undo reverses the whole cut (body + scene).
    await page.evaluate(() => (window as any).__lemonSchedule.undo());
    const undone = await bridgeProject(page);
    expect(undone.scenes.length).toBe(before.scenes.length);
    expect(undone.scriptDocument.scenes.length).toBe(bodyBefore);

    // Redo, then "Merge with next" reverses it (confirm dialog + one batch).
    await page.evaluate(() => (window as any).__lemonSchedule.redo());
    await expect.poll(async () => (await bridgeProject(page)).scenes.length).toBe(before.scenes.length + 1);
    await firstSection.hover();
    await firstSection.getByRole('button', { name: 'Merge' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(async () => (await bridgeProject(page)).scenes.length).toBe(before.scenes.length);
    const merged = await bridgeProject(page);
    expect(merged.scriptDocument.scenes.length).toBe(bodyBefore);
  });
});

test.describe('split manager (roadmap 132 Part E)', () => {
  test('lists a cut group and merges it back', async ({ page }) => {
    await openSeededProject(page);
    await importFile(page, writeFdx('lemon-script-splitmgr.fdx', FDX_A));
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 2)");
    await page.getByRole('button', { name: 'Script', exact: true }).click();

    const firstSection = page.getByTestId('script-scene').first();
    const bodyBefore = (await bridgeProject(page)).scriptDocument.scenes.length;
    await firstSection.hover();
    await firstSection.getByRole('button', { name: 'Cut' }).click();
    await page.getByRole('button', { name: 'Cut scene' }).click();
    await expect.poll(async () => (await bridgeProject(page)).scenes.some((s: any) => s.duplicateKind === 'split')).toBe(true);

    await page.getByRole('button', { name: 'Split Manager' }).click();
    const modal = page.getByTestId('split-manager-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('→');
    await expect(modal.getByText('clean', { exact: true })).toBeVisible();

    await modal.getByRole('button', { name: /Merge back/ }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(async () => (await bridgeProject(page)).scenes.some((s: any) => s.duplicateKind === 'split')).toBe(false);
    expect((await bridgeProject(page)).scriptDocument.scenes.length).toBe(bodyBefore);
  });
});

test.describe('scene duplicate modes (roadmap 132 Part D)', () => {
  test('the shared modal covers coverage (same number + badge) and split (renumber + body copy)', async ({ page }) => {
    await openSeededProject(page);
    await importFile(page, writeFdx('lemon-script-dup.fdx', FDX_A));
    await waitForPersistedProject(page, "(p.scriptDocument && p.scriptDocument.scenes.length === 2)");
    await page.getByRole('button', { name: 'Sheet', exact: true }).click();

    const before = await bridgeProject(page);
    const currentId = await page.evaluate(() => (window as any).__lemonSchedule.getProject().scenes[0].id);
    const parent = before.scenes.find((s: any) => s.id === currentId);

    // Coverage: same number, schedule-only, "copy" badge.
    await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByTestId('scene-duplicate-modal')).toBeVisible();
    await dlg.getByText('Coverage / second unit').click();
    await dlg.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect.poll(async () => (await bridgeProject(page)).scenes.some((s: any) => s.duplicateKind === 'coverage')).toBe(true);
    const coverage = (await bridgeProject(page)).scenes.find((s: any) => s.duplicateKind === 'coverage');
    expect(coverage.sceneNumber).toBe(parent.sceneNumber);
    expect(coverage.duplicateOf).toBe(parent.id);

    // Split: renumbered + body copied.
    const bodyBefore = (await bridgeProject(page)).scriptDocument.scenes.length;
    await page.getByRole('button', { name: 'Duplicate', exact: true }).first().click();
    await page.getByRole('dialog').getByText('Split / second scene').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect.poll(async () => (await bridgeProject(page)).scenes.some((s: any) => s.duplicateKind === 'split')).toBe(true);
    const split = (await bridgeProject(page)).scenes.find((s: any) => s.duplicateKind === 'split');
    const base = parent.sceneNumber.replace(/[A-Z]+$/i, '');
    expect(split.sceneNumber).toMatch(new RegExp(`^${base}[A-Z]$`));
    const after = await bridgeProject(page);
    expect(after.scriptDocument.scenes.length).toBe(bodyBefore + 1);
    expect(after.scriptDocument.scenes.some((s: any) => s.sceneNumber === split.sceneNumber)).toBe(true);
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
