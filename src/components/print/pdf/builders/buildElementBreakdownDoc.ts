import type { TDocumentDefinitions } from '../conf/pdfMakeSetup';
import type { Project, Scene, CastMember } from '../../../../types';
import { getFieldItems } from '../../../../lib/categories';
import { formatPageCount } from '../../../../lib/utils';
import { PAGE_SIZES, PAGE_MARGINS } from '../conf/pdfLayout';

export interface ElementBreakdownPdfOptions {
  category: string;
  orientation: 'portrait' | 'landscape';
  paperSize: 'a4' | 'letter';
}

function getCategoryLabel(project: Project, category: string): string {
  const stored = project.categoryLabels?.[category];
  if (stored) return stored;
  const custom = project.customCategories?.find(c => c.key === category);
  if (custom) return custom.label;
  return category;
}

function getElementValues(scene: any, category: string): string[] {
  const raw = String(scene[category] ?? '');
  return getFieldItems(category, raw);
}

function getDayDate(dayMeta: Record<number, any>, shootDay: number | null): string {
  if (shootDay == null) return '';
  const meta = dayMeta[shootDay];
  if (!meta?.date) return '';
  const d = new Date(meta.date + 'T00:00:00');
  return isNaN(d.getTime()) ? meta.date : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

export function buildElementBreakdownDoc(
  project: Project,
  opts: ElementBreakdownPdfOptions,
): TDocumentDefinitions {
  const { category, orientation, paperSize } = opts;
  const pageSize = PAGE_SIZES[paperSize];
  const margins = PAGE_MARGINS[orientation];
  const now = new Date();
  const genStr = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  const catLabel = getCategoryLabel(project, category);

  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const dayMeta = activeVersion?.dayMeta || {};
  const rows = activeVersion?.rows || [];
  const castMembers = project.castMembers || [];

  const sceneToDay = new Map<string, number>();
  for (const r of rows) {
    if (r.type === 'SCENE' && r.sceneId) sceneToDay.set(r.sceneId, r.shootDay);
  }

  // Build element data
  const elMap = new Map<string, { name: string; sceneIds: string[] }>();
  for (const scene of project.scenes) {
    const vals = getElementValues(scene, category);
    for (const v of vals) {
      const upper = v.toUpperCase();
      const name = category === 'set' ? upper : v;
      if (!elMap.has(upper)) elMap.set(upper, { name, sceneIds: [] });
      elMap.get(upper)!.sceneIds.push(scene.id);
    }
  }

  const sceneMap = new Map(project.scenes.map(s => [s.id, s]));
  const elements = Array.from(elMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, el]) => {
      const elScenes = (el.sceneIds
        .map(id => sceneMap.get(id))
        .filter((s): s is Scene => s != null))
        .sort((a, b) => {
          const na = parseInt(a.sceneNumber, 10);
          const nb = parseInt(b.sceneNumber, 10);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return a.sceneNumber.localeCompare(b.sceneNumber, undefined, { numeric: true });
        });
      const totalPages = elScenes.reduce((sum, s) => sum + (s.pageCountDecimal || 0), 0);
      return { key, name: el.name, scenes: elScenes, totalPages };
    })
    .filter(el => el.scenes.some(s => sceneToDay.has(s.id) && sceneToDay.get(s.id) != null));

  const content: any[] = [];

  // Title
  content.push({
    table: {
      widths: ['auto', '*', 'auto'],
      body: [[
        { text: project.title || 'Production Schedule', font: 'Helvetica', fontSize: 10, bold: true, alignment: 'left' },
        { text: `${catLabel} Breakdown`, font: 'Helvetica', fontSize: 10, bold: true, alignment: 'center' },
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

  for (let ei = 0; ei < elements.length; ei++) {
    const el = elements[ei];
    const scheduledScenes = el.scenes.filter(s => sceneToDay.has(s.id) && sceneToDay.get(s.id) != null);
    if (scheduledScenes.length === 0) continue;

    // Category header
    let headerText = el.name;
    if (category === 'cast') {
      const cm = castMembers.find(c => c.id === el.name);
      headerText = cm ? `${el.name}. ${cm.name}` : el.name;
    }
    content.push({ text: headerText, font: 'Helvetica', fontSize: 9, bold: true, margin: [0, 8, 0, 3] });

    // Scene table
    const tableBody: any[][] = [];
    // Header row
    tableBody.push([
      { text: 'Scene', font: 'Helvetica', fontSize: 7, bold: true, alignment: 'center', fillColor: '#f5f5f5' },
      { text: 'Set', font: 'Helvetica', fontSize: 7, bold: true, alignment: 'center', fillColor: '#f5f5f5' },
      { text: 'I/E', font: 'Helvetica', fontSize: 7, bold: true, alignment: 'center', fillColor: '#f5f5f5' },
      { text: 'D/N', font: 'Helvetica', fontSize: 7, bold: true, alignment: 'center', fillColor: '#f5f5f5' },
      { text: 'Pages', font: 'Helvetica', fontSize: 7, bold: true, alignment: 'center', fillColor: '#f5f5f5' },
      { text: 'Shoot Day', font: 'Helvetica', fontSize: 7, bold: true, alignment: 'center', fillColor: '#f5f5f5' },
      { text: 'Date', font: 'Helvetica', fontSize: 7, bold: true, alignment: 'center', fillColor: '#f5f5f5' },
    ]);

    // Data rows (sorted by shoot day)
    scheduledScenes.sort((a, b) => {
      const da = sceneToDay.get(a.id) || 0;
      const db = sceneToDay.get(b.id) || 0;
      return da - db;
    });

    for (const s of scheduledScenes) {
      tableBody.push([
        { text: s.sceneNumber, font: 'Helvetica', fontSize: 8, alignment: 'center' },
        { text: s.set || '', font: 'Helvetica', fontSize: 8 },
        { text: s.intExt || '', font: 'Helvetica', fontSize: 8, alignment: 'center' },
        { text: s.dayNight || '', font: 'Helvetica', fontSize: 8, alignment: 'center' },
        { text: s.pageCount ? `${s.pageCount} pgs` : '', font: 'Helvetica', fontSize: 8, alignment: 'center' },
        { text: String(sceneToDay.get(s.id) ?? '\u2014'), font: 'Helvetica', fontSize: 8, alignment: 'center' },
        { text: getDayDate(dayMeta, sceneToDay.get(s.id) ?? null), font: 'Helvetica', fontSize: 8 },
      ]);
    }

    content.push({
      table: {
        widths: [28, '*', 28, 34, 36, 36, 60],
        headerRows: 1,
        dontBreakRows: true,
        body: tableBody,
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => '#999',
        vLineColor: () => '#999',
        paddingLeft: () => 3,
        paddingRight: () => 3,
        paddingTop: () => 1.5,
        paddingBottom: () => 1.5,
      },
    });

    // Total line
    const totalPgs = Math.round(el.totalPages * 8);
    content.push({
      text: `Scenes: ${scheduledScenes.length} | Pages: ${formatPageCount(totalPgs)} pgs`,
      font: 'Helvetica',
      fontSize: 7.5,
      color: '#000',
      alignment: 'right',
      margin: [0, 2, 0, 0],
    });

    // HR between elements (except last)
    if (ei < elements.length - 1) {
      content.push({ text: '', decoration: 'underline', margin: [0, 6, 0, 0] });
      // Use a canvas line instead of underline hack
      content.push({
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#999' }],
        margin: [0, 4, 0, 4],
      });
    }
  }

  // Footer
  content.push({
    text: `${project.title || 'Production Schedule'} \u2014 ${catLabel} Breakdown \u2014 ${genStr}`,
    font: 'Helvetica',
    fontSize: 7,
    color: '#666',
    margin: [0, 6, 0, 0],
  });

  return {
    pageSize,
    pageOrientation: orientation === 'landscape' ? 'landscape' : 'portrait',
    pageMargins: [margins[0], margins[1], margins[2], margins[3]],
    defaultStyle: { font: 'Helvetica', fontSize: 8, color: '#000' },
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'center',
      font: 'Helvetica',
      fontSize: 7,
      color: '#666',
    }),
    content,
  };
}
