import React, { useMemo } from 'react';
import { Scene, ScheduleRow, ShootDayMeta, CastMember } from '../../types';
import { BASE_PRINT_RESET } from './shared/basePrintCss';
import { naturalSortSceneStrings } from '../../lib/utils';

const CSS = `
${BASE_PRINT_RESET}
@page { size: portrait; margin: 10mm 12mm; }
.bs-root {
  font-family: Helvetica, Arial, sans-serif;
  font-size: 8pt; line-height: 1.3; color: #000; width: 100%; background: #fff;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.bs-title { display: flex; justify-content: space-between; border-bottom: 1pt solid #999; padding-bottom: 4pt; margin-bottom: 6pt; }
.bs-title-left { font-weight: 700; font-size: 10pt; }
.bs-title-center { text-align: center; text-transform: uppercase; font-weight: 700; font-size: 10pt; }
.bs-title-right { text-align: right; font-weight: 700; font-size: 10pt; }
.bs-sheet { page-break-after: always; break-after: page; margin-bottom: 12pt; }
.bs-sheet:last-child { page-break-after: auto; break-after: auto; }
.bs-header { width: 100%; border-collapse: collapse; margin-bottom: 6pt; }
.bs-header td { border: 1px solid #999; padding: 2pt 4pt; vertical-align: top; font-size: 8pt; }
.bs-header .bs-label { font-weight: 700; width: 80pt; background: #f5f5f5; }
.bs-cat-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4pt; }
.bs-cat-box { border: 1px solid #999; }
.bs-cat-header { background: #f5f5f5; padding: 2pt 4pt; font-weight: 700; font-size: 7pt; text-transform: uppercase; border-bottom: 1px solid #999; }
.bs-cat-body { padding: 3pt 4pt; min-height: 24pt; font-size: 8pt; }
.bs-page-info { font-size: 7pt; color: #666; text-align: right; margin-bottom: 4pt; }
`;

interface BreakdownSheetProps {
  title: string;
  scenes: Scene[];
  rows: ScheduleRow[];
  dayMeta: Record<number, ShootDayMeta>;
  castMembers: CastMember[];
  sortOrder: 'sheet' | 'scene';
  sceneIds: string[];
}

interface CategoryDef {
  key: string;
  label: string;
  getData: (scene: Scene, castMembers: CastMember[]) => string;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'cast', label: 'Cast', getData: (s, cm) => s.cast.split(',').map(c => c.trim()).filter(Boolean).map(id => {
    const m = cm.find(m => m.id === id);
    return m ? `${id}. ${m.name}` : id;
  }).join('\n') },
  { key: 'extras', label: 'Supporting Artistes / Extras', getData: s => s.extras },
  { key: 'stunts', label: 'Stunts', getData: s => s.stunts },
  { key: 'vehicles', label: 'Vehicles', getData: s => s.vehicles },
  { key: 'props', label: 'Props', getData: s => s.props },
  { key: 'wardrobe', label: 'Wardrobe / Costume', getData: s => s.wardrobe },
  { key: 'makeup', label: 'Makeup & Hair', getData: s => s.makeup },
  { key: 'sfx', label: 'Special Effects (SFX)', getData: s => s.sfx },
  { key: 'vfx', label: 'Visual Effects (VFX)', getData: s => s.vfx },
  { key: 'sound', label: 'Sound', getData: s => s.sound },
  { key: 'music', label: 'Music / Playback', getData: s => s.music },
  { key: 'animals', label: 'Animals', getData: s => s.animals },
  { key: 'weapons', label: 'Weapons / Armoury', getData: s => s.weapons },
  { key: 'greenery', label: 'Greenery / Set Dressing', getData: s => s.greenery },
  { key: 'art', label: 'Art Department', getData: (s, _cm) => s.artDept },
  { key: 'notes', label: 'Notes / Special Requirements', getData: s => s.notes },
];

const BreakdownSheet: React.FC<BreakdownSheetProps> = ({ title, scenes: rawScenes, rows, dayMeta, castMembers, sortOrder, sceneIds }) => {
  const now = new Date();
  const genStr = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

  const scenes = useMemo(() => {
    let filtered = rawScenes.filter(s => sceneIds.length === 0 || sceneIds.includes(s.id));
    if (sortOrder === 'scene') {
      return [...filtered].sort((a, b) => naturalSortSceneStrings(a.sceneNumber, b.sceneNumber));
    }
    return filtered;
  }, [rawScenes, sortOrder, sceneIds]);

  const sceneToDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.type === 'SCENE' && r.sceneId) m.set(r.sceneId, r.shootDay);
    return m;
  }, [rows]);

  return (
    <div className="bs-root">
      <style>{CSS}</style>
      <div className="bs-title">
        <div className="bs-title-left">{title}</div>
        <div className="bs-title-center">Scene Breakdown</div>
        <div className="bs-title-right">{genStr}</div>
      </div>

      {scenes.map((scene, si) => (
        <div key={scene.id} className="bs-sheet">
          {si > 0 && <div className="bs-page-info">Page {si + 1} of {scenes.length} — {genStr}</div>}
          <table className="bs-header">
            <tbody>
              <tr><td className="bs-label">Scene Sheet</td><td>{si + 1}</td><td className="bs-label">Scene No.</td><td>{scene.sceneNumber}</td></tr>
              <tr><td className="bs-label">Int/Ext</td><td>{scene.intExt}</td><td className="bs-label">Day/Night</td><td>{scene.dayNight}</td></tr>
              <tr><td className="bs-label">Set</td><td>{scene.set}</td><td className="bs-label">Location</td><td>&nbsp;</td></tr>
              <tr><td className="bs-label">Pages</td><td>{scene.pageCount}</td><td className="bs-label">Script Day</td><td>{scene.scriptDay}</td></tr>
              <tr><td className="bs-label">Synopsis</td><td colSpan={3}>{scene.description}</td></tr>
            </tbody>
          </table>

          <div className="bs-cat-grid">
            {CATEGORIES.map(cat => {
              const data = cat.getData(scene, castMembers);
              return (
                <div key={cat.key} className="bs-cat-box">
                  <div className="bs-cat-header">{cat.label}</div>
                  <div className="bs-cat-body">{data ? <span style={{whiteSpace:'pre-wrap'}}>{data}</span> : null}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default BreakdownSheet;
