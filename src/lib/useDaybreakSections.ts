import { useMemo } from 'react';
import { useProject } from '../store';
import { ScheduleRow } from '../types';
import { addDays, buildNonShootSet, splitSections, computeRowData, ProductionDay, ComputedRow, SectionSums } from './daybreakUtils';

export type { ProductionDay, ComputedRow, SectionSums };

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

  const productionDays: ProductionDay[] = useMemo(() => splitSections(containerRows), [containerRows]);

  const firstSectionPinned = productionDays[0]?.daybreakRow?.pinned ?? false;

  const productionSections = useMemo(() =>
    firstSectionPinned ? productionDays.filter((s, i) => i !== 0 || !s.daybreakRow?.pinned) : productionDays,
    [productionDays, firstSectionPinned]);

  const nonShootSet = useMemo(() => buildNonShootSet(activeVersion?.nonShootDates), [activeVersion?.nonShootDates]);

  const startDate = activeVersion?.productionStart || new Date().toISOString().slice(0, 10);

  const sectionDateMap = useMemo(() => {
    const m = new Map<number, string>();
    let current = startDate;
    for (let i = 0; i < productionDays.length; i++) {
      while (nonShootSet.has(current)) current = addDays(current, 1);
      m.set(i, current);
      if (!productionDays[i].daybreakRow?.pinned) {
        current = addDays(current, 1);
      }
    }
    return m;
  }, [productionDays, startDate, nonShootSet]);

  const sectionLabelMap = useMemo(() => {
    const m = new Map<number, string>();
    productionDays.forEach((s, i) => {
      if (s.daybreakRow?.pinned) {
        m.set(s.index, '');
      } else {
        m.set(s.index, `Day ${i - (firstSectionPinned ? 1 : 0) + 1}`);
      }
    });
    return m;
  }, [productionDays, firstSectionPinned]);

  const nextSectionDateMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of productionDays) {
      m.set(s.index, sectionDateMap.get(s.index + 1) || '');
    }
    return m;
  }, [productionDays, sectionDateMap]);

  const chronoDayMap = useMemo(() => {
    const m = new Map<number, number>();
    let counter = 0;
    for (const s of productionDays) {
      if (s.daybreakRow?.pinned) continue;
      counter++;
      m.set(s.index, counter);
    }
    return m;
  }, [productionDays]);

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
    for (const s of productionDays) {
      for (const r of s.rows) {
        if (r.type === 'SCENE' && r.sceneId) {
          m.set(r.sceneId, s.index);
        }
      }
    }
    return m;
  }, [productionDays]);

  const daybreakRowToSection = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of productionDays) {
      if (s.daybreakRow) m.set(s.daybreakRow.id, s.index);
    }
    return m;
  }, [productionDays]);

  const firstDaybreak = useMemo(() => productionDays.find(p => p.daybreakRow)?.daybreakRow, [productionDays]);
  const callTimeBase = firstDaybreak?.daybreakCallTime || '08:00';

  const { computedRows, sectionSums } = useMemo(
    () => computeRowData(containerRows, productionDays, project.scenes, sectionDateMap, sectionLabelMap, callTimeBase),
    [containerRows, productionDays, project.scenes, sectionDateMap, sectionLabelMap, callTimeBase],
  );

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
    sections: productionDays,
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