import { Project, RuleViolation } from '../types';
import { SectionInfo } from './daybreakUtils';
import { checkSection } from './rulesEngine';

// One canonical violation computation for the whole app. The stripboard /
// calendar / schedule views each run checkSection in their own loop today;
// the reports consume this index. Section date + base call time follow the
// same rules as the daybreak model (the daybreak ABOVE the section is the
// source of truth for its base time) so reports agree with the UI flags.

export const VIOLATION_TYPE_LABELS: Record<string, string> = {
  MAX_HOURS: 'Max Hours',
  DATE_RESTRICTION: 'Date Restriction',
  TIME_WINDOW: 'Time Window',
  CAST_CONFLICT: 'Cast Conflict',
  CAST_SCENE_FLAG: 'Cast Scene Flag',
};

export function violationTypeLabel(type: string): string {
  return VIOLATION_TYPE_LABELS[type] || type;
}

export interface ViolationIndex {
  sectionViolations: Map<number, RuleViolation[]>;
  sceneViolations: Map<string, RuleViolation[]>;
  totalViolations: number;
}

const flaggedSceneIds = (v: RuleViolation): string[] => v.sceneIds || (v.sceneId ? [v.sceneId] : []);

export function computeViolationIndex(project: Project, sections: SectionInfo[]): ViolationIndex {
  const rules = project.rules || [];
  const sectionViolations = new Map<number, RuleViolation[]>();
  const sceneViolations = new Map<string, RuleViolation[]>();
  let totalViolations = 0;

  if (rules.length > 0) {
    const castMembers = project.castMembers || [];
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (s.isPinned || s.rows.length === 0) continue;
      const above = sections[i - 1]?.daybreakRow;
      const baseTime = above?.daybreakCallTime || s.daybreakRow?.daybreakCallTime || '08:00';
      const v = checkSection(s.rows, s.date, baseTime, rules, project.scenes, castMembers);
      if (v.length === 0) continue;
      sectionViolations.set(s.index, v);
      totalViolations += v.length;
      for (const viol of v) {
        for (const sid of flaggedSceneIds(viol)) {
          if (!sceneViolations.has(sid)) sceneViolations.set(sid, []);
          sceneViolations.get(sid)!.push(viol);
        }
      }
    }
  }

  return { sectionViolations, sceneViolations, totalViolations };
}
