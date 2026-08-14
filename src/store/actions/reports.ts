import { Project, ReportDesign, ReportTrashItem, CrewRole, CrewPerson, CrewTrashItem, ProductionInfo, ProjectLocation, LocationTrashItem } from '../../types';
import { generateUUID } from '../../lib/utils';
import { getDefaultReportDesign } from '../../lib/reportTemplates';
import type { Action, State } from '../reducer';

export type ApplyChange = (p: Project) => State;

// ---- report designs ----------------------------------------------------------

export function caseAddReportDesign(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_REPORT_DESIGN') return state;
  const source = action.payload.cloneFromId
    ? state.present.reportDesigns?.find(d => d.id === action.payload.cloneFromId)
    : null;
  const blocks = action.payload.blocks
    ? JSON.parse(JSON.stringify(action.payload.blocks))
    : source
      ? JSON.parse(JSON.stringify(source.blocks))
      : getDefaultReportDesign().blocks;
  const header = action.payload.header
    ? JSON.parse(JSON.stringify(action.payload.header))
    : source?.header
      ? JSON.parse(JSON.stringify(source.header))
      : [];
  const footer = action.payload.footer
    ? JSON.parse(JSON.stringify(action.payload.footer))
    : source?.footer
      ? JSON.parse(JSON.stringify(source.footer))
      : [];
  const newDesign: ReportDesign = {
    id: action.payload.id || generateUUID(),
    name: action.payload.name,
    createdAt: Date.now(),
    page: action.payload.page ?? source?.page ?? 'portrait',
    blocks,
    header,
    footer,
    headerSkipFirst: action.payload.headerSkipFirst ?? source?.headerSkipFirst,
    footerSkipFirst: action.payload.footerSkipFirst ?? source?.footerSkipFirst,
  };
  return applyChange({
    ...state.present,
    reportDesigns: [...(state.present.reportDesigns || []), newDesign],
    activeReportId: newDesign.id,
  });
}

export function caseUpdateReportDesign(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_REPORT_DESIGN') return state;
  const { id, blocks, header, footer, headerSkipFirst, footerSkipFirst } = action.payload;
  return applyChange({
    ...state.present,
    reportDesigns: (state.present.reportDesigns || []).map(d => {
      if (d.id !== id) return d;
      return {
        ...d,
        ...(blocks !== undefined ? { blocks: JSON.parse(JSON.stringify(blocks)) } : {}),
        ...(header !== undefined ? { header: JSON.parse(JSON.stringify(header)) } : {}),
        ...(footer !== undefined ? { footer: JSON.parse(JSON.stringify(footer)) } : {}),
        ...(headerSkipFirst !== undefined ? { headerSkipFirst } : {}),
        ...(footerSkipFirst !== undefined ? { footerSkipFirst } : {}),
      };
    }),
  });
}

export function caseUpdateReportPage(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_REPORT_PAGE') return state;
  return applyChange({
    ...state.present,
    reportDesigns: (state.present.reportDesigns || []).map(d =>
      d.id === action.payload.id ? { ...d, page: action.payload.page } : d
    ),
  });
}

export function caseRenameReportDesign(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RENAME_REPORT_DESIGN') return state;
  return applyChange({
    ...state.present,
    reportDesigns: (state.present.reportDesigns || []).map(d =>
      d.id === action.payload.id ? { ...d, name: action.payload.name } : d
    ),
  });
}

export function caseSetActiveReport(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SET_ACTIVE_REPORT') return state;
  return applyChange({
    ...state.present,
    activeReportId: action.payload,
  });
}

export function caseDeleteReportDesign(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_REPORT_DESIGN') return state;
  const target = (state.present.reportDesigns || []).find(d => d.id === action.payload);
  if (!target) return state;
  const remaining = (state.present.reportDesigns || []).filter(d => d.id !== action.payload);
  if (remaining.length === 0) return state;
  const newActiveId = state.present.activeReportId === action.payload
    ? remaining[0].id
    : state.present.activeReportId;
  const trashItem: ReportTrashItem = { design: target, deletedAt: Date.now() };
  return applyChange({
    ...state.present,
    reportDesigns: remaining,
    activeReportId: newActiveId,
    reportTrash: [...(state.present.reportTrash || []), trashItem],
  });
}

export function caseRestoreReportFromTrash(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RESTORE_REPORT_FROM_TRASH') return state;
  const item = (state.present.reportTrash || []).find(t => t.design.id === action.payload);
  if (!item) return state;
  return applyChange({
    ...state.present,
    reportDesigns: [...(state.present.reportDesigns || []), item.design],
    reportTrash: (state.present.reportTrash || []).filter(t => t.design.id !== action.payload),
  });
}

