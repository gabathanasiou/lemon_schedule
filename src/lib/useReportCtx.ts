import { useMemo } from 'react';
import { useProject } from '../store';
import { useDaybreakSections } from './useDaybreakSections';
import { buildReportCtx, ReportCtx } from './reportData';

// Report context for the ACTIVE version + ACTIVE calendar plan, built on top
// of the canonical daybreak computation (useDaybreakSections) — never
// re-derived.
export function useReportCtx(): ReportCtx | null {
  const { state, activeCalendarVersion } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
  const { sections, computedRows } = useDaybreakSections();

  return useMemo(() => {
    if (!activeVersion || !activeCalendarVersion) return null;
    return buildReportCtx(project, activeVersion, activeCalendarVersion, { sections, computedRows });
  }, [project, activeVersion, activeCalendarVersion, sections, computedRows]);
}
