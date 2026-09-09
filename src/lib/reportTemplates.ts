import { ReportDesign, ReportTableColumn } from '../types';
import { cid } from './ribbonUtils';
import { DEFAULT_CREW_ROLES } from './crewCatalog';

// ---- built-in crew roles catalog lives in ./crewCatalog (official order,
//      department-grouped) — re-exported here for existing importers ----------

export { DEFAULT_CREW_ROLES };

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
    footer: [
      textBlock('Page {{pageNumber}} of {{pageCount}}', { fontSize: 8, align: 'right', paddingV: 0, paddingH: 4 }),
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
          textBlock('Weather: {{weather}} · Sunrise: {{sunrise}} · Sunset: {{sunset}} · Location: {{locationName}}', { fontSize: 9, align: 'center', paddingV: 1 }),
          { id: cid(), type: 'link', text: '{{locationName}}', url: '{{locationMapLink}}', fontSize: 9, align: 'center', paddingV: 1 },
          { id: cid(), type: 'ribbon' },
          textBlock('SCENES', { fontSize: 10, bold: true, paddingV: 3 }),
          tableBlock('scenesOfDay', [
            { field: 'sceneNumber', width: 8, align: 'center' },
            { field: 'set', width: 30 },
            { field: 'intExt', width: 8, align: 'center' },
            { field: 'dayNight', width: 8, align: 'center' },
            { field: 'pageCount', width: 8, align: 'center' },
            { field: 'cast', width: 38 },
          ]),
          textBlock('CAST CALL TIMES', { fontSize: 10, bold: true, paddingV: 3 }),
          tableBlock('elementCallsOfDay', [
            { field: 'elementCallId', width: 8, align: 'center' },
            { field: 'elementCallName', width: 32 },
            { field: 'call_onSet', width: 12, align: 'center' },
          ]),
          textBlock('CREW', { fontSize: 10, bold: true, paddingV: 3 }),
          tableBlock('crewOfDay', [
            { field: 'role', width: 34 },
            { field: 'crewName', width: 34 },
            { field: 'crewCallTime', width: 16, align: 'center' },
            { field: 'phone', width: 16 },
          ]),
          textBlock('DEPARTMENT CALLS', { fontSize: 10, bold: true, paddingV: 3 }),
          tableBlock('departmentCallsOfDay', [
            { field: 'departmentLabel', width: 60 },
            { field: 'departmentCallTime', width: 40, align: 'center' },
          ]),
          textBlock('LOCATIONS', { fontSize: 10, bold: true, paddingV: 3 }),
          tableBlock('locationsOfDay', [
            { field: 'locationName', width: 40 },
            { field: 'locationAddress', width: 60 },
          ]),
          textBlock('NOTES', { fontSize: 10, bold: true, paddingV: 3 }),
          textBlock('{{dayNotes}}', { fontSize: 9, paddingV: 2 }),
          { id: cid(), type: 'callSheetEdit', children: [textBlock('TRANSPORTATION / ADDITIONAL INFO', { fontSize: 10, bold: true })] },
          textBlock('ADVANCE — NEXT DAY', { fontSize: 10, bold: true, paddingV: 3 }),
          {
            id: cid(),
            type: 'relative',
            relativeOffset: 1,
            relativeCount: 1,
            children: [
              textBlock('Day {{dayNumber}} · {{dayDate}} · Call {{dayCallTime}} · {{locationName}}', { fontSize: 9 }),
              tableBlock('scenesOfDay', [
                { field: 'sceneNumber', width: 10, align: 'center' },
                { field: 'set', width: 50 },
                { field: 'intExt', width: 10, align: 'center' },
                { field: 'dayNight', width: 10, align: 'center' },
                { field: 'pageCount', width: 20, align: 'center' },
              ]),
            ],
          },
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
