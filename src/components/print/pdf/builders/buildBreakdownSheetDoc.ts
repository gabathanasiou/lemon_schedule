import type { TDocumentDefinitions } from '../conf/pdfMakeSetup';
import type { Project, Scene, CastMember, CustomCategoryDef } from '../../../../types';
import { getElementsFromScenes } from '../../../../store';
import { naturalSortSceneStrings } from '../../../../lib/utils';
import { PAGE_SIZES, PAGE_MARGINS } from '../conf/pdfLayout';

export interface BreakdownSheetPdfOptions {
  sortOrder: 'sheet' | 'scene';
  sceneIds: string[];
  orientation: 'portrait' | 'landscape';
  paperSize: 'a4' | 'letter';
}

interface CatDef {
  key: string;
  label: string;
  getData: (scene: Scene, castMembers: CastMember[]) => string;
}

const CATEGORIES: CatDef[] = [
  { key: 'cast', label: 'Cast', getData: (s, cm) => s.cast.split(',').map(c => c.trim()).filter(Boolean).map(id => {
    const m = cm.find(m => m.id === id);
    return m ? `${id}. ${m.name}` : id;
  }).join('\n') },
  { key: 'backgroundActors', label: 'Background Actors', getData: s => s.backgroundActors },
  { key: 'stunts', label: 'Stunts', getData: s => s.stunts },
  { key: 'vehicles', label: 'Vehicles', getData: s => s.vehicles },
  { key: 'props', label: 'Props', getData: s => s.props },
  { key: 'wardrobe', label: 'Wardrobe / Costume', getData: s => s.wardrobe },
  { key: 'makeup', label: 'Makeup & Hair', getData: s => s.makeup },
  { key: 'sfx', label: 'Special Effects (SFX)', getData: s => s.sfx },
  { key: 'vfx', label: 'Visual Effects (VFX)', getData: s => s.vfx },
  { key: 'sound', label: 'Sound', getData: s => s.sound },
  { key: 'music', label: 'Music / Playback', getData: s => s.music },
  { key: 'animalsAndWranglers', label: 'Animals & Wranglers', getData: s => s.animalsAndWranglers },
  { key: 'weapons', label: 'Weapons / Armoury', getData: s => s.weapons },
  { key: 'greenery', label: 'Greenery', getData: s => s.greenery },
  { key: 'artDept', label: 'Art Department', getData: s => s.artDept },
  { key: 'notes', label: 'Notes / Special Requirements', getData: s => s.notes },
];

