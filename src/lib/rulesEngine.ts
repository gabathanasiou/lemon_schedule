import { ProjectRule, RuleViolation, Scene, ScheduleRow, ShootDayMeta } from '../types';

export function checkDay(
  shootDay: number,
  rules: ProjectRule[],
  scenes: Scene[],
  rows: ScheduleRow[],
  dayMeta: Record<number, ShootDayMeta>
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const dayRows = rows.filter(r => r.shootDay === shootDay);

  for (const rule of rules) {
    if (rule.type === 'MAX_HOURS') {
      if (rule.days && !rule.days.includes(shootDay)) continue;
      let totalMin = 0;
      const sceneIds = new Set<string>();
      for (const row of dayRows) {
        if (row.type !== 'SCENE' || !row.sceneId) continue;
        const scene = scenes.find(s => s.id === row.sceneId);
        if (!scene || !scene.cast.split(',').map(c => c.trim()).includes(rule.castId)) continue;
        totalMin += row.estimatedDuration || 0;
        sceneIds.add(scene.id);
      }
      const hours = totalMin / 60;
      if (hours > rule.maxHours) {
        violations.push({
          ruleId: rule.id, ruleType: 'MAX_HOURS', castId: rule.castId,
          message: `Cast ${rule.castId}: ${hours.toFixed(1)}h > max ${rule.maxHours}h`,
          shootDay,
        });
      }
      continue;
    }

    if (rule.type === 'DATE_RESTRICTION') {
      const meta = dayMeta[shootDay];
      if (!meta?.date || meta.date !== rule.date) continue;
      for (const row of dayRows) {
        if (row.type !== 'SCENE' || !row.sceneId) continue;
        const scene = scenes.find(s => s.id === row.sceneId);
        if (!scene || !scene.cast.split(',').map(c => c.trim()).includes(rule.castId)) continue;
        violations.push({
          ruleId: rule.id, ruleType: 'DATE_RESTRICTION', castId: rule.castId,
          message: `Cast ${rule.castId} cannot work on ${rule.date}`,
          shootDay, sceneId: scene.id,
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
