import React, { useMemo } from 'react';
import { Scene, ScheduleRow, CastMember, NonShootDate, DayTypeDef } from '../../types';
import { getElementsFromScenes } from '../../store';
import { BASE_PRINT_RESET } from './shared/basePrintCss';
import { DEFAULT_CATEGORY_LABELS } from '../../lib/categories';
import { deriveDood, DoodDay } from '../../lib/nonShootStats';
import { visualForType, dayTypeTextColor, codeForType, resolveDayTypes } from '../../lib/dayTypes';

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
  dayTypes?: DayTypeDef[];
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
  dayTypes,
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

  const typeCodes = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of resolveDayTypes(dayTypes)) m.set(t.key, codeForType(dayTypes, t.key));
    return m;
  }, [dayTypes]);

  const data = useMemo(() => deriveDood(
    scenes, scheduleRows, productionStart || new Date().toISOString().slice(0, 10), nonShootDates || [], elementIds, dayInts, includeNonShooting, category, castMemberNames, elementNameMap, typeCodes,
  ), [scenes, scheduleRows, productionStart, nonShootDates, elementIds, dayInts, includeNonShooting, category, castMemberNames, elementNameMap, typeCodes]);

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

  // Count columns for in-use custom attachable types (travel/hold already have
  // their own Work/Hold/Travel columns).
  const usedStatuses = new Set(data.days.map(d => d.nonShootStatus).filter(Boolean) as string[]);
  const typeColumns = resolveDayTypes(dayTypes).filter(t =>
    t.attachable === true && t.key !== 'travel' && t.key !== 'hold' && usedStatuses.has(t.key));

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
                {isLast && showTotals && typeColumns.map(t => <col key={t.key} style={{ width: '14pt' }} />)}
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
                      {typeColumns.map(t => <th key={t.key} className="dood-total-border">{codeForType(dayTypes, t.key)}</th>)}
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
                      {typeColumns.map(t => <th key={t.key} className="dood-total-border">{t.label}</th>)}
                    </>
                  )}
                </tr>
                <tr>
                  <th className="dood-col-cast">Shooting Day</th>
                  {group.days.map((d, ci) => {
                    const v = visualForType(dayTypes, d.nonShootStatus);
                    return (
                      <th key={d.dayInt} className={`dood-day-cell ${d.isShooting ? '' : 'dood-grey'} ${d.hasGap ? 'dood-gap-cell' : ''}`}
                        style={!d.isShooting && v?.color ? { background: v.color, color: dayTypeTextColor(v.color) } : undefined}>
                        {d.isShooting ? chronoDayMap.get(d.dayInt) : v?.label ?? ''}
                      </th>
                    );
                  })}
                  {isLast && showTotals && (
                    <>
                      <th className="dood-total-border" />
                      <th className="dood-total-border" />
                      <th className="dood-total-border" />
                      <th className="dood-total-border" />
                      <th className="dood-total-border" />
                      {typeColumns.map(t => <th key={t.key} className="dood-total-border">{codeForType(dayTypes, t.key)}</th>)}
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
                          {typeColumns.map(tc => (
                            <td key={tc.key} className="dood-total-border">{((t.typeDayLists[tc.key] || []).length > 0) ? t.typeDayLists[tc.key]!.length : ''}</td>
                          ))}
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
        {title} - Day Out of Days - {genDate} {genTime}
      </div>
    </div>
  );
};

export default Dood;
