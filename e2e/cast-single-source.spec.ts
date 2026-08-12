import { test, expect } from '@playwright/test';
import { openSeededProject, loadSeedProject } from './helpers';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Project = any;

async function getProject(page: import('@playwright/test').Page): Promise<Project> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('lemon_schedule_project_v1'));
    return key ? JSON.parse(localStorage.getItem(key)!) : null;
  });
}

/** Builds a legacy-shaped project from the seed: cast names only live in the breakdownElements.cast mirror. */
function makeLegacyCastProject(opts: { dropCastMembers?: boolean; conflictName?: string; extraMirrorMembers?: { id: string; name: string }[] } = {}): Project {
  const seed = loadSeedProject().data;
  const legacy = JSON.parse(JSON.stringify(seed));
  if (opts.dropCastMembers) {
    delete legacy.castMembers;
  } else if (opts.conflictName) {
    legacy.castMembers = legacy.castMembers.map((m: any) => m.id === '1' ? { ...m, name: opts.conflictName } : m);
  }
  if (opts.extraMirrorMembers) {
    legacy.breakdownElements.cast = [...legacy.breakdownElements.cast, ...opts.extraMirrorMembers];
  }
  return legacy;
}

async function seedLegacyProject(page: import('@playwright/test').Page, legacy: Project) {
  const meta = JSON.stringify({ id: legacy.id, title: legacy.title, lastModified: Date.now(), createdAt: Date.now() });
  const projectJson = JSON.stringify(legacy);
  await page.addInitScript(({ projectJson, meta }) => {
    const project = JSON.parse(projectJson);
    localStorage.setItem('lemon_schedule_project_v1_' + project.id, JSON.stringify(project));
    localStorage.setItem('lemon_schedule_project_index', JSON.stringify([JSON.parse(meta)]));
  }, { projectJson, meta });
  await page.goto('http://localhost:3001/lemon_schedule/');
  await page.getByText(legacy.title, { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1000);
}

async function openElementManagerCast(page: import('@playwright/test').Page) {
  await openSeededProject(page);
  await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Element Manager' }).click();
  await page.waitForTimeout(600);
  await page.locator('aside').getByRole('button', { name: /Cast/ }).click();
  await page.waitForTimeout(400);
}

async function importFile(page: import('@playwright/test').Page, filePath: string, sceneCount: number) {
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /Import Screenplay/ }).click();
  await page.waitForTimeout(500);
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
  await page.waitForTimeout(1500);
  await expect(page.getByRole('button', { name: new RegExp(`Import ${sceneCount} Scenes`) })).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: new RegExp(`Import ${sceneCount} Scenes`) }).click();
  await page.waitForTimeout(1500);
}

