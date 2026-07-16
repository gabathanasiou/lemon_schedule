import { Project, ScheduleVersion, ScheduleRow } from '../types';
import { generateUUID } from './utils';

export interface LegacyMigrationResult {
  project: Project;
  migrated: boolean;
  dayCount: number;
  versionCount: number;
}

export function isLegacyVersion(v: ScheduleVersion): boolean {
  if ((v as any).dayMeta) return true;
  for (const r of v.rows || []) {
    if ('shootDay' in r && !('containerId' in r)) return true;
  }
  return false;
}

function migrateLegacyVersion(v: ScheduleVersion): ScheduleVersion {
  if (!isLegacyVersion(v)) return v;

  const dayMeta = (v as any).dayMeta || {};

  const unscheduledRows: ScheduleRow[] = [];
  const dayGroups = new Map<number, ScheduleRow[]>();

  for (const r of v.rows || []) {
    const sd = (r as any).shootDay;
    if (sd == null) {
      unscheduledRows.push(r);
    } else {
      const group = dayGroups.get(sd) || [];
      group.push(r);
      dayGroups.set(sd, group);
    }
  }

  const sortedShootDays = Array.from(dayGroups.keys()).sort((a, b) => a - b);

  // Build new rows array: unscheduled (containerId null), then container 1 with daybreaks
  const newRows: ScheduleRow[] = [];

  // 1. Unscheduled rows: remove shootDay, set containerId null, renumber order
  unscheduledRows
    .sort((a, b) => a.order - b.order)
    .forEach((r, i) => {
      const cleaned = { ...r };
      delete (cleaned as any).shootDay;
      cleaned.containerId = null;
      cleaned.order = i;
      newRows.push(cleaned);
    });

  if (sortedShootDays.length === 0) {
    delete (v as any).dayMeta;
    delete (v as any).legacy;
    return { ...v, rows: newRows };
  }

  // 2. Container 1: start with pinned DAYBREAK using first shootDay's metadata
  const firstDay = sortedShootDays[0];
  const firstMeta = dayMeta[String(firstDay)] || {};
  const firstCallTime = firstMeta.unitCall || '08:00';
  const firstDate = firstMeta.date || '';

  const pinnedDaybreak: ScheduleRow = {
    id: generateUUID(),
    type: 'DAYBREAK',
    containerId: 1,
    order: 0,
    daybreakLabel: 'DAYBREAK',
    daybreakCallTime: firstCallTime,
    daybreakDate: firstDate,
    pinned: true,
  };
  newRows.push(pinnedDaybreak);

  // 3. First shootDay's rows at order 1, 2, 3, ...
  let order = 1;
  const firstGroup = dayGroups.get(firstDay) || [];
  firstGroup.sort((a, b) => a.order - b.order).forEach(r => {
    const cleaned = { ...r };
    delete (cleaned as any).shootDay;
    cleaned.containerId = 1;
    cleaned.order = order++;
    newRows.push(cleaned);
  });

  // 4. For each subsequent shootDay: non-pinned DAYBREAK then that day's rows
  for (let i = 1; i < sortedShootDays.length; i++) {
    const day = sortedShootDays[i];
    const meta = dayMeta[String(day)] || {};
    const callTime = meta.unitCall || '08:00';
    const date = meta.date || '';

    const daybreak: ScheduleRow = {
      id: generateUUID(),
      type: 'DAYBREAK',
      containerId: 1,
      order: order++,
      daybreakLabel: 'DAYBREAK',
      daybreakCallTime: callTime,
      daybreakDate: date,
      pinned: false,
    };
    newRows.push(daybreak);

    const group = dayGroups.get(day) || [];
    group.sort((a, b) => a.order - b.order).forEach(r => {
      const cleaned = { ...r };
      delete (cleaned as any).shootDay;
      cleaned.containerId = 1;
      cleaned.order = order++;
      newRows.push(cleaned);
    });
  }

  // 5. Trailing DAYBREAK to close the last section
  newRows.push({
    id: generateUUID(),
    type: 'DAYBREAK',
    containerId: 1,
    order: order++,
    daybreakLabel: 'DAYBREAK',
    daybreakCallTime: '',
    daybreakDate: '',
    pinned: false,
  });

  delete (v as any).dayMeta;
  delete (v as any).legacy;

  return { ...v, rows: newRows };
}

export function migrateLegacyProject(project: Project): LegacyMigrationResult {
  let migrated = false;
  let versionCount = 0;
  let dayCount = 0;

  if (!project.versions) return { project, migrated: false, dayCount: 0, versionCount: 0 };

  for (let i = 0; i < project.versions.length; i++) {
    if (isLegacyVersion(project.versions[i])) {
      migrated = true;
      versionCount++;
      const dayMeta = (project.versions[i] as any).dayMeta || {};
      dayCount = Math.max(dayCount, Object.keys(dayMeta).length);
      project.versions[i] = migrateLegacyVersion(project.versions[i]);
    }
  }

  if (project.versionTrash) {
    for (let i = 0; i < project.versionTrash.length; i++) {
      if (isLegacyVersion(project.versionTrash[i].version)) {
        migrated = true;
        versionCount++;
        project.versionTrash[i].version = migrateLegacyVersion(project.versionTrash[i].version);
      }
    }
  }

  return { project, migrated, dayCount, versionCount };
}
