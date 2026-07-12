import type { ProjectMeta } from '../store';
import type { Project } from '../types';
import {
  listDriveProjects,
  saveDriveProject,
  deleteDriveProject,
  updateDriveIndexForProject,
  type DriveProjectMeta,
} from './googleDriveStorage';

export interface Conflict {
  projectId: string;
  localTitle: string;
  localModified: number;
  driveTitle: string;
  driveModified: number;
  resolution: 'keep_local' | 'keep_drive' | 'keep_both' | 'unresolved';
}

export async function pullFromDrive(
  accessToken: string,
  localProjects: ProjectMeta[],
): Promise<{
  newProjects: { project: Project; driveFileId: string }[];
  updatedProjects: { project: Project; driveFileId: string }[];
  conflicts: Conflict[];
}> {
  const { projects: driveProjects } = await listDriveProjects(accessToken);

  const newProjects: { project: Project; driveFileId: string }[] = [];
  const updatedProjects: { project: Project; driveFileId: string }[] = [];
  const conflicts: Conflict[] = [];

  const localMap = new Map(localProjects.map(p => [p.id, p]));

  for (const [projectId, driveProject] of driveProjects) {
    const localMeta = localMap.get(projectId);

    if (!localMeta) {
      newProjects.push({ project: driveProject, driveFileId: projectId });
      continue;
    }

    const driveModified = driveProject.versions?.[0]?.createdAt ?? 0;

    if (driveModified > localMeta.lastModified) {
      if (localMeta.driveFileId === projectId || !localMeta.driveFileId) {
        updatedProjects.push({ project: driveProject, driveFileId: projectId });
      } else {
        conflicts.push({
          projectId,
          localTitle: localMeta.title,
          localModified: localMeta.lastModified,
          driveTitle: driveProject.title,
          driveModified,
          resolution: 'unresolved',
        });
      }
    }
  }

  return { newProjects, updatedProjects, conflicts };
}

export async function pushToDrive(
  accessToken: string,
  project: Project,
  driveFileId?: string,
): Promise<{ driveFileId: string }> {
  const newFileId = await saveDriveProject(accessToken, project, driveFileId);
  return { driveFileId: newFileId };
}

export async function pushProjectAndUpdateIndex(
  accessToken: string,
  project: Project,
  existingDriveFileId?: string,
): Promise<string> {
  const newFileId = await saveDriveProject(accessToken, project, existingDriveFileId);

  const meta: DriveProjectMeta = {
    id: project.id,
    title: project.title,
    lastModified: Date.now(),
    createdAt: project.versions?.[0]?.createdAt ?? Date.now(),
  };
  await updateDriveIndexForProject(accessToken, meta);

  return newFileId;
}

export async function removeFromDrive(
  accessToken: string,
  driveFileId: string,
): Promise<void> {
  return deleteDriveProject(accessToken, driveFileId);
}

export function resolveConflict(
  conflict: Conflict,
  localProject: Project,
  driveProject: Project,
): { action: 'keep_local' | 'keep_drive' | 'keep_both'; project?: Project } {
  switch (conflict.resolution) {
    case 'keep_local':
      return { action: 'keep_local' };
    case 'keep_drive':
      return { action: 'keep_drive', project: driveProject };
    case 'keep_both':
      return {
        action: 'keep_both',
        project: { ...driveProject, title: `${driveProject.title} (from Drive)` },
      };
    default:
      return { action: 'keep_local' };
  }
}

export function toDriveProjectMeta(p: ProjectMeta): DriveProjectMeta {
  return {
    id: p.id,
    title: p.title,
    lastModified: p.lastModified,
    createdAt: p.createdAt,
  };
}
