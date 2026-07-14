import React, { useMemo } from 'react';
import { Scene, ScheduleRow, CastMember, NonShootDate } from '../../types';
import { getElementsFromScenes } from '../../store';
import { BASE_PRINT_RESET } from './shared/basePrintCss';
import { DEFAULT_CATEGORY_LABELS, getFieldItems } from '../../lib/categories';

function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDow(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

const DOOD_CSS = `
${BASE_PRINT_RESET}
@page { size: portrait; margin: 10mm 12mm; }
.dood-root {
  font-family: Helvetica, sans-serif;
  font-size: 7pt;
  line-height: 1.3;
  color: #000000;
  width: 100%;
  background: #ffffff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.dood-title {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding-bottom: 6pt;
  margin-bottom: 6pt;
  border-bottom: 1pt solid #999;
}
.dood-title-left { text-align: left; font-weight: 700; font-size: 9pt; }
.dood-title-center { text-align: center; text-transform: uppercase; font-weight: 700; font-size: 9pt; }
.dood-title-right { text-align: right; font-weight: 700; font-size: 9pt; }
.dood-gen { color: #52525b; margin-top: 1pt; }
.dood-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}
.dood-table th, .dood-table td {
  border: 1px solid #999;
  padding: 1pt 2pt;
  vertical-align: middle;
  text-align: center;
  font-weight: 400;
}
.dood-col-cast { }
th.dood-col-cast { text-align: right; }
td.dood-col-cast { text-align: left; }
.dood-table thead tr:last-child th { border-bottom-width: 2px; }
.dood-day-cell { white-space: nowrap; }
.dood-grey { background: #d0d0d0; }
.dood-gap-cell { border-left: 1px dotted #666; }
.dood-total-border { border-left: 1px solid #999; white-space: nowrap; }
.dood-footer { font-size: 7pt; color: #52525b; margin-top: 4pt; }
.dood-page-break { page-break-before: always; break-before: page; }
`;

const DAYS_PER_PAGE = 9;

interface DoodDay {
  dayInt: number;
  isoDate: string;
  isShooting: boolean;
  nonShootStatus?: string;
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

function getSceneElements(scene: Scene, category: string): string[] {
  const raw = String((scene as any)[category] ?? '');
  return getFieldItems(category, raw);
}

function getElementDisplayName(elementId: string, isCast: boolean, castMemberNames?: Map<string, string>, elementNameMap?: Map<string, string>): string {
  if (isCast) {
    const name = castMemberNames?.get(elementId) || '—';
    return `${elementId.padStart(3, ' ')}.  ${name}`;
  }
  return elementNameMap?.get(elementId.toLowerCase()) || elementId;
}

function deriveDood(
  scenes: Scene[],
  scheduleRows: ScheduleRow[],
  productionStart: string,
  nonShootDates: NonShootDate[],
  elementIds: string[],
  dayInts: number[],
  includeNonShooting: boolean,
  category: string,
  castMemberNames?: Map<string, string>,
  elementNameMap?: Map<string, string>,
): { days: DoodDay[]; rows: DoodRow[]; totals: Map<string, DoodTotals> } {
  const isCast = category === 'cast';
  const nonShootByDate = new Map(nonShootDates?.map(n => [n.date, n]) || []);
  const scenesByDay = new Map<number, Scene[]>();
  for (const row of scheduleRows) {
    if (row.type !== 'SCENE' || !row.sceneId) continue;
    const scene = scenes.find(s => s.id === row.sceneId);
    if (!scene) continue;
    if (!scenesByDay.has(row.containerId)) scenesByDay.set(row.containerId, []);
    scenesByDay.get(row.containerId)!.push(scene);
  }

  const shootingDays = new Set(scenesByDay.keys());

  const addDays = (d: string, n: number) => { const p = d.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); };
  const nonShootSet = new Set((nonShootDates || []).map(n => n.date));
  const containerIds = [...new Set(scheduleRows.filter(r => r.containerId != null).map(r => r.containerId!))].sort((a, b) => a - b);
  const containerDateMap = new Map<number, string>();
  let currentDate = productionStart;
  for (const cid of containerIds) {
    while (nonShootSet.has(currentDate)) currentDate = addDays(currentDate, 1);
    containerDateMap.set(cid, currentDate);
    currentDate = addDays(currentDate, 1);
  }

  let sortedDayInts = dayInts
    .filter(d => containerDateMap.has(d))
    .sort((a, b) => (containerDateMap.get(a) || '').localeCompare(containerDateMap.get(b) || ''));

  if (!includeNonShooting) {
    sortedDayInts = sortedDayInts.filter(d => shootingDays.has(d));
  }

  const days: DoodDay[] = sortedDayInts.map(d => {
    const isoDate = containerDateMap.get(d) || '';
    const ns = nonShootByDate.get(isoDate);
    return {
      dayInt: d,
      isoDate,
      isShooting: shootingDays.has(d),
      nonShootStatus: ns?.status || undefined,
    };
  });

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
        const date = containerDateMap.get(d) || '';
        if (!firstDate || date < firstDate) firstDate = date;
        if (!lastDate || date > lastDate) lastDate = date;
      }
    }

    const cells: string[] = days.map(d => {
      const ns = nonShootByDate.get(d.isoDate);
      if (isCast && ns?.status === 'travel' && ns?.castIds) {
        const tIds = ns.castIds.split(',').map(x => x.trim());
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

    const swDays = appearSet.size > 0 ? 1 : 0;
    const workDays = appearSet.size;
    const holdCount = cells.filter(c => c === 'H').length;
    const travelCount = cells.filter(c => c === 'T').length;
    const totalDays = workDays + holdCount + travelCount;
    const elementName = getElementDisplayName(elementId, isCast, castMemberNames, elementNameMap);
    const startDate = firstDate;
    const finishDate = lastDate;

    doodRows.push({ elementId, elementName, cells } as DoodRow);
    totals.set(elementId, { workDays, holdDays: holdCount, travelDays: travelCount, startDate, finishDate });
  }

  return { days, rows: doodRows, totals };
}

interface DoodProps {
  title: string;
  scenes: Scene[];
  scheduleRows: ScheduleRow[];
  productionStart?: string;
  nonShootDates?: NonShootDate[];
  castMembers?: CastMember[];
  elementIds: string[];
  dayInts: number[];
  includeNonShooting: boolean;
  showTotals: boolean;
  category?: string;
}

const Dood: React.FC<DoodProps> = ({
  title,
  scenes,
  scheduleRows,
  productionStart,
  nonShootDates,
  castMembers,
  elementIds,
  dayInts,
  includeNonShooting,
  showTotals,
  category = 'cast',
}) => {
  const castMemberNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const cm of castMembers || []) m.set(cm.id, cm.name);
    return m;
  }, [castMembers]);

  const elementNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of getElementsFromScenes(scenes, category)) {
      m.set(e.id.toLowerCase(), e.name);
    }
    return m;
  }, [scenes, category]);

  const data = useMemo(() => deriveDood(
    scenes, scheduleRows, productionStart || new Date().toISOString().slice(0, 10), nonShootDates || [], elementIds, dayInts, includeNonShooting, category, castMemberNames, elementNameMap,
  ), [scenes, scheduleRows, productionStart, nonShootDates, elementIds, dayInts, includeNonShooting, category, castMemberNames, elementNameMap]);

  const chronoDayMap = useMemo(() => {
    const m = new Map<number, number>();
    let counter = 0;
    for (const d of data.days) {
      if (d.isShooting) { counter++; m.set(d.dayInt, counter); }
    }
    return m;
  }, [data.days]);

  const now = new Date();
  const genDate = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  const genTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  const groups: { days: DoodDay[]; startIdx: number }[] = [];
  for (let i = 0; i < data.days.length; i += DAYS_PER_PAGE) {
    groups.push({ days: data.days.slice(i, i + DAYS_PER_PAGE), startIdx: i });
  }

  return (
    <div className="dood-root">
      <style>{DOOD_CSS}</style>

      {groups.map((group, gi) => {
        const isLast = gi === groups.length - 1;

        return (
          <div key={gi} className={gi > 0 ? 'dood-page-break' : ''}>
            <div className="dood-title">
              <div>
                <div className="dood-title-left">{title}</div>
                <div className="dood-gen">{genDate}  {genTime}</div>
              </div>
              <div className="dood-title-center">Day Out of Days Report for Cast Members</div>
              <div className="dood-title-right">Page {gi + 1} of {groups.length}</div>
            </div>

            <table className="dood-table">
              <colgroup>
                <col style={{ width: '30pt' }} />
                {group.days.map((_, ci) => <col key={ci} style={{ width: '16pt' }} />)}
                {isLast && showTotals && <col span={5} style={{ width: '14pt' }} />}
              </colgroup>
              <thead>
                <tr>
                  <th className="dood-col-cast">Day/Month</th>
                  {group.days.map(d => (
                    <th key={d.dayInt} className={`dood-day-cell ${d.isShooting ? '' : 'dood-grey'} ${d.hasGap ? 'dood-gap-cell' : ''}`}>
                      {formatDateShort(d.isoDate)}
                    </th>
                  ))}
                  {isLast && showTotals && (
                    <>
                      <th className="dood-total-border" />
                      <th className="dood-total-border" />
                      <th className="dood-total-border" />
                      <th className="dood-total-border" />
                      <th className="dood-total-border" />
                    </>
                  )}
                </tr>
                <tr>
                  <th className="dood-col-cast">Day of Week</th>
                  {group.days.map(d => (
                    <th key={d.dayInt} className={`dood-day-cell ${d.isShooting ? '' : 'dood-grey'} ${d.hasGap ? 'dood-gap-cell' : ''}`}>
                      {formatDow(d.isoDate)}
                    </th>
                  ))}
                  {isLast && showTotals && (
                    <>
                      <th className="dood-total-border">Work</th>
                      <th className="dood-total-border">Hold</th>
                      <th className="dood-total-border">Travel</th>
                      <th className="dood-total-border">Start</th>
                      <th className="dood-total-border">Finish</th>
                    </>
                  )}
                </tr>
                <tr>
                  <th className="dood-col-cast">Shooting Day</th>
                  {group.days.map((d, ci) => (
                    <th key={d.dayInt} className={`dood-day-cell ${d.isShooting ? '' : 'dood-grey'} ${d.hasGap ? 'dood-gap-cell' : ''}`}>
                      {d.isShooting ? chronoDayMap.get(d.dayInt) : d.nonShootStatus === 'hold' ? 'H' : d.nonShootStatus === 'travel' ? 'T' : d.nonShootStatus === 'holiday' ? 'DO' : ''}
                    </th>
                  ))}
                  {isLast && showTotals && (
                    <>
                      <th className="dood-total-border" />
                      <th className="dood-total-border" />
                      <th className="dood-total-border" />
                      <th className="dood-total-border" />
                      <th className="dood-total-border" />
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.rows.map(row => (
                  <tr key={row.elementId}>
                    <td className="dood-col-cast">{row.elementName}</td>
                    {group.days.map((d, ci) => {
                      const code = row.cells[group.startIdx + ci];
                      return (
                        <td key={ci} className={`dood-day-cell ${d.isShooting ? '' : 'dood-grey'} ${d.hasGap ? 'dood-gap-cell' : ''}`}>
                          {code}
                        </td>
                      );
                    })}
                    {isLast && showTotals && (() => {
                      const t = data.totals.get(row.elementId);
                      if (!t) return null;
                      const startStr = t.startDate ? formatDateShort(t.startDate) : '';
                      const finishStr = t.finishDate ? formatDateShort(t.finishDate) : '';
                      return (
                        <>
                          <td className="dood-total-border">{t.workDays > 0 ? t.workDays : ''}</td>
                          <td className="dood-total-border">{t.holdDays > 0 ? t.holdDays : ''}</td>
                          <td className="dood-total-border">{t.travelDays > 0 ? t.travelDays : ''}</td>
                          <td className="dood-total-border">{startStr || ''}</td>
                          <td className="dood-total-border">{finishStr || ''}</td>
                        </>
                      );
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="dood-footer">
        {title} — Day Out of Days — {genDate} {genTime}
      </div>
    </div>
  );
};

export default Dood;
