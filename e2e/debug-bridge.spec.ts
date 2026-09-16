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

    await expect(page.getByTestId('stripboard-day').first()).toBeAttached({ timeout: 5000 });
    await expect(page.getByTestId('daybreak-row').first()).toBeAttached();
    await expect(page.getByTestId('section-footer').first()).toBeAttached();
    await expect(page.getByTestId('next-day-header').first()).toBeAttached();
  });

  test('edits the stripboard through the schedule ops (move, sort, daybreaks, insert, reorder)', async ({ page }) => {
    await bootApp(page);

    const result = await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const out: any = {};
      const mk = (n: string, set: string, dayNight: string, intExt: string) => {
        const sc = b.makeBlankScene({ sceneNumber: n, set, dayNight, intExt, pageCountDecimal: 1, estimatedDuration: 30 });
        b.dispatch({ type: 'ADD_SCENE', payload: sc });
        return sc.id;
      };
      const c = mk('1', 'B SET', 'DAY', 'INT');
      const a = mk('2', 'A SET', 'NIGHT', 'EXT');
      const mid = mk('3', 'A SET', 'DAY', 'INT');

      const strip = () => b.getRows().rows.filter((r: any) => r.containerId === 1);
      const rowIdFor = (sceneId: string) => b.getRows().rows.find((r: any) => r.sceneId === sceneId).id;

      // New scenes land in the boneyard; move all three onto the stripboard.
      b.batch(() => {
        for (const sceneId of [c, a, mid]) b.moveRows({ rowIds: [rowIdFor(sceneId)], toContainer: 'stripboard' });
      });
      out.movedOntoStrip = strip().filter((r: any) => r.type === 'SCENE').length;

      // Hierarchical sort: set → day/night → INT/EXT.
      b.sortRows({ criteria: [{ key: 'set' }, { key: 'day_night' }, { key: 'int_ext' }] });
      const values = b.getSceneValues().rows;
      out.sorted = strip()
        .filter((r: any) => r.type === 'SCENE')
        .map((r: any) => {
          const v = values.find((x: any) => x.id === r.sceneId).values;
          return `${v.set}|${v.dayNight}|${v.intExt}`;
        });

      // Re-split into days by pages, then add a note and reorder the whole board.
      b.autoDaybreaks({ mode: 'pages', threshold: 2 });
      out.daybreaksAfterSplit = b.getRows().rows.filter((r: any) => r.type === 'DAYBREAK').length;

      b.insertRow({ row: { type: 'NOTE', noteText: 'LUNCH NOTE' }, container: 'stripboard' });
      out.hasStripNote = strip().some((r: any) => r.type === 'NOTE');

      b.reorderRows({ orderedRowIds: strip().map((r: any) => r.id).reverse() });
      out.pinnedFirstAfterReorder = b.getRows().rows[0]?.pinned === true;

      b.deleteAllDaybreaks();
      out.daybreaksAfterDelete = b.getRows().rows.filter((r: any) => r.type === 'DAYBREAK').length;
      b.undo();
      out.daybreaksAfterUndo = b.getRows().rows.filter((r: any) => r.type === 'DAYBREAK').length;
      return out;
    });

    expect(result.movedOntoStrip).toBe(3);
    expect(result.sorted).toEqual(['A SET|DAY|INT', 'A SET|NIGHT|EXT', 'B SET|DAY|INT']);
    expect(result.daybreaksAfterSplit).toBe(3); // pinned + 2 splits
    expect(result.hasStripNote).toBe(true);
    expect(result.pinnedFirstAfterReorder).toBe(true);
    expect(result.daybreaksAfterDelete).toBe(1);
    expect(result.daybreaksAfterUndo).toBe(3);
  });

  test('reads the Reports Designer vocabulary and builds a design through the bridge', async ({ page }) => {
    await bootApp(page);

    const result = await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const out: any = {};

      const registry = b.getReportRegistry();
      out.blockTypes = registry.blockTypes.length;
      out.contextualColl = registry.collections.some((c: any) => c.key === 'elementCallsOfDay' && c.contextual);
      out.unscopedColl = registry.collections.some((c: any) => c.key === 'locations' && c.scoped === false);
      out.fieldRegistered = registry.fields.some((f: any) => f.key === 'sceneNumber' && f.scope === 'scenes');

      // The seeded Call Sheet template is readable as a starting point.
      const project = b.getProject();
      out.before = project.reportDesigns.length;
      const callSheet = project.reportDesigns.find((d: any) => d.name === 'Call Sheet');
      out.foundCallSheet = !!callSheet;
      const design = b.getReportDesign(callSheet.id);
      out.seedBlocks = design.blocks.length;

      // Block factory produces a valid, uniquely-identified block.
      const a = b.makeReportBlock({ type: 'text', text: 'HELLO {{production}}' });
      const c = b.makeReportBlock({ type: 'text', text: 'WORLD' });
      out.blocksValid = a.type === 'text' && !!a.id && a.id !== c.id;

      // Clone the template into a new design in one action, then undo.
      b.dispatch({ type: 'ADD_REPORT_DESIGN', payload: { name: 'Agent Call Sheet', cloneFromId: callSheet.id } });
      const created = b.getProject().reportDesigns.find((d: any) => d.name === 'Agent Call Sheet');
      out.created = !!created;
      out.cloneBlocks = created ? created.blocks.length : -1;
      b.undo();
      out.afterUndo = b.getProject().reportDesigns.length;
      return out;
    });

    expect(result.blockTypes).toBeGreaterThan(10);
    expect(result.contextualColl).toBe(true);
    expect(result.unscopedColl).toBe(true);
    expect(result.fieldRegistered).toBe(true);
    expect(result.foundCallSheet).toBe(true);
    expect(result.seedBlocks).toBeGreaterThan(0);
    expect(result.blocksValid).toBe(true);
    expect(result.created).toBe(true);
    expect(result.cloneBlocks).toBe(result.seedBlocks);
    expect(result.afterUndo).toBe(result.before);
  });

  test('resolves production days, violations, element stats and script integrity', async ({ page }) => {
    await bootApp(page);

    const result = await page.evaluate(() => {
      const b = (window as any).__lemonSchedule;
      const out: any = {};

      // Put one scene on the board and split it into a single production day.
      const sc = b.makeBlankScene({ sceneNumber: '1', set: 'KITCHEN', intExt: 'INT', dayNight: 'DAY', pageCountDecimal: 2, estimatedDuration: 60 });
      b.dispatch({ type: 'ADD_SCENE', payload: sc });
      const row = b.getRows().rows.find((r: any) => r.sceneId === sc.id);
      b.moveRows({ rowIds: [row.id], toContainer: 'stripboard' });
      b.autoDaybreaks({ mode: 'pages', threshold: 5 });

      const days = b.getDays();
      out.dayCount = days.days.length;
      out.hasCalendarVersion = !!days.calendarVersionId;
      const d0 = days.days[0];
      out.day0 = d0 ? { chronoDay: d0.chronoDay, date: d0.date, callTime: d0.callTime, sceneCount: d0.sceneCount } : null;

      const full = b.getDay({ chronoDay: d0.chronoDay });
      out.fullScenes = full ? full.scenes.length : -1;
      out.fullCall = full ? full.callTime : null;
      out.fullHasCast = Array.isArray(full?.cast);
      out.byDateSameDay = b.getDay({ date: d0.date })?.chronoDay === d0.chronoDay;
      out.missingDayNull = b.getDay({ chronoDay: 999 }) === null;

      out.violationTotal = b.getViolations().total;
      out.castStats = b.getElementStats('cast').elements.length;
      out.auditHasReport = !!b.auditScript();
      out.historyPast = b.historyDepth().past;
      return out;
    });

    expect(result.dayCount).toBe(1);
    expect(result.hasCalendarVersion).toBe(true);
    expect(result.day0).toEqual({ chronoDay: 1, date: expect.any(String), callTime: '08:00', sceneCount: 1 });
    expect(result.fullScenes).toBe(1);
    expect(result.fullCall).toBe('08:00');
    expect(result.fullHasCast).toBe(true);
    expect(result.byDateSameDay).toBe(true);
    expect(result.missingDayNull).toBe(true);
    expect(typeof result.violationTotal).toBe('number');
    expect(typeof result.castStats).toBe('number');
    expect(result.auditHasReport).toBe(true);
    expect(result.historyPast).toBeGreaterThan(0);
  });
});