test.describe('cast single source of truth (castMembers)', () => {
  test.describe.configure({ mode: 'serial' });

  test('legacy projects are migrated: breakdownElements.cast is stripped on load', async ({ page }) => {
    await openSeededProject(page);
    await page.waitForTimeout(1500);

    // castMembers must survive migration untouched
    await expect.poll(async () => {
      const p = await getProject(page);
      return p ? (p.castMembers || []).length : 0;
    }, { timeout: 8000 }).toBe(23);

    const project = await getProject(page);
    expect(project.breakdownElements.cast).toBeUndefined();
  });

  test('legacy cast conversion: names are recovered from the mirror when castMembers is missing', async ({ page }) => {
    // Worst case: the project only carries cast in the legacy mirror
    const legacy = makeLegacyCastProject({ dropCastMembers: true, extraMirrorMembers: [{ id: '99', name: 'EXTRA MAN' }] });
    await seedLegacyProject(page, legacy);

    await expect.poll(async () => {
      const p = await getProject(page);
      return p ? (p.castMembers || []).length : 0;
    }, { timeout: 8000 }).toBe(24);

    const project = await getProject(page);
    expect(project.breakdownElements.cast).toBeUndefined();
    const names = (project.castMembers || []).map((m: any) => m.name);
    expect(names).toContain('FISHERMAN');
    expect(names).toContain('SENKAR');
    expect(names).toContain('EXTRA MAN');
    // scene references by id still resolve (id 4 = JO in the mirror)
    expect(project.scenes.some((s: any) => (s.cast || '').includes('4'))).toBe(true);
  });

  test('legacy cast conversion: castMembers wins on name conflicts, mirror fills gaps', async ({ page }) => {
    // castMembers exists but diverged from the mirror: id 1 renamed, id 99 only in the mirror
    const legacy = makeLegacyCastProject({ conflictName: 'FISHERMAN II', extraMirrorMembers: [{ id: '99', name: 'EXTRA MAN' }] });
    await seedLegacyProject(page, legacy);

    await expect.poll(async () => {
      const p = await getProject(page);
      return p ? (p.castMembers || []).length : 0;
    }, { timeout: 8000 }).toBe(24);

    const project = await getProject(page);
    const byId = new Map((project.castMembers || []).map((m: any) => [m.id, m.name]));
    expect(byId.get('1')).toBe('FISHERMAN II');
    expect(byId.get('99')).toBe('EXTRA MAN');
    expect(project.breakdownElements.cast).toBeUndefined();
  });

  test('legacy cast conversion: .lemon import via Project Manager recovers cast names', async ({ page }) => {
    const legacy = makeLegacyCastProject({ dropCastMembers: true });
    const lemonPath = path.join(os.tmpdir(), 'lemon-legacy-cast.lemon');
    fs.writeFileSync(lemonPath, JSON.stringify(legacy));

    await page.goto('http://localhost:3001/lemon_schedule/');
    await page.getByRole('button', { name: /Import/i }).click({ timeout: 8000 });
    await page.locator('input[type="file"][accept=".lemon,.json"]').setInputFiles(lemonPath);
    await page.waitForTimeout(1500);

    const project = await getProject(page);
    expect(project).toBeTruthy();
    const names = (project.castMembers || []).map((m: any) => m.name);
    expect(names).toContain('FISHERMAN');
    expect(names).toContain('SENKAR');
    expect(project.breakdownElements.cast).toBeUndefined();
  });

  test('element manager cast edits land in castMembers and never re-create the mirror', async ({ page }) => {
    await openElementManagerCast(page);

    // rename cast member 1 (FISHERMAN) via the ID+Name row
    const row = page.locator('tr', { has: page.locator('input[value="FISHERMAN"]') });
    const nameInput = row.locator('input').last();
    await nameInput.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type('FISHERMAN II', { delay: 15 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(1500);

    const project = await getProject(page);
    const member = (project.castMembers || []).find((m: any) => m.id === '1');
    expect(member).toBeTruthy();
    expect(member.name).toBe('FISHERMAN II');
    expect(project.breakdownElements.cast).toBeUndefined();
    // scene cast references still by id
    const castVals = project.scenes.map((s: any) => s.cast || '').join(', ');
    expect(castVals.includes('1')).toBe(true);
  });

  test('scene sheet cast dropdown lists members from castMembers', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Breakdown', exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Sheet', exact: true }).click();
    await page.waitForTimeout(800);

    // The Cast box renders an EntityDropdown; clicking it opens a panel with member items
    const castInput = page.locator('input[value="4, 11"]').first();
    await castInput.click();
    await page.waitForTimeout(400);

    await expect(page.getByText('FISHERMAN', { exact: true }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('SENKAR', { exact: true }).first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
  });

  test('reports element breakdown shows cast members for the cast category', async ({ page }) => {
    await openSeededProject(page);
    await page.getByRole('button', { name: 'Reports' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Element Breakdown' }).click();
    await page.waitForTimeout(600);
    await page.locator('aside').getByRole('button', { name: /Cast/ }).click();
    await page.waitForTimeout(600);

    // members with scenes show as "id. name"
    await expect(page.getByText('1. FISHERMAN', { exact: false }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('4. JO', { exact: false }).first()).toBeVisible({ timeout: 5000 });
  });

  test('CSV import: cast members land in castMembers, scenes reference ids, elements in breakdownElements', async ({ page }) => {
    const csvPath = path.join(os.tmpdir(), 'lemon-import-cast.csv');
    const csv = [
      'Scene #,INT/EXT,Set,Day/Night,Cast,Props,Vehicles,Description',
      '1,INT,KITCHEN,DAY,"AMY, BOB","Gun, Mug","Boat","AMY talks to BOB"',
      '2,EXT,STREET,NIGHT,"AMY","Gun","Car","BOB watches"',
    ].join('\n');
    fs.mkdirSync(path.dirname(csvPath), { recursive: true });
    fs.writeFileSync(csvPath, csv);

    await openSeededProject(page);
    await importFile(page, csvPath, 2);

    const project = await getProject(page);
    const names = (project.castMembers || []).map((m: any) => m.name);
    expect(names).toContain('AMY');
    expect(names).toContain('BOB');

    const amy = (project.castMembers || []).find((m: any) => m.name === 'AMY');
    expect(amy).toBeTruthy();
    // scenes reference cast by id, not name (amy.id is freshly assigned, referenced only by imported scenes)
    const scene1 = project.scenes.find((s: any) => (s.cast || '').includes(String(amy.id)));
    expect(scene1).toBeTruthy();
    expect(scene1.cast.split(',').map((x: string) => x.trim())).toContain(String(amy.id));
    expect(scene1.cast.toLowerCase()).not.toContain('amy');

    // non-cast elements in breakdownElements, cast NOT mirrored
    expect(project.breakdownElements.cast).toBeUndefined();
    const vehNames = (project.breakdownElements.vehicles || []).map((e: any) => e.name);
    expect(vehNames).toContain('Boat');
    const propNames = (project.breakdownElements.props || []).map((e: any) => e.name);
    expect(propNames).toContain('Gun');
  });

  test('FDX import: characters become castMembers, scenes reference ids', async ({ page }) => {
    const fdxPath = path.join(os.tmpdir(), 'lemon-import-cast.fdx');
    const fdx = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
<Content>
<Paragraph Type="Scene Heading" Number="1"><Text>INT. KITCHEN - DAY</Text><SceneProperties Length="1.0"/></Paragraph>
<Paragraph Type="Character"><Text>AMY</Text></Paragraph>
<Paragraph Type="Action"><Text>AMY talks to BOB.</Text></Paragraph>
<Paragraph Type="Scene Heading" Number="2"><Text>EXT. STREET - NIGHT</Text><SceneProperties Length="1.0"/></Paragraph>
<Paragraph Type="Character"><Text>BOB</Text></Paragraph>
<Paragraph Type="Action"><Text>BOB watches.</Text></Paragraph>
</Content>
</FinalDraft>`;
    fs.writeFileSync(fdxPath, fdx);

    await openSeededProject(page);
    await importFile(page, fdxPath, 2);

    const project = await getProject(page);
    const names = (project.castMembers || []).map((m: any) => m.name);
    expect(names).toContain('AMY');
    expect(names).toContain('BOB');

    const amy = (project.castMembers || []).find((m: any) => m.name === 'AMY');
    expect(amy).toBeTruthy();
    const scene1 = project.scenes.find((s: any) => (s.cast || '').includes(String(amy.id)));
    expect(scene1).toBeTruthy();
    expect(scene1.cast.split(',').map((x: string) => x.trim())).toContain(String(amy.id));
    expect(scene1.cast.toLowerCase()).not.toContain('amy');
    expect(project.breakdownElements.cast).toBeUndefined();
  });

  test('modals & prints: DOODs dialog, rule cards and printed cast list all read castMembers', async ({ page }) => {
    await openSeededProject(page);

    // Rules tab — color rule cards render cast conditions as "id. name"
    await page.getByRole('button', { name: 'Rules' }).click();
    await page.waitForTimeout(600);
    await expect(page.getByText('1. FISHERMAN', { exact: false }).first()).toBeVisible({ timeout: 5000 });

    // Reports -> Day Out of Days -> Print dialog lists members
    await page.getByRole('button', { name: 'Reports' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Print' }).click();
    await page.waitForTimeout(600);
    await expect(page.getByText('1. FISHERMAN', { exact: false }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('4. JO', { exact: false }).first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Schedule -> Print -> Cast List renders in the print output
    await page.evaluate(() => { window.print = () => {}; });
    await page.getByRole('button', { name: 'Schedule' }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Print' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Print / Save PDF' }).click();
    await page.waitForTimeout(1200);
    await expect(page.locator('.print-root')).toBeAttached({ timeout: 5000 });
    await expect(page.getByText('FISHERMAN', { exact: false }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('JO', { exact: false }).first()).toBeVisible({ timeout: 5000 });
  });
});
