import { ProjectRule, RuleViolation, Scene, ScheduleRow, ShootDayMeta } from '../types';
import { addMinutesToTime } from './utils';

function ordinal(n: number): string {
  const s = ['TH', 'ST', 'ND', 'RD'];
  return (n >= 11 && n <= 13) ? 'TH' : s[n % 10] || 'TH';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${d.getDate()}${ordinal(d.getDate())} ${d.toLocaleDateString('en-US', { month: 'long' })}`;
}

export function checkDay(
  shootDay: number,
  rules: ProjectRule[],
  scenes: Scene[],
  rows: ScheduleRow[],
  dayMeta: Record<number, ShootDayMeta>
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const dayRows = rows.filter(r => r.shootDay === shootDay);
  const dayDate = dayMeta[shootDay]?.date;

  for (const rule of rules) {
    if (rule.type === 'MAX_HOURS') {
      if (rule.dates && rule.dates.length > 0 && (!dayDate || !rule.dates.includes(dayDate))) continue;
      let totalMin = 0;
      let exceeded = false;
      const flaggedScenes: string[] = [];
      for (const row of dayRows.sort((a, b) => a.order - b.order)) {
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
        const hours = totalMin / 60;
        const exceed = hours - rule.maxHours;
        violations.push({
          ruleId: rule.id, ruleType: 'MAX_HOURS', castId: rule.castId,
          message: `${rule.castId}: ${hours.toFixed(1)}h scheduled — limit is ${rule.maxHours}h (+${exceed.toFixed(1)}h over)`,
          shootDay,
          sceneIds: flaggedScenes,
        });
      }
      continue;
    }

    if (rule.type === 'DATE_RESTRICTION') {
      if (!dayDate || dayDate !== rule.date) continue;
      const affectedScenes: string[] = [];
      for (const row of dayRows) {
        if (row.type !== 'SCENE' || !row.sceneId) continue;
        const scene = scenes.find(s => s.id === row.sceneId);
        if (!scene || !scene.cast.split(',').map(c => c.trim()).includes(rule.castId)) continue;
        affectedScenes.push(scene.id);
      }
      if (affectedScenes.length > 0) {
        violations.push({
          ruleId: rule.id, ruleType: 'DATE_RESTRICTION', castId: rule.castId,
          message: `${rule.castId} unavailable on ${formatDate(rule.date)}`,
          shootDay,
          sceneIds: affectedScenes,
        });
      }
      continue;
    }

    if (rule.type === 'TIME_WINDOW') {
      if (rule.date && (!dayDate || dayDate !== rule.date)) continue;
      const unitCall = dayMeta[shootDay]?.unitCall || '08:00';
      let runningMin = 0;
      const flaggedScenes: string[] = [];
      for (const row of dayRows.sort((a, b) => a.order - b.order)) {
        const callTime = addMinutesToTime(unitCall, runningMin);
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
const ws = rule.windowStart || '00:00';
        const we = rule.windowEnd || '23:59';
        const fullDay = ws === '00:00' && we === '23:59';
        const desc = fullDay
            ? 'during all day'
            : rule.windowStart && rule.windowEnd
            ? `${ws}–${we}`
            : rule.windowStart ? `after ${ws}`
            : `before ${we}`;
        violations.push({
          ruleId: rule.id, ruleType: 'TIME_WINDOW', castId: rule.castId,
          message: `${rule.castId} only available ${desc}${rule.date ? ` on ${formatDate(rule.date)}` : ''}`,
          shootDay,
          sceneIds: flaggedScenes,
        });
      }
      continue;
    }
  }

  return violations;
}

export function checkAllDays(
  rules: ProjectRule[],
  scenes: Scene[],
  rows: ScheduleRow[],
  dayMeta: Record<number, ShootDayMeta>
): Map<number, RuleViolation[]> {
  const result = new Map<number, RuleViolation[]>();
  const days = new Set(rows.filter(r => r.shootDay !== null).map(r => r.shootDay!));
  for (const sdk of Object.keys(dayMeta)) days.add(Number(sdk));
  for (const day of days) {
    const v = checkDay(day, rules, scenes, rows, dayMeta);
    if (v.length > 0) result.set(day, v);
  }
  return result;
}
