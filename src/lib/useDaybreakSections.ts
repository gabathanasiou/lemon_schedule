import { useMemo } from 'react';
import { useProject } from '../store';
import { ScheduleRow, Scene } from '../types';

export interface DaybreakSection {
  index: number;
  rows: ScheduleRow[];
  daybreakRow?: ScheduleRow;
}

export function useDaybreakSections() {
  const { state } = useProject();
  const project = state.present;
  const activeVersion = project.versions.find(v => v.id === project.activeVersionId);

  const containerRows = useMemo(() => {
    if (!activeVersion) return [];
    return activeVersion.rows.filter(r => r.containerId != null).sort((a, b) => {
      if ((a.containerId || 0) !== (b.containerId || 0)) return (a.containerId || 0) - (b.containerId || 0);
      return a.order - b.order;
    });
  }, [activeVersion]);

  const sections: DaybreakSection[] = useMemo(() => {
    const s: DaybreakSection[] = [];
    let currentRows: ScheduleRow[] = [];
    let sectionIndex = 0;
    for (const r of containerRows) {
      if (r.type === 'DAYBREAK') {
        s.push({ index: sectionIndex, rows: currentRows, daybreakRow: r });
        currentRows = [];
        sectionIndex++;
      } else {
        currentRows.push(r);
      }
    }
    return s;
  }, [containerRows]);

  const firstSectionPinned = sections[0]?.daybreakRow?.pinned ?? false;

  const productionSections = useMemo(() =>
    firstSectionPinned ? sections.filter((s, i) => i !== 0 || !s.daybreakRow?.pinned) : sections,
  [sections, firstSectionPinned]);

  const addDays = (d: string, n: number) => {
    const parts = d.split('-').map(Number);
    const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + n));
    return dt.toISOString().slice(0, 10);
  };

  const startDate = activeVersion?.productionStart || new Date().toISOString().slice(0, 10);
  const nonShootSet = useMemo(() => {
    return new Set((activeVersion?.nonShootDates || []).map(n => n.date));
  }, [activeVersion?.nonShootDates]);

  const sectionDateMap = useMemo(() => {
    const m = new Map<number, string>();
    let current = startDate;
    for (let i = 0; i < sections.length; i++) {
      while (nonShootSet.has(current)) current = addDays(current, 1);
      m.set(i, current);
      if (!sections[i].daybreakRow?.pinned) {
        current = addDays(current, 1);
      }
    }
    return m;
  }, [sections, startDate, nonShootSet]);

  const sectionLabelMap = useMemo(() => {
    const m = new Map<number, string>();
    sections.forEach((s, i) => {
      if (s.daybreakRow?.pinned) {
        m.set(s.index, '');
      } else {
        m.set(s.index, `Day ${i - (firstSectionPinned ? 1 : 0) + 1}`);
      }
    });
    return m;
  }, [sections, firstSectionPinned]);

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

  const formatSectionDate = (sectionIndex: number): string => {
    const d = sectionDateMap.get(sectionIndex);
    const label = sectionLabelMap.get(sectionIndex) || `Section ${sectionIndex + 1}`;
    if (!d) return `${label} (no date)`;
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return `${label} (no date)`;
    return `${label} (${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
  };

  return {
    sections,
    productionSections,
    sectionDateMap,
    sectionLabelMap,
    sceneToSection,
    formatSectionDate,
    nonShootSet,
    activeVersion,
    project,
  };
}
