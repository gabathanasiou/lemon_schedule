import type { TDocumentDefinitions, Content, Table, TableCell } from '../conf/pdfMakeSetup';
import type { Project, Scene, ScheduleRow, ShootDayMeta, RibbonCell, RibbonRow, SceneColorEntry } from '../../../../types';
import type { CellBorders } from '../../../../lib/persist';
import { getFieldValue, resolveSceneColor, computeMergeGroups, getNoteBannerColors, getNoteBreakPad, formatCellText, getAlign } from '../../../../lib/ribbonUtils';
import { addMinutesToTime, formatDuration, formatPageCount } from '../../../../lib/utils';
import {
  PAGE_SIZES,   PAGE_MARGINS, DEFAULT_FONT, DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT,
  DEFAULT_TEXT_COLOR, BASE_STYLE, DAY_HEADER_STYLE, NOTE_ROW_STYLE,
  BREAK_ROW_STYLE, BORDER_COLOR, TABLE_BORDER, sceneCellStyle,
  formatDateLong, formatDateShort, CAST_LIST_STYLE, PAGE_NUMBER_STYLE,
  TITLE_STYLE, SUBTITLE_STYLE, SUBTITLE_COLOR, getRibbonColumnWidthsPt,
  TITLE_FONT_SIZE,
} from '../conf/pdfLayout';

