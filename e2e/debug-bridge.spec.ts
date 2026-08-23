import { test, expect } from '@playwright/test';
import { ensureProject } from './helpers';

/**
 * Agentic debug bridge (window.__lemonSchedule) — proves agents can inject
 * data, mutate via the same dispatch the UI uses, read state-level truth
 * (rows/scene values), and rewind with undo/redo. See AGENTS.md
 * "Agentic Debug Bridge". The dev server runs `import.meta.env.DEV`, so the
 * bridge is always installed in this suite.
 *
 * NOTE: bridge methods MUST be invoked inside page.evaluate() — the protocol
 * serializes return values and strips functions, so agents drive the bridge
 * through evaluate and read back plain data (same as Playwright MCP eval).
 */

async function bootApp(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/lemon_schedule/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /New Project/i }).waitFor({ timeout: 15000 });
  await ensureProject(page);
  await page.waitForFunction(() => !!(window as any).__lemonSchedule, undefined, { timeout: 10000 });
}

test.describe('Agentic Debug Bridge', () => {
  test.describe.configure({ mode: 'serial' });

  test('installs, self-documents, and rejects unknown action types', async ({ page }) => {
    await bootApp(page);

    const result = await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const help = b.help();
      let invalidType;
      try {
        b.dispatch({ type: 'NOPE' });
        invalidType = 'no error';
      } catch (e) {
        invalidType = String(e);
      }
      let invalidShape;
      try {
        b.dispatch({ nope: true });
        invalidShape = 'no error';
      } catch (e) {
        invalidShape = String(e);
      }
      return {
        hasBridge: true,
        version: b.version,
        helpLen: help.length,
        helpText: help.join('\n'),
        invalidType,
        invalidShape,
      };
    });

    expect(result.helpLen).toBeGreaterThan(10);
    expect(result.helpText).toMatch(/getRows[\s\S]*getSceneValues[\s\S]*dispatch/);
    expect(result.invalidType).toMatch(/unknown action type 'NOPE'/);
    expect(result.invalidShape).toMatch(/expects an Action object/);
  });

  test('injects data, reads it, and rewinds with undo/redo', async ({ page }) => {
    await bootApp(page);

    const result = await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const steps: any[] = [];
      steps.push({ label: 'initial', castCount: b.getState().present.castMembers.length });
      b.dispatch({
        type: 'ADD_CAST_MEMBER',
        payload: { id: b.newId(), name: 'Agent Test', role: 'Lead' },
      });
      steps.push({ label: 'after-add', castCount: b.getState().present.castMembers.length });
      b.undo();
      steps.push({ label: 'after-undo', castCount: b.getState().present.castMembers.length });
      b.redo();
      steps.push({ label: 'after-redo', castCount: b.getState().present.castMembers.length });
      return steps;
    });

    expect(result.map((s) => s.castCount)).toEqual([0, 1, 0, 1]);
  });

  test('adds scenes with rows, exposes computed truth and scene values, and batches as one undo entry', async ({ page }) => {
    await bootApp(page);

    const result = await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const out: any = {};

      const scene = b.makeBlankScene({
        sceneNumber: '1',
        intExt: 'INT',
        dayNight: 'DAY',
        set: 'Backlot',
        description: 'Bridge spec scene',
      });
      b.dispatch({ type: 'ADD_SCENE', payload: scene });

      const { rows } = b.getRows();
      const row = rows.find((r: any) => r.sceneId === scene.id);
      out.row = row ? { type: row.type, computedCallTime: row.computedCallTime, containerId: row.containerId } : null;

      const view = b.getSceneValues();
      const cell = view.rows.find((r: any) => r.id === scene.id);
      out.cell = cell ? { description: cell.values.description, intExt: cell.values.intExt } : null;

      b.dispatch({ type: 'UPDATE_SCENE', payload: { id: scene.id, description: 'Edited via bridge' } });
      out.edited = b.getSceneValues().rows.find((r: any) => r.id === scene.id).values.description;

      const beforeBatch = b.getState().present.scenes.length;
      b.batch(() => {
        b.dispatch({ type: 'ADD_SCENE', payload: b.makeBlankScene({ sceneNumber: '2' }) });
        b.dispatch({ type: 'ADD_SCENE', payload: b.makeBlankScene({ sceneNumber: '3' }) });
      });
      out.afterBatch = b.getState().present.scenes.length;
      out.expectedAfterBatch = beforeBatch + 2;
      b.undo();
      out.afterBatchUndo = b.getState().present.scenes.length;
      out.expectedAfterBatchUndo = beforeBatch;
      return out;
    });

    expect(result.row).toEqual({ type: 'SCENE', computedCallTime: '08:00', containerId: null });
    expect(result.cell).toEqual({ description: 'Bridge spec scene', intExt: 'INT' });
    expect(result.edited).toBe('Edited via bridge');
    expect(result.afterBatch).toBe(result.expectedAfterBatch);
    expect(result.afterBatchUndo).toBe(result.expectedAfterBatchUndo);
  });

  test('notifies onAction subscribers of every dispatch', async ({ page }) => {
    await bootApp(page);

    const result = await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const seen: string[] = [];
      const off = b.onAction((a: any) => seen.push(a.type));
      b.dispatch({ type: 'SET_PRODUCTION_INFO', payload: { production: 'Bridge Film' } });
      off();
      b.dispatch({ type: 'SET_PRODUCTION_INFO', payload: { production: 'Untracked' } });
      return { seen, production: b.getState().present.productionInfo.production };
    });

    expect(result.seen).toEqual(['SET_PRODUCTION_INFO']);
    expect(result.production).toBe('Untracked');
  });

  test('renders the stable testid anchors on the schedule stripboard', async ({ page }) => {
    await bootApp(page);

    await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const s = b.getState().present;
      const version = s.versions.find((v: any) => v.id === s.activeVersionId);
      b.dispatch({
        type: 'UPDATE_VERSION',
        payload: {
          id: version.id,
          rows: [
            ...version.rows,
            { id: b.newId(), type: 'DAYBREAK', containerId: 1, order: version.rows.length, daybreakLabel: 'Day 2', daybreakCallTime: '09:00' },
          ],
        },
      });
    });

    await page.getByRole('button', { name: 'Schedule' }).click();
    await page.waitForTimeout(800);

    await expect(page.getByTestId('stripboard-day').first()).toBeAttached({ timeout: 5000 });
    await expect(page.getByTestId('daybreak-row').first()).toBeAttached();
    await expect(page.getByTestId('section-footer').first()).toBeAttached();
    await expect(page.getByTestId('next-day-header').first()).toBeAttached();
  });
});