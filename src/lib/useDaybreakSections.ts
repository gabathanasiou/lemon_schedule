import { useMemo } from 'react';
import { useProject } from '../store';
import { ScheduleRow } from '../types';
import { addDays, buildNonShootSet, computeRowData, ProductionDay, ComputedRow, SectionSums, SectionInfo } from './daybreakUtils';

export type { ProductionDay, ComputedRow, SectionSums, SectionInfo };

export function useDaybreakSections() {
  const { state } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const containerRows = useMemo(() => {
    if (!activeVersion) return [];
    return activeVersion.rows.filter(r => r.containerId != null && r.containerId !== -1).sort((a, b) => {
      if ((a.containerId || 0) !== (b.containerId || 0)) return (a.containerId || 0) - (b.containerId || 0);
      return a.order - b.order;
    });
  }, [activeVersion]);

  const nonShootSet = useMemo(() => buildNonShootSet(activeVersion?.nonShootDates), [activeVersion?.nonShootDates]);

  const startDate = activeVersion?.productionStart || new Date().toISOString().slice(0, 10);

  const firstDaybreak = useMemo(() => containerRows.find(r => r.type === 'DAYBREAK'), [containerRows]);
  const callTimeBase = firstDaybreak?.daybreakCallTime || '08:00';

  const {
    computedRows,
    sections,
    sectionDateMap,
    sectionLabelMap,
    sectionSums,
  } = useMemo(
    () => computeRowData(containerRows, project.scenes, startDate, nonShootSet, callTimeBase),
    [containerRows, project.scenes, startDate, nonShootSet, callTimeBase],
  );

  const productionDays: ProductionDay[] = sections;

  const firstSectionPinned = sections[0]?.isPinned ?? false;

  const productionSections = useMemo(() =>
    firstSectionPinned ? sections.filter((_, i) => i !== 0 || !sections[i].isPinned) : sections,
    [sections, firstSectionPinned]);

  const nextSectionDateMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of sections) {
      m.set(s.index, sectionDateMap.get(s.index + 1) || '');
    }
    return m;
  }, [sections, sectionDateMap]);

  const chronoDayMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of sections) {
      if (s.isPinned) continue;
      m.set(s.index, s.chronoDay);
    }
    return m;
  }, [sections]);

  const productionChronoDayMap = useMemo(() => {
    const m = new Map<number, number>();
    let counter = 0;
    for (const s of productionSections) {
      counter++;
      m.set(s.index, counter);
    }
    return m;
  }, [productionSections]);

  const sceneToSection = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sections) {
      for (const r of s.rows) {
        if (r.type === 'SCENE' && r.sceneId) {
          m.set(r.sceneId, s.index);
        }
      }
    }
    return m;
  }, [sections]);

  const daybreakRowToSection = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sections) {
      if (s.daybreakRow) m.set(s.daybreakRow.id, s.index);
    }
    return m;
  }, [sections]);

  const formatSectionDate = (sectionIndex: number): string => {
    const d = sectionDateMap.get(sectionIndex);
    const label = sectionLabelMap.get(sectionIndex) || `Section ${sectionIndex + 1}`;
    if (!d) return `${label} (no date)`;
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return `${label} (no date)`;
    return `${label} (${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
  };

  return {
    productionDays,
    sections,
    productionSections,
    sectionDateMap,
    sectionLabelMap,
    sceneToSection,
    formatSectionDate,
    nonShootSet,
    activeVersion,
    project,
    chronoDayMap,
    productionChronoDayMap,
    nextSectionDateMap,
    daybreakRowToSection,
    computedRows,
    sectionSums,
    startDate,
  };
}
