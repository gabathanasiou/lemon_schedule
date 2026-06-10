import React, { useMemo } from 'react';
import { Scene, ScheduleRow, ShootDayMeta, CastMember } from '../../types';
import { BASE_PRINT_RESET } from './shared/basePrintCss';

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
.dood-total-border { border-left: 1px solid #999; white-space: nowrap; }
.dood-footer { font-size: 7pt; color: #52525b; margin-top: 4pt; }
.dood-page-break { page-break-before: always; break-before: page; }
`;

const DAYS_PER_PAGE = 9;

interface DoodDay {
  dayInt: number;
  isoDate: string;
  isShooting: boolean;
  status?: string;
}

interface DoodRow {
  castId: string;
  castName: string;
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
  castIds: string[],
  dayInts: number[],
  includeNonShooting: boolean,
  castMembers: CastMember[],
): { days: DoodDay[]; rows: DoodRow[]; totals: Map<string, DoodTotals> } {
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

  const doodRows: DoodRow[] = [];
  const totals = new Map<string, DoodTotals>();

  for (const castId of castIds) {
    const appearanceDays: number[] = [];
    for (const d of sortedDayInts) {
      const dayScenes = scenesByDay.get(d);
      if (!dayScenes) continue;
      if (dayScenes.some(s => s.cast.split(',').map(c => c.trim()).includes(castId))) {
        appearanceDays.push(d);
      }
    }

    const appearSet = new Set(appearanceDays);
    const first = appearanceDays.length > 0 ? Math.min(...appearanceDays) : null;
    const last = appearanceDays.length > 0 ? Math.max(...appearanceDays) : null;

    const holdDays = new Set<number>();
    if (first != null && last != null && first !== last) {
      for (const d of sortedDayInts) {
        if (d > first && d < last && !appearSet.has(d)) {
          holdDays.add(d);
        }
      }
    }

    const cells: string[] = days.map(d => {
      const meta = dayMeta[d.dayInt];
      if (meta?.status === 'travel' && meta?.castIds) {
        const tIds = meta.castIds.split(',').map(x => x.trim());
        if (tIds.includes(castId)) return 'T';
      }
      if (!appearSet.has(d.dayInt)) {
        return holdDays.has(d.dayInt) ? 'H' : '';
      }
      if (d.dayInt === first && d.dayInt === last) return 'SWF';
      if (d.dayInt === first) return 'SW';
      if (d.dayInt === last) return 'WF';
      return 'W';
    });

    const swDays = appearanceDays.length > 0 ? 1 : 0;
    const workDays = appearanceDays.length;
    const holdCount = holdDays.size;
    let travelCount = 0;
    for (const d of sortedDayInts) {
      if (dayMeta[d]?.status === 'travel' && dayMeta[d]?.castIds) {
        const ids = dayMeta[d].castIds!.split(',').map(x => x.trim());
        if (ids.includes(castId)) travelCount++;
      }
    }
    const totalDays = workDays + holdCount + travelCount;
    const castName = castMembers.find(m => m.id === castId)?.name || '—';
    const startDate = first != null ? (dayMeta[first]?.date || null) : null;
    const finishDate = last != null ? (dayMeta[last]?.date || null) : null;

    doodRows.push({ castId, castName, cells } as DoodRow);
    totals.set(castId, { workDays, holdDays: holdCount, travelDays: travelCount, startDate, finishDate });
  }

  return { days, rows: doodRows, totals };
}

interface DoodProps {
  title: string;
  scenes: Scene[];
  scheduleRows: ScheduleRow[];
  dayMeta: Record<number, ShootDayMeta>;
  castMembers: CastMember[];
  castIds: string[];
  dayInts: number[];
  includeNonShooting: boolean;
  showTotals: boolean;
}

const Dood: React.FC<DoodProps> = ({
  title,
  scenes,
  scheduleRows,
  dayMeta,
  castMembers,
  castIds,
  dayInts,
  includeNonShooting,
  showTotals,
}) => {
  const data = useMemo(() => deriveDood(
    scenes, scheduleRows, dayMeta, castIds, dayInts, includeNonShooting, castMembers,
  ), [scenes, scheduleRows, dayMeta, castIds, dayInts, includeNonShooting, castMembers]);

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
                    <th key={d.dayInt} className={`dood-day-cell ${d.isShooting ? '' : 'dood-grey'}`}>
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
                    <th key={d.dayInt} className={`dood-day-cell ${d.isShooting ? '' : 'dood-grey'}`}>
                      {formatDow(d.isoDate)}
                    </th>
                  ))}
                  {isLast && showTotals && (
                    <>
                      <th className="dood-total-border">Travel</th>
                      <th className="dood-total-border">Work</th>
                      <th className="dood-total-border">Hold</th>
                      <th className="dood-total-border">Start</th>
                      <th className="dood-total-border">Finish</th>
                    </>
                  )}
                </tr>
                <tr>
                  <th className="dood-col-cast">Shooting Day</th>
                  {group.days.map((d, ci) => (
                    <th key={d.dayInt} className={`dood-day-cell ${d.isShooting ? '' : 'dood-grey'}`}>
                      {d.isShooting ? chronoDayMap.get(d.dayInt) : d.status === 'hold' ? 'H' : d.status === 'travel' ? 'T' : d.status === 'holiday' ? 'HOL' : ''}
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
                  <tr key={row.castId}>
                    <td className="dood-col-cast">{String(row.castId).padStart(3, ' ')}.{'  '}{row.castName}</td>
                    {group.days.map((d, ci) => {
                      const code = row.cells[group.startIdx + ci];
                      return (
                        <td key={ci} className={`dood-day-cell ${d.isShooting ? '' : 'dood-grey'}`}>
                          {code}
                        </td>
                      );
                    })}
                    {isLast && showTotals && (() => {
                      const t = data.totals.get(row.castId);
                      if (!t) return null;
                      const startStr = t.startDate ? formatDateShort(t.startDate) : '';
                      const finishStr = t.finishDate ? formatDateShort(t.finishDate) : '';
                      return (
                        <>
                          <td className="dood-total-border">{t.travelDays > 0 ? t.travelDays : ''}</td>
                          <td className="dood-total-border">{t.workDays > 0 ? t.workDays : ''}</td>
                          <td className="dood-total-border">{t.holdDays > 0 ? t.holdDays : ''}</td>
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
