import type { ProjectMeta } from '../store';
import type { Project } from '../types';

export interface DriveProjectMeta {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
  driveFileId: string;
}

async function uploadJson(
  accessToken: string,
  name: string,
  data: unknown,
  existingFileId?: string,
): Promise<string> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/json',
  };
  if (!existingFileId) {
    metadata.parents = ['appDataFolder'];
  }

  const formData = new FormData();
  formData.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
  );
  formData.append(
    'file',
    new Blob([JSON.stringify(data)], { type: 'application/json' }),
  );

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const method = existingFileId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API error: ${res.status} ${text}`);
  }
  const file = await res.json();
  return file.id;
}

async function downloadFile(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive download error: ${res.status} ${text}`);
  }
  return res.text();
}

async function listAppDataFiles(accessToken: string): Promise<
  {
    id: string;
    name: string;
    modifiedTime: string;
  }[]
> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name,mimeType,size,modifiedTime)',
    pageSize: '100',
  });
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive list error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.files || [];
}

async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Drive delete error: ${res.status} ${text}`);
  }
}

export async function listDriveProjectMetas(
  accessToken: string,
): Promise<DriveProjectMeta[]> {
  const files = await listAppDataFiles(accessToken);
  const indexFile = files.find(f => f.name === '_lemon_schedule_index.json');
  if (!indexFile) return [];

  const fileIdByName = new Map<string, string>();
  for (const f of files) {
    if (f.name.endsWith('.json') && f.name !== '_lemon_schedule_index.json') {
      fileIdByName.set(f.name, f.id);
    }
  }

  try {
    const raw = await downloadFile(accessToken, indexFile.id);
    const parsed: DriveProjectMeta[] = JSON.parse(raw);
    const result: DriveProjectMeta[] = [];
    for (const entry of parsed) {
      if (!entry.driveFileId) {
        const resolved = fileIdByName.get(`${entry.id}.json`);
        if (!resolved) {
          console.warn('[Drive] Skipping ghost index entry (no file found):', entry.id, entry.title);
          continue;
        }
        entry.driveFileId = resolved;
      }
      result.push(entry);
    }
    console.log('[Drive] listDriveProjectMetas result:', result.map(e => ({ id: e.id, title: e.title, driveFileId: e.driveFileId })));
    return result;
  } catch (e) {
    console.error('Failed to parse Drive index file:', e);
    return [];
  }
}

export async function readDriveProject(
  accessToken: string,
  driveFileId: string,
): Promise<Project> {
  const raw = await downloadFile(accessToken, driveFileId);
  return JSON.parse(raw);
}

export async function saveDriveProject(
  accessToken: string,
  project: Project,
  existingDriveFileId?: string,
): Promise<string> {
  const name = `${project.id}.json`;
  return uploadJson(accessToken, name, project, existingDriveFileId);
}

export async function deleteDriveProject(
  accessToken: string,
  driveFileId: string,
): Promise<void> {
  return deleteFile(accessToken, driveFileId);
}

let _cachedIndexFileId: string | null = null;

export function invalidateDriveIndexCache() {
  _cachedIndexFileId = null;
}

export async function saveDriveIndex(
  accessToken: string,
  index: DriveProjectMeta[],
  existingIndexFileId?: string,
): Promise<string> {
  const name = '_lemon_schedule_index.json';
  const fileId = await uploadJson(
    accessToken,
    name,
    index,
    existingIndexFileId ?? _cachedIndexFileId ?? undefined,
  );
  _cachedIndexFileId = fileId;
  return fileId;
}

export async function updateDriveIndexForProject(
  accessToken: string,
  meta: DriveProjectMeta,
): Promise<string> {
  try {
    const index = await listDriveProjectMetas(accessToken);
    const existing = index.findIndex(i => i.id === meta.id);
    if (existing >= 0) {
      index[existing] = meta;
    } else {
      index.push(meta);
    }
    return saveDriveIndex(accessToken, index);
  } catch (e: any) {
    if (e?.message?.includes('404') || e?.message?.includes('410')) {
      invalidateDriveIndexCache();
    }
    const index = await listDriveProjectMetas(accessToken);
    const existing = index.findIndex(i => i.id === meta.id);
    if (existing >= 0) {
      index[existing] = meta;
    } else {
      index.push(meta);
    }
    return saveDriveIndex(accessToken, index);
  }
}

export async function removeFromDriveIndex(
  accessToken: string,
  projectId: string,
): Promise<void> {
  const index = await listDriveProjectMetas(accessToken);
  const filtered = index.filter(i => i.id !== projectId);
  if (filtered.length === index.length) return;
  await saveDriveIndex(accessToken, filtered);
}

export async function clearAllDriveData(accessToken: string): Promise<number> {
  const files = await listAppDataFiles(accessToken);
  let deleted = 0;
  for (const file of files) {
    try {
      await deleteFile(accessToken, file.id);
      deleted++;
    } catch (e) {
      console.error(`Failed to delete ${file.name}:`, e);
    }
  }
  invalidateDriveIndexCache();
  return deleted;
}
