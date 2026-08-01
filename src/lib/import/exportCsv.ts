import { Project } from '../../types';

export function exportBreakdownCSV(project: Project): void {
  const hiddenSet = new Set(project.hiddenCategories || []);

  const BREAKDOWN_KEYS = [
    'backgroundActors', 'stunts', 'vehicles', 'props', 'wardrobe', 'makeup',
    'sfx', 'vfx', 'sound', 'music', 'animalsAndWranglers', 'weapons', 'greenery', 'artDept',
  ];

  const FALLBACK_LABELS: Record<string, string> = {
    sceneNumber: 'Scene #', pageCount: 'Pages', scriptDay: 'Script Day',
    intExt: 'I/E', set: 'Set', dayNight: 'D/N', description: 'Description',
    cast: 'Cast', notes: 'Notes',
    backgroundActors: 'Background Actors', stunts: 'Stunts', vehicles: 'Vehicles',
    props: 'Props', wardrobe: 'Wardrobe', makeup: 'Makeup & Hair',
    sfx: 'SFX', vfx: 'VFX', sound: 'Sound', music: 'Music',
    animalsAndWranglers: 'Animals & Wranglers', weapons: 'Weapons', greenery: 'Greenery',
    artDept: 'Art Dept',
  };

  const colLabel = (key: string): string => project.categoryLabels?.[key] || FALLBACK_LABELS[key] || key;

  const fixedCols = ['sceneNumber', 'pageCount', 'scriptDay', 'intExt', 'set', 'dayNight', 'description', 'cast', 'notes'];
  const breakdownCols = [
    ...BREAKDOWN_KEYS.filter(k => !hiddenSet.has(k) && k !== 'set'),
    ...(project.customCategories || []).filter(c => !hiddenSet.has(c.key)).map(c => c.key),
  ];

  const cols = [...fixedCols, ...breakdownCols];
  const headers = cols.map(colLabel);

  const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;

  const lines = [headers.map(esc).join(',')];
  for (const s of project.scenes) {
    const row = cols.map(k => esc((s as any)[k] ?? ''));
    lines.push(row.join(','));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.title || 'Breakdown'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
