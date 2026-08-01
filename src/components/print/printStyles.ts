export const PRINT_STYLE = `
  @media print {
    html, body, #root, #root > * {
      height: initial !important;
      overflow: initial !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
  @page {
    size: landscape;
    margin: 10mm 8mm;
  }
  .print-root {
    font-family: Helvetica, sans-serif;
    font-size: 8pt;
    line-height: 1.1;
    color: #18181b;
    padding: 0;
    margin: 0;
    width: 100%;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .print-title-section {
    text-align: left;
    padding-bottom: 10pt;
    margin-bottom: 10pt;
    border-bottom: 2pt solid #18181b;
    background: #ffffff;
  }
  .print-title {
    margin: 0;
  }
  .print-subtitle {
    color: #52525b;
    margin: 2pt 0 0 0;
  }
  .print-day {
    page-break-inside: auto;
    background: #ffffff;
  }
  .print-day-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #000000;
    color: #ffffff;
    padding: 16pt 10pt;
  }
  .print-day-number {
    flex: 0 0 auto;
  }
  .print-day-date {
    text-align: center;
    flex: 1;
  }
  .print-day-call {
    flex: 0 0 auto;
  }
  .print-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0;
    padding: 0;
    border: none;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .print-table td {
    padding: 3pt 1pt;
    vertical-align: top;
  }
  .print-col-sc { width: 15pt; text-align: center !important; }
  .print-col-call { width: 20pt; text-align: center !important; }
  .print-col-dur { width: 30pt; text-align: center !important; }
  .print-col-ie { width: 34pt; text-align: left !important; }
  .print-col-set { width: 120pt; text-align: left; text-transform: uppercase; }
  .print-col-dn { width: 40pt; text-align: left !important; }
  .print-col-cast { width: 56pt; text-align: left !important; }
  .print-col-pgs { width: 34pt; text-align: center !important; }

  .print-table .print-row-scene td,
  .print-table .print-row-desc td {
    border-right: 1px solid var(--td-border-color, #ffffff);
  }

  .print-table .print-row-note td,
  .print-table .print-row-break td {
    background: var(--note-bg, #591b1b);
    color: var(--note-fg, #ffffff);
    vertical-align: middle;
    padding-top: var(--note-row-py, 12px) !important;
    padding-bottom: var(--note-row-py, 12px) !important;
    border-right: 1px solid var(--td-border-color, #591b1b);
    border-bottom: 1px solid var(--td-border-color, #591b1b);
  }
  .print-row-scene td { padding-bottom: 3pt !important; }
  .print-row-desc td { vertical-align: middle; padding-top: 0 !important; }
  .print-cell-desc {
    line-height: 1.1;
    text-align: left !important;
  }

  .print-table tbody tr:first-child td {
    border-top: 1px solid #000 !important;
  }
  .print-table:last-of-type tbody tr:last-child td {
    border-bottom: 1px solid #000 !important;
  }
  .print-table td:first-child {
    border-left: 1px solid #000 !important;
  }
  .print-table td:last-child {
    border-right: 1px solid #000 !important;
  }

`;

export const CAST_LIST_STYLE = `
  .cast-list-page {
    page-break-after: always;
    padding-top: 10pt;
    background: #ffffff;
  }
  .cast-list-title {
    text-align: left;
    font-family: Helvetica, sans-serif;
    font-size: 8pt;
    font-weight: 700;
    margin: 0 0 8pt 0;
    border-bottom: 1pt solid #000;
    padding-bottom: 4pt;
  }
  .cast-list-table {
    width: 100%;
    border-collapse: collapse;
    font-family: Helvetica, sans-serif;
    font-size: 8pt;
    table-layout: fixed;
  }
  .cast-list-table td {
    width: 33.33%;
    padding: 2pt 8pt;
    vertical-align: top;
    border: none;
  }
  .cast-list-cell {
    line-height: 1.4;
  }
  .cast-list-id {
    font-weight: 600;
  }
`;
