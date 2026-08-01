import { Project, ScheduleRow } from '../types';
import { generateUUID } from '../lib/utils';

export function ensurePinnedDaybreak(rows: ScheduleRow[]): ScheduleRow[] {
  const pinnedRows = rows.filter(r => r.pinned);
  if (pinnedRows.length === 1) {
    const pinned = pinnedRows[0];
    if (pinned.containerId === 1 && pinned.order === 0 && pinned.type === 'DAYBREAK') {
      return rows;
    }
  }
  let result = rows.filter(r => !r.pinned);
  const pinned: ScheduleRow = pinnedRows.length > 0
    ? { ...pinnedRows[0], containerId: 1, order: 0, type: 'DAYBREAK' as const, pinned: true }
    : {
        id: generateUUID(),
        type: 'DAYBREAK' as const,
        containerId: 1,
        order: 0,
        daybreakLabel: 'DAYBREAK',
        daybreakCallTime: '08:00',
        pinned: true,
      };
  result = result.map(r =>
    r.containerId === 1 ? { ...r, order: r.order + 1 } : r
  );
  return [pinned, ...result];
}

export function ensureAllScenesHaveRows(project: Project): Project {
  return {
    ...project,
    versions: project.versions.map(v => {
      const sceneIdsInRows = new Set(v.rows.filter(r => r.type === 'SCENE').map(r => r.sceneId));
      const missing = project.scenes.filter(s => !sceneIdsInRows.has(s.id));
      let rows = v.rows;
      if (missing.length > 0) {
        const maxBoneyardOrder = rows
          .filter(r => r.containerId === null)
          .reduce((max, r) => Math.max(max, r.order), 0);
        const newRows = missing.map((s, i) => ({
          id: generateUUID(),
          type: 'SCENE' as const,
          sceneId: s.id,
          containerId: null as number | null,
          order: maxBoneyardOrder + 1 + i,
          estimatedDuration: 30,
        }));
        rows = [...rows, ...newRows];
      }
      rows = ensurePinnedDaybreak(rows);
      return { ...v, rows };
    }),
  };
}

