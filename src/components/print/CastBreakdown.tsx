import React, { useMemo } from 'react';
import { Scene, ScheduleRow, ShootDayMeta, CastMember } from '../../types';
import { formatPageCount } from '../../lib/utils';
import { BASE_PRINT_RESET } from './shared/basePrintCss';

const CSS = `
${BASE_PRINT_RESET}
@page { size: portrait; margin: 10mm 12mm; }
.cb-root {
  font-family: Helvetica, Arial, sans-serif;
  font-size: 8pt; line-height: 1.3; color: #000; width: 100%; background: #fff;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cb-title { display: flex; justify-content: space-between; border-bottom: 1pt solid #999; padding-bottom: 4pt; margin-bottom: 8pt; }
.cb-title-left { font-weight: 700; font-size: 10pt; }
.cb-title-center { text-align: center; text-transform: uppercase; font-weight: 700; font-size: 10pt; }
.cb-title-right { text-align: right; font-weight: 700; font-size: 10pt; }
.cb-char-header { font-weight: 700; font-size: 9pt; margin-top: 10pt; margin-bottom: 3pt; }
.cb-table { width: 100%; border-collapse: collapse; margin-bottom: 2pt; }
.cb-table th, .cb-table td { border: 1px solid #999; padding: 1.5pt 3pt; vertical-align: middle; text-align: left; font-size: 8pt; }
.cb-table th { background: #f5f5f5; text-align: center; font-size: 7pt; font-weight: 700; }
.cb-num { width: 24pt; text-align: center; }
.cb-pages { width: 28pt; text-align: center; }
.cb-total { font-size: 7.5pt; border-top: 1px solid #999; padding: 2pt 0; margin-bottom: 8pt; text-align: right; }
.cb-sep { border: none; border-top: 1px solid #999; margin: 0; }
.cb-footer { font-size: 7pt; color: #666; margin-top: 6pt; }
`;

interface CastBreakdownProps {
  title: string;
  scenes: Scene[];
  rows: ScheduleRow[];
  dayMeta: Record<number, ShootDayMeta>;
  castMembers: CastMember[];
  castIds: string[];
}

const CastBreakdown: React.FC<CastBreakdownProps> = ({ title, scenes, rows, dayMeta, castMembers, castIds }) => {
  const now = new Date();
  const genStr = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

  const sceneMap = useMemo(() => {
    const m = new Map<string, Scene>();
    for (const s of scenes) m.set(s.id, s);
    return m;
  }, [scenes]);

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

  return (
    <div className="cb-root">
      <style>{CSS}</style>
      <div className="cb-title">
        <div className="cb-title-left">{title}</div>
        <div className="cb-title-center">Cast Breakdown</div>
        <div className="cb-title-right">{genStr}</div>
      </div>

      {castIds.map((castId, ci) => {
        const castName = castMembers.find(m => m.id === castId)?.name || '—';
        const castScenes = scenes.filter(s => s.cast.split(',').map(c => c.trim()).includes(castId));
        const scheduledScenes = castScenes.filter(s => sceneToDay.has(s.id) && sceneToDay.get(s.id) != null);
        const totalPages = scheduledScenes.reduce((sum, s) => sum + s.pageCountDecimal, 0);
        const shootingDays = new Set(scheduledScenes.map(s => sceneToDay.get(s.id)).filter(Boolean));

        if (scheduledScenes.length === 0) return null;

        return (
          <div key={castId}>
            <div className="cb-char-header">{castId}.  {castName}</div>
            <table className="cb-table">
              <thead>
                <tr>
                  <th className="cb-num">Scene</th>
                  <th style={{width:'100pt'}}>Set</th>
                  <th className="cb-ie" style={{width:'24pt'}}>I/E</th>
                  <th className="cb-dn" style={{width:'30pt'}}>D/N</th>
                  <th className="cb-pages">Pages</th>
                  <th style={{width:'36pt'}}>Shoot Day</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {scheduledScenes.sort((a, b) => {
                  const da = sceneToDay.get(a.id) || 0, db = sceneToDay.get(b.id) || 0;
                  return da - db;
                }).map(s => (
                  <tr key={s.id}>
                    <td className="cb-num">{s.sceneNumber}</td>
                    <td>{s.set}</td>
                    <td className="cb-ie" style={{textAlign:'center'}}>{s.intExt}</td>
                    <td className="cb-dn" style={{textAlign:'center'}}>{s.dayNight}</td>
                    <td className="cb-pages">{s.pageCount}</td>
                    <td style={{textAlign:'center'}}>{sceneToDay.get(s.id) ?? '—'}</td>
                    <td>{getDayDate(sceneToDay.get(s.id) ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="cb-total">
              Scenes: {scheduledScenes.length} | Pages: {formatPageCount(Math.round(totalPages * 8))} | Shooting Days: {shootingDays.size}
            </div>
            {ci < castIds.length - 1 && <hr className="cb-sep" />}
          </div>
        );
      })}

      <div className="cb-footer">{title} — Cast Breakdown — {genStr}</div>
    </div>
  );
};

export default CastBreakdown;
