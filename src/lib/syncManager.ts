import type { Project } from '../types';
import {
  saveDriveProject,
  deleteDriveProject,
  updateDriveIndexForProject,
  type DriveProjectMeta,
} from './googleDriveStorage';

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
    driveFileId: newFileId,
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
