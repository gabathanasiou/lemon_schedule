import type { TDocumentDefinitions } from '../conf/pdfMakeSetup';
import type { Project, Scene, ScheduleRow, ShootDayMeta, CastMember } from '../../../../types';
import { getFieldItems } from '../../../../lib/categories';
import { getElementsFromScenes } from '../../../../store';
import { PAGE_SIZES, PAGE_MARGINS, BASE_STYLE, formatDateShort, formatDateLong } from '../conf/pdfLayout';

export interface DoodPdfOptions {
  castIds: string[];
  elementIds?: string[];
  selectedCategory?: string;
  dayInts: number[];
  includeNonShooting: boolean;
  showTotals: boolean;
  orientation: 'portrait' | 'landscape';
  paperSize: 'a4' | 'letter';
}

function formatDow(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function getSceneElements(scene: Scene, category: string): string[] {
  const raw = String((scene as any)[category] ?? '');
  return getFieldItems(category, raw);
}

function getElementDisplayName(
  elementId: string,
  isCast: boolean,
  castMemberNames?: Map<string, string>,
  elementNameMap?: Map<string, string>,
): string {
  if (isCast) {
    const name = castMemberNames?.get(elementId) || '\u2014';
    return `${elementId.padStart(3, ' ')}.  ${name}`;
  }
  return elementNameMap?.get(elementId.toLowerCase()) || elementId;
}

interface DoodDay {
  dayInt: number;
  isoDate: string;
  isShooting: boolean;
  status?: string;
  hasGap?: boolean;
}

interface DoodRow {
  elementId: string;
  elementName: string;
  cells: string[];
}

interface DoodTotals {
  workDays: number;
  holdDays: number;
  travelDays: number;
  startDate: string | null;
  finishDate: string | null;
}

function deriveDood(
  scenes: Scene[],
  scheduleRows: ScheduleRow[],
  dayMeta: Record<number, ShootDayMeta>,
  elementIds: string[],
  dayInts: number[],
  includeNonShooting: boolean,
  category: string,
  castMemberNames?: Map<string, string>,
  elementNameMap?: Map<string, string>,
): { days: DoodDay[]; rows: DoodRow[]; totals: Map<string, DoodTotals> } {
  const isCast = category === 'cast';
  const scenesByDay = new Map<number, Scene[]>();
  for (const row of scheduleRows) {
    if (row.type !== 'SCENE' || !row.sceneId) continue;
    const scene = scenes.find(s => s.id === row.sceneId);
    if (!scene) continue;
    if (!scenesByDay.has(row.shootDay)) scenesByDay.set(row.shootDay, []);
    scenesByDay.get(row.shootDay)!.push(scene);
  }

  const shootingDays = new Set(scenesByDay.keys());

  let sortedDayInts = dayInts
    .filter(d => dayMeta[d])
    .sort((a, b) => (dayMeta[a].date || '').localeCompare(dayMeta[b].date || ''));

  if (!includeNonShooting) {
    sortedDayInts = sortedDayInts.filter(d => shootingDays.has(d));
  }

  const days: DoodDay[] = sortedDayInts.map(d => ({
    dayInt: d,
    isoDate: dayMeta[d].date || '',
    isShooting: shootingDays.has(d) && (!dayMeta[d].status || dayMeta[d].status === 'work'),
    status: dayMeta[d].status || undefined,
  }));

  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1].isoDate + 'T00:00:00');
    const cur = new Date(days[i].isoDate + 'T00:00:00');
    if (cur.getTime() - prev.getTime() > 86400000) {
      days[i].hasGap = true;
    }
  }

  const doodRows: DoodRow[] = [];
  const totals = new Map<string, DoodTotals>();

  for (const elementId of elementIds) {
    const appearSet = new Set<number>();
    let firstDate: string | null = null;
    let lastDate: string | null = null;
    for (const d of sortedDayInts) {
      const dayScenes = scenesByDay.get(d);
      if (!dayScenes) continue;
      if (dayScenes.some(s => getSceneElements(s, category).some(e => e.toLowerCase() === elementId))) {
        appearSet.add(d);
        const date = dayMeta[d]?.date || '';
        if (!firstDate || date < firstDate) firstDate = date;
        if (!lastDate || date > lastDate) lastDate = date;
      }
    }

    const cells: string[] = days.map(d => {
      const meta = dayMeta[d.dayInt];
      if (isCast && meta?.status === 'travel' && meta?.castIds) {
        const tIds = meta.castIds.split(',').map(x => x.trim());
        if (tIds.includes(elementId)) return 'T';
      }
      if (!appearSet.has(d.dayInt)) {
        return (firstDate && lastDate && d.isoDate > firstDate && d.isoDate < lastDate) ? 'H' : '';
      }
      if (d.isoDate === firstDate && d.isoDate === lastDate) return 'SWF';
      if (d.isoDate === firstDate) return 'SW';
      if (d.isoDate === lastDate) return 'WF';
      return 'W';
    });

    const workDays = appearSet.size;
    const holdCount = cells.filter(c => c === 'H').length;
    const travelCount = cells.filter(c => c === 'T').length;
    const elementName = getElementDisplayName(elementId, isCast, castMemberNames, elementNameMap);
    const startDate = firstDate;
    const finishDate = lastDate;

    doodRows.push({ elementId, elementName, cells });
    totals.set(elementId, { workDays, holdDays: holdCount, travelDays: travelCount, startDate, finishDate });
  }

  return { days, rows: doodRows, totals };
}

