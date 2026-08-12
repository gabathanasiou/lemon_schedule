import { CrewRole, ReportDesign, ReportTableColumn, ReportTableRow } from '../types';
import { cid } from './ribbonUtils';

// ---- built-in crew roles catalog (roles-first: role → one or more people) ----

export const DEFAULT_CREW_ROLES: CrewRole[] = [
  { key: 'producer', label: 'Producer', builtin: true },
  { key: 'lineProducer', label: 'Line Producer', builtin: true },
  { key: 'director', label: 'Director', builtin: true },
  { key: 'firstAD', label: '1st AD', builtin: true },
  { key: 'secondAD', label: '2nd AD', builtin: true },
  { key: 'upm', label: 'Unit Production Manager', builtin: true },
  { key: 'productionManager', label: 'Production Manager', builtin: true },
  { key: 'productionCoordinator', label: 'Production Coordinator', builtin: true },
  { key: 'scriptSupervisor', label: 'Script Supervisor', builtin: true },
  { key: 'productionAccountant', label: 'Production Accountant', builtin: true },
  { key: 'dop', label: 'Director of Photography', builtin: true },
  { key: 'cameraOperator', label: 'Camera Operator', builtin: true },
  { key: 'firstAC', label: '1st AC', builtin: true },
  { key: 'secondAC', label: '2nd AC', builtin: true },
  { key: 'dit', label: 'DIT', builtin: true },
  { key: 'soundMixer', label: 'Sound Mixer', builtin: true },
  { key: 'boomOp', label: 'Boom Operator', builtin: true },
  { key: 'productionDesigner', label: 'Production Designer', builtin: true },
  { key: 'artDirector', label: 'Art Director', builtin: true },
  { key: 'setDecorator', label: 'Set Decorator', builtin: true },
  { key: 'costumeDesigner', label: 'Costume Designer', builtin: true },
  { key: 'makeup', label: 'Makeup', builtin: true },
  { key: 'hair', label: 'Hair', builtin: true },
  { key: 'keyGrip', label: 'Key Grip', builtin: true },
  { key: 'dollyGrip', label: 'Dolly Grip', builtin: true },
  { key: 'gaffer', label: 'Gaffer', builtin: true },
  { key: 'locations', label: 'Locations', builtin: true },
  { key: 'stunts', label: 'Stunts', builtin: true },
  { key: 'specialEffects', label: 'Special Effects', builtin: true },
  { key: 'castingDirector', label: 'Casting Director', builtin: true },
  { key: 'editor', label: 'Editor', builtin: true },
  { key: 'vfxSupervisor', label: 'VFX Supervisor', builtin: true },
  { key: 'pa', label: 'PA', builtin: true },
];

// ---- default report design (One-Liner) ---------------------------------------

export function getDefaultReportDesign(): ReportDesign {
  const columns: ReportTableColumn[] = [
    { id: cid(), field: 'day', width: 6, align: 'center' },
    { id: cid(), field: 'sceneNumber', width: 8, align: 'center' },
    { id: cid(), field: 'intExt', width: 7, align: 'center' },
    { id: cid(), field: 'set', width: 20 },
    { id: cid(), field: 'dayNight', width: 8, align: 'center' },
    { id: cid(), field: 'pageCount', width: 8, align: 'center' },
    { id: cid(), field: 'cast', width: 20 },
    { id: cid(), field: 'description', width: 23 },
  ];
  const rows: ReportTableRow[] = [
    { id: cid(), cells: columns.map(c => ({ id: cid(), field: c.field, align: c.align })) },
  ];
  return {
    id: cid(),
    name: 'One-Liner',
    createdAt: Date.now(),
    page: 'landscape',
    blocks: [
      {
        id: cid(),
        type: 'text',
        text: '{{title}} — One-Liner',
        fontSize: 16,
        bold: true,
        align: 'center',
      },
      {
        id: cid(),
        type: 'table',
        collection: 'scenes',
        colWidths: columns.map(c => c.width),
        tableRows: rows,
        showHeader: true,
        gap: 0,
      },
    ],
  };
}
