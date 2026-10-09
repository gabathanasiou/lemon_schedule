import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildNonShootSet, computeRowData } from '../daybreakUtils';
import { buildReportCtx, resolveCollection, type ReportCtx } from '../reportData';
import { makeReportBlock } from '../reportBlocks';
import { getReportFieldMap, resolveReportTokensHtml } from '../reportFields';
import { sampleRepeatItem } from '../reportSampling';

// Roadmap 197: day repeats sample Day 1 of the ACTIVE schedule/calendar, and
// the text-block ↔ free-table-cell per-day breakdown union stays identical.
// Built on the committed hermetic seed via the same pure pipeline the app uses.

const SEED = fileURLToPath(new URL('../../../e2e/fixtures/seed.lemon', import.meta.url));

function seedProject(mutate?: (p: any) => void): any {
  const project = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  mutate?.(project);
  return project;
}

function buildCtx(project: any): ReportCtx {
  const version = project.versions.find((v: any) => v.id === project.activeVersionId) || project.versions[0];
  const calendar =
    (project.calendarVersions || []).find((c: any) => c.id === project.activeCalendarVersionId) ||
    (project.calendarVersions || [])[0];
  const containerRows = version.rows
    .filter((r: any) => r.containerId != null && r.containerId !== -1)
    .sort((a: any, b: any) => (a.containerId || 0) - (b.containerId || 0) || a.order - b.order);
  const nonShootSet = buildNonShootSet(calendar?.nonShootDates);
  const startDate = calendar?.productionStart || '2026-01-01';
  const firstDaybreak = containerRows.find((r: any) => r.type === 'DAYBREAK');
  const daybreak = computeRowData(containerRows, project.scenes, startDate, nonShootSet, firstDaybreak?.daybreakCallTime);
  return buildReportCtx(project, version, calendar, { sections: daybreak.sections, computedRows: daybreak.computedRows });
}

function wardrobeRepeat(): any {
  return makeReportBlock('repeat', {
    collection: 'days',
    children: [makeReportBlock('text', { text: '<p>{{wardrobe}}</p>' })],
  });
}

function sampledDayOf(project: any): any {
  const ctx = buildCtx(project);
  return sampleRepeatItem(ctx, wardrobeRepeat(), getReportFieldMap(project), undefined);
}

describe('sampleRepeatItem — day repeats show Day 1', () => {
  it('samples Day 1 even when later days carry the data (matches preview page 1)', () => {
    const probe = buildCtx(seedProject());
    const days = resolveCollection(probe, 'days', undefined, undefined) as any[];
    const last = days[days.length - 1];
    const lastSceneIds = probe.sceneInfos.filter(si => si.chronoDay === last.chronoDay).map(si => si.scene.id);
    expect(lastSceneIds.length).toBeGreaterThan(0);

    const project = seedProject((p) => {
      for (const s of p.scenes) s.wardrobe = '';
      for (const id of lastSceneIds) p.scenes.find((s: any) => s.id === id).wardrobe = 'DERBY';
    });
    const ctx = buildCtx(project);
    const sampled = sampledDayOf(project);
    expect(sampled.chronoDay).toBe(1);
    expect(sampled.section.index).toBe(ctx.dayInfos[0].section.index);
    // The canvas shows the same blank Day-1 value preview page 1 renders.
    expect(resolveReportTokensHtml(ctx, getReportFieldMap(project), '<p>{{wardrobe}}</p>', sampled)).not.toContain('DERBY');
  });

  it('names Day 1 of the ACTIVE calendar version (dates follow the selection)', () => {
    const project = seedProject((p) => {
      const cal = JSON.parse(JSON.stringify(p.calendarVersions.find((c: any) => c.id === p.activeCalendarVersionId)));
      cal.id = 'cal-alt';
      cal.productionStart = '2026-10-01';
      cal.nonShootDates = [];
      p.calendarVersions.push(cal);
      p.activeCalendarVersionId = cal.id;
    });
    const ctx = buildCtx(project);
    const sampled = sampledDayOf(project);
    expect(sampled.date).toBe(ctx.dayInfos[0].date);
    expect(sampled.date).toBe('2026-10-01');
  });

  it('names the first day of the ACTIVE schedule version (call time follows the selection)', () => {
    const project = seedProject((p) => {
      const v = JSON.parse(JSON.stringify(p.versions.find((x: any) => x.id === p.activeVersionId)));
      v.id = 'v-alt';
      v.rows.find((r: any) => r.type === 'DAYBREAK' && r.pinned).daybreakCallTime = '05:15';
      p.versions.push(v);
      p.activeVersionId = v.id;
    });
    expect(sampledDayOf(project).callTime).toBe('05:15');
  });

  it('always returns one item (never null) for a non-empty collection', () => {
    const item = sampledDayOf(seedProject());
    expect(item?.section?.index).toBeGreaterThanOrEqual(0);
  });
});