export function buildBreakdownSheetDoc(
  project: Project,
  opts: BreakdownSheetPdfOptions,
): TDocumentDefinitions {
  const { sortOrder, sceneIds, orientation, paperSize } = opts;

  const pageSize = PAGE_SIZES[paperSize];
  const margins = PAGE_MARGINS[orientation];
  const now = new Date();
  const genStr = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

  const hiddenSet = new Set(project.hiddenCategories || []);

  const allCategories: CatDef[] = [
    ...CATEGORIES,
    ...(project.customCategories || []).map(c => ({
      key: c.key,
      label: c.label,
      getData: (s: Scene) => String((s as any)[c.key] || ''),
    })),
  ].filter(c => !hiddenSet.has(c.key));

  const scenes = sceneIds.length > 0
    ? project.scenes.filter(s => sceneIds.includes(s.id))
    : [...project.scenes];

  if (sortOrder === 'scene') {
    scenes.sort((a, b) => naturalSortSceneStrings(a.sceneNumber, b.sceneNumber));
  }

  const castMembers = project.castMembers || [];

  const content: any[] = [];

  // Title
  content.push({
    table: {
      widths: ['auto', '*', 'auto'],
      body: [[
        { text: project.title || 'Production Schedule', font: 'Helvetica', fontSize: 10, bold: true, alignment: 'left' },
        { text: 'Scene Breakdown', font: 'Helvetica', fontSize: 10, bold: true, alignment: 'center' },
        { text: genStr, font: 'Helvetica', fontSize: 10, bold: true, alignment: 'right' },
      ]],
    },
    layout: {
      hLineWidth: (i: number, node: any) => i === node.table.body.length ? 1 : 0,
      vLineWidth: () => 0,
      hLineColor: () => '#999',
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 4,
    },
  });

  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si];

    const pageInfo = si > 0
      ? { text: `Page ${si + 1} of ${scenes.length} \u2014 ${genStr}`, font: 'Helvetica', fontSize: 7, color: '#666', alignment: 'right' as const, margin: [0, 0, 0, 4] }
      : null;

    const infoRows = [
      [
        { text: 'Scene Sheet', font: 'Helvetica', fontSize: 8, bold: true, fillColor: '#f5f5f5' },
        { text: String(si + 1), font: 'Helvetica', fontSize: 8 },
        { text: 'Scene No.', font: 'Helvetica', fontSize: 8, bold: true, fillColor: '#f5f5f5' },
        { text: scene.sceneNumber, font: 'Helvetica', fontSize: 8 },
      ],
      [
        { text: 'Int/Ext', font: 'Helvetica', fontSize: 8, bold: true, fillColor: '#f5f5f5' },
        { text: scene.intExt || '', font: 'Helvetica', fontSize: 8 },
        { text: 'Day/Night', font: 'Helvetica', fontSize: 8, bold: true, fillColor: '#f5f5f5' },
        { text: scene.dayNight || '', font: 'Helvetica', fontSize: 8 },
      ],
      [
        { text: 'Set', font: 'Helvetica', fontSize: 8, bold: true, fillColor: '#f5f5f5' },
        { text: scene.set || '', font: 'Helvetica', fontSize: 8 },
        { text: 'Location', font: 'Helvetica', fontSize: 8, bold: true, fillColor: '#f5f5f5' },
        { text: '' },
      ],
      [
        { text: 'Pages', font: 'Helvetica', fontSize: 8, bold: true, fillColor: '#f5f5f5' },
        { text: scene.pageCount ? `${scene.pageCount} pgs` : '', font: 'Helvetica', fontSize: 8 },
        { text: 'Script Day', font: 'Helvetica', fontSize: 8, bold: true, fillColor: '#f5f5f5' },
        { text: scene.scriptDay || '' },
      ],
      [
        { text: 'Synopsis', font: 'Helvetica', fontSize: 8, bold: true, fillColor: '#f5f5f5' },
        { text: scene.description || '', font: 'Helvetica', fontSize: 8, colSpan: 3 },
        {}, {}, {},
      ],
    ];

    // Build category grid — 3 columns per row
    const catGridRows: any[][] = [];
    let catRow: any[] = [];
    for (const cat of allCategories) {
      const data = cat.getData(scene, castMembers);
      catRow.push({
        stack: [
          { text: cat.label, font: 'Helvetica', fontSize: 7, bold: true, color: '#000', margin: [0, 0, 0, 2] },
          { text: data || '', font: 'Helvetica', fontSize: 8, color: '#000' },
        ],
        border: [true, true, true, true],
        margin: [0, 0, 0, 0],
      });
      if (catRow.length === 3) {
        catGridRows.push([...catRow]);
        catRow = [];
      }
    }
    if (catRow.length > 0) {
      while (catRow.length < 3) catRow.push({ text: '' });
      catGridRows.push(catRow);
    }

    const sceneContent: any[] = [];

    if (pageInfo) sceneContent.push(pageInfo);

    // Header info table
    sceneContent.push({
      table: {
        widths: [80, '*', 80, '*'],
        body: infoRows,
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => '#999',
        vLineColor: () => '#999',
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 2,
        paddingBottom: () => 2,
      },
    });

    // Category grid — use table with min-height
    if (catGridRows.length > 0) {
      sceneContent.push({
        table: {
          widths: ['*', '*', '*'],
          body: catGridRows.map(row =>
            row.map((cell: any) => ({
              ...cell,
              margin: [0, 0, 0, 0],
            }))
          ),
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => '#999',
          vLineColor: () => '#999',
          paddingLeft: () => 4,
          paddingRight: () => 4,
          paddingTop: () => 3,
          paddingBottom: () => 6,
        },
      });
    }

    content.push({
      stack: sceneContent,
      pageBreak: si < scenes.length - 1 ? 'after' : undefined,
    });
  }

  return {
    pageSize,
    pageOrientation: orientation === 'landscape' ? 'landscape' : 'portrait',
    pageMargins: [margins[0], margins[1], margins[2], margins[3]],
    defaultStyle: { font: 'Helvetica', fontSize: 8, color: '#000' },
    content,
  };
}
