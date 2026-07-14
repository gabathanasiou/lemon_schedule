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
      current = addDays(current, 1);
    }
    return m;
  }, [sections, startDate, nonShootSet]);

  const sectionLabelMap = useMemo(() => {
    const m = new Map<number, string>();
    sections.forEach((s, i) => {
      m.set(s.index, `Day ${i + 1}`);
    });
    return m;
  }, [sections]);

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
    if (!d) return `Section ${sectionIndex + 1}`;
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return `Section ${sectionIndex + 1}`;
    return `Day ${sectionIndex + 1} (${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
  };

  return {
    sections,
    sectionDateMap,
    sectionLabelMap,
    sceneToSection,
    formatSectionDate,
    nonShootSet,
    activeVersion,
    project,
  };
}
