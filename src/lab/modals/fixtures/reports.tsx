import React, { useEffect, useMemo, useState } from 'react';
import type { SurfaceRender } from '../types';
import { meta } from '../surfaces/reports';
import PrintDialog from '../../../components/PrintDialog';
import DoodDialog from '../../../components/print/DoodDialog';
import BreakdownSheetDialog from '../../../components/print/BreakdownSheetDialog';
import ElementBreakdownDialog from '../../../components/print/ElementBreakdownDialog';
import ReportPrintDialog from '../../../components/reports/ReportPrintDialog';
import { TextStylesModal } from '../../../components/reports/TextStyleMenu';
import ImportDialog from '../../../components/ImportDialog';
import HeadingValueMapper from '../../../components/import/HeadingValueMapper';
import {
  knownDayNightValues,
  knownIntExtValues,
  parseCSV,
  type ImportResult,
} from '../../../lib/import';
import type { Project } from '../../../types';
import type { FixtureContext } from '../types';

/**
 * Reports & Print fixture batch (roadmap 374). Every surface renders the REAL
 * component open against the active project — the print dialogs read the
 * canonical daybreak/report hooks (`useDaybreakSections` / `useReportCtx`), so
 * no parallel provider is mounted here. Print actions close the preview
 * (the real dialogs close to print; the studio offers Re-open) and never start
 * a real print job.
 */

type Id = (typeof meta)[number]['id'];

/** A tiny, real CSV run through the canonical parser — the import preview's
 *  review stage (cast assignment + new category) needs a parsed result. */
const IMPORT_SAMPLE_CSV = [
  'Scene,Pages,I/E,Set,D/N,Description,Cast,Props,Aerial Rigging,Notes',
  '1,1 2/8,INT,DRUGSTORE,DAY,"George with Mary and Violet. Mr Gower gets telegram.","GEORGE, MARY",Ledger,,',
  '2,3/8,EXT,MAIN STREET BEDFORD FALLS,DAY,"George runs through town waving the newspaper.",GEORGE,Bicycle,Drone plate,"Snow falling"',
  '3,1/8,INT,BAILEY BUILDING,DAY,"George and Mary share a look across the counter.","GEORGE, MARY",Cash box,,',
].join('\n');

const PreviewNote: React.FC<{ text: string }> = ({ text }) => (
  <div className="mx-auto mt-10 max-w-md rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-3 text-[11px] leading-relaxed text-[color:var(--ui-text-muted)]">
    {text}
  </div>
);

/** Print — the Report Designer's scope dialog. `useReportCtx()` is a hook over
 *  the active project/version/calendar, so the App's own context is enough. */
const PrintReportPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  const design = useMemo(
    () => project.reportDesigns?.find(d => d.id === ctx.picks.reportDesign?.id) ?? project.reportDesigns?.[0],
    [project.reportDesigns, ctx.picks.reportDesign],
  );
  useEffect(() => {
    if (!design) return;
    ctx.select({ kind: 'report', id: design.id, label: design.name });
    // Select is the studio's publisher, not project state — never a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design?.id]);

  if (!design) return <PreviewNote text="This project has no report designs yet — open Design → Reports to create one." />;
  return <ReportPrintDialog design={design} onPrint={ctx.close} onClose={ctx.close} />;
};

/** Import preview — parse a tiny sample CSV through the real parser, then open
 *  the review stage exactly as File → Import does. */
const ImportPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const file = new File([IMPORT_SAMPLE_CSV], 'scene-list-revised.csv', { type: 'text/csv' });
    parseCSV(file, project.castMembers || [], project.customCategories || [], project.categoryLabels || {})
      .then(parsed => { if (alive) setResult(parsed); })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : 'Could not parse the sample CSV');
      });
    return () => { alive = false; };
  }, [project.castMembers, project.customCategories, project.categoryLabels]);

  if (error) return <PreviewNote text={error} />;
  if (!result) return <PreviewNote text="Parsing the sample scene list…" />;
  return <ImportDialog initialResult={result} initialFileName="scene-list-revised.csv" onClose={ctx.close} />;
};

/** Heading mapping — the unknown values the importer would prompt for. */
const HeadingMapPreview: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  const unknown = useMemo(() => {
    const intExt = ['INTERIOR', 'EXTERIOR'].filter(v => !knownIntExtValues(project).includes(v));
    const dayNight = ['DAWN', 'DUSK'].filter(v => !knownDayNightValues(project).includes(v));
    return {
      intExt: intExt.length ? intExt : ['INT./EXT.'],
      dayNight: dayNight.length ? dayNight : ['MAGIC HOUR'],
    };
  }, [project]);
  return (
    <HeadingValueMapper
      unknown={unknown}
      knownIntExt={knownIntExtValues(project)}
      knownDayNight={knownDayNightValues(project)}
      onCancel={ctx.close}
      onConfirm={() => ctx.close()}
    />
  );
};

/** Shared category preselect for the two element prints. */
function pickedCategory(ctx: FixtureContext, project: Project): string | undefined {
  const picked = ctx.picks.element?.category;
  if (picked && picked in (project.breakdownElements || {})) return picked;
  return undefined;
}

export const render: Record<Id, SurfaceRender> = {
  'print-schedule': (ctx) => <PrintDialog onPrint={ctx.close} onClose={ctx.close} />,
  'print-report': (ctx) => <PrintReportPreview ctx={ctx} />,
  dood: (ctx) => (
    <DoodDialog
      selectedCategory={pickedCategory(ctx, ctx.project!)}
      onPrint={ctx.close}
      onClose={ctx.close}
    />
  ),
  'breakdown-sheet': (ctx) => <BreakdownSheetDialog onPrint={ctx.close} onClose={ctx.close} />,
  'element-breakdown': (ctx) => (
    <ElementBreakdownDialog
      selectedCategory={pickedCategory(ctx, ctx.project!)}
      onPrint={ctx.close}
      onClose={ctx.close}
    />
  ),
  'text-styles': (ctx) => (
    <TextStylesModal
      open
      project={ctx.project!}
      onClose={ctx.close}
      onSave={styles => ctx.dispatch({ type: 'SET_REPORT_TEXT_STYLES', payload: styles })}
    />
  ),
  import: (ctx) => <ImportPreview ctx={ctx} />,
  'heading-map': (ctx) => <HeadingMapPreview ctx={ctx} />,
};
