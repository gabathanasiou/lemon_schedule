import React, { useMemo } from 'react';
import { Scene, ScheduleRow, ShootDayMeta, CastMember } from '../../types';
import { formatPageCount } from '../../lib/utils';
import { BASE_PRINT_RESET } from './shared/basePrintCss';

const CSS = `
${BASE_PRINT_RESET}
@page { size: portrait; margin: 10mm 12mm; }
.ca-root {
  font-family: Helvetica, Arial, sans-serif;
  font-size: 8pt; line-height: 1.3; color: #000; width: 100%; background: #fff;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.ca-title { display: flex; justify-content: space-between; border-bottom: 1pt solid #999; padding-bottom: 4pt; margin-bottom: 6pt; }
.ca-title-left { font-weight: 700; font-size: 10pt; }
.ca-title-center { text-align: center; text-transform: uppercase; font-weight: 700; font-size: 10pt; }
.ca-title-right { text-align: right; font-weight: 700; font-size: 10pt; }
.ca-char-header { font-weight: 700; font-size: 9pt; margin-top: 6pt; margin-bottom: 1pt; }
.ca-table { width: 100%; border-collapse: collapse; }
.ca-table td { border: 1px solid #999; padding: 1pt 2.5pt; vertical-align: middle; text-align: left; font-size: 7.5pt; }
.ca-table tr:first-child td { border-top: none; }
.ca-table tr:last-child td { border-bottom: none; }
.ca-table tr td:first-child { border-left: none; }
.ca-table tr td:last-child { border-right: none; }
.ca-num { width: 22pt; text-align: center; }
.ca-ie { width: 24pt; text-align: center; }
.ca-dn { width: 28pt; text-align: center; }
.ca-pages { width: 24pt; text-align: center; }
.ca-summary { font-size: 7pt; color: #666; margin-bottom: 4pt; }
.ca-footer { font-size: 7pt; color: #666; margin-top: 6pt; }
`;

interface CharacterAppearancesProps {
  title: string;
  scenes: Scene[];
  rows: ScheduleRow[];
  dayMeta: Record<number, ShootDayMeta>;
  castMembers: CastMember[];
  castIds: string[];
}

const CharacterAppearances: React.FC<CharacterAppearancesProps> = ({ title, scenes, rows, dayMeta, castMembers, castIds }) => {
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

  return (
    <div className="ca-root">
      <style>{CSS}</style>
      <div className="ca-title">
        <div className="ca-title-left">{title}</div>
        <div className="ca-title-center">Character Appearances</div>
        <div className="ca-title-right">{genStr}</div>
      </div>

      {castIds.map((castId, ci) => {
        const castName = castMembers.find(m => m.id === castId)?.name || '—';
        const castScenes = scenes.filter(s => s.cast.split(',').map(c => c.trim()).includes(castId));
        const scheduledScenes = castScenes.filter(s => sceneToDay.has(s.id) && sceneToDay.get(s.id) != null)
          .sort((a, b) => (sceneToDay.get(a.id) || 0) - (sceneToDay.get(b.id) || 0));
        const totalPages = scheduledScenes.reduce((sum, s) => sum + s.pageCountDecimal, 0);
        const shootingDays = new Set(scheduledScenes.map(s => sceneToDay.get(s.id)).filter(Boolean));

        if (scheduledScenes.length === 0) return null;

        return (
          <div key={castId}>
            <div className="ca-char-header">{castId}.  {castName}</div>
            <table className="ca-table">
              <tbody>
                {scheduledScenes.map(s => (
                  <tr key={s.id}>
                    <td className="ca-num">{s.sceneNumber}</td>
                    <td className="ca-ie">{s.intExt}</td>
                    <td className="ca-dn">{s.dayNight}</td>
                    <td style={{width:'80pt'}}>{s.set}</td>
                    <td className="ca-pages">{s.pageCount}</td>
                    <td style={{width:'24pt',textAlign:'center'}}>{sceneToDay.get(s.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ca-summary">
              Scenes: {scheduledScenes.length} &middot; Pages: {formatPageCount(Math.round(totalPages * 8))} &middot; Shooting days: {shootingDays.size}
            </div>
          </div>
        );
      })}

      <div className="ca-footer">{title} — Character Appearances — {genStr}</div>
    </div>
  );
};

export default CharacterAppearances;
