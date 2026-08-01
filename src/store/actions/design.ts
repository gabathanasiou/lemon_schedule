import { Project, RibbonDesign, RibbonTrashItem, ColorRuleTrashItem } from '../../types';
import { generateUUID } from '../../lib/utils';
import { getDefaultRibbonRows, getDefaultColWidths, DEFAULT_COLOR_PALETTE } from '../../lib/ribbonUtils';
import type { Action, State } from '../reducer';

export type ApplyChange = (p: Project) => State;

export function caseUpdateSceneRibbon(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_SCENE_RIBBON') return state;
  return applyChange({
    ...state.present,
    sceneRibbon: action.payload,
  });
}

export function caseAddRibbonDesign(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_RIBBON_DESIGN') return state;
  const source = action.payload.cloneFromId
    ? state.present.ribbonDesigns.find(d => d.id === action.payload.cloneFromId)
    : null;
  const rows = action.payload.rows
    ? JSON.parse(JSON.stringify(action.payload.rows))
    : source
      ? JSON.parse(JSON.stringify(source.rows))
      : getDefaultRibbonRows();
  const colWidths = action.payload.colWidths
    ? [...action.payload.colWidths]
    : source?.colWidths
      ? [...source.colWidths]
      : getDefaultColWidths();
  const newDesign: RibbonDesign = {
    id: action.payload.id || generateUUID(),
    name: action.payload.name,
    colWidths,
    rows,
    createdAt: Date.now(),
    cellPaddingV: action.payload.cellPaddingV ?? source?.cellPaddingV ?? 3,
    cellPaddingH: action.payload.cellPaddingH ?? source?.cellPaddingH ?? 3,
    edgePadding: action.payload.edgePadding ?? source?.edgePadding ?? 3,
  };
  return applyChange({
    ...state.present,
    ribbonDesigns: [...state.present.ribbonDesigns, newDesign],
    activeRibbonId: newDesign.id,
  });
}

export function caseUpdateRibbonDesign(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_RIBBON_DESIGN') return state;
  return applyChange({
    ...state.present,
    ribbonDesigns: state.present.ribbonDesigns.map(d =>
      d.id === action.payload.id ? { ...d, rows: action.payload.rows, colWidths: action.payload.colWidths } : d
    ),
  });
}

export function caseDeleteRibbonDesign(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_RIBBON_DESIGN') return state;
  const target = state.present.ribbonDesigns.find(d => d.id === action.payload);
  if (!target) return state;
  const remaining = state.present.ribbonDesigns.filter(d => d.id !== action.payload);
  if (remaining.length === 0) return state;
  const newActiveId = state.present.activeRibbonId === action.payload
    ? remaining[0].id
    : state.present.activeRibbonId;
  const trashItem: RibbonTrashItem = { design: target, deletedAt: Date.now() };
  return applyChange({
    ...state.present,
    ribbonDesigns: remaining,
    activeRibbonId: newActiveId,
    ribbonTrash: [...state.present.ribbonTrash, trashItem],
  });
}

export function caseRestoreRibbonFromTrash(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RESTORE_RIBBON_FROM_TRASH') return state;
  const item = state.present.ribbonTrash.find(t => t.design.id === action.payload);
  if (!item) return state;
  return applyChange({
    ...state.present,
    ribbonDesigns: [...state.present.ribbonDesigns, item.design],
    ribbonTrash: state.present.ribbonTrash.filter(t => t.design.id !== action.payload),
  });
}

export function caseSetRibbonCellPaddingV(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SET_RIBBON_CELL_PADDING_V') return state;
  return applyChange({
    ...state.present,
    ribbonDesigns: state.present.ribbonDesigns.map(d =>
      d.id === action.payload.id ? { ...d, cellPaddingV: action.payload.cellPaddingV } : d
    ),
  });
}

export function caseSetRibbonCellPaddingH(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SET_RIBBON_CELL_PADDING_H') return state;
  return applyChange({
    ...state.present,
    ribbonDesigns: state.present.ribbonDesigns.map(d =>
      d.id === action.payload.id ? { ...d, cellPaddingH: action.payload.cellPaddingH } : d
    ),
  });
}

export function caseSetRibbonEdgePadding(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SET_RIBBON_EDGE_PADDING') return state;
  return applyChange({
    ...state.present,
    ribbonDesigns: state.present.ribbonDesigns.map(d =>
      d.id === action.payload.id ? { ...d, edgePadding: action.payload.edgePadding } : d
    ),
  });
}

export function caseRenameRibbonDesign(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RENAME_RIBBON_DESIGN') return state;
  return applyChange({
    ...state.present,
    ribbonDesigns: state.present.ribbonDesigns.map(d =>
      d.id === action.payload.id ? { ...d, name: action.payload.name } : d
    ),
  });
}

export function caseSetActiveRibbon(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SET_ACTIVE_RIBBON') return state;
  return applyChange({
    ...state.present,
    activeRibbonId: action.payload,
  });
}

export function caseSetColorPalette(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SET_COLOR_PALETTE') return state;
  return applyChange({
    ...state.present,
    colorPalette: action.payload,
  });
}

export function caseAddColorRule(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_COLOR_RULE') return state;
  return applyChange({
    ...state.present,
    colorPalette: {
      ...(state.present.colorPalette || DEFAULT_COLOR_PALETTE),
      colorRules: [...(state.present.colorPalette?.colorRules || []), action.payload],
    },
  });
}

export function caseUpdateColorRule(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_COLOR_RULE') return state;
  return applyChange({
    ...state.present,
    colorPalette: {
      ...(state.present.colorPalette || DEFAULT_COLOR_PALETTE),
      colorRules: (state.present.colorPalette?.colorRules || []).map(r =>
        r.id === action.payload.id ? action.payload : r
      ),
    },
  });
}

export function caseDeleteColorRule(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_COLOR_RULE') return state;
  const palette = state.present.colorPalette || DEFAULT_COLOR_PALETTE;
  const rule = (palette.colorRules || []).find(r => r.id === action.payload);
  if (!rule) return state;
  const trashItem: ColorRuleTrashItem = { rule: { ...rule }, deletedAt: Date.now() };
  return applyChange({
    ...state.present,
    colorRulesTrash: [...(state.present.colorRulesTrash || []), trashItem],
    colorPalette: {
      ...palette,
      colorRules: (palette.colorRules || []).filter(r => r.id !== action.payload),
    },
  });
}

export function caseRestoreColorRuleFromTrash(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RESTORE_COLOR_RULE_FROM_TRASH') return state;
  const item = (state.present.colorRulesTrash || []).find(t => t.rule.id === action.payload);
  if (!item) return state;
  const palette = state.present.colorPalette || DEFAULT_COLOR_PALETTE;
  return applyChange({
    ...state.present,
    colorRulesTrash: (state.present.colorRulesTrash || []).filter(t => t.rule.id !== action.payload),
    colorPalette: {
      ...palette,
      colorRules: [...(palette.colorRules || []), item.rule],
    },
  });
}

export function caseReorderColorRules(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'REORDER_COLOR_RULES') return state;
  return applyChange({
    ...state.present,
    colorPalette: {
      ...(state.present.colorPalette || DEFAULT_COLOR_PALETTE),
      colorRules: action.payload,
    },
  });
}