export function caseSetReportTextStyles(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SET_REPORT_TEXT_STYLES') return state;
  return applyChange({
    ...state.present,
    reportTextStyles: JSON.parse(JSON.stringify(action.payload)),
  });
}

// ---- production info ---------------------------------------------------------

export function caseSetProductionInfo(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SET_PRODUCTION_INFO') return state;
  return applyChange({
    ...state.present,
    productionInfo: { ...(state.present.productionInfo || {}), ...action.payload },
  });
}

// ---- crew roles --------------------------------------------------------------

export function caseAddCrewRole(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_CREW_ROLE') return state;
  const existing = state.present.crewRoles || [];
  if (existing.some(r => r.key === action.payload.role.key)) return state;
  return applyChange({
    ...state.present,
    crewRoles: [...existing, action.payload.role],
  });
}

export function caseRenameCrewRole(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RENAME_CREW_ROLE') return state;
  return applyChange({
    ...state.present,
    crewRoles: (state.present.crewRoles || []).map(r =>
      r.key === action.payload.key ? { ...r, label: action.payload.label } : r
    ),
  });
}

export function caseDeleteCrewRole(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_CREW_ROLE') return state;
  const crew = { ...(state.present.crew || {}) };
  const trashItems: CrewTrashItem[] = (crew[action.payload] || []).map(person => ({
    person,
    role: action.payload,
    roleLabel: (state.present.crewRoles || []).find(r => r.key === action.payload)?.label || action.payload,
    deletedAt: Date.now(),
  }));
  delete crew[action.payload];
  return applyChange({
    ...state.present,
    crewRoles: (state.present.crewRoles || []).filter(r => r.key !== action.payload),
    crew,
    crewTrash: [...(state.present.crewTrash || []), ...trashItems],
  });
}

// ---- crew people -------------------------------------------------------------

export function caseAddCrewPerson(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_CREW_PERSON') return state;
  const crew = { ...(state.present.crew || {}) };
  crew[action.payload.role] = [...(crew[action.payload.role] || []), action.payload.person];
  return applyChange({ ...state.present, crew });
}

export function caseUpdateCrewPerson(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_CREW_PERSON') return state;
  const crew = { ...(state.present.crew || {}) };
  const list = crew[action.payload.role] || [];
  crew[action.payload.role] = list.map(p => (p.id === action.payload.id ? { ...p, ...action.payload.updates } : p));
  if (action.payload.toRole && action.payload.toRole !== action.payload.role) {
    const person = (crew[action.payload.role] || []).find(p => p.id === action.payload.id);
    crew[action.payload.role] = (crew[action.payload.role] || []).filter(p => p.id !== action.payload.id);
    if (person) crew[action.payload.toRole] = [...(crew[action.payload.toRole] || []), person];
  }
  return applyChange({ ...state.present, crew });
}

export function caseDeleteCrewPerson(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_CREW_PERSON') return state;
  const crew = { ...(state.present.crew || {}) };
  const list = crew[action.payload.role] || [];
  const person = list.find(p => p.id === action.payload.id);
  crew[action.payload.role] = list.filter(p => p.id !== action.payload.id);
  const trashItems: CrewTrashItem[] = person
    ? [{
        person,
        role: action.payload.role,
        roleLabel: (state.present.crewRoles || []).find(r => r.key === action.payload.role)?.label || action.payload.role,
        deletedAt: Date.now(),
      }]
    : [];
  return applyChange({
    ...state.present,
    crew,
    crewTrash: [...(state.present.crewTrash || []), ...trashItems],
  });
}

export function caseRestoreCrewPersonFromTrash(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RESTORE_CREW_PERSON_FROM_TRASH') return state;
  const item = (state.present.crewTrash || []).find(t => t.person.id === action.payload);
  if (!item) return state;
  const crewRoles = [...(state.present.crewRoles || [])];
  if (!crewRoles.some(r => r.key === item.role)) {
    crewRoles.push({ key: item.role, label: item.roleLabel });
  }
  const crew = { ...(state.present.crew || {}) };
  crew[item.role] = [...(crew[item.role] || []), item.person];
  return applyChange({
    ...state.present,
    crewRoles,
    crew,
    crewTrash: (state.present.crewTrash || []).filter(t => t.person.id !== action.payload),
  });
}

