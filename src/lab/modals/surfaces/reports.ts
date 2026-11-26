import type { SurfaceMetaList } from '../types';

/** Report printing + import surfaces. */
export const meta: SurfaceMetaList = [
  {
    id: 'print-schedule',
    title: 'Print schedule',
    group: 'Reports & Print',
    note: 'Day selection, ribbon and page settings for the stripboard print.',
    kind: 'modal',
    sources: ['src/components/PrintDialog.tsx'],
  },
  {
    id: 'print-report',
    title: 'Print report',
    group: 'Reports & Print',
    note: 'Scope/day/budget filters for a Report Designer design before printing.',
    kind: 'modal',
    sources: ['src/components/reports/ReportPrintDialog.tsx'],
  },
  {
    id: 'dood',
    title: 'Day Out of Days',
    group: 'Reports & Print',
    note: 'DOOD print options: elements, days to include, totals.',
    kind: 'modal',
    sources: ['src/components/print/DoodDialog.tsx'],
  },
  {
    id: 'breakdown-sheet',
    title: 'Scene breakdown sheet',
    group: 'Reports & Print',
    note: 'Select scenes + print the scene breakdown sheet.',
    kind: 'modal',
    sources: ['src/components/print/BreakdownSheetDialog.tsx'],
  },
  {
    id: 'element-breakdown',
    title: 'Element breakdown',
    group: 'Reports & Print',
    note: 'Category + element scope for the element breakdown print.',
    kind: 'modal',
    sources: ['src/components/print/ElementBreakdownDialog.tsx'],
  },
  {
    id: 'text-styles',
    title: 'Text styles',
    group: 'Reports & Print',
    note: 'Named report text styles (the design\'s typography registry).',
    kind: 'modal',
    sources: ['src/components/reports/TextStyleMenu.tsx'],
  },
  {
    id: 'import',
    title: 'Import preview',
    group: 'Reports & Print',
    note: 'Review parsed CSV/FDX/Fountain rows before committing the import.',
    kind: 'modal',
    sources: ['src/components/ImportDialog.tsx'],
  },
  {
    id: 'heading-map',
    title: 'Map script headings',
    group: 'Reports & Print',
    note: 'Map unknown INT/EXT + DAY/NIGHT values from an imported script.',
    kind: 'modal',
    sources: ['src/components/import/HeadingValueMapper.tsx'],
  },
];
