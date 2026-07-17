import { ProjectRule, RuleViolation, Scene, ScheduleRow, CastMember } from '../types';
import { addMinutesToTime } from './utils';
import {
  formatCastId, formatCastIds,
  maxHoursDetail, dateRestrictionDetail, timeWindowLabel, timeWindowDetail,
  castConflictMessage, castSceneFlagMessage,
} from './violationMessages';

function ordinal(n: number): string {
  const s = ['TH', 'ST', 'ND', 'RD'];
  return (n >= 11 && n <= 13) ? 'TH' : s[n % 10] || 'TH';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${d.getDate()}${ordinal(d.getDate())} ${d.toLocaleDateString('en-US', { month: 'long' })}`;
}

export function checkSection(
  sectionRows: ScheduleRow[],
  sectionDate: string | undefined,
  sectionBaseTime: string,
  rules: ProjectRule[],
  scenes: Scene[],
  castMembers: CastMember[] = [],
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const secRows = sectionRows;
  const secDate = sectionDate;

  for (const rule of rules) {
    if (rule.type === 'MAX_HOURS') {
      if (rule.dates && rule.dates.length > 0 && (!secDate || !rule.dates.includes(secDate))) continue;
      let totalMin = 0;
      let exceeded = false;
      const flaggedScenes: string[] = [];
      for (const row of secRows.sort((a, b) => a.order - b.order)) {
        if (row.type !== 'SCENE' || !row.sceneId) continue;
        const scene = scenes.find(s => s.id === row.sceneId);
        if (!scene || !scene.cast.split(',').map(c => c.trim()).includes(rule.castId)) continue;
        totalMin += row.estimatedDuration || 0;
        if (totalMin / 60 > rule.maxHours) {
          exceeded = true;
          flaggedScenes.push(scene.id);
        }
      }
      if (exceeded) {
        const exceed = totalMin / 60 - rule.maxHours;
        const castName = formatCastId(rule.castId, castMembers);
        violations.push({
          ruleId: rule.id, ruleType: 'MAX_HOURS', castId: rule.castId,
          message: `${castName}: ${maxHoursDetail(rule.maxHours, exceed)}`,
          detail: maxHoursDetail(rule.maxHours, exceed),
          containerId: 0,
          sceneIds: flaggedScenes,
        });
      }
      continue;
    }

    if (rule.type === 'DATE_RESTRICTION') {
      if (!secDate || !rule.dates.includes(secDate)) continue;
      const affectedScenes: string[] = [];
      for (const row of secRows) {
        if (row.type !== 'SCENE' || !row.sceneId) continue;
        const scene = scenes.find(s => s.id === row.sceneId);
        if (!scene || !scene.cast.split(',').map(c => c.trim()).includes(rule.castId)) continue;
        affectedScenes.push(scene.id);
      }
      if (affectedScenes.length > 0) {
        const castName = formatCastId(rule.castId, castMembers);
        violations.push({
          ruleId: rule.id, ruleType: 'DATE_RESTRICTION', castId: rule.castId,
          message: `${castName} unavailable on this date`,
          detail: dateRestrictionDetail(),
          containerId: 0,
          sceneIds: affectedScenes,
        });
      }
      continue;
    }

    if (rule.type === 'TIME_WINDOW') {
      if (rule.dates.length > 0 && (!secDate || !rule.dates.includes(secDate))) continue;
      let runningMin = 0;
      const flaggedScenes: string[] = [];
      for (const row of secRows.sort((a, b) => a.order - b.order)) {
        const callTime = addMinutesToTime(sectionBaseTime, runningMin);
        const dur = row.type === 'BREAK' ? (row.breakDuration || 0) : (row.estimatedDuration || 0);
        const endTime = addMinutesToTime(callTime, dur);

        if (row.type === 'SCENE' && row.sceneId) {
          const scene = scenes.find(s => s.id === row.sceneId);
          if (scene && scene.cast.split(',').map(c => c.trim()).includes(rule.castId)) {
            let flag = false;
            if (rule.windowStart && rule.windowEnd) {
              if (callTime < rule.windowStart || endTime > rule.windowEnd) flag = true;
            } else if (rule.windowStart) {
              if (callTime < rule.windowStart) flag = true;
            } else if (rule.windowEnd) {
              if (endTime > rule.windowEnd) flag = true;
            }
            if (flag) flaggedScenes.push(scene.id);
          }
        }
        runningMin += dur;
      }
      if (flaggedScenes.length > 0) {
        const dateSuffix = rule.dates.length > 0
          ? ` on ${rule.dates.length === 1 ? formatDate(rule.dates[0]) : rule.dates.length + ' dates'}`
          : '';
        const castName = formatCastId(rule.castId, castMembers);
        const label = timeWindowLabel(rule.windowStart, rule.windowEnd);
        violations.push({
          ruleId: rule.id, ruleType: 'TIME_WINDOW', castId: rule.castId,
          message: `${castName} only available ${label}${dateSuffix}`,
          detail: timeWindowDetail(rule.windowStart, rule.windowEnd) + dateSuffix,
          containerId: 0,
          sceneIds: flaggedScenes,
        });
      }
      continue;
    }

    if (rule.type === 'CAST_CONFLICT') {
      const castSet = new Set<string>();
      for (const row of secRows) {
        if (row.type !== 'SCENE' || !row.sceneId) continue;
        const scene = scenes.find(s => s.id === row.sceneId);
        if (!scene) continue;
        for (const c of scene.cast.split(',').map(c => c.trim())) {
          if (c) castSet.add(c);
        }
      }
      const groupA = rule.castIds.filter(c => castSet.has(c));
      const groupB = rule.conflictCastIds.filter(c => castSet.has(c));
      if (groupA.length > 0 && groupB.length > 0) {
        const flaggedScenes: string[] = [];
        for (const row of secRows) {
          if (row.type !== 'SCENE' || !row.sceneId) continue;
          const scene = scenes.find(s => s.id === row.sceneId);
          if (!scene) continue;
          const sceneCast = scene.cast.split(',').map(c => c.trim());
          if (sceneCast.some(c => rule.castIds.includes(c) || rule.conflictCastIds.includes(c))) {
            flaggedScenes.push(scene.id);
          }
        }
        violations.push({
          ruleId: rule.id, ruleType: 'CAST_CONFLICT',
          message: castConflictMessage(formatCastIds(groupA, castMembers), formatCastIds(groupB, castMembers)),
          containerId: 0, sceneIds: flaggedScenes,
        });
      }
      continue;
    }

    if (rule.type === 'CAST_SCENE_FLAG') {
      const flaggedScenes: string[] = [];
      for (const row of secRows) {
        if (row.type !== 'SCENE' || !row.sceneId) continue;
        const scene = scenes.find(s => s.id === row.sceneId);
        if (!scene) continue;
        const sceneCast = scene.cast.split(',').map(c => c.trim());
        if (sceneCast.some(c => rule.castIds.includes(c))) {
          flaggedScenes.push(scene.id);
        }
      }
      if (flaggedScenes.length > 0) {
        violations.push({
          ruleId: rule.id, ruleType: 'CAST_SCENE_FLAG',
          message: castSceneFlagMessage(formatCastIds(rule.castIds, castMembers)),
          containerId: 0, sceneIds: flaggedScenes,
        });
      }
      continue;
    }
  }

  return violations;
}
