import React, { useMemo } from 'react';
import { Scene, ScheduleRow, ShootDayMeta } from '../../types';
import { formatPageCount } from '../../lib/utils';
import { BASE_PRINT_RESET } from './shared/basePrintCss';

const CSS = `
${BASE_PRINT_RESET}
@page { size: portrait; margin: 10mm 12mm; }
.sp-root {
  font-family: Helvetica, Arial, sans-serif;
  font-size: 8pt;
  line-height: 1.3;
  color: #000;
  width: 100%;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.sp-title {
  display: flex;
  justify-content: space-between;
  border-bottom: 1pt solid #999;
  padding-bottom: 6pt;
  margin-bottom: 8pt;
}
.sp-title-left { font-weight: 700; font-size: 10pt; }
.sp-title-center { text-align: center; text-transform: uppercase; font-weight: 700; font-size: 10pt; }
.sp-title-right { text-align: right; font-weight: 700; font-size: 10pt; }
.sp-day-sep {
  background: #000;
  color: #fff;
  padding: 4pt 6pt;
  font-weight: 700;
  font-size: 9pt;
  margin-top: 8pt;
  margin-bottom: 2pt;
}
.sp-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 2pt;
}
.sp-table th, .sp-table td {
  border: 1px solid #999;
  padding: 1.5pt 3pt;
  vertical-align: middle;
  text-align: left;
  font-size: 7.5pt;
}
.sp-table th {
  text-align: center;
  font-weight: 700;
  font-size: 7pt;
  background: #f5f5f5;
}
.sp-num { width: 30pt; text-align: center; }
.sp-ie { width: 30pt; text-align: center; }
.sp-dn { width: 36pt; text-align: center; }
.sp-pages { width: 30pt; text-align: center; }
.sp-total { text-align: right; font-size: 7.5pt; margin-top: 2pt; padding: 2pt 0; border-top: 1px solid #999; }
.sp-footer { font-size: 7pt; color: #666; margin-top: 6pt; }
`;

interface ShootingPlanProps {
  title: string;
  scenes: Scene[];
  rows: ScheduleRow[];
  dayMeta: Record<number, ShootDayMeta>;
  dayInts: number[];
}

function formatDayLong(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const ShootingPlan: React.FC<ShootingPlanProps> = ({ title, scenes, rows, dayMeta, dayInts }) => {
  const sortedDays = useMemo(() =>
    dayInts
      .filter(d => dayMeta[d])
      .sort((a, b) => (dayMeta[a].date || '').localeCompare(dayMeta[b].date || '')),
  [dayInts, dayMeta]);

  const sceneMap = useMemo(() => {
    const m = new Map<string, Scene>();
    for (const s of scenes) m.set(s.id, s);
    return m;
  }, [scenes]);

  const now = new Date();
  const genStr = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="sp-root">
      <style>{CSS}</style>
      <div className="sp-title">
        <div className="sp-title-left">{title}</div>
        <div className="sp-title-center">Shooting Plan</div>
        <div className="sp-title-right">{genStr}</div>
      </div>

      {sortedDays.map((dayInt, di) => {
        const meta = dayMeta[dayInt];
        const dayRows = rows.filter(r => r.shootDay === dayInt).sort((a, b) => a.order - b.order);
        const scenesInDay = dayRows.filter(r => r.type === 'SCENE' && r.sceneId).map(r => sceneMap.get(r.sceneId!)).filter(Boolean) as Scene[];
        const totalPages = scenesInDay.reduce((sum, s) => sum + s.pageCountDecimal, 0);
        const pageCount = totalPages > 0 ? formatPageCount(Math.round(totalPages * 8)) : '—';

        return (
          <div key={dayInt}>
            <div className="sp-day-sep">
              SHOOTING DAY {di + 1} — {meta?.date ? formatDayLong(meta.date) : ''}
            </div>
            <table className="sp-table">
              <thead>
                <tr>
                  <th className="sp-num">Scene</th>
                  <th className="sp-ie">I/E</th>
                  <th className="sp-dn">D/N</th>
                  <th style={{width:'80pt'}}>Set</th>
                  <th style={{width:'80pt'}}>Location</th>
                  <th className="sp-pages">Pages</th>
                  <th style={{width:'60pt'}}>Cast</th>
                  <th>Synopsis</th>
                </tr>
              </thead>
              <tbody>
                {scenesInDay.map(scene => (
                  <tr key={scene.id}>
                    <td className="sp-num">{scene.sceneNumber}</td>
                    <td className="sp-ie">{scene.intExt}</td>
                    <td className="sp-dn">{scene.dayNight}</td>
                    <td>{scene.set}</td>
                    <td />
                    <td className="sp-pages">{scene.pageCount}</td>
                    <td>{scene.cast}</td>
                    <td>{scene.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="sp-total">
              Total pages: {pageCount} &mdash; Total scenes: {scenesInDay.length}
            </div>
          </div>
        );
      })}

      <div className="sp-footer">{title} — Shooting Plan — {genStr}</div>
    </div>
  );
};

export default ShootingPlan;
