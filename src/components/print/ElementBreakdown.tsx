import React, { useMemo } from 'react';
import { Scene, ScheduleRow, CastMember, CustomCategoryDef, NonShootDate } from '../../types';
import { formatPageCount } from '../../lib/utils';
import { DEFAULT_CATEGORY_LABELS } from '../../store';
import { getFieldItems } from '../../lib/categories';
import { BASE_PRINT_RESET } from './shared/basePrintCss';

const CSS = `
${BASE_PRINT_RESET}
@page { size: portrait; margin: 10mm 12mm; }
.eb-root {
  font-family: Helvetica, sans-serif;
  font-size: 8pt; line-height: 1.3; color: #000; width: 100%; background: #fff;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.eb-title { display: flex; justify-content: space-between; border-bottom: 1pt solid #999; padding-bottom: 4pt; margin-bottom: 8pt; }
.eb-title-left { font-weight: 700; font-size: 10pt; }
.eb-title-center { text-align: center; text-transform: uppercase; font-weight: 700; font-size: 10pt; }
.eb-title-right { text-align: right; font-weight: 700; font-size: 10pt; }
.eb-cat-header { font-weight: 700; font-size: 9pt; margin-top: 10pt; margin-bottom: 3pt; }
.eb-table { width: 100%; border-collapse: collapse; margin-bottom: 2pt; }
.eb-table th, .eb-table td { border: 1px solid #999; padding: 1.5pt 3pt; vertical-align: middle; text-align: left; font-size: 8pt; }
.eb-table th { background: #f5f5f5; text-align: center; font-size: 7pt; font-weight: 700; }
.eb-name { font-weight: 600; }
.eb-pages { width: 36pt; text-align: center; }
.eb-total { font-size: 7.5pt; border-top: 1px solid #999; padding: 2pt 0; margin-bottom: 8pt; text-align: right; }
.eb-footer { font-size: 7pt; color: #666; margin-top: 6pt; }
`;

interface ElementBreakdownProps {
  title: string;
  scenes: Scene[];
  rows: ScheduleRow[];
  productionStart?: string;
  nonShootDates?: NonShootDate[];
  castMembers: CastMember[];
  customCategories: CustomCategoryDef[];
  category: string;
}

function getCategoryLabel(key: string, customCategories: CustomCategoryDef[]): string {
  const builtin = DEFAULT_CATEGORY_LABELS[key];
  if (builtin) return builtin;
  const custom = customCategories.find(c => c.key === key);
  return custom?.label || key;
}

function getElementValues(scene: any, category: string): string[] {
  const raw = String(scene[category] ?? '');
  return getFieldItems(category, raw);
}

const ElementBreakdown: React.FC<ElementBreakdownProps> = ({ title, scenes, rows, productionStart, nonShootDates, castMembers, customCategories, category }) => {
  const now = new Date();
  const genStr = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  const catLabel = getCategoryLabel(category, customCategories);

  const sceneToDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.type === 'SCENE' && r.sceneId) m.set(r.sceneId, r.containerId);
    }
    return m;
  }, [rows]);

  const sectionDateMap = useMemo(() => {
    const m = new Map<number, string>();
    const addDays = (d: string, n: number) => { const p = d.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); };
    const nonShootSet = new Set((nonShootDates || []).map(n => n.date));
    const containerIds = [...new Set<number>(rows.filter(r => r.containerId != null && r.type === 'SCENE').map(r => r.containerId as number))].sort((a, b) => a - b);
    let currentDate = productionStart || new Date().toISOString().slice(0, 10);
    for (const cid of containerIds) {
      while (nonShootSet.has(currentDate)) currentDate = addDays(currentDate, 1);
      m.set(cid, currentDate);
      currentDate = addDays(currentDate, 1);
    }
    return m;
  }, [rows, productionStart, nonShootDates]);

  const getDayDate = (containerId: number | null): string => {
    if (containerId == null) return '';
    const dateStr = sectionDateMap.get(containerId);
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  };

  const elements = useMemo(() => {
    const elMap = new Map<string, { name: string; sceneIds: string[] }>();
    for (const scene of scenes) {
      const vals = getElementValues(scene, category);
      for (const v of vals) {
        const upper = v.toUpperCase();
        const name = category === 'set' ? upper : v;
        if (!elMap.has(upper)) elMap.set(upper, { name, sceneIds: [] });
        elMap.get(upper)!.sceneIds.push(scene.id);
      }
    }

    const sceneMap = new Map(scenes.map(s => [s.id, s]));
    return Array.from(elMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, el]) => {
        const elScenes = (el.sceneIds
          .map(id => sceneMap.get(id))
          .filter((s): s is Scene => s != null))
          .sort((a, b) => {
            const na = parseInt(a.sceneNumber, 10);
            const nb = parseInt(b.sceneNumber, 10);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.sceneNumber.localeCompare(b.sceneNumber, undefined, { numeric: true });
          });

        const totalPages = elScenes.reduce((sum, s) => sum + (s.pageCountDecimal || 0), 0);

        return { key, name: el.name, scenes: elScenes, totalPages, totalPagesStr: formatPageCount(Math.round(totalPages * 8)) };
      });
  }, [scenes, category]);

  return (
    <div className="eb-root">
      <style>{CSS}</style>
      <div className="eb-title">
        <div className="eb-title-left">{title}</div>
        <div className="eb-title-center">{catLabel} Breakdown</div>
        <div className="eb-title-right">{genStr}</div>
      </div>

      {elements.map((el, ei) => {
        const scheduledScenes = el.scenes.filter(s => sceneToDay.has(s.id) && sceneToDay.get(s.id) != null);
        if (scheduledScenes.length === 0) return null;

        return (
          <div key={el.key}>
            <div className="eb-cat-header">
              {category === 'cast'
                ? (() => {
                    const cm = castMembers.find(c => c.id === el.name);
                    return cm ? `${el.name}. ${cm.name}` : el.name;
                  })()
                : el.name}
            </div>
            <table className="eb-table">
              <thead>
                <tr>
                  <th style={{width:'24pt'}}>Scene</th>
                  <th style={{width:'100pt'}}>Set</th>
                  <th style={{width:'24pt'}}>I/E</th>
                  <th style={{width:'30pt'}}>D/N</th>
                  <th className="eb-pages">Pages</th>
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
                    <td style={{textAlign:'center'}}>{s.sceneNumber}</td>
                    <td>{s.set}</td>
                    <td style={{textAlign:'center'}}>{s.intExt}</td>
                    <td style={{textAlign:'center'}}>{s.dayNight}</td>
                    <td className="eb-pages">{s.pageCount ? `${s.pageCount} pgs` : ''}</td>
                    <td style={{textAlign:'center'}}>{sceneToDay.get(s.id) ?? '?'}</td>
                    <td>{getDayDate(sceneToDay.get(s.id) ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="eb-total">
              Scenes: {scheduledScenes.length} | Pages: {formatPageCount(Math.round(el.totalPages * 8))} pgs
            </div>
            {ei < elements.length - 1 && <hr style={{border:'none', borderTop:'1px solid #999', margin:'8pt 0'}} />}
          </div>
        );
      })}

      <div className="eb-footer">{title} - {catLabel} Breakdown - {genStr}</div>
    </div>
  );
};

export default ElementBreakdown;