export function buildDoodDoc(project: Project, opts: DoodPdfOptions): TDocumentDefinitions {
  const {
    castIds, elementIds, selectedCategory, dayInts, includeNonShooting,
    showTotals, orientation, paperSize,
  } = opts;

  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const scenes = project.scenes;
  const scheduleRows = activeVersion?.rows || [];
  const dayMeta = activeVersion?.dayMeta || {};
  const castMembers = project.castMembers || [];

  const category = selectedCategory || 'cast';
  const isCast = category === 'cast';
  const ids = isCast ? castIds : (elementIds || []);

  const castMemberNames = new Map<string, string>();
  for (const cm of castMembers) castMemberNames.set(cm.id, cm.name);

  const elementNameMap = new Map<string, string>();
  for (const e of getElementsFromScenes(scenes, category)) {
    elementNameMap.set(e.id.toLowerCase(), e.name);
  }

  const data = deriveDood(
    scenes, scheduleRows, dayMeta, ids, dayInts,
    includeNonShooting, category, castMemberNames, elementNameMap,
  );

  const chronoDayMap = new Map<number, number>();
  let counter = 0;
  for (const d of data.days) {
    if (d.isShooting) { counter++; chronoDayMap.set(d.dayInt, counter); }
  }

  const now = new Date();
  const genDate = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  const genTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  const pageSize = PAGE_SIZES[paperSize];
  const margins = PAGE_MARGINS[orientation];

  const DAY_COL_WIDTH = 16;
  const CAST_COL_WIDTH = 50;

  const dayColWidths = data.days.map(() => DAY_COL_WIDTH);
  const tableWidths: (number | string)[] = [CAST_COL_WIDTH, ...dayColWidths];
  if (showTotals) {
    tableWidths.push(14, 14, 14, 14, 14);
  }

  const FOOTER_CELL_OPTS = { font: 'Helvetica', fontSize: 7, color: '#52525b', alignment: 'center' as const };
  const HEADER_CELL_OPTS = { font: 'Helvetica', fontSize: 7, color: '#000', alignment: 'center' as const };
  const BODY_CELL_OPTS = { font: 'Helvetica', fontSize: 7, color: '#000', alignment: 'center' as const };
  const HEADER_CAST_CELL_OPTS = { font: 'Helvetica', fontSize: 7, color: '#000', alignment: 'right' as const };

  const headerBody: any[][] = [
    [],
    [],
    [],
  ];

  // Row 0: Day/Month
  headerBody[0].push({ text: 'Day/Month', style: 'doodHeader', ...HEADER_CAST_CELL_OPTS });
  for (const d of data.days) {
    headerBody[0].push({
      text: formatDateShort(d.isoDate),
      ...HEADER_CELL_OPTS,
      fillColor: d.isShooting ? undefined : '#d0d0d0',
    });
  }
  if (showTotals) {
    headerBody[0].push({ text: '', ...HEADER_CELL_OPTS });
    headerBody[0].push({ text: '', ...HEADER_CELL_OPTS });
    headerBody[0].push({ text: '', ...HEADER_CELL_OPTS });
    headerBody[0].push({ text: '', ...HEADER_CELL_OPTS });
    headerBody[0].push({ text: '', ...HEADER_CELL_OPTS });
  }

  // Row 1: Day of Week
  headerBody[1].push({ text: 'Day of Week', style: 'doodHeader', ...HEADER_CAST_CELL_OPTS });
  for (const d of data.days) {
    headerBody[1].push({
      text: formatDow(d.isoDate),
      ...HEADER_CELL_OPTS,
      fillColor: d.isShooting ? undefined : '#d0d0d0',
    });
  }
  if (showTotals) {
    headerBody[1].push({ text: 'Work', ...HEADER_CELL_OPTS });
    headerBody[1].push({ text: 'Hold', ...HEADER_CELL_OPTS });
    headerBody[1].push({ text: 'Travel', ...HEADER_CELL_OPTS });
    headerBody[1].push({ text: 'Start', ...HEADER_CELL_OPTS });
    headerBody[1].push({ text: 'Finish', ...HEADER_CELL_OPTS });
  }

  // Row 2: Shooting Day
  headerBody[2].push({ text: 'Shooting Day', style: 'doodHeader' });
  for (const d of data.days) {
    headerBody[2].push({
      text: d.isShooting ? String(chronoDayMap.get(d.dayInt) || '') : d.status === 'hold' ? 'H' : d.status === 'travel' ? 'T' : d.status === 'holiday' ? 'HOL' : '',
      ...HEADER_CELL_OPTS,
      fillColor: d.isShooting ? undefined : '#d0d0d0',
    });
  }
  if (showTotals) {
    headerBody[2].push({ text: '', ...HEADER_CELL_OPTS });
    headerBody[2].push({ text: '', ...HEADER_CELL_OPTS });
    headerBody[2].push({ text: '', ...HEADER_CELL_OPTS });
    headerBody[2].push({ text: '', ...HEADER_CELL_OPTS });
    headerBody[2].push({ text: '', ...HEADER_CELL_OPTS });
  }

  const dataBody: any[][] = [];
  for (const row of data.rows) {
    const bodyRow: any[] = [
      { text: row.elementName, ...BODY_CELL_OPTS, alignment: 'left' as const },
    ];
    for (const code of row.cells) {
      bodyRow.push({ text: code, ...BODY_CELL_OPTS });
    }
    if (showTotals) {
      const t = data.totals.get(row.elementId);
      const startStr = t?.startDate ? formatDateShort(t.startDate) : '';
      const finishStr = t?.finishDate ? formatDateShort(t.finishDate) : '';
      bodyRow.push({ text: t && t.workDays > 0 ? String(t.workDays) : '', ...BODY_CELL_OPTS });
      bodyRow.push({ text: t && t.holdDays > 0 ? String(t.holdDays) : '', ...BODY_CELL_OPTS });
      bodyRow.push({ text: t && t.travelDays > 0 ? String(t.travelDays) : '', ...BODY_CELL_OPTS });
      bodyRow.push({ text: startStr || '', ...BODY_CELL_OPTS });
      bodyRow.push({ text: finishStr || '', ...BODY_CELL_OPTS });
    }
    dataBody.push(bodyRow);
  }

  const title = project.title || 'Production Schedule';
  const categoryLabel = category === 'cast' ? 'Cast' : category;

  return {
    pageSize,
    pageOrientation: orientation === 'landscape' ? 'landscape' : 'portrait',
    pageMargins: [margins[0], margins[1], margins[2], margins[3]],
    defaultStyle: { font: 'Helvetica', fontSize: 7, lineHeight: 1.3, color: '#000' },
    footer: (currentPage: number, pageCount: number) => ({
      text: `${title} \u2014 Day Out of Days \u2014 ${genDate} ${genTime} \u2014 Page ${currentPage} of ${pageCount}`,
      alignment: 'center',
      font: 'Helvetica',
      fontSize: 7,
      color: '#52525b',
    }),
    content: [
      {
        stack: [
          {
            table: {
              widths: ['auto', '*', 'auto'],
              body: [[
                { text: title, font: 'Helvetica', fontSize: 9, bold: true, alignment: 'left' },
                { text: `Day Out of Days Report for ${categoryLabel}`, font: 'Helvetica', fontSize: 9, bold: true, alignment: 'center' },
                { text: `${genDate}  ${genTime}`, font: 'Helvetica', fontSize: 9, bold: true, alignment: 'right' },
              ]],
            },
            layout: {
              hLineWidth: (i: number, node: any) => i === node.table.body.length ? 1 : 0,
              vLineWidth: () => 0,
              hLineColor: () => '#999',
              paddingLeft: () => 0,
              paddingRight: () => 0,
              paddingTop: () => 0,
              paddingBottom: () => 6,
            },
          },
          {
            table: {
              widths: tableWidths,
              headerRows: 3,
              dontBreakRows: true,
              body: [...headerBody, ...dataBody],
            },
            layout: {
              hLineWidth: (i: number) => i === 3 ? 2 : 1,
              vLineWidth: () => 1,
              hLineColor: () => '#999',
              vLineColor: (i: number, node: any) => {
                // Gap cells get dotted border, totals get solid border
                const dayCount = data.days.length;
                const headerCount = 3;
                if (i >= headerCount && i < headerCount + dayCount) {
                  return '#999';
                }
                return '#999';
              },
              paddingLeft: () => 2,
              paddingRight: () => 2,
              paddingTop: () => 1,
              paddingBottom: () => 1,
            },
          },
        ],
      },
    ],
  };
}
