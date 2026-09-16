import { test, expect } from '@playwright/test';
import { openSeededReportsDesigner, selectReportDesign } from './helpers';

async function openSceneBreakdown(page: any, mutate: (project: any) => void) {
  await openSeededReportsDesigner(page, mutate);
  await selectReportDesign(page, 'Scene Breakdown');
}

test('canvas repeat samples the first scene WITH data, not the first row', async ({ page }) => {
  await openSceneBreakdown(page, (project) => {
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
  });

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
  await openSceneBreakdown(page, (project) => {
    for (const s of project.scenes as any[]) { s.cast = ''; s.props = ''; s.description = ''; s.set = ''; }
  });
  const text = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.block-card.block-type-text, .report-repeat .report-text-block'))
      .map(el => (el as HTMLElement).innerText?.trim())
      .filter(Boolean)
      .join('\n'),
  );
  // still renders the template (raw tokens for the empty values), no crash
  expect(text).toContain('SC ');
});
