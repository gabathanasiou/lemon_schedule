import { CrewRole, ReportDesign, ReportTableColumn } from '../types';
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

// ---- default report designs (seeded on new projects) --------------------------

function tableBlock(collection: string, fields: { field: string; width: number; align?: 'left' | 'center' | 'right' }[], extra: Partial<ReportDesign['blocks'][number]> = {}): ReportDesign['blocks'][number] {
  const columns: ReportTableColumn[] = fields.map(f => ({ id: cid(), field: f.field, width: f.width, align: f.align }));
  return {
    id: cid(),
    type: 'table',
    collection: collection as any,
    columns,
    showHeader: true,
    ...extra,
  };
}

function textBlock(text: string, extra: Partial<ReportDesign['blocks'][number]> = {}): ReportDesign['blocks'][number] {
  return { id: cid(), type: 'text', text, ...extra };
}

function pageBreakBlock(): ReportDesign['blocks'][number] {
  return { id: cid(), type: 'pageBreak' };
}

function oneLiner(): ReportDesign {
  return {
    id: cid(),
    name: 'One-Liner',
    createdAt: Date.now(),
    page: 'landscape',
    blocks: [
      textBlock('{{title}} — One-Liner', { fontSize: 16, bold: true, align: 'center' }),
      tableBlock('scenes', [
        { field: 'day', width: 6, align: 'center' },
        { field: 'sceneNumber', width: 8, align: 'center' },
        { field: 'intExt', width: 7, align: 'center' },
        { field: 'set', width: 20 },
        { field: 'dayNight', width: 8, align: 'center' },
        { field: 'pageCount', width: 8, align: 'center' },
        { field: 'cast', width: 20 },
        { field: 'description', width: 23 },
      ]),
    ],
  };
}

function castList(): ReportDesign {
  return {
    id: cid(),
    name: 'Cast List',
    createdAt: Date.now(),
    page: 'portrait',
    blocks: [
      textBlock('{{title}} — Cast List', { fontSize: 16, bold: true, align: 'center' }),
      tableBlock('cast', [
        { field: 'id', width: 10, align: 'center' },
        { field: 'elementName', width: 40 },
        { field: 'totalWorkDays', width: 15, align: 'center' },
        { field: 'workStart', width: 20 },
        { field: 'workFinish', width: 20 },
      ]),
    ],
  };
}

function elementBreakdown(): ReportDesign {
  return {
    id: cid(),
    name: 'Element Breakdown',
    createdAt: Date.now(),
    page: 'portrait',
    blocks: [
      textBlock('{{title}} — Element Breakdown', { fontSize: 16, bold: true, align: 'center' }),
      {
        id: cid(),
        type: 'repeat',
        collection: 'elements',
        category: 'props',
        gap: 10,
        children: [
          { id: cid(), type: 'field', field: 'elementName', fontSize: 12, bold: true },
          textBlock('Scenes: {{sceneCount}} · Pages: {{totalPages}}'),
          tableBlock('scenesOfElement', [
            { field: 'sceneNumber', width: 10, align: 'center' },
            { field: 'set', width: 24 },
            { field: 'intExt', width: 10, align: 'center' },
            { field: 'dayNight', width: 10, align: 'center' },
            { field: 'pageCount', width: 10, align: 'center' },
            { field: 'day', width: 8, align: 'center' },
            { field: 'date', width: 16 },
          ], { collection: 'scenesOfElement' as any }),
        ],
      },
    ],
  };
}

function sceneBreakdown(): ReportDesign {
  return {
    id: cid(),
    name: 'Scene Breakdown',
    createdAt: Date.now(),
    page: 'portrait',
    blocks: [
      textBlock('{{title}} — Scene Breakdown', { fontSize: 16, bold: true, align: 'center' }),
      {
        id: cid(),
        type: 'repeat',
        collection: 'scenes',
        gap: 10,
        children: [
          textBlock('SC {{sceneNumber}} — {{set}} ({{intExt}} {{dayNight}}) · {{pageCount}} pgs', { fontSize: 12, bold: true }),
          textBlock('{{description}}', { paddingV: 4 }),
          textBlock('Props: {{props}}', { emptyBehavior: 'hideBlock' }),
          textBlock('Wardrobe: {{wardrobe}}', { emptyBehavior: 'hideBlock' }),
          textBlock('Cast: {{cast}}', { emptyBehavior: 'hideBlock' }),
          pageBreakBlock(),
        ],
      },
    ],
  };
}

function categoryBreakdown(): ReportDesign {
  return {
    id: cid(),
    name: 'Category Breakdown',
    createdAt: Date.now(),
    page: 'portrait',
    blocks: [
      textBlock('{{title}} — Category Breakdown', { fontSize: 16, bold: true, align: 'center' }),
      {
        id: cid(),
        type: 'repeat',
        collection: 'categories',
        skipEmptyCategories: true,
        gap: 10,
        children: [
          { id: cid(), type: 'field', field: 'categoryLabel', fontSize: 13, bold: true },
          tableBlock('elementsOfCategory', [
            { field: 'elementName', width: 40 },
            { field: 'sceneCount', width: 15, align: 'center' },
            { field: 'totalPages', width: 15, align: 'center' },
            { field: 'totalWorkDays', width: 15, align: 'center' },
            { field: 'workDayList', width: 15, align: 'center' },
          ]),
        ],
      },
    ],
  };
}

function crewContactSheet(): ReportDesign {
  return {
    id: cid(),
    name: 'Crew Contact Sheet',
    createdAt: Date.now(),
    page: 'portrait',
    blocks: [
      textBlock('{{title}} — Crew Contact', { fontSize: 16, bold: true, align: 'center' }),
      textBlock('{{company}} · {{productionOffice}} · {{prodPhone}}', { align: 'center' }),
      textBlock('Director: {{director}} · Producer: {{producer}} · 1st AD: {{firstAD}}', { emptyBehavior: 'hideText' }),
      tableBlock('crew', [
        { field: 'role', width: 26 },
        { field: 'crewName', width: 26 },
        { field: 'phone', width: 22 },
        { field: 'email', width: 26 },
      ]),
    ],
  };
}

function callSheet(): ReportDesign {
  return {
    id: cid(),
    name: 'Call Sheet',
    createdAt: Date.now(),
    page: 'portrait',
    blocks: [
      {
        id: cid(),
        type: 'repeat',
        collection: 'days',
        gap: 10,
        children: [
          textBlock('CALL SHEET — Day {{dayNumber}} · {{dayDate}} · Call {{dayCallTime}}', { fontSize: 15, bold: true, align: 'center' }),
          { id: cid(), type: 'ribbon' },
          tableBlock('crew', [
            { field: 'role', width: 34 },
            { field: 'crewName', width: 34 },
            { field: 'phone', width: 32 },
          ]),
          pageBreakBlock(),
        ],
      },
    ],
  };
}

export function getDefaultReportDesigns(): ReportDesign[] {
  return [oneLiner(), castList(), elementBreakdown(), categoryBreakdown(), sceneBreakdown(), crewContactSheet(), callSheet()];
}

export function getDefaultReportDesign(): ReportDesign {
  return getDefaultReportDesigns()[0];
}