export function caseSortCrewBy(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SORT_CREW_BY') return state;
  const { key, direction } = action.payload;
  const cmp = (aVal: string, bVal: string) => {
    if (aVal === '' && bVal === '') return 0;
    if (aVal === '') return 1;
    if (bVal === '') return -1;
    return String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' });
  };
  if (key === 'role') {
    const crewRoles = [...(state.present.crewRoles || [])].sort((a, b) => {
      const c = cmp(a.label, b.label);
      return direction === 'asc' ? c : -c;
    });
    return applyChange({ ...state.present, crewRoles });
  }
  const crew: Record<string, CrewPerson[]> = {};
  for (const [roleKey, list] of Object.entries(state.present.crew || {})) {
    crew[roleKey] = [...list].sort((a, b) => {
      const c = cmp((a as any)[key] || '', (b as any)[key] || '');
      return direction === 'asc' ? c : -c;
    });
  }
  return applyChange({ ...state.present, crew });
}

export function caseReorderCrewPerson(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'REORDER_CREW_PERSON') return state;
  const crew = { ...(state.present.crew || {}) };
  const list = [...(crew[action.payload.role] || [])];
  const idx = list.findIndex(p => p.id === action.payload.id);
  const target = idx + action.payload.dir;
  if (idx < 0 || target < 0 || target >= list.length) return state;
  const [p] = list.splice(idx, 1);
  list.splice(target, 0, p);
  crew[action.payload.role] = list;
  return applyChange({ ...state.present, crew });
}

// ---- location types ----------------------------------------------------------

export function caseAddLocationType(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_LOCATION_TYPE') return state;
  const existing = state.present.locationTypes || [];
  if (existing.some(t => t.key === action.payload.type.key)) return state;
  return applyChange({
    ...state.present,
    locationTypes: [...existing, action.payload.type],
  });
}

export function caseRenameLocationType(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RENAME_LOCATION_TYPE') return state;
  return applyChange({
    ...state.present,
    locationTypes: (state.present.locationTypes || []).map(t =>
      t.key === action.payload.key ? { ...t, label: action.payload.label } : t
    ),
  });
}

export function caseDeleteLocationType(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_LOCATION_TYPE') return state;
  const locations = state.present.locations || [];
  const trashItems: LocationTrashItem[] = locations
    .filter(l => l.type === action.payload)
    .map(location => ({ location, deletedAt: Date.now() }));
  return applyChange({
    ...state.present,
    locationTypes: (state.present.locationTypes || []).filter(t => t.key !== action.payload),
    locations: locations.filter(l => l.type !== action.payload),
    locationsTrash: [...(state.present.locationsTrash || []), ...trashItems],
  });
}

// ---- locations ---------------------------------------------------------------

export function caseAddLocation(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'ADD_LOCATION') return state;
  return applyChange({
    ...state.present,
    locations: [...(state.present.locations || []), action.payload.location],
  });
}

export function caseUpdateLocation(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'UPDATE_LOCATION') return state;
  return applyChange({
    ...state.present,
    locations: (state.present.locations || []).map(l =>
      l.id === action.payload.id ? { ...l, ...action.payload.updates } : l
    ),
  });
}

export function caseDeleteLocation(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'DELETE_LOCATION') return state;
  const locations = state.present.locations || [];
  const location = locations.find(l => l.id === action.payload);
  return applyChange({
    ...state.present,
    locations: locations.filter(l => l.id !== action.payload),
    locationsTrash: location
      ? [...(state.present.locationsTrash || []), { location, deletedAt: Date.now() }]
      : state.present.locationsTrash || [],
  });
}

export function caseRestoreLocation(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'RESTORE_LOCATION') return state;
  const item = (state.present.locationsTrash || []).find(t => t.location.id === action.payload);
  if (!item) return state;
  const locationTypes = [...(state.present.locationTypes || [])];
  if (!locationTypes.some(t => t.key === item.location.type)) {
    locationTypes.push({ key: item.location.type, label: item.location.type });
  }
  return applyChange({
    ...state.present,
    locationTypes,
    locations: [...(state.present.locations || []), item.location],
    locationsTrash: (state.present.locationsTrash || []).filter(t => t.location.id !== action.payload),
  });
}

export function caseSortLocationsBy(state: State, action: Action, applyChange: ApplyChange): State {
  if (action.type !== 'SORT_LOCATIONS_BY') return state;
  const { key, direction } = action.payload;
  const cmp = (aVal: string, bVal: string) => {
    if (aVal === '' && bVal === '') return 0;
    if (aVal === '') return 1;
    if (bVal === '') return -1;
    return String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' });
  };
  const types = state.present.locationTypes || [];
  const valueOf = (l: ProjectLocation): string => {
    if (key === 'type') return types.find(t => t.key === l.type)?.label || l.type;
    return String((l as any)[key] ?? '');
  };
  const locations = [...(state.present.locations || [])].sort((a, b) => {
    const c = cmp(valueOf(a), valueOf(b));
    return direction === 'asc' ? c : -c;
  });
  return applyChange({ ...state.present, locations });
}
