import jsPDF from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
applyPlugin(jsPDF);
import type { Project, ScheduleRow, RibbonCell, RibbonRow } from '../../../../types';
import type { CellBorders } from '../../../../lib/persist';
import { getFieldValue, resolveSceneColor, computeMergeGroups, getNoteBreakPad, formatCellText, getAlign } from '../../../../lib/ribbonUtils';
import { addMinutesToTime, formatDuration, formatPageCount } from '../../../../lib/utils';
import { getRibbonColumnWidthsPt } from '../conf/pdfLayout';

const PAGE_MARGIN = 40;
const FONT_SIZE = 8;

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  const year = d.getFullYear();
  const suffixes = ['TH', 'ST', 'ND', 'RD'];
  const suffix = (day >= 11 && day <= 13) ? 'TH' : suffixes[day % 10] || 'TH';
  return `${weekday} ${day}${suffix} ${month} ${year}`;
}

function formatExportDate(): string {
  return new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

export interface JspdfPrintOptions {
  showTimes: boolean;
  showDurations: boolean;
  showCastList: boolean;
  showExportDate: boolean;
  showPageNumbers: boolean;
  selectedDays: number[];
  includeStatusDays: boolean;
  selectedRibbonId?: string;
  cellBorders?: CellBorders;
  orientation: 'portrait' | 'landscape';
  paperSize: 'a4' | 'letter';
}

const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

export function buildPrintScheduleJspdf(project: Project, opts: JspdfPrintOptions): jsPDF {
  const { showTimes, showDurations, showCastList, showExportDate, selectedDays, includeStatusDays, selectedRibbonId, cellBorders, orientation, paperSize } = opts;

  const [pw, ph] = PAGE_SIZES[paperSize];
  const isLandscape = orientation === 'landscape';
  const pageW = isLandscape ? ph : pw;
  const availW = pageW - PAGE_MARGIN * 2;

  const doc = new jsPDF({ orientation: isLandscape ? 'l' : 'p', unit: 'pt', format: paperSize });
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  if (!activeVersion) {
    doc.text('No active schedule version.', PAGE_MARGIN, PAGE_MARGIN);
    return doc;
  }

  const scenes = project.scenes;
  const design = selectedRibbonId ? project.ribbonDesigns.find(d => d.id === selectedRibbonId) : undefined;
  const ribbon = design?.rows;
  const colWidths = design?.colWidths;
  const cellPaddingV = design?.cellPaddingV ?? 6;
  const cellPaddingH = design?.cellPaddingH ?? 6;
  const edgePadding = design?.edgePadding ?? 2;
  const sceneColors = project.colorPalette?.sceneColors;

  // Build scheduled rows per day
  const scheduledRows: Record<number, ScheduleRow[]> = {};
  for (const row of activeVersion.rows) {
    if (row.shootDay !== null) {
      if (!scheduledRows[row.shootDay]) scheduledRows[row.shootDay] = [];
      scheduledRows[row.shootDay].push(row);
    }
  }
  for (const dayRows of Object.values(scheduledRows)) {
    dayRows.sort((a, b) => a.order - b.order);
  }

  // Build list of days to print (matching PrintSchedule logic)
  const augmentedRows: ScheduleRow[] = activeVersion.rows.map(r => ({ ...r }));
  const missingScenes = project.scenes.filter(s => !augmentedRows.some(r => r.sceneId === s.id));
  for (const s of missingScenes) {
    augmentedRows.push({
      id: `row-synth-${s.id}`,
      type: 'SCENE',
      sceneId: s.id,
      shootDay: null,
      order: 999999,
      estimatedDuration: 30,
    });
  }

  // Rebuild scheduledRows with augmented data
  const fullScheduledRows: Record<number, ScheduleRow[]> = {};
  for (const row of augmentedRows) {
    if (row.shootDay !== null) {
      if (!fullScheduledRows[row.shootDay]) fullScheduledRows[row.shootDay] = [];
      fullScheduledRows[row.shootDay].push(row);
    }
  }
  Object.values(fullScheduledRows).forEach(dayRows => dayRows.sort((a, b) => a.order - b.order));

  const allDayEntries = new Set<number>();
  for (const row of augmentedRows) {
    if (row.shootDay !== null) allDayEntries.add(row.shootDay);
  }
  if (includeStatusDays) {
    for (const [k, v] of Object.entries(activeVersion.dayMeta || {})) {
      if ((v as any).status && (v as any).status !== 'work') {
        allDayEntries.add(Number(k));
      }
    }
  }

  const existingDays = Array.from(allDayEntries)
    .filter(d => {
      const rows = fullScheduledRows[d];
      return rows && rows.length > 0 ? selectedDays.includes(d) : includeStatusDays && selectedDays.includes(d);
    })
    .sort((a, b) => {
      const dateA = activeVersion.dayMeta?.[a]?.date || '';
      const dateB = activeVersion.dayMeta?.[b]?.date || '';
      return dateA.localeCompare(dateB);
    });

  // Chrono day numbering: only count work days (matching PrintSchedule chronoDayMap)
  const chronoDayMap = new Map<number, number>();
  {
    let counter = 0;
    for (const d of existingDays) {
      const status = activeVersion.dayMeta?.[d]?.status;
      if (!status || status === 'work') { counter++; chronoDayMap.set(d, counter); }
    }
  }

  // Collect printed cast IDs for cast list
  const printedSceneIds = new Set<string>();
  for (const dayInt of existingDays) {
    for (const row of (fullScheduledRows[dayInt] || [])) {
      if (row.sceneId) printedSceneIds.add(row.sceneId);
    }
  }
  const printedCastIds = new Set<string>();
  for (const s of scenes) {
    if (printedSceneIds.has(s.id)) {
      for (const id of (s.cast || '').split(',').map(x => x.trim()).filter(Boolean)) {
        printedCastIds.add(id);
      }
    }
  }

  // Ribbon / column prep
  const rawCells = ribbon?.[0]?.cells;
  const cw = colWidths ?? [];
  let cells: RibbonCell[] | null = null;
  let filteredWidths: (number | string)[] = [];
  let cellIndices: number[] = [];
  let filteredRibbon: RibbonRow[] | undefined;

  if (rawCells && cw.length > 0) {
    const result = getRibbonColumnWidthsPt(rawCells, cw, showTimes, showDurations);
    filteredWidths = result.widths;
    cellIndices = result.cellIndices;
    cells = cellIndices.length > 0 ? cellIndices.map(i => rawCells[i]) : null;
    filteredRibbon = ribbon?.map(row => ({ ...row, cells: cellIndices.map(i => row.cells[i]).filter(Boolean) }));
  }

  // Convert percentage widths to pt
  const colWidthsPt: number[] = [];
  if (cells) {
    for (const w of filteredWidths) {
      if (typeof w === 'string' && w.endsWith('%')) {
        colWidthsPt.push((parseFloat(w) / 100) * availW);
      } else if (typeof w === 'number') {
        colWidthsPt.push(w);
      } else {
        colWidthsPt.push(availW / filteredWidths.length);
      }
    }
  }

  const ribbonLen = ribbon?.length || 1;
  const noteBreakPad = getNoteBreakPad(cellPaddingV ?? 6, ribbonLen);

  let y = PAGE_MARGIN;

  // ── Title Section ──
  doc.setFontSize(14);
  doc.setFont('Helvetica', 'bold');
  doc.text(project.title || 'Production Schedule', PAGE_MARGIN, y);
  y += 16;
  doc.setFontSize(FONT_SIZE);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(82, 82, 91);
  let subtitle = `Schedule Version: ${activeVersion.name}`;
  if (showExportDate) subtitle += ` ${formatExportDate()}`;
  doc.text(subtitle, PAGE_MARGIN, y);
  y += 6;
  // Bottom border line
  doc.setDrawColor(24, 24, 27);
  doc.setLineWidth(2);
  doc.line(PAGE_MARGIN, y, PAGE_MARGIN + availW, y);
  y += 10;
  doc.setTextColor(0, 0, 0);

  // ── Cast List Page ──
  if (showCastList) {
    const sorted = (project.castMembers || [])
      .filter(m => printedCastIds.has(m.id))
      .sort((a, b) => {
        const na = parseInt(a.id, 10);
        const nb = parseInt(b.id, 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.id.localeCompare(b.id, undefined, { numeric: true });
      });

    if (sorted.length > 0) {
      doc.addPage();
      y = PAGE_MARGIN;
      doc.setFontSize(FONT_SIZE);
      doc.setFont('Helvetica', 'bold');
      doc.text('CAST LIST', PAGE_MARGIN, y);
      y += 4;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1);
      doc.line(PAGE_MARGIN, y, PAGE_MARGIN + availW, y);
      y += 8;

      const ROWS = 10;
      const COLS = 3;
      const grid: (typeof sorted[0] | null)[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      for (let i = 0; i < sorted.length; i++) {
        const col = Math.floor(i / ROWS);
        const row = i % ROWS;
        if (col < COLS) grid[row][col] = sorted[i];
      }

      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      for (let ri = 0; ri < ROWS; ri++) {
        const rowY = y + ri * 12;
        if (rowY > pageW - PAGE_MARGIN) break;
        let xOff = PAGE_MARGIN;
        for (let ci = 0; ci < COLS; ci++) {
          const m = grid[ri][ci];
          if (m) {
            doc.setFont('Helvetica', 'bold');
            doc.text(`${m.id}.`, xOff, rowY);
            const idW = doc.getTextWidth(`${m.id}.`);
            doc.setFont('Helvetica', 'normal');
            doc.text(m.name, xOff + idW + 2, rowY);
          }
          xOff += availW / COLS;
        }
      }
      y = PAGE_MARGIN + ROWS * 12 + 20;
    }
  }

  // ── Build per-column columnStyles ──
  const columnStyles: Record<string, any> = {};
  if (cells) {
    cells.forEach((cell, ci) => {
      columnStyles[ci] = { cellWidth: colWidthsPt[ci] || 50 };
    });
  }

  const borderEnabled = cellBorders !== 'none';
  const hasVertBorder = cellBorders === 'vertical' || cellBorders === 'both';
  const hasHorizBorder = cellBorders === 'horizontal' || cellBorders === 'both';

  // ── Day Loop ──
  for (const dayInt of existingDays) {
    const meta = activeVersion.dayMeta?.[dayInt];
    const dayRows = fullScheduledRows[dayInt] || [];

    const isStatusDay = meta?.status && meta.status !== 'work';

    // Status day with no rows: minimal header
    if (isStatusDay && (!dayRows || dayRows.length === 0)) {
      const statusLabel = meta.status === 'hold' ? 'HOLD' : meta.status === 'travel' ? 'TRAVEL' : 'HOLIDAY';
      const dateStr = meta?.date ? formatDateLong(meta.date) : '';

      if (cells && cells.length > 0) {
        const mainCellIdx = (() => {
          const nonSpecial = cells!.map((c, i) => ({ i, f: c.field })).filter(x => x.f !== 'duration' && x.f !== 'callTime');
          return nonSpecial.length > 0 ? nonSpecial.reduce((a, b) => a.i >= b.i ? a : b).i : 0;
        })();

        const headerRow: any[] = cells.map((cell, ci) => {
          let text = '';
          if (ci === mainCellIdx) text = dateStr;
          else if (ci === 0) text = statusLabel;
          return { content: text || '', styles: { fillColor: '#000000', textColor: '#ffffff', fontSize: FONT_SIZE } };
        });

        doc.autoTable({
          body: [headerRow],
          columnStyles,
          tableWidth: availW,
          margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
          styles: { cellPadding: { top: noteBreakPad, bottom: noteBreakPad, left: cellPaddingH, right: cellPaddingH }, fontSize: FONT_SIZE },
          tableLineColor: [0, 0, 0],
          tableLineWidth: 0,
          startY: y,
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
      } else {
        doc.autoTable({
          body: [[
            { content: statusLabel, styles: { fillColor: '#000000', textColor: '#ffffff', fontSize: FONT_SIZE } },
            { content: dateStr, styles: { fillColor: '#000000', textColor: '#ffffff', fontSize: FONT_SIZE } },
            { content: '', styles: { fillColor: '#000000', textColor: '#ffffff', fontSize: FONT_SIZE } },
          ]],
          tableWidth: availW,
          margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
          styles: { cellPadding: 8, fontSize: FONT_SIZE },
          tableLineColor: [0, 0, 0],
          tableLineWidth: 0,
          startY: y,
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
      }

      // Dashed separator for status days
      doc.setDrawColor(161, 161, 170);
      doc.setLineWidth(1);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(PAGE_MARGIN, y, PAGE_MARGIN + availW, y);
      doc.setLineDashPattern([], 0);
      y += 6;
      continue;
    }

    if (!dayRows || dayRows.length === 0) continue;

    let runningElapsed = 0;
    let totalBreakTime = 0;
    let totalPages = 0;

    const computedRows = dayRows.map(r => {
      const callTime = addMinutesToTime(meta?.unitCall || '08:00', runningElapsed);
      let dur = 0;
      if (r.type === 'SCENE') {
        dur = r.estimatedDuration || 0;
        const scene = scenes.find(s => s.id === r.sceneId);
        if (scene) totalPages += scene.pageCountDecimal;
      } else if (r.type === 'BREAK') {
        dur = r.breakDuration || 0;
        totalBreakTime += dur;
      } else if (r.type === 'NOTE') {
        dur = r.estimatedDuration || 0;
      }
      runningElapsed += dur;
      return { ...r, computedCallTime: callTime };
    });

    const dateStr = meta?.date ? formatDateLong(meta.date) : '';
    const callStr = meta?.unitCall ? `CALL ${meta.unitCall}` : '';
    const chronoDay = chronoDayMap.get(dayInt);

    // ── Day Header ──
    if (cells && cells.length > 0) {
      const mainCellIdx = (() => {
        const nonSpecial = cells!.map((c, i) => ({ i, f: c.field })).filter(x => x.f !== 'duration' && x.f !== 'callTime');
        return nonSpecial.length > 0 ? nonSpecial.reduce((a, b) => a.i >= b.i ? a : b).i : 0;
      })();

      const headerRow: any[] = cells.map((cell, ci) => {
        let text = '';
        if (ci === mainCellIdx) text = dateStr;
        else if (ci === 0 && chronoDay !== undefined) text = `DAY #${chronoDay}`;
        else if (cell.field === 'callTime') text = callStr;
        return { content: text || '', styles: { fillColor: '#000000', textColor: '#ffffff', fontStyle: 'bold', fontSize: FONT_SIZE, halign: 'center' } };
      });

      doc.autoTable({
        body: [headerRow],
        columnStyles,
        tableWidth: availW,
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
        styles: { cellPadding: { top: noteBreakPad, bottom: noteBreakPad, left: cellPaddingH, right: cellPaddingH }, fontSize: FONT_SIZE },
        tableLineColor: [0, 0, 0],
        tableLineWidth: 0,
        startY: y,
      });
      y = (doc as any).lastAutoTable?.finalY || y + 50;
    } else {
      doc.autoTable({
        body: [[
          { content: chronoDay !== undefined ? `DAY #${chronoDay}` : '', styles: { fillColor: '#000000', textColor: '#ffffff', fontStyle: 'bold', fontSize: FONT_SIZE, cellPadding: 8 } },
          { content: dateStr, styles: { fillColor: '#000000', textColor: '#ffffff', fontStyle: 'bold', fontSize: FONT_SIZE, cellPadding: 8, halign: 'center' } },
          { content: callStr, styles: { fillColor: '#000000', textColor: '#ffffff', fontStyle: 'bold', fontSize: FONT_SIZE, cellPadding: 8 } },
        ]],
        tableWidth: availW,
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
        styles: { fontSize: FONT_SIZE },
        tableLineColor: [0, 0, 0],
        tableLineWidth: 0,
        startY: y,
      });
      y = (doc as any).lastAutoTable?.finalY || y + 50;
    }

    // ── Rows ──
    for (const r of computedRows) {
      if (r.type === 'NOTE' || r.type === 'BREAK') {
        const isBreak = r.type === 'BREAK';
        const label = isBreak ? (r as any).breakLabel || 'BREAK' : (r as any).noteText || '';
        const bgColor = isBreak ? '#591b1b' : ((r as any).noteColor || '#591b1b');
        const fgColor = isBreak ? '#ffffff' : ((r as any).noteTextColor || '#ffffff');

        if (cells && filteredWidths.length > 0) {
          const mainCellIdx = (() => {
            const nonSpecial = cells!.map((c, i) => ({ i, f: c.field })).filter(x => x.f !== 'duration' && x.f !== 'callTime');
            return nonSpecial.length > 0 ? nonSpecial.reduce((a, b) => a.i >= b.i ? a : b).i : 0;
          })();

          const noteRow: any[] = cells.map((cell, ci) => {
            if (ci === mainCellIdx) return { content: label, styles: { fillColor: bgColor, textColor: fgColor, fontSize: FONT_SIZE, halign: 'center' } };
            if (cell.field === 'callTime') return { content: r.computedCallTime || '', styles: { fillColor: bgColor, textColor: fgColor, fontSize: FONT_SIZE, halign: getAlign(cell) } };
            if (cell.field === 'duration') return { content: r.estimatedDuration ? formatDuration(r.estimatedDuration) : '', styles: { fillColor: bgColor, textColor: fgColor, fontSize: FONT_SIZE, halign: getAlign(cell) } };
            return { content: '', styles: { fillColor: bgColor, fontSize: FONT_SIZE } };
          });

          doc.autoTable({
            body: [noteRow],
            columnStyles,
            tableWidth: availW,
            margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
            styles: { cellPadding: { top: noteBreakPad, bottom: noteBreakPad, left: cellPaddingH, right: cellPaddingH }, fontSize: FONT_SIZE },
            tableLineColor: [0, 0, 0],
            tableLineWidth: 0,
            startY: y,
          });
          y = (doc as any).lastAutoTable?.finalY || y + 50;
        } else {
          doc.autoTable({
            body: [[
              { content: '', styles: { fillColor: bgColor, fontSize: FONT_SIZE, cellPadding: { top: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), bottom: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), left: 1, right: 1 } } },
              { content: r.computedCallTime || '', styles: { fillColor: bgColor, textColor: fgColor, fontSize: FONT_SIZE, cellPadding: { top: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), bottom: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), left: 1, right: 1 } } },
              { content: r.estimatedDuration ? formatDuration(r.estimatedDuration) : '', styles: { fillColor: bgColor, textColor: fgColor, fontSize: FONT_SIZE, cellPadding: { top: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), bottom: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), left: 1, right: 1 } } },
              { content: '', styles: { fillColor: bgColor, fontSize: FONT_SIZE, cellPadding: { top: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), bottom: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), left: 1, right: 1 } } },
              { content: label, styles: { fillColor: bgColor, textColor: fgColor, fontSize: FONT_SIZE, halign: 'center', cellPadding: { top: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), bottom: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), left: 1, right: 1 } } },
              { content: '', styles: { fillColor: bgColor, fontSize: FONT_SIZE, cellPadding: { top: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), bottom: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), left: 1, right: 1 } } },
              { content: '', styles: { fillColor: bgColor, fontSize: FONT_SIZE, cellPadding: { top: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), bottom: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), left: 1, right: 1 } } },
              { content: '', styles: { fillColor: bgColor, fontSize: FONT_SIZE, cellPadding: { top: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), bottom: getNoteBreakPad(cellPaddingV ?? 6, ribbonLen), left: 1, right: 1 } } },
            ]],
            tableWidth: availW,
            margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
            tableLineColor: [0, 0, 0],
            tableLineWidth: 0,
            startY: y,
          });
          y = (doc as any).lastAutoTable?.finalY || y + 50;
        }

        // Strip bottom border (2pt)
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(2);
        doc.line(PAGE_MARGIN, y, PAGE_MARGIN + availW, y);
        continue;
      }

      const scene = scenes.find(s => s.id === r.sceneId);
      if (!scene) continue;

      const { background: bgColor, color: textColor } = resolveSceneColor(
        scene.intExt || '', scene.dayNight || '', sceneColors,
      );

      if (cells && filteredRibbon && filteredWidths.length > 0) {
        const mgroups = computeMergeGroups(filteredRibbon);
        const hiddenIds = new Set<string>();
        for (const g of mgroups) {
          if (g.direction === 'v') {
            for (let ri = g.rowIndex + 1; ri < g.rowIndex + g.span; ri++) {
              const cell = filteredRibbon[ri]?.cells[g.colIndex];
              if (cell) hiddenIds.add(cell.id);
            }
          } else {
            for (let ci = g.colIndex + 1; ci < g.colIndex + g.span; ci++) {
              const cell = filteredRibbon[g.rowIndex]?.cells[ci];
              if (cell) hiddenIds.add(cell.id);
            }
          }
        }

        const bodyRows: any[][] = [];
        const numRows = filteredRibbon.length;
        for (let ri = 0; ri < numRows; ri++) {
          const row: any[] = [];
          for (let ci = 0; ci < filteredRibbon[ri].cells.length; ci++) {
            const cell = filteredRibbon[ri].cells[ci];
            const g = mgroups.find(gg => gg.colIndex === ci && gg.rowIndex === ri);
            const vSpan = g?.direction === 'v' ? (g.span || 1) : 1;
            const hSpan = g?.direction === 'h' ? (g.span || 1) : 1;
            const isHidden = hiddenIds.has(cell.id);

            if (isHidden) {
              continue;
            }

            let val = '';
            let valFields: any = scene ? { ...scene, computedCallTime: r.computedCallTime, estimatedDuration: r.estimatedDuration || 0, sheetNumber: String(scenes.findIndex(s => s.id === scene.id) + 1) } : {};
            if (cell.field === 'text') {
              val = cell.textContent || '';
            } else if (cell.field === 'callTime') {
              val = r.computedCallTime || '';
            } else if (cell.field === 'duration') {
              val = r.estimatedDuration ? formatDuration(r.estimatedDuration) : '';
            } else {
              val = getFieldValue(cell.field, valFields);
            }
            if (cell.field === 'set') val = val.toUpperCase();
            let display = formatCellText(cell.prefix, val, cell.suffix);

            // Truncate with ellipsis when wrap is off and text exceeds cell width
            if (!cell.wrap && display) {
              let availCellW = colWidthsPt[ci] || 50;
              if (hSpan > 1) {
                for (let si = 1; si < hSpan; si++) {
                  availCellW += colWidthsPt[ci + si] || 50;
                }
              }
              availCellW -= 2 * cellPaddingH;
              if (doc.getTextWidth(display) > availCellW) {
                let lo = 0, hi = display.length;
                while (lo < hi) {
                  const mid = Math.ceil((lo + hi) / 2);
                  if (doc.getTextWidth(display.slice(0, mid) + '…') <= availCellW) {
                    lo = mid;
                  } else {
                    hi = mid - 1;
                  }
                }
                display = display.slice(0, lo) + '…';
              }
            }

            const multiRow = vSpan > 1;
            const align = getAlign(cell);

            const cellObj: any = {
              content: display || '',
              styles: {
                fillColor: bgColor,
                textColor,
                fontSize: FONT_SIZE,
                fontStyle: cell.field === 'sceneNumber' ? 'bold' : 'normal',
                halign: align,
                valign: 'top',
                overflow: cell.wrap ? 'linebreak' : 'hidden',
              },
            };

            if (multiRow) {
              cellObj.rowSpan = vSpan;
              const mTop = (ri === 0) ? edgePadding : 0;
              const mBottom = (ri + vSpan >= numRows) ? edgePadding : 0;
              cellObj.styles.cellPadding = { top: mTop, bottom: mBottom, left: cellPaddingH, right: cellPaddingH };
            } else {
              const nTop = (ri === 0) ? cellPaddingV + edgePadding : cellPaddingV;
              const nBottom = (ri === numRows - 1) ? cellPaddingV + edgePadding : cellPaddingV;
              cellObj.styles.cellPadding = { top: nTop, bottom: nBottom, left: cellPaddingH, right: cellPaddingH };
            }

            if (hSpan > 1) {
              cellObj.colSpan = hSpan;
            }

            // Horizontal border (right side, for vertical | both modes)
            if (borderEnabled && hasVertBorder && ci < filteredRibbon[ri].cells.length - 1) {
              (cellObj as any)._rightBorder = true;
            }

            row.push(cellObj);
          }
          bodyRows.push(row);
        }

        doc.autoTable({
          body: bodyRows,
          columnStyles,
          tableWidth: availW,
          margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
          styles: {
            fontSize: FONT_SIZE,
          },
          tableLineColor: [0, 0, 0],
          tableLineWidth: 0,
          rowPageBreak: 'avoid',
          startY: y,
          didDrawCell: (data: any) => {
            if (borderEnabled && hasVertBorder && data.section === 'body') {
              const cellRaw = data.row?.raw?.[data.column.index];
              if (cellRaw && cellRaw._rightBorder) {
                const { x, y: cy, width, height } = data.cell;
                doc.setDrawColor(textColor);
                doc.setLineWidth(0.5);
                doc.line(x + width, cy, x + width, cy + height);
              }
            }
          },
        });

        y = (doc as any).lastAutoTable?.finalY || y + 60;

        // Strip bottom border (2pt)
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(2);
        doc.line(PAGE_MARGIN, y, PAGE_MARGIN + availW, y);
      } else {
        // No-ribbon fallback
        const noRibbonRow0: any[] = [
          { content: scene.sceneNumber, styles: { fillColor: bgColor, textColor, fontSize: FONT_SIZE, halign: 'center', cellPadding: 3 } },
          { content: r.computedCallTime || '', styles: { fillColor: bgColor, textColor, fontSize: FONT_SIZE, halign: 'center', cellPadding: 3 } },
          { content: r.estimatedDuration ? formatDuration(r.estimatedDuration) : '', styles: { fillColor: bgColor, textColor, fontSize: FONT_SIZE, halign: 'center', cellPadding: 3 } },
          { content: scene.intExt || '', styles: { fillColor: bgColor, textColor, fontSize: FONT_SIZE, halign: 'left', cellPadding: 3 } },
          { content: (scene.set || '').toUpperCase(), styles: { fillColor: bgColor, textColor, fontSize: FONT_SIZE, halign: 'left', cellPadding: 3 } },
          { content: scene.dayNight || '', styles: { fillColor: bgColor, textColor, fontSize: FONT_SIZE, halign: 'left', cellPadding: 3 } },
          { content: scene.cast || '', styles: { fillColor: bgColor, textColor, fontSize: FONT_SIZE, halign: 'left', cellPadding: 3 } },
          { content: scene.pageCount ? `${scene.pageCount} pgs` : '', styles: { fillColor: bgColor, textColor, fontSize: FONT_SIZE, halign: 'center', cellPadding: 3 } },
        ];

        const noRibbonRow1: any[] = [
          { content: '', styles: { fillColor: bgColor, textColor, fontSize: FONT_SIZE, cellPadding: 3 } },
          { content: '', styles: { fillColor: bgColor, textColor, fontSize: FONT_SIZE, cellPadding: 3 } },
          { content: '', styles: { fillColor: bgColor, textColor, fontSize: FONT_SIZE, cellPadding: 3 } },
          { content: '', styles: { fillColor: bgColor, textColor, fontSize: FONT_SIZE, cellPadding: 3 } },
          { content: scene.description || '', colSpan: 5, styles: { fillColor: bgColor, textColor, fontSize: FONT_SIZE, halign: 'left', cellPadding: { top: 0, bottom: 3, left: 3, right: 3 } } },
        ];

        doc.autoTable({
          body: [noRibbonRow0, noRibbonRow1],
          tableWidth: availW,
          margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
          styles: { fontSize: FONT_SIZE },
          tableLineColor: [0, 0, 0],
          tableLineWidth: 0, // Outer borders handled by strip line
          rowPageBreak: 'avoid',
          startY: y,
        });
        y = (doc as any).lastAutoTable?.finalY || y + 60;

        // Strip bottom border (2pt)
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(2);
        doc.line(PAGE_MARGIN, y, PAGE_MARGIN + availW, y);
      }
    }

    // ── Day Footer ──
    const endTime = addMinutesToTime(meta?.unitCall || '08:00', runningElapsed);
    const workTime = runningElapsed - totalBreakTime;
    const textColorFooter = '#18181b';

    if (cells && cells.length > 0) {
      // End-of-day + date row (with ribbon columns)
      doc.autoTable({
        body: [[
          { content: `End of Day #${chronoDay}${runningElapsed > 0 ? ` \u00b7 ${endTime}` : ''}`,
            styles: { fillColor: '#ffffff', textColor: textColorFooter, fontSize: FONT_SIZE, cellPadding: { top: cellPaddingV, bottom: cellPaddingV, left: cellPaddingH, right: cellPaddingH }, halign: 'center' } },
        ]],
        tableWidth: availW,
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
        tableLineColor: [212, 212, 216],
        tableLineWidth: 1,
        startY: y,
      });
      y = (doc as any).lastAutoTable?.finalY || y + 30;

      // Totals row (full width)
      doc.autoTable({
        body: [[
          { content: `Total Pages: ${formatPageCount(totalPages)} pgs`,
            styles: { fillColor: '#ffffff', textColor: textColorFooter, fontSize: FONT_SIZE, halign: 'left' } },
          { content: `EST. TIME: ${formatDuration(workTime)}${totalBreakTime > 0 ? ` + ${formatDuration(totalBreakTime)}` : ''}`,
            styles: { fillColor: '#ffffff', textColor: textColorFooter, fontSize: FONT_SIZE, halign: 'right' } },
        ]],
        tableWidth: availW,
        columnStyles: { 0: { cellWidth: availW * 0.5 }, 1: { cellWidth: availW * 0.5 } },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
        styles: { cellPadding: { top: 2, bottom: cellPaddingV, left: cellPaddingH, right: cellPaddingH } },
        tableLineColor: [0, 0, 0],
        tableLineWidth: 0,
        startY: y,
      });
      y = (doc as any).lastAutoTable?.finalY || y + 20;
    } else {
      doc.autoTable({
        body: [[
          { content: `End of Day #${chronoDay}${runningElapsed > 0 ? ` \u00b7 ${endTime}` : ''}`,
            styles: { fillColor: '#ffffff', textColor: textColorFooter, fontSize: FONT_SIZE, halign: 'left', cellPadding: { top: cellPaddingV, bottom: cellPaddingV, left: cellPaddingH, right: cellPaddingH } } },
          { content: dateStr,
            styles: { fillColor: '#ffffff', textColor: textColorFooter, fontSize: FONT_SIZE, halign: 'center', cellPadding: { top: cellPaddingV, bottom: cellPaddingV, left: cellPaddingH, right: cellPaddingH } } },
          { content: `Total Pages: ${formatPageCount(totalPages)} pgs  |  EST. TIME: ${formatDuration(workTime)}${totalBreakTime > 0 ? ` + ${formatDuration(totalBreakTime)}` : ''}`,
            styles: { fillColor: '#ffffff', textColor: textColorFooter, fontSize: FONT_SIZE, halign: 'right', cellPadding: { top: cellPaddingV, bottom: cellPaddingV, left: cellPaddingH, right: cellPaddingH } } },
        ]],
        tableWidth: availW,
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
        tableLineColor: [212, 212, 216],
        tableLineWidth: 1,
        startY: y,
      });
      y = (doc as any).lastAutoTable?.finalY || y + 20;
    }

    y += 10; // gap between days
  }

  return doc;
}
