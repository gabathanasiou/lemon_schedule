import { test, expect } from '@playwright/test';
import { loadSeedProject } from './helpers';

async function openSceneBreakdown(page: any, project: any) {
  const meta = JSON.stringify({ id: project.id, title: project.title, lastModified: Date.now(), createdAt: Date.now() });
  await page.addInitScript(({ projectJson, metaJson }) => {
    const p = JSON.parse(projectJson);
    localStorage.setItem('lemon_schedule_project_v1_' + p.id, projectJson);
    localStorage.setItem('lemon_schedule_project_index', JSON.stringify([JSON.parse(metaJson)]));
  }, { projectJson: JSON.stringify(project), metaJson: meta });
  await page.goto('http://localhost:3001/lemon_schedule/');
  await page.getByText(project.title, { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Reports Designer', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByText('Editing: One-Liner', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Scene Breakdown' }).click();
  await page.waitForTimeout(600);
}

test('canvas repeat samples the first scene WITH data, not the first row', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  const scenes: any[] = project.scenes;
  // The first scene the canvas samples (empirically SC 22 in this seed) is
  // emptied; EVERY other scene gets data. The canvas must sample a data-ful
  // scene instead of showing raw tokens.
  const s22 = scenes.find((s: any) => String(s.sceneNumber) === '22');
  s22.cast = ''; s22.props = ''; s22.description = ''; s22.set = '';
  for (const s of scenes) {
    if (s === s22) continue;
    if (!s.cast) s.cast = 'JASON, MARIA';
    if (!s.props) s.props = 'Chairs, Coffee table';
    if (!s.description) s.description = 'A fully broken-down scene.';
    if (!s.set) s.set = 'The Filled Set';
  }

  await openSceneBreakdown(page, project);

  const text = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.block-card.block-type-text, .report-repeat .report-text-block'))
      .map(el => (el as HTMLElement).innerText?.trim())
      .filter(Boolean)
      .join('\n'),
  );
  console.log('CANVAS-TEXT:', text);
  // the sample must resolve real values, not raw tokens, and must not be the
  // emptied first scene (SC 22)
  expect(text).not.toContain('SC 22 —');
  expect(text).not.toContain('{{set}}');
  expect(text).not.toContain('{{props}}');
  expect(text).not.toContain('{{cast}}');
  expect(text).toContain('Cast:');
});

test('canvas falls back to the first item when no scene has data', async ({ page }) => {
  const seed = loadSeedProject();
  const project = JSON.parse(seed.raw);
  for (const s of project.scenes as any[]) { s.cast = ''; s.props = ''; s.description = ''; s.set = ''; }
  await openSceneBreakdown(page, project);
  const text = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.block-card.block-type-text, .report-repeat .report-text-block'))
      .map(el => (el as HTMLElement).innerText?.trim())
      .filter(Boolean)
      .join('\n'),
  );
  // still renders the template (raw tokens for the empty values), no crash
  expect(text).toContain('SC ');
});
