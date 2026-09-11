import { test, expect } from '@playwright/test';
import { ensureProject } from './helpers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Project = any;

const bridgeProject = (page: import('@playwright/test').Page): Promise<Project> =>
  page.evaluate(() => (window as any).__lemonSchedule.getProject());

function writeFdx(name: string, scenes: { n: string; heading: string; action?: string }[]): string {
  const paragraphs = scenes.map(s => [
    `<Paragraph Type="Scene Heading" Number="${s.n}"><Text>${s.heading}</Text><SceneProperties Length="1.0"/></Paragraph>`,
    s.action ? `<Paragraph Type="Action"><Text>${s.action}</Text></Paragraph>` : '',
  ].join('')).join('');
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="1"><Content>${paragraphs}</Content></FinalDraft>`);
  return p;
}

async function openUpdateModal(page: import('@playwright/test').Page, filePath: string) {
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
  await page.getByRole('menuitem', { name: /Update script/ }).click();
  await page.locator('input[type="file"]').nth(1).setInputFiles(filePath);
  await expect(page.getByRole('dialog').getByText(/Update Script/)).toBeVisible({ timeout: 8000 });
}

test.describe('script update review (roadmap 38)', () => {
  test('explicit Update script… reviews changes one by one and applies in place', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await ensureProject(page);
    // A tiny 2-scene project so the review queue is short and deterministic.
    await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      b.batch(() => {
        b.dispatch({ type: 'ADD_SCENE', payload: b.makeBlankScene({ sceneNumber: '1', set: 'KITCHEN', intExt: 'INT', dayNight: 'DAY', description: 'Old kitchen' }) });
        b.dispatch({ type: 'ADD_SCENE', payload: b.makeBlankScene({ sceneNumber: '2', set: 'STREET', intExt: 'EXT', dayNight: 'NIGHT' }) });
      });
    });
    const before = await bridgeProject(page);
    const scene1Id = before.scenes.find((s: any) => s.sceneNumber === '1').id;
    const scene2Id = before.scenes.find((s: any) => s.sceneNumber === '2').id;

    // Incoming: scene 1 modified, scene 2 dropped (→ removed), scene 3 new.
    await openUpdateModal(page, writeFdx('lemon-update.fdx', [
      { n: '1', heading: 'INT. KITCHEN - DAY', action: 'New kitchen action.' },
      { n: '3', heading: 'EXT. FIELD - DAY', action: 'A new scene.' },
    ]));

    // One-by-one keyboard review: →/A accepts, ←/K keeps, ⌫ goes back.
    await expect(page.getByText('0 / 3')).toBeVisible();
    await page.keyboard.press('ArrowRight'); // change 1
    await expect(page.getByText('1 / 3')).toBeVisible();
    await page.keyboard.press('ArrowRight'); // change 2
    await expect(page.getByText('2 / 3')).toBeVisible();
    await page.keyboard.press('ArrowRight'); // change 3
    await expect(page.getByText('3 / 3')).toBeVisible();
    // Review auto-advances to the final confirmation list; Apply shows a warning.
    await expect(page.getByText(/to apply/)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /Apply \d+/ }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await page.waitForFunction(() => {
      const b = (window as any).__lemonSchedule;
      const nums = b.getProject().scenes.map((s: any) => s.sceneNumber).sort();
      return nums.length === 2 && nums[0] === '1' && nums[1] === '3';
    });
    const after = await bridgeProject(page);
    const s1 = after.scenes.find((s: any) => s.sceneNumber === '1');
    expect(s1.id).toBe(scene1Id);          // updated in place, id preserved
    expect(after.scenes.find((s: any) => s.sceneNumber === '2')).toBeUndefined(); // removed (accepted)
    // The retained body was replaced and the previous body became the baseline.
    expect(after.scriptDocument.scenes.map((s: any) => s.sceneNumber)).toEqual(['1', '3']);
    expect(after.scriptBaseline).toBeTruthy();
  });

  test('plain Import still appends (no diff) even on a project with scenes', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await ensureProject(page);
    await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      b.dispatch({ type: 'ADD_SCENE', payload: b.makeBlankScene({ sceneNumber: '1', set: 'KITCHEN' }) });
    });
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
    await page.getByRole('menuitem', { name: /\.fdx, \.fountain, \.csv/ }).click();
    await page.locator('input[type="file"]').first().setInputFiles(writeFdx('lemon-append.fdx', [{ n: '1', heading: 'INT. OTHER - DAY' }]));
    // Append flow shows the "... Import N Scenes" button, not the diff modal.
    await expect(page.getByRole('button', { name: /Import 1 Scenes/ })).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: /Import 1 Scenes/ }).click();
    await page.waitForFunction(() => (window as any).__lemonSchedule.getProject().scenes.length === 2);
  });

  test('re-import never duplicates an existing cast member (Board ID reuse)', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await ensureProject(page);
    const amyFdx = (action: string) => `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Version="1"><Content>
<Paragraph Type="Scene Heading" Number="1"><Text>INT. KITCHEN - DAY</Text><SceneProperties Length="1.0"/></Paragraph>
<Paragraph Type="Character"><Text>AMY</Text></Paragraph>
<Paragraph Type="Action"><Text>${action}</Text></Paragraph>
</Content></FinalDraft>`;
    const p1 = path.join(os.tmpdir(), 'dup-a.fdx'); fs.writeFileSync(p1, amyFdx('First.'));
    const p2 = path.join(os.tmpdir(), 'dup-b.fdx'); fs.writeFileSync(p2, amyFdx('Second.'));

    // Append AMY.
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
    await page.getByRole('menuitem', { name: /\.fdx, \.fountain, \.csv/ }).click();
    await page.locator('input[type="file"]').first().setInputFiles(p1);
    await page.getByRole('button', { name: /Import 1 Scenes/ }).click();
    await page.waitForFunction(() => (window as any).__lemonSchedule.getProject().castMembers?.some((m: any) => m.name === 'AMY'));
    const amyId = await page.evaluate(() => (window as any).__lemonSchedule.getProject().castMembers.find((m: any) => m.name === 'AMY').id);

    // Update with the SAME character — must reuse the member, not add a duplicate.
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
    await page.getByRole('menuitem', { name: /Update script/ }).click();
    await page.locator('input[type="file"]').nth(1).setInputFiles(p2);
    await page.getByRole('dialog').getByText(/Update Script/).waitFor();
    await page.getByRole('button', { name: 'Accept all' }).click();
    await page.getByRole('button', { name: /Apply \d+/ }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await page.waitForFunction(() => (window as any).__lemonSchedule.getProject().scriptBaseline);

    const cast = await page.evaluate(() => (window as any).__lemonSchedule.getProject().castMembers);
    expect(cast.filter((m: any) => m.name === 'AMY')).toHaveLength(1);
    expect(cast.find((m: any) => m.name === 'AMY').id).toBe(amyId);
  });

  test('a kept custom day/night prompts the mapper AFTER applying (not before the review)', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await ensureProject(page);
    await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      b.dispatch({ type: 'ADD_SCENE', payload: b.makeBlankScene({ sceneNumber: '1', set: 'KITCHEN', dayNight: 'DAY' }) });
    });
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
    await page.getByRole('menuitem', { name: /Update script/ }).click();
    await page.locator('input[type="file"]').nth(1).setInputFiles(writeFdx('dream-update.fdx', [{ n: '1', heading: 'INT. KITCHEN - DREAM', action: 'Dream.' }]));
    await page.getByRole('dialog').getByText(/Update Script/).waitFor();

    // No mapper during review; the ordinary review is shown first.
    await expect(page.getByText('Map script headings')).toHaveCount(0);
    await page.keyboard.press('ArrowRight'); // accept
    await page.getByRole('button', { name: /Apply \d+/ }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    // NOW the mapper appears (the odd value survived the decision).
    await expect(page.getByText('Map script headings')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /Import 1 value/ }).click();

    await page.waitForFunction(() => {
      const p = (window as any).__lemonSchedule.getProject();
      return (p.colorPalette?.dayNightOptions || []).includes('DREAM');
    });
    const project = await page.evaluate(() => (window as any).__lemonSchedule.getProject());
    expect(project.scenes[0].dayNight).toBe('DREAM');
  });

  test('an UNCHANGED scene that already carries a custom day/night still prompts at apply', async ({ page }) => {
    await page.goto('http://localhost:3001/lemon_schedule/');
    await ensureProject(page);
    // Scene 1 is byte-for-byte identical to the incoming (retained body matches),
    // so the diff classifies it UNCHANGED. Scene 2 changes, so there is a real
    // mutation to apply — which is what enables the Apply button. The prompt must
    // still surface scene 1's custom DREAM value (roadmap 127 follow-up).
    await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const document_ = {
        format: 'fdx',
        scenes: [{ sceneNumber: '1', blocks: [['heading', 'INT. KITCHEN - DREAM'], ['action', 'Same.']] }],
      };
      b.batch(() => {
        b.dispatch({ type: 'SET_SCRIPT_DOCUMENT', payload: { document: document_ } });
        b.dispatch({ type: 'ADD_SCENE', payload: b.makeBlankScene({ sceneNumber: '1', set: 'KITCHEN', intExt: 'INT', dayNight: 'DREAM', pageCount: '1.0', pageCountDecimal: 1 }) });
        b.dispatch({ type: 'ADD_SCENE', payload: b.makeBlankScene({ sceneNumber: '2', set: 'STREET', intExt: 'EXT', dayNight: 'DAY' }) });
      });
    });
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
    await page.getByRole('menuitem', { name: /Update script/ }).click();
    await page.locator('input[type="file"]').nth(1).setInputFiles(writeFdx('dream-same.fdx', [
      { n: '1', heading: 'INT. KITCHEN - DREAM', action: 'Same.' },
      { n: '2', heading: 'EXT. STREET - DAY', action: 'Changed.' },
    ]));
    await page.getByRole('dialog').getByText(/Update Script/).waitFor();

    // Only scene 2 is in the review queue; accept it to reach an enabled Apply.
    await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: /Apply \d+/ }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Map script headings')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /Import 1 value/ }).click();
    await page.waitForFunction(() => ((window as any).__lemonSchedule.getProject().colorPalette?.dayNightOptions || []).includes('DREAM'));
  });
});