describe('sampleRepeatItem — designer day picker (roadmap 198)', () => {
  const sampleWithDay = (project: any, previewSectionIndex?: number): any => {
    const ctx = buildCtx(project);
    return sampleRepeatItem(ctx, wardrobeRepeat(), getReportFieldMap(project), undefined, undefined, undefined, previewSectionIndex);
  };

  it('samples the picked production day instead of Day 1, and its values resolve', () => {
    const probe = buildCtx(seedProject());
    const days = resolveCollection(probe, 'days', undefined, undefined) as any[];
    const picked = days[days.length - 1];
    const pickedSceneIds = probe.sceneInfos.filter(si => si.sectionIndex === picked.section.index).map(si => si.scene.id);
    expect(pickedSceneIds.length).toBeGreaterThan(0);

    const project = seedProject((p) => {
      for (const s of p.scenes) s.wardrobe = '';
      for (const id of pickedSceneIds) p.scenes.find((s: any) => s.id === id).wardrobe = 'DERBY';
    });
    const ctx = buildCtx(project);
    const item = sampleRepeatItem(ctx, wardrobeRepeat(), getReportFieldMap(project), undefined, undefined, undefined, picked.section.index);
    expect(item.section.index).toBe(picked.section.index);
    expect(item.chronoDay).toBe(picked.chronoDay);
    expect(resolveReportTokensHtml(ctx, getReportFieldMap(project), '<p>{{wardrobe}}</p>', item)).toContain('DERBY');
  });

  it('falls back to Day 1 when the picked section no longer exists', () => {
    const project = seedProject();
    const ctx = buildCtx(project);
    const item = sampleWithDay(project, 99_999);
    expect(item.section.index).toBe(ctx.dayInfos[0].section.index);
  });
});

describe('day union parity — text block vs free-table cell', () => {
  it('resolves the same consolidated, de-duplicated union of the day\'s scenes', () => {
    const probe = buildCtx(seedProject());
    const day1 = (resolveCollection(probe, 'days', undefined, undefined) as any[])[0];
    const day1Scenes = probe.sceneInfos.filter(si => si.chronoDay === day1.chronoDay);
    expect(day1Scenes.length).toBeGreaterThan(1);
    const project = seedProject((p) => {
      for (const s of p.scenes) s.wardrobe = '';
      p.scenes.find((s: any) => s.id === day1Scenes[0].scene.id).wardrobe = 'Derby';
      p.scenes.find((s: any) => s.id === day1Scenes[1].scene.id).wardrobe = 'Army Uniform, Derby';
    });
    const ctx = buildCtx(project);
    const fieldMap = getReportFieldMap(project);
    const day = (resolveCollection(ctx, 'days', undefined, undefined) as any[])[0];

    const textHtml = resolveReportTokensHtml(ctx, fieldMap, '<p>{{wardrobe}}</p>', day);
    expect(textHtml).toContain('Derby, Army Uniform');

    const table = makeReportBlock('table', {
      custom: true,
      customRows: [{ id: 'r1', cells: ['<p>{{wardrobe}}</p>'] }],
      columns: [{ id: 'c1', field: '', width: 100 }],
    });
    const cellHtml = resolveReportTokensHtml(ctx, fieldMap, table.customRows![0].cells[0], day, undefined, {
      cellRef: { block: table, rowId: 'r1', colId: 'c1' },
    });
    expect(cellHtml).toBe(textHtml);
  });
});
