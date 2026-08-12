import { Project, ScheduleVersion, TrashItem, VersionTrashItem, RuleTrashItem, RibbonTrashItem, ElementTrashItem, CategoryTrashItem, ColorRuleTrashItem } from '../types';
import { cid } from '../lib/ribbonUtils';
import { migrateLegacyProject, migrateLegacyCastMirror, LegacyMigrationResult } from '../lib/legacyMigration';

export const LEGACY_KEY = 'a-little-bit-of-hope-project';
export const INDEX_KEY = 'lemon_schedule_project_index';
export const PROJECT_KEY_PREFIX = 'lemon_schedule_project_v1_';

// Module-level store for communicating legacy migration notices from standalone functions
let _pendingLegacyMigrationNotice: LegacyMigrationResult | null = null;

export function peekPendingLegacyMigrationNotice(): LegacyMigrationResult | null {
  return _pendingLegacyMigrationNotice;
}

export function setPendingLegacyMigrationNotice(result: LegacyMigrationResult): void {
  _pendingLegacyMigrationNotice = result;
}

export function consumePendingLegacyMigrationNotice(): LegacyMigrationResult | null {
  const result = _pendingLegacyMigrationNotice;
  _pendingLegacyMigrationNotice = null;
  return result;
}

export interface ProjectMeta {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
  driveFileId?: string;
}

export function getProjectStorageKey(id: string): string {
  return `${PROJECT_KEY_PREFIX}${id}`;
}

export function loadProjectListFromStorage(): ProjectMeta[] {
  try {
    const stored = localStorage.getItem(INDEX_KEY);
    if (stored) {
      const list: ProjectMeta[] = JSON.parse(stored);
      return list.map(p => ({ createdAt: p.lastModified, ...p }));
    }
  } catch (e) {
    console.error("Failed to load project list", e);
  }
  return [];
}

export function saveProjectListToStorage(list: ProjectMeta[]) {
  const localOnly = list.filter(p => !p.driveFileId);
  localStorage.setItem(INDEX_KEY, JSON.stringify(localOnly));
}

export function loadProjectFromStorage(id: string): Project | null {
  try {
    const stored = localStorage.getItem(getProjectStorageKey(id));
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.scenes && parsed.versions) {
        parsed.versions = parsed.versions.map((v: ScheduleVersion) => ({
          ...v,
          updatedAt: v.updatedAt || v.createdAt || Date.now()
        }));
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        parsed.trash = (parsed.trash || []).filter((t: TrashItem) => {
          return Date.now() - t.deletedAt < thirtyDays;
        }).map((t: TrashItem) => ({
          ...t,
          versionName: t.versionName || 'Unknown'
        }));
        parsed.versionTrash = (parsed.versionTrash || []).filter((t: VersionTrashItem) => {
          return Date.now() - t.deletedAt < thirtyDays;
        });
        parsed.rulesTrash = (parsed.rulesTrash || []).filter((t: RuleTrashItem) => {
          return Date.now() - t.deletedAt < thirtyDays;
        });
        parsed.ribbonTrash = (parsed.ribbonTrash || []).filter((t: RibbonTrashItem) => {
          return Date.now() - t.deletedAt < thirtyDays;
        });
        parsed.elementsTrash = (parsed.elementsTrash || []).filter((t: ElementTrashItem) => {
          return Date.now() - t.deletedAt < thirtyDays;
        });
        parsed.categoryTrash = (parsed.categoryTrash || []).filter((t: CategoryTrashItem) => {
          return Date.now() - t.deletedAt < thirtyDays;
        });
        parsed.colorRulesTrash = (parsed.colorRulesTrash || []).filter((t: ColorRuleTrashItem) => {
          return Date.now() - t.deletedAt < thirtyDays;
        });

        // Migrate renamed keys: extras→backgroundActors, animals→animalsAndWranglers
        for (const s of parsed.scenes || []) {
          if ('extras' in s) { s.backgroundActors = s.extras; delete s.extras; }
          if ('animals' in s) { s.animalsAndWranglers = s.animals; delete s.animals; }
        }
        if (parsed.breakdownElements) {
          if (parsed.breakdownElements.extras) {
            parsed.breakdownElements.backgroundActors = parsed.breakdownElements.extras;
            delete parsed.breakdownElements.extras;
          }
          if (parsed.breakdownElements.animals) {
            parsed.breakdownElements.animalsAndWranglers = parsed.breakdownElements.animals;
            delete parsed.breakdownElements.animals;
          }
          // castMembers is the single source of truth for cast — recover any
          // members only present in the legacy mirror, then drop the mirror
          migrateLegacyCastMirror(parsed);
        }
        for (const d of parsed.ribbonDesigns || []) {
          // Migrate: extract colWidths from cells, strips width from cells
          if (!d.colWidths || d.colWidths.length === 0) {
            const maxRow = (d.rows || []).reduce((a: any, b: any) =>
              (a?.cells?.length ?? 0) >= (b?.cells?.length ?? 0) ? a : b, d.rows?.[0]);
            d.colWidths = maxRow?.cells?.map((c: any) => c.width ?? 10) ?? [];
          }
          const numCols = d.colWidths.length;
          for (const row of d.rows || []) {
            for (const cell of row.cells || []) {
              if (cell.field === 'extras') cell.field = 'backgroundActors';
              if (cell.field === 'animals') cell.field = 'animalsAndWranglers';
              delete (cell as any).width;
            }
            // Pad rows with fewer cells to match colWidths.length
            while ((row.cells || []).length < numCols) {
              row.cells.push({ id: cid(), field: '' });
            }
          }
        }

        parsed.hiddenCategories = parsed.hiddenCategories || [];
        parsed.categoryLabels = parsed.categoryLabels || {};

        for (const v of parsed.versions || []) {
          for (const r of v.rows || []) {
            if (r.type === 'DAYBREAK' && r.daybreakCallTime == null) {
              r.daybreakCallTime = '08:00';
            }
          }
        }

        const migrationResult = migrateLegacyProject(parsed);
        if (migrationResult.migrated) {
          _pendingLegacyMigrationNotice = migrationResult;
        }

        return migrationResult.project;
      }
    }
  } catch (e) {
    console.error("Failed to load project", e);
  }
  return null;
}