export interface PrintSchedulePdfOptions {
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

function buildCastListContent(castMembers: Project['castMembers'], castIds: Set<string>): Content {
  const sorted = [...castMembers]
    .filter(m => castIds.has(m.id))
    .sort((a, b) => {
      const na = parseInt(a.id, 10);
      const nb = parseInt(b.id, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  if (sorted.length === 0) return { text: '' };

  const ROWS = 10;
  const COLS = 3;
  const grid: (typeof sorted[0] | null)[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let i = 0; i < sorted.length; i++) {
    const col = Math.floor(i / ROWS);
    const row = i % ROWS;
    if (col < COLS) grid[row][col] = sorted[i];
  }

  return {
    stack: [
      { text: 'CAST LIST', style: 'castListTitle' },
      {
        table: {
          widths: ['*', '*', '*'],
          body: grid.map((row) =>
            row.map((m) => ({
              text: m ? `${m.id}. ${m.name}` : '',
              ...CAST_LIST_STYLE,
            })),
          ),
        },
        layout: 'noBorders',
      },
    ],
    pageBreak: 'after',
  };
}

export function buildPrintScheduleDoc(project: Project, opts: PrintSchedulePdfOptions): TDocumentDefinitions {
  const {
    showTimes, showDurations, showCastList, showExportDate, showPageNumbers,
    selectedDays, includeStatusDays, selectedRibbonId, cellBorders,
    orientation, paperSize,
  } = opts;

  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  if (!activeVersion) {
    return {
      content: [{ text: 'No active schedule version.', ...BASE_STYLE }],
      defaultStyle: BASE_STYLE,
    };
  }

  const scenes = project.scenes;
  const design = selectedRibbonId ? project.ribbonDesigns.find(d => d.id === selectedRibbonId) : undefined;
  const ribbon = design?.rows;
  const colWidths = design?.colWidths;
  const cellPaddingV = design?.cellPaddingV ?? 6;
  const cellPaddingH = design?.cellPaddingH ?? 6;
  const edgePadding = design?.edgePadding ?? 2;
  const sceneColors = project.colorPalette?.sceneColors;

  const margins = PAGE_MARGINS[orientation];
  const pageSize = PAGE_SIZES[paperSize];

  const augmentedRows: ScheduleRow[] = activeVersion.rows.map(r => ({ ...r }));
  const missingScenes = scenes.filter(s => !augmentedRows.some(r => r.sceneId === s.id));
  for (const s of missingScenes) {
    augmentedRows.push({
      id: `row-synth-${s.id}`,
      type: 'SCENE' as const,
      sceneId: s.id,
      shootDay: null as unknown as number,
      order: 999999,
      estimatedDuration: 30,
    });
  }

  const scheduledRows: Record<number, ScheduleRow[]> = {};
  for (const row of augmentedRows) {
    if (row.shootDay !== null) {
      if (!scheduledRows[row.shootDay]) scheduledRows[row.shootDay] = [];
      scheduledRows[row.shootDay].push(row);
    }
  }
  for (const dayRows of Object.values(scheduledRows)) {
    dayRows.sort((a, b) => a.order - b.order);
  }

  const allDayEntries = new Set<number>();
  for (const row of augmentedRows) {
    if (row.shootDay !== null) allDayEntries.add(row.shootDay);
  }
  if (includeStatusDays) {
    for (const [k, v] of Object.entries(activeVersion.dayMeta || {})) {
      if ((v as ShootDayMeta).status && (v as ShootDayMeta).status !== 'work') {
        allDayEntries.add(Number(k));
      }
    }
  }

  const existingDays = Array.from(allDayEntries)
    .filter(d => {
      const hasRows = scheduledRows[d] && scheduledRows[d].length > 0;
      if (hasRows) return selectedDays.includes(d);
      return includeStatusDays && selectedDays.includes(d);
    })
    .sort((a, b) => {
      const dateA = activeVersion.dayMeta?.[a]?.date || '';
      const dateB = activeVersion.dayMeta?.[b]?.date || '';
      return dateA.localeCompare(dateB);
    });

  const chronoDayMap = new Map<number, number>();
  let counter = 0;
  for (const d of existingDays) {
    const meta = activeVersion.dayMeta?.[d];
    if (!meta?.status || meta.status === 'work') {
      counter++;
      chronoDayMap.set(d, counter);
    }
  }

  const printedSceneIds = new Set<string>();
  for (const dayInt of existingDays) {
    for (const row of scheduledRows[dayInt] || []) {
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

  const content: Content[] = [];

  if (showCastList) {
    content.push(buildCastListContent(project.castMembers || [], printedCastIds));
  }

  const exportDate = showExportDate
    ? new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  content.push({
    table: {
      widths: ['*'],
      body: [[
        { stack: [
          { text: project.title || 'Production Schedule', ...TITLE_STYLE },
          { text: [
            { text: `Schedule Version: ${activeVersion.name}`, ...SUBTITLE_STYLE },
            ...(exportDate ? [{ text: `  ${exportDate}` }] : []),
          ], margin: [0, 2, 0, 0] },
        ] },
      ]],
    },
    layout: {
      hLineWidth: (i: number, node: any) => i === node.table.body.length ? 2 : 0,
      vLineWidth: () => 0,
      hLineColor: (i: number, node: any) => i === node.table.body.length ? '#18181b' : '#fff',
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 10,
    },
  });

  for (const dayInt of existingDays) {
    const meta = activeVersion.dayMeta?.[dayInt];
    const rows = scheduledRows[dayInt] || [];
    const chronoDay = chronoDayMap.get(dayInt);
    const chronoLabel = chronoDay != null ? `DAY #${chronoDay}` : '';

    const dayBlocks: Content[] = [];

    const dateStr = meta?.date ? formatDateLong(meta.date) : '';
    const callStr = `CALL ${meta?.unitCall || ''}`;

    const isStatusDay = meta?.status && meta.status !== 'work';
    if (isStatusDay && rows.length === 0) {
      const statusLabel = meta.status === 'hold' ? 'HOLD' : meta.status === 'travel' ? 'TRAVEL' : 'HOLIDAY';
      dayBlocks.push({
        table: {
          widths: ['*'],
          body: [[
            {
              text: `${statusLabel}${dateStr ? `  ${dateStr}` : ''}`,
              ...DAY_HEADER_STYLE,
              margin: [0, 6, 0, 6],
            } as TableCell,
          ]],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 6,
          paddingBottom: () => 6,
          fillColor: () => '#000000',
        },
      });
      content.push({ stack: dayBlocks, margin: [0, 0, 0, 2] });
      continue;
    }

    let runningElapsed = 0;
    let totalBreakTime = 0;
    let totalPages = 0;

    const computedRows = rows.map(r => {
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

    const mainCellIdx = cells ? (() => {
      const nonSpecial = cells
        .map((c, i) => ({ i, w: (filteredWidths[i] as number) ?? 0, f: c.field }))
        .filter(x => x.f !== 'duration' && x.f !== 'callTime');
      return nonSpecial.length > 0
        ? nonSpecial.reduce((a, b) => a.w >= b.w ? a : b).i
        : 0;
    })() : null;

    const noteBreakPad = getNoteBreakPad(cellPaddingV ?? 6, ribbon?.length || 1);
    const dayHeaderStyle = DAY_HEADER_STYLE;

    const headerPadV = noteBreakPad;
    const headerPadH = cellPaddingH ?? 6;

    if (cells && filteredWidths.length > 0) {
      const headerRow: TableCell[] = cells.map((cell, ci) => {
        let text = '';
        if (ci === mainCellIdx) {
          text = dateStr;
        } else if (ci === 0) {
          text = chronoLabel;
        } else if (cell.field === 'callTime') {
          text = callStr;
        }
        return {
          text,
          ...dayHeaderStyle,
          alignment: getAlign(cell) as 'left' | 'center' | 'right',
          margin: [0, headerPadV, 0, headerPadV],
        };
      });

      dayBlocks.push({
        table: {
          widths: filteredWidths,
          body: [headerRow],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => headerPadH,
          paddingRight: () => headerPadH,
          paddingTop: () => 0,
          paddingBottom: () => 0,
          fillColor: () => '#000000',
          defaultBorder: false,
        },
      });
    } else {
      dayBlocks.push({
        table: {
          widths: ['*', '*', '*'],
          body: [[
            { text: chronoLabel, ...dayHeaderStyle },
            { text: dateStr, ...dayHeaderStyle, alignment: 'center' },
            { text: callStr, ...dayHeaderStyle, alignment: 'right' },
          ]],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 10,
          paddingRight: () => 10,
          paddingTop: () => 16,
          paddingBottom: () => 16,
          fillColor: () => '#000000',
          defaultBorder: false,
        },
      });
    }

    const rowBodies: Content[] = [];

    for (const r of computedRows) {
      if (r.type === 'NOTE') {
        const noteBg = (r as any).noteColor || '#591b1b';
        const noteFg = (r as any).noteTextColor || '#ffffff';

        if (cells && filteredWidths.length > 0) {
          const noteRow = cells.map((cell, ci) => {
            if (ci === mainCellIdx) {
              return {
                text: r.noteText || '',
                font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE,
                color: noteFg, fillColor: noteBg,
                alignment: 'center',
                margin: [0, noteBreakPad, 0, noteBreakPad],
              };
            }
            if (cell.field === 'callTime') {
              return {
                text: r.computedCallTime || '',
                font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE,
                color: noteFg, fillColor: noteBg,
                alignment: 'center',
                margin: [0, noteBreakPad, 0, noteBreakPad],
              };
            }
            if (cell.field === 'duration') {
              const durText = r.estimatedDuration ? formatDuration(r.estimatedDuration) : '';
              return {
                text: durText,
                font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE,
                color: noteFg, fillColor: noteBg,
                alignment: 'center',
                margin: [0, noteBreakPad, 0, noteBreakPad],
              };
            }
            return { text: '', fillColor: noteBg };
          });

          rowBodies.push({
            table: {
              widths: filteredWidths,
              body: [noteRow],
              dontBreakRows: true,
            },
            layout: {
              hLineWidth: () => 1,
              vLineWidth: () => 0,
              hLineColor: () => '#000',
              paddingLeft: () => 4,
              paddingRight: () => 4,
              paddingTop: () => noteBreakPad,
              paddingBottom: () => noteBreakPad,
              fillColor: () => noteBg,
              defaultBorder: false,
            },
          } as Content);
        } else {
          rowBodies.push({
            table: {
              widths: [15, 20, 30, 34, 120, 40, 56, 34],
              body: [[
                { text: '' }, { text: r.computedCallTime || '' },
                { text: r.estimatedDuration ? formatDuration(r.estimatedDuration) : '' },
                { text: '' }, { text: r.noteText || '', alignment: 'center' },
                { text: '' }, { text: '' },
              ].map((c: any) => ({ ...c, fillColor: noteBg, color: noteFg, font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE }))],
              dontBreakRows: true,
            },
            layout: {
              hLineWidth: () => 1,
              vLineWidth: () => 0,
              hLineColor: () => '#000',
              paddingLeft: () => 4,
              paddingRight: () => 4,
              paddingTop: () => noteBreakPad,
              paddingBottom: () => noteBreakPad,
            },
          } as Content);
        }
        continue;
      }

      if (r.type === 'BREAK') {
        const breakLabel = r.breakLabel || 'BREAK';

        if (cells && filteredWidths.length > 0) {
          const breakRow = cells.map((cell, ci) => {
            if (ci === mainCellIdx) {
              return {
                text: breakLabel,
                font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, bold: true,
                fillColor: '#591b1b', color: '#ffffff',
                alignment: 'center',
                margin: [0, noteBreakPad, 0, noteBreakPad],
              };
            }
            if (cell.field === 'callTime') {
              return {
                text: r.computedCallTime || '',
                font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE,
                fillColor: '#591b1b', color: '#ffffff',
                alignment: 'center',
                margin: [0, noteBreakPad, 0, noteBreakPad],
              };
            }
            if (cell.field === 'duration') {
              const durText = r.breakDuration ? formatDuration(r.breakDuration) : '';
              return {
                text: durText,
                font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE,
                fillColor: '#591b1b', color: '#ffffff',
                alignment: 'center',
                margin: [0, noteBreakPad, 0, noteBreakPad],
              };
            }
            return { text: '', fillColor: '#591b1b' };
          });

          rowBodies.push({
            table: {
              widths: filteredWidths,
              body: [breakRow],
              dontBreakRows: true,
            },
            layout: {
              hLineWidth: () => 1,
              vLineWidth: () => 0,
              hLineColor: () => '#000',
              fillColor: () => '#591b1b',
              defaultBorder: false,
              paddingLeft: () => 4,
              paddingRight: () => 4,
              paddingTop: () => noteBreakPad,
              paddingBottom: () => noteBreakPad,
            },
          } as Content);
        } else {
          rowBodies.push({
            table: {
              widths: [15, 20, 30, 34, 120, 40, 56, 34],
              body: [[
                { text: '' }, { text: r.computedCallTime || '' },
                { text: formatDuration(r.breakDuration || 0) },
                { text: '' },                 { text: breakLabel, alignment: 'center' },
                { text: '' }, { text: '' },
              ].map((c: any) => ({ ...c, fillColor: '#591b1b', color: '#ffffff', font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE }))],
              dontBreakRows: true,
            },
            layout: {
              hLineWidth: () => 1,
              vLineWidth: () => 0,
              hLineColor: () => '#000',
              fillColor: () => '#591b1b',
              defaultBorder: false,
              paddingLeft: () => 4,
              paddingRight: () => 4,
              paddingTop: () => noteBreakPad,
              paddingBottom: () => noteBreakPad,
            },
          } as Content);
        }
        continue;
      }

      const scene = scenes.find(s => s.id === r.sceneId);
      if (!scene) continue;

      const { background: bgColor, color: textColor } = resolveSceneColor(
        scene.intExt || '', scene.dayNight || '', sceneColors,
      );

      if (cells && filteredRibbon && filteredWidths.length > 0) {
        const cpv = cellPaddingV ?? 6;
        const cph = cellPaddingH ?? 6;
        const ep = edgePadding ?? 2;
        const isVertical = cellBorders === 'vertical' || cellBorders === 'both';
        const isHorizontal = cellBorders === 'horizontal' || cellBorders === 'both';

        const mgroups = computeMergeGroups(filteredRibbon);
        if (scene.sceneNumber === '16') {
          console.log('mgroups for scene 16:', JSON.stringify(mgroups));
          console.log('filteredRibbon rows:', filteredRibbon.map(r => r.cells.map(c => c.field).join(',')));
        }
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

        const gridItems: { cell: RibbonCell; col: number; row: number; vSpan: number; hSpan: number }[] = [];
        for (let ri = 0; ri < filteredRibbon.length; ri++) {
          for (let ci = 0; ci < filteredRibbon[ri].cells.length; ci++) {
            const cell = filteredRibbon[ri].cells[ci];
            if (hiddenIds.has(cell.id)) continue;
            const g = mgroups.find(gg => gg.colIndex === ci && gg.rowIndex === ri);
            const vSpan = g?.direction === 'v' ? (g.span || 1) : 1;
            const hSpan = g?.direction === 'h' ? (g.span || 1) : 1;
            gridItems.push({ cell, col: ci, row: ri, vSpan, hSpan });
          }
        }

        const numVisibleRows = Math.max(1, gridItems.length > 0
          ? Math.max(...gridItems.map(item => item.row + (item.vSpan > 1 ? item.vSpan - 1 : 0))) + 1
          : filteredRibbon.length);

        const tableGrid: (TableCell | null)[][] = Array.from({ length: numVisibleRows }, () =>
          Array(filteredWidths.length).fill(null).map(() => null),
        );

        for (const { cell, col, row, vSpan, hSpan } of gridItems) {
          if (col >= filteredWidths.length) continue;
          if (row >= numVisibleRows) continue;

          const span = vSpan || 1;
          const multiRow = span > 1;

          let val = '';
          if (cell.field === 'text') {
            val = cell.textContent || '';
          } else if (cell.field === 'callTime') {
            val = r.computedCallTime || '';
          } else if (cell.field === 'duration') {
            val = r.estimatedDuration ? formatDuration(r.estimatedDuration) : '';
          } else {
            val = getFieldValue(cell.field, scene as any);
          }
          if (cell.field === 'set') val = val.toUpperCase();
          const display = formatCellText(cell.prefix, val, cell.suffix);

          const multiRowLineHeight = (8 * 1.1 + (cpv * 2) / 1.333) / 8;  // ~2.23 ≈ calc(8pt*1.1 + 12px) as relative lineHeight
          const cellDef: TableCell = {
            text: display || '',
            font: DEFAULT_FONT,
            fontSize: DEFAULT_FONT_SIZE,
            lineHeight: multiRow ? multiRowLineHeight : DEFAULT_LINE_HEIGHT,
            color: textColor,
            fillColor: bgColor,
            alignment: getAlign(cell) as 'left' | 'center' | 'right',
            bold: cell.field === 'sceneNumber',
          };

          // Per-cell margin mirrors getRibbonCellBaseStyle padding:
          //   multiRow => 0px cph (no vertical padding)
          //   single   => cpv cph (uniform on all 4 sides)
          // First row adds edgePadding to top, last row adds it to bottom.
          // pdfmake margin format: [left, top, right, bottom]
          if (multiRow) {
            cellDef.margin = [cph, 0, cph, 0];
          } else {
            const mt = cpv + (row === 0 ? ep : 0);
            const mb = cpv + (row === numVisibleRows - 1 ? ep : 0);
            // Add extra bottom margin on row 0 to balance row 1's description wrapping
            // (pdfmake rows are independent; CSS grid uses 1fr 1fr).
            const extra = (row === 0 && !multiRow) ? cpv * 2 : 0;
            cellDef.margin = [cph, mt, cph, mb + extra];
          }

          if (cellBorders !== 'none') {
            const isLastInRow = col + (hSpan || 1) >= filteredWidths.length;
            const isLastRow = row + (vSpan || 1) >= numVisibleRows;
            (cellDef as any).border = [false, false, isVertical && !isLastInRow, isHorizontal && !isLastRow];
            (cellDef as any).borderColor = ['#fff', '#fff', isVertical && !isLastInRow ? textColor : '#fff', isHorizontal && !isLastRow ? textColor : '#fff'];
          }

          if (vSpan && vSpan > 1) cellDef.rowSpan = vSpan;
          if (hSpan && hSpan > 1) cellDef.colSpan = hSpan;

          tableGrid[row][col] = cellDef;
        }

        const safeGrid: TableCell[][] = tableGrid.map(row =>
          row.map(cell => cell ?? { text: '' }),
        );

        // Bottom 2pt border via last-row cells (avoids pdfmake layout lines
        // that cut through rowSpan merged areas).
        const lastRow = safeGrid[safeGrid.length - 1];
        if (lastRow) {
          for (const cell of lastRow) {
            const existing = (cell as any).border;
            if (existing) {
              (cell as any).border = [existing[0], existing[1], existing[2], true];
              const ec = (cell as any).borderColor;
              (cell as any).borderColor = ec ? [ec[0], ec[1], ec[2], '#000'] : ['#fff', '#fff', '#fff', '#000'];
            } else {
              (cell as any).border = [false, false, false, true];
              (cell as any).borderColor = ['#fff', '#fff', '#fff', '#000'];
            }
          }
        }

        if (scene.sceneNumber === '16') {
          console.log('grid for scene 16:', safeGrid.map((row, ri) =>
            row.map((c, ci) => {
              const tc = c as any;
              if (tc?.rowSpan) return `RS${tc.rowSpan} ${tc.text?.slice(0, 12) || ''}`;
              if (tc?.colSpan) return `CS${tc.colSpan}`;
              if (tc?.text?.trim() === '') return '..';
              return tc?.text?.slice(0, 12) || '..';
            }).join(' | ')
          ).join('  │  '));
        }

        rowBodies.push({
          table: {
            widths: filteredWidths,
            body: safeGrid,
            dontBreakRows: true,
          },
          // Move hLineWidth to post-process: pdfmake draws between-row lines (i=1)
          // through rowSpan cells even at 0 width. Use per-cell borders instead.
          layout: {
            paddingLeft: () => 0,
            paddingRight: () => 0,
            paddingTop: () => 0,
            paddingBottom: () => 0,
            fillColor: () => bgColor,
            defaultBorder: false,
          },
        } as Content);
      } else {
        const noRibbonRow: TableCell[] = [
          { text: scene.sceneNumber, font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, color: textColor, fillColor: bgColor, alignment: 'center', margin: [3, 1, 3, 1] },
        ];
        if (showTimes) noRibbonRow.push({ text: r.computedCallTime || '', font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, color: textColor, fillColor: bgColor, alignment: 'center', margin: [3, 1, 3, 1] });
        if (showDurations) noRibbonRow.push({ text: formatDuration(r.estimatedDuration || 0), font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, color: textColor, fillColor: bgColor, alignment: 'center', margin: [3, 1, 3, 1] });
        noRibbonRow.push({ text: scene.intExt, font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, color: textColor, fillColor: bgColor, alignment: 'left', margin: [3, 1, 3, 1] });
        noRibbonRow.push({ text: (scene.set || '').toUpperCase(), font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, color: textColor, fillColor: bgColor, alignment: 'left', margin: [3, 1, 3, 1] });
        noRibbonRow.push({ text: scene.dayNight, font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, color: textColor, fillColor: bgColor, alignment: 'left', margin: [3, 1, 3, 1] });
        noRibbonRow.push({ text: scene.cast, font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, color: textColor, fillColor: bgColor, alignment: 'left', margin: [3, 1, 3, 1] });
        noRibbonRow.push({ text: scene.pageCount ? `${scene.pageCount} pgs` : '', font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, color: textColor, fillColor: bgColor, alignment: 'center', margin: [3, 1, 3, 1] });

        const descRow: TableCell[] = [
          { text: '', fillColor: bgColor, margin: [0, 0, 0, 0] },
        ];
        if (showTimes) descRow.push({ text: '', fillColor: bgColor, margin: [0, 0, 0, 0] });
        if (showDurations) descRow.push({ text: '', fillColor: bgColor, margin: [0, 0, 0, 0] });
        descRow.push({
          text: scene.description || '',
          font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, lineHeight: DEFAULT_LINE_HEIGHT,
          color: textColor, fillColor: bgColor,
          margin: [0, 0, 0, 2],
          colSpan: 5,
        });
        for (let i = descRow.length; i < noRibbonRow.length; i++) {
          descRow.push({ text: '', fillColor: bgColor, margin: [0, 0, 0, 0] });
        }

        const colWidthsFixed = [
          15,
          ...(showTimes ? [20] : []),
          ...(showDurations ? [30] : []),
          34, 120, 40, 56, 34,
        ];

        rowBodies.push({
          table: {
            widths: colWidthsFixed,
            body: [noRibbonRow, descRow],
            dontBreakRows: true,
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => '#000',
            vLineColor: () => textColor,
            paddingLeft: () => 1,
            paddingRight: () => 1,
            paddingTop: () => 0,
            paddingBottom: () => 0,
          },
        } as Content);
      }
    }

    dayBlocks.push({ stack: rowBodies });

    const endTime = addMinutesToTime(meta?.unitCall || '08:00', runningElapsed);
    const footerContent: Content[] = [];
    const workTime = runningElapsed - totalBreakTime;

    if (cells && filteredWidths.length > 0) {
      const footerRow: TableCell[] = cells.map((cell, ci) => {
        let text = '';
        if (ci === 0) {
          text = `End of Day #${chronoDay}${runningElapsed > 0 ? ` · ${endTime}` : ''}`;
        } else if (ci === mainCellIdx) {
          text = dateStr;
        }
        return {
          text,
          font: DEFAULT_FONT,
          fontSize: DEFAULT_FONT_SIZE,
          color: DEFAULT_TEXT_COLOR,
          alignment: getAlign(cell) as 'left' | 'center' | 'right',
          margin: [4, 4, 4, 4],
        };
      });

      footerContent.push({
        table: {
          widths: filteredWidths,
          body: [footerRow],
        },
        layout: {
          hLineWidth: (i: number) => i === 0 ? 1 : 0,
          hLineColor: () => '#d4d4d8',
          vLineWidth: () => 0,
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 4,
          paddingBottom: () => 4,
          fillColor: () => '#ffffff',
          defaultBorder: false,
        },
      });
    } else {
      footerContent.push({
        table: {
          widths: ['*', '*', '*'],
          body: [[
            { text: `End of Day #${chronoDay}${runningElapsed > 0 ? ` · ${endTime}` : ''}`, font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, color: DEFAULT_TEXT_COLOR, margin: [4, 4, 4, 4] },
            { text: dateStr, font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, color: DEFAULT_TEXT_COLOR, alignment: 'center', margin: [4, 4, 4, 4] },
            { text: '', font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, color: DEFAULT_TEXT_COLOR, alignment: 'right' },
          ]],
        },
        layout: {
          hLineWidth: (i: number) => i === 0 ? 1 : 0,
          hLineColor: () => '#d4d4d8',
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 4,
          paddingBottom: () => 4,
          defaultBorder: false,
        },
      });
    }

    footerContent.push({
      table: {
        widths: ['*', '*'],
        body: [[
          { text: `Total Pages: ${formatPageCount(totalPages)} pgs`, font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, color: DEFAULT_TEXT_COLOR, alignment: 'left' as const },
          {
            text: `EST. TIME: ${formatDuration(workTime)}${totalBreakTime > 0 ? ` + ${formatDuration(totalBreakTime)}` : ''}`,
            font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, color: DEFAULT_TEXT_COLOR, alignment: 'right' as const,
          },
        ]],
      },
      layout: 'noBorders',
    });

    dayBlocks.push({ stack: footerContent });

    content.push({
      stack: dayBlocks,
      margin: [0, 0, 0, 4],
    });
  }

  const docDef: TDocumentDefinitions = {
    pageSize,
    pageOrientation: orientation === 'landscape' ? 'landscape' : 'portrait',
    pageMargins: [margins[0], margins[1], margins[2], margins[3]],
    defaultStyle: BASE_STYLE,
    content,
    styles: {
      castListTitle: {
        font: DEFAULT_FONT,
        fontSize: TITLE_FONT_SIZE,
        bold: true,
        margin: [0, 0, 0, 6],
      },
    },
  };

  if (showPageNumbers) {
    docDef.footer = (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'center',
      font: DEFAULT_FONT,
      fontSize: 7,
      color: '#52525b',
    });
  }

  return docDef;
}
