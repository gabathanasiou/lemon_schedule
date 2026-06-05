import React, { useMemo } from 'react';
import { Scene, ScheduleRow, ShootDayMeta } from '../../types';
import { formatPageCount } from '../../lib/utils';
import { BASE_PRINT_RESET } from './shared/basePrintCss';

const CSS = `
${BASE_PRINT_RESET}
@page { size: portrait; margin: 10mm 12mm; }
.lb-root {
  font-family: Helvetica, Arial, sans-serif;
  font-size: 8pt; line-height: 1.3; color: #000; width: 100%; background: #fff;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.lb-title { display: flex; justify-content: space-between; border-bottom: 1pt solid #999; padding-bottom: 4pt; margin-bottom: 8pt; }
.lb-title-left { font-weight: 700; font-size: 10pt; }
.lb-title-center { text-align: center; text-transform: uppercase; font-weight: 700; font-size: 10pt; }
.lb-title-right { text-align: right; font-weight: 700; font-size: 10pt; }
.lb-loc-header { font-weight: 700; font-size: 9pt; margin-top: 10pt; margin-bottom: 3pt; text-transform: uppercase; }
.lb-table { width: 100%; border-collapse: collapse; margin-bottom: 2pt; }
.lb-table th, .lb-table td { border: 1px solid #999; padding: 1.5pt 3pt; vertical-align: middle; text-align: left; font-size: 8pt; }
.lb-table th { background: #f5f5f5; text-align: center; font-size: 7pt; font-weight: 700; }
.lb-num { width: 24pt; text-align: center; }
.lb-ie { width: 24pt; text-align: center; }
.lb-dn { width: 30pt; text-align: center; }
.lb-pages { width: 28pt; text-align: center; }
.lb-total { font-size: 7.5pt; border-top: 1px solid #999; padding: 2pt 0; margin-bottom: 8pt; text-align: right; }
.lb-sep { border: none; border-top: 1px solid #999; margin: 0; }
.lb-footer { font-size: 7pt; color: #666; margin-top: 6pt; }
`;

interface LocationBreakdownProps {
  title: string;
  scenes: Scene[];
  rows: ScheduleRow[];
  dayMeta: Record<number, ShootDayMeta>;
  locationFilters: string[];
}

const LocationBreakdown: React.FC<LocationBreakdownProps> = ({ title, scenes, rows, dayMeta, locationFilters }) => {
  const now = new Date();
  const genStr = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

  const sceneToDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.type === 'SCENE' && r.sceneId) m.set(r.sceneId, r.shootDay);
    }
    return m;
  }, [rows]);

  const getDayDate = (shootDay: number | null): string => {
    if (shootDay == null) return '';
    const meta = dayMeta[shootDay];
    if (!meta?.date) return '';
    const d = new Date(meta.date + 'T00:00:00');
    return isNaN(d.getTime()) ? meta.date : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  };

  const locations = useMemo(() => {
    const grouped = new Map<string, Scene[]>();
    for (const loc of locationFilters) {
      const locScenes = scenes.filter(s => s.set.trim() === loc).sort((a, b) => {
        const da = sceneToDay.get(a.id) || 0, db = sceneToDay.get(b.id) || 0;
        return da - db;
      });
      if (locScenes.length > 0) grouped.set(loc, locScenes);
    }
    return grouped;
  }, [scenes, locationFilters, sceneToDay]);

  return (
    <div className="lb-root">
      <style>{CSS}</style>
      <div className="lb-title">
        <div className="lb-title-left">{title}</div>
        <div className="lb-title-center">Location Breakdown</div>
        <div className="lb-title-right">{genStr}</div>
      </div>

      {[...locations.entries()].map(([loc, locScenes], li) => {
        const totalPages = locScenes.reduce((sum, s) => sum + s.pageCountDecimal, 0);
        const shootingDays = new Set(locScenes.map(s => sceneToDay.get(s.id)).filter(Boolean));

        return (
          <div key={loc}>
            <div className="lb-loc-header">{loc}</div>
            <table className="lb-table">
              <thead>
                <tr>
                  <th className="lb-num">Scene</th>
                  <th style={{width:'60pt'}}>Set</th>
                  <th className="lb-ie">I/E</th>
                  <th className="lb-dn">D/N</th>
                  <th className="lb-pages">Pages</th>
                  <th style={{width:'60pt'}}>Cast</th>
                  <th style={{width:'36pt'}}>Shoot Day</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {locScenes.map(s => (
                  <tr key={s.id}>
                    <td className="lb-num">{s.sceneNumber}</td>
                    <td>{s.set}</td>
                    <td className="lb-ie" style={{textAlign:'center'}}>{s.intExt}</td>
                    <td className="lb-dn" style={{textAlign:'center'}}>{s.dayNight}</td>
                    <td className="lb-pages">{s.pageCount}</td>
                    <td>{s.cast}</td>
                    <td style={{textAlign:'center'}}>{sceneToDay.get(s.id) ?? '—'}</td>
                    <td>{getDayDate(sceneToDay.get(s.id) ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="lb-total">
              Scenes: {locScenes.length} | Pages: {formatPageCount(Math.round(totalPages * 8))} | Shooting Days: {shootingDays.size}
            </div>
            {li < locations.size - 1 && <hr className="lb-sep" />}
          </div>
        );
      })}

      <div className="lb-footer">{title} — Location Breakdown — {genStr}</div>
    </div>
  );
};

export default LocationBreakdown;
