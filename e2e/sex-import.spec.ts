import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_BOOT_ANCHOR, waitForPersistedProject } from './helpers';

const FIXTURE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const FIXTURE = path.join(FIXTURE_PATH, 'lair-v10.sex');
const GOLDEN = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_PATH, 'lair-v10.expected.json'), 'utf8'),
);

type PState = {
  present: {
    title: string;
    scenes: any[];
    castMembers: { id: string; name: string }[];
    customCategories: { key: string }[];
    versions: any[];
    activeVersionId: string;
  };
};

function bridge<T>(page: import('@playwright/test').Page, fn: string): Promise<T> {
  return page.evaluate((body) => {
    const b: any = (window as any).__lemonSchedule;
    // eslint-disable-next-line no-new-func
    return new Function('b', `return (${body})`)(b);
  }, fn);
}

async function importFixture(page: import('@playwright/test').Page, fixturePath: string) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.goto('http://localhost:' + (process.env.PLAYWRIGHT_PORT || '3001') + '/lemon_schedule/');
  await expect(page.getByRole('button', { name: 'Import Schedule' })).toBeVisible();
  await page.getByRole('button', { name: 'Import Schedule' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(fixturePath);
  await expect(APP_BOOT_ANCHOR(page)).toBeVisible({ timeout: 15000 });
  await waitForPersistedProject(page, `p.scenes.length === ${GOLDEN.scenes.length}`);
}

test.describe('SEX import/export (Movie Magic Scheduling Exchange)', () => {
  test('imports the Lair V10 breakdown and matches the golden reference', async ({ page }) => {
    await importFixture(page, FIXTURE);

    const state = await bridge<PState>(page, `b.getState()`);
    const p = state.present;
    expect(p.scenes).toHaveLength(GOLDEN.scenes.length); // 144

    // cast — sequential integer ids, names in first-appearance order
    expect(p.castMembers.map((c: any) => c.name)).toEqual(GOLDEN.cast);
    expect(p.castMembers.every((c: any) => /^\d+$/.test(c.id))).toBe(true);

    // breakdown-only: no sections invented, scenes in the Boneyard
    const active = p.versions.find(v => v.id === p.activeVersionId)!;
    const daybreaks = active.rows.filter((r: any) => r.type === 'DAYBREAK');
    expect(daybreaks).toHaveLength(1); // pinned only
    expect(daybreaks[0].pinned).toBe(true);
    const boneyard = active.rows.filter((r: any) => r.type === 'SCENE');
    expect(boneyard).toHaveLength(GOLDEN.scenes.length);
    expect(boneyard.every((r: any) => r.containerId === null)).toBe(true);

    const byId = new Map(p.castMembers.map((c: any) => [c.id, c.name]));
    const castNames = (s: any) =>
      (s.cast || '').split(',').map((x: string) => x.trim()).filter(Boolean).map((id: string) => byId.get(id));

    // spot-check scene fields against the golden
    const g0 = GOLDEN.scenes[0];
    const s0 = p.scenes[0];
    expect(s0.sceneNumber).toBe(g0.n);
    expect(s0.scriptPageNumbers).toBe(g0.spn);
    expect(s0.intExt).toBe(g0.ie);
    expect(s0.set).toBe(g0.set);
    expect(s0.dayNight).toBe(g0.dn);
    expect(s0.pageCountDecimal).toBe(g0.pg / 8); // eighths → total decimals
    expect(castNames(s0)).toEqual(g0.cast);

    // cast-heavy scene + omitted scenes
    const scene5 = p.scenes.find((s: any) => s.sceneNumber === '5');
    expect(castNames(scene5)).toEqual(GOLDEN.scenes.find((g: any) => g.n === '5')!.cast);
    const omitted = p.scenes.filter((s: any) => s.sceneNumber === '8' || s.sceneNumber === '9');
    expect(omitted).toHaveLength(2);
  });

  test('exports .sex and re-imports it (round trip)', async ({ page }) => {
    await importFixture(page, FIXTURE);

    // File > Export > Schedule to SEX (Movie Magic)
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'File' }).first().click();
    await page.getByRole('menuitem', { name: /Export/ }).click();
    await page.getByRole('menuitem', { name: 'Schedule to SEX (Movie Magic)' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.sex$/);
    const exportPath = path.join(FIXTURE_PATH, 'roundtrip.sex');
    await download.saveAs(exportPath);

    // re-import through the manager — identical breakdown
    await page.getByRole('button', { name: 'File' }).first().click();
    await page.getByRole('menuitem', { name: 'Project Manager' }).click();
    await expect(page.getByRole('button', { name: 'Import Schedule' })).toBeVisible();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import Schedule' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(exportPath);
    await waitForPersistedProject(page, `p.scenes.length === ${GOLDEN.scenes.length}`);

    const state = await bridge<PState>(page, `b.getState()`);
    const p = state.present;
    expect(p.scenes).toHaveLength(GOLDEN.scenes.length);
    expect(p.scenes.map((s: any) => s.sceneNumber)).toEqual(GOLDEN.scenes.map((g: any) => g.n));
    expect(p.scenes.map((s: any) => s.intExt)).toEqual(GOLDEN.scenes.map((g: any) => g.ie));
    expect(p.castMembers.map((c: any) => c.name)).toEqual(GOLDEN.cast);
    expect(p.scenes[0].pageCountDecimal).toBe(GOLDEN.scenes[0].pg / 8);
    fs.unlinkSync(exportPath);
  });
});