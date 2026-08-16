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
  lastModified?: number,
): Promise<string> {
  const newFileId = await saveDriveProject(accessToken, project, existingDriveFileId);

  const meta: DriveProjectMeta = {
    id: project.id,
    title: project.title,
    // Moves carry the original modified time over so the cloud copy doesn't
    // appear newer than the local one; regular saves stamp "now".
    lastModified: lastModified ?? Date.now(),
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
