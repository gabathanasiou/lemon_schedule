import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_BOOT_ANCHOR } from './helpers';

const FIXTURE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const FIXTURE = path.join(FIXTURE_PATH, 'wonderful-life.msd');
const GOLDEN = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_PATH, 'wonderful-life.expected.json'), 'utf8'),
);

type PState = {
  present: {
    title: string;
    scenes: any[];
    castMembers: any[];
    crew?: Record<string, { id: string; name: string }[]>;
    customCategories: { key: string }[];
    breakdownElements: Record<string, { id: string; name: string }[]>;
    colorPalette?: {
      sceneColors: { intExt: string; dayNight: string; background: string; text: string }[];
      selectedStripBg: string;
      dayHeaderBg: string;
      noteBg: string;
    };
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

function goldenStripLabels(version: any): string[] {
  return version.rows
    .filter((r: any) => r.k === 's')
    .map((r: any) => r.n);
}

test.describe('MSD import (Movie Magic Scheduling .msd → new project)', () => {
  test('imports the demo schedule and matches the golden reference', async ({ page }) => {
    const chooserPromise = page.waitForEvent('filechooser');
    await page.goto('http://localhost:' + (process.env.PLAYWRIGHT_PORT || '3001') + '/lemon_schedule/');
    await expect(page.getByRole('button', { name: 'Import Schedule' })).toBeVisible();
    await page.getByRole('button', { name: 'Import Schedule' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(FIXTURE);

    // project manager closes, app header shows the imported production title
    await expect(APP_BOOT_ANCHOR(page)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(GOLDEN.title, { exact: true }).first()).toBeVisible();

    const state = await bridge<PState>(page, `b.getState()`);
    const p = state.present;
    expect(p.title).toBe(GOLDEN.title);
    expect(p.scenes).toHaveLength(GOLDEN.scenes.length);

    // cast — ids are sequential integers (user decision), names in order
    expect(p.castMembers).toHaveLength(GOLDEN.cast.length);
    const goldenCast = GOLDEN.cast.map((c: any) => c.name);
    expect(p.castMembers.map((c: any) => c.name)).toEqual(goldenCast);
    expect(p.castMembers.every((c: any) => /^\d+$/.test(c.id))).toBe(true);
    expect(new Set(p.castMembers.map((c: any) => c.id)).size).toBe(p.castMembers.length);
    // Board IDs follow the MMS roster order (George=1, Mary=2)
    expect(p.castMembers.find((c: any) => c.name === 'GEORGE')?.id).toBe('1');
    expect(p.castMembers.find((c: any) => c.name === 'MARY')?.id).toBe('2');

    // crew — MMS ProductionInfo named roles land in the crew roster
    for (const [roleKey, names] of Object.entries(GOLDEN.crew || {})) {
      expect((p.crew?.[roleKey] || []).map((m: any) => m.name)).toEqual(names);
    }
    expect((p.crew?.director || []).map((m: any) => m.name)).toContain('Frank Capra');

    // strip colors — the MMS ColorSettings matrix + strip preferences
    const goldenColors = GOLDEN.colors;
    const pal = p.colorPalette!;
    expect(pal.sceneColors).toEqual(
      goldenColors.sceneColors.map((e: any) => ({
        intExt: e.ie, dayNight: e.dn, background: e.bg, text: e.fg,
      })),
    );
    expect(pal.selectedStripBg).toBe(goldenColors.prefs.Hilite.bg);
    expect(pal.dayHeaderBg).toBe(goldenColors.prefs.DayStrip.bg);
    expect(pal.noteBg).toBe(goldenColors.prefs.Banner.bg);

    // custom categories
    expect(p.customCategories.map((c) => c.key).sort()).toEqual(
      GOLDEN.customCategories.map((c: any) => c.key).sort(),
    );

    // element registry counts (cast excluded — single source is castMembers)
    const elemNames = Object.fromEntries(
      Object.entries(p.breakdownElements).map(([k, v]) => [k, v.map(e => e.name).sort()]),
    );
    expect(elemNames).toEqual(GOLDEN.elements);

    // spot-check scene fields (first + a multi-scene sheet)
    const scene0 = p.scenes[0];
    const g0 = GOLDEN.scenes[0];
    expect(scene0.sceneNumber).toBe(g0.n);
    expect(scene0.sheetNumber).toBe(g0.sheetNumber);
    expect(scene0.scriptPageNumbers).toBe(g0.spn || undefined);
    expect(scene0.pageCount).toBe(g0.pgStr);
    expect(scene0.pageCountDecimal).toBe(g0.pgDec);
    expect(scene0.intExt).toBe(g0.ie);
    // scenes sorted by MMS sheet numbers (script order): sheet 1 is scene 1
    expect(scene0.sceneNumber).toBe('1');
    expect(scene0.sheetNumber).toBe('1');
    expect(scene0.dayNight).toBe(g0.dn);
    expect(scene0.set).toBe(g0.set);
    expect(scene0.scriptDay).toBe(g0.sd);
    expect(scene0.description).toBe(g0.desc);
    expect(scene0.sequence).toBe(g0.seq);
    expect(scene0.unit).toBe(g0.unit);
    const castNamesOf = (idStr: string) =>
      idStr.split(', ').filter(Boolean).map(id => p.castMembers.find(c => c.id === id)?.name);
    expect(castNamesOf(scene0.cast)).toEqual(g0.cast);
    const s18 = p.scenes.find((s: any) => s.sceneNumber === '18');
    const g18 = GOLDEN.scenes.find((g: any) => g.n === '18');
    expect(s18.sheetNumber).toBe(g18.sheetNumber);
    expect(castNamesOf(s18.cast)).toEqual(g18.cast);
    expect(s18.props.split(', ')).toEqual(g18.elems.props);

    const multi = p.scenes.find((s: any) => s.sceneNumber === '135, 137');
    expect(multi).toBeTruthy();
    expect(castNamesOf(multi.cast).sort()).toEqual(['CLARENCE', 'GEORGE']);

    // versions (one per MMS stripboard)
    expect(p.versions).toHaveLength(GOLDEN.versions.length);
    const active = p.versions.find(v => v.id === p.activeVersionId);
    expect(active?.name).toBe(GOLDEN.activeVersion);
    const activeRows = await bridge<any>(page, `b.getRows(b.getProject().activeVersionId)`);
    const sections = activeRows.sections as any[];
    expect(sections.length).toBe(active!.rows.filter((r: any) => r.type === 'DAYBREAK').length);
    // the first production section must carry the first day's content (no
    // phantom empty Day 1 — the pinned daybreak anchors it)
    expect(sections.find((s: any) => !s.isPinned)?.rows.length).toBeGreaterThan(0);

    for (const gv of GOLDEN.versions) {
      const v = p.versions.find((x: any) => x.name === gv.name);
      expect(v, `version ${gv.name}`).toBeTruthy();
      // scheduled strips (stripboard rows, excluding the pinned daybreak) +
      // undated strips (boneyard) = all sheets, in the board's order
      const scheduled = v.rows.filter(
        (r: any) => r.type === 'SCENE' && r.containerId != null && r.containerId !== -1,
      );
      const boneyard = v.rows.filter((r: any) => r.type === 'SCENE' && r.containerId === null);
      expect(scheduled).toHaveLength(
        gv.rows.filter((r: any) => r.k === 's' && !r.n.startsWith('?')).length,
      );
      expect(boneyard).toHaveLength(gv.remaining.length + gv.unscheduled.length);

      const notes = v.rows.filter((r: any) => r.type === 'NOTE');
      expect(notes).toHaveLength(gv.rows.filter((r: any) => r.k === 'n').length);

      // daybreaks: pinned anchor + one break BETWEEN days (N days → N-1 breaks)
      const daybreaks = v.rows.filter((r: any) => r.type === 'DAYBREAK');
      expect(daybreaks[0]?.pinned).toBe(true);
      expect(daybreaks.filter((r: any) => r.pinned)).toHaveLength(1);
      expect(daybreaks.length).toBe(Math.max(gv.dayCount, 1));

      // strip order inside the scheduled region matches the golden exactly
      const byId = new Map(p.scenes.map((s: any) => [s.id, s.sceneNumber]));
      const scheduledLabels = scheduled.map((r: any) => byId.get(r.sceneId));
      expect(scheduledLabels).toEqual(goldenStripLabels(gv));

      expect(v.productionStart).toBe(GOLDEN.calendars[gv.calendar]?.productionStart);
      const expectedNS = GOLDEN.calendars[gv.calendar]?.nonShootDates || [];
      expect((v.nonShootDates || []).map((n: any) => n.date + ':' + n.status)).toEqual(
        expectedNS.map((n: any) => n.date + ':' + n.status),
      );
    }
  });
});
