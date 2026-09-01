import { Scene } from '../types';
import { formatPageCount, parsePageCount } from './utils';
import { createBlankScene } from './sceneFactory';
import type { Item } from '@glideapps/glide-data-grid';

export interface PasteEdit {
  row: number;
  colKey: string;
  val: string;
}

export interface PastePlan {
  editRows: PasteEdit[];
  newScenes: Scene[];
}

export interface PasteColumn {
  key: string;
}

export interface PasteRange {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Selection-aware grid paste planner (shared by the scenes and crew glides):
 * computes which existing cells to edit and which new rows to create. Pure —
 * the caller dispatches the plan.
 */
export function planGridPaste<R>(
  target: Item,
  values: readonly (readonly string[])[],
  existingRowCount: number,
  columns: PasteColumn[],
  selection: PasteRange | null | undefined,
  buildNewRow: (raw: Record<string, string>) => R,
): { editRows: PasteEdit[]; newRows: R[] } {
  const editRows: PasteEdit[] = [];
  const newRows: R[] = [];

  if (values.length === 0) return { editRows, newRows };

  const pasteRows = selection && selection.height > values.length ? selection.height : values.length;
  const maxRowLen = Math.max(...values.map(r => r.length));
  const pasteCols = selection && selection.width > maxRowLen ? selection.width : maxRowLen;

  for (let r = 0; r < pasteRows; r++) {
    const srcR = r % values.length;
    const srcRow = values[srcR];
    const targetRow = target[1] + r;
    if (targetRow < existingRowCount) {
      for (let c = 0; c < pasteCols; c++) {
        const srcC = c % (srcRow.length || 1);
        const targetCol = target[0] + c;
        if (targetCol < columns.length && columns[targetCol].key !== 'actions') {
          editRows.push({ row: targetRow, colKey: columns[targetCol].key, val: srcRow[srcC] ?? '' });
        }
      }
    } else {
      const raw: Record<string, string> = {};
      for (let c = 0; c < pasteCols; c++) {
        const srcC = c % (srcRow.length || 1);
        const colIndex = target[0] + c;
        if (colIndex < columns.length) {
          raw[columns[colIndex].key] = srcRow[srcC] ?? '';
        }
      }
      newRows.push(buildNewRow(raw));
    }
  }

  return { editRows, newRows };
}

function buildSceneFromRaw(raw: Record<string, string>): Scene {
  const scene: any = createBlankScene({
    sceneNumber: raw.sceneNumber || '',
    pageCount: raw.pageCount || '',
    scriptDay: raw.scriptDay || '',
    intExt: raw.intExt || '',
    set: (raw.set || '').toUpperCase(),
    dayNight: raw.dayNight || '',
    description: raw.description || '',
    cast: raw.cast || '',
    notes: raw.notes || '',
    backgroundActors: raw.backgroundActors || '',
    stunts: raw.stunts || '',
    vehicles: raw.vehicles || '',
    props: raw.props || '',
    wardrobe: raw.wardrobe || '',
    makeup: raw.makeup || '',
    sfx: raw.sfx || '',
    vfx: raw.vfx || '',
    sound: raw.sound || '',
    music: raw.music || '',
    animalsAndWranglers: raw.animalsAndWranglers || '',
    weapons: raw.weapons || '',
    greenery: raw.greenery || '',
    artDept: raw.artDept || '',
    containerId: null,
  } as any);
  if (scene.pageCount && scene.pageCount.trim()) {
    const decimal = parsePageCount(scene.pageCount);
    scene.pageCount = formatPageCount(decimal);
    scene.pageCountDecimal = decimal;
  }
  return scene as Scene;
}

/**
 * Scenes paste planner (scenes glide adapter over planGridPaste) — normalizes
 * field values (page counts, script day digits, uppercase sets).
 */
export function planPaste(
  target: Item,
  values: readonly (readonly string[])[],
  currentScenes: Scene[],
  columns: PasteColumn[],
  selection?: PasteRange | null,
): PastePlan {
  const plan = planGridPaste<Scene>(target, values, currentScenes.length, columns, selection, buildSceneFromRaw);
  return { editRows: plan.editRows, newScenes: plan.newRows };
}
