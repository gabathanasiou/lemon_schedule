import type { ProjectMeta } from '../store';
import type { Project } from '../types';
import { pruneVersionTrash, pruneCalendarVersionTrash } from '../store/storage';

export function getDriveErrorStatus(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const match = msg.match(/\b(401|403|404|410|429|5\d\d)\b/);
  return match ? parseInt(match[1], 10) : null;
}

export function formatDriveError(err: unknown, fallback = 'Google Drive sync failed. Please try again.'): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const status = getDriveErrorStatus(err);
  if (status === 401 || status === 403) {
    return 'Your Google sign-in has expired. Sign in again to continue.';
  }
  if (status === 429) {
    return 'Google Drive is receiving too many requests. Please wait a moment and try again.';
  }
  if (status && status >= 500) {
    return 'Google Drive is having issues right now. Please try again in a moment.';
  }
  if (/failed to fetch|networkerror|network error|load failed|offline|internet connection/i.test(msg)) {
    return "You're offline - check your connection and try again.";
  }
  return fallback;
}


export interface DriveProjectMeta {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
  driveFileId: string;
}

// Upload strategy — TEXT-ONLY, SMALL request bodies. Never gzip/binary, never
// FormData, never large raw JSON.
//
// Ad-blocker content scripts (AdGuard Extra et al.) wrap window.fetch to
// inspect request bodies for filter matching. They read the body as TEXT and
// rebuild the request from what they read. Verified in a live Safari with
// AdGuard active:
//   - binary bodies (gzip) get corrupted by the text re-encode → Google resets
//     the connection → "TypeError: Load failed" on every save
//   - FormData bodies lose their browser-generated multipart boundary header →
//     Drive 403s the create
//   - plain-text bodies over ~300KB get aborted mid-flight (6s then "Load
//     failed"); bodies ≤100KB pass reliably
//   - upload.googleapis.com and uploadType=resumable URLs are rule-blocked
//     outright; www.googleapis.com/upload passes
//
// So every request body is a STRING of ASCII text: updates use uploadType=media
// with the encoded payload; creates use a manually-framed string multipart with
// an explicit boundary header (no FormData). Large payloads are stored as
// base64(gzip(json)) — ~30x smaller and pure text, so it survives both the
// re-encode AND the size cutoff. Small files stay plain JSON (readable, and
// small uploads pass cleanly). Detection is unambiguous: JSON starts with
// '{'/'[', base64 never does.

const PLAIN_JSON_LIMIT = 100 * 1024;

function isPlainJson(raw: string): boolean {
  const t = raw.trimStart();
  return t.startsWith('{') || t.startsWith('[');
}

async function encodePayload(json: string): Promise<string> {
  if (json.length <= PLAIN_JSON_LIMIT || typeof CompressionStream === 'undefined') {
    return json;
  }
  const bytes = new TextEncoder().encode(json);
  const cs = new CompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  const gz = new Uint8Array(await new Response(stream).arrayBuffer());
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(new Blob([gz]));
  });
}

async function decodePayload(raw: string): Promise<string> {
  if (isPlainJson(raw)) return raw;
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Drive file is compressed but this browser cannot decompress it');
  }
  const bin = atob(raw.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Response(stream).text();
}

function buildMultipartBody(metadata: Record<string, unknown>, payload: string): { boundary: string; body: string } {
  const boundary = `lemonSchedule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const body = [
    `--${boundary}\r\nContent-Disposition: form-data; name="metadata"; filename="blob"\r\nContent-Type: application/json\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="blob"\r\nContent-Type: application/json\r\n\r\n`,
    payload,
    `\r\n--${boundary}--\r\n`,
  ].join('');
  return { boundary, body };
}

async function uploadJson(
  accessToken: string,
  name: string,
  data: unknown,
  existingFileId?: string,
): Promise<string> {
  const payload = await encodePayload(JSON.stringify(data));
  if (existingFileId) {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: payload,
      },
    );
    if (!res.ok) {
      if (res.status === 404 || res.status === 410) {
        return uploadJson(accessToken, name, data);
      }
      const text = await res.text();
      throw new Error(`Drive API error: ${res.status} ${text}`);
    }
    const file = await res.json();
    return file.id;
  }

  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/json',
    parents: ['appDataFolder'],
  };
  const { boundary, body } = buildMultipartBody(metadata, payload);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    },
  );

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
    fields: 'files(id,name,mimeType,size,modifiedTime),nextPageToken',
    pageSize: '100',
  });
  const files: { id: string; name: string; modifiedTime: string }[] = [];
  let next = '';
  do {
    if (next) params.set('pageToken', next);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive list error: ${res.status} ${text}`);
    }
    const data = await res.json();
    files.push(...(data.files || []));
    next = data.nextPageToken || '';
  } while (next);
  return files;
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
  // There may be multiple index files (older builds created a new one on every
  // save). Always read the NEWEST and record its id so the next save PATCHes it
  // instead of orphaning another copy.
  const indexFiles = files
    .filter(f => f.name === '_lemon_schedule_index.json')
    .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
  const indexFile = indexFiles[0];
  if (!indexFile) return [];
  _cachedIndexFileId = indexFile.id;

  const fileIdByName = new Map<string, string>();
  for (const f of files) {
    if (f.name.endsWith('.json') && f.name !== '_lemon_schedule_index.json') {
      fileIdByName.set(f.name, f.id);
    }
  }

  try {
    const raw = await downloadFile(accessToken, indexFile.id);
    const parsed: DriveProjectMeta[] = JSON.parse(await decodePayload(raw));
    const result: DriveProjectMeta[] = [];
    for (const entry of parsed) {
      if (!entry.driveFileId) {
        const resolved = fileIdByName.get(`${entry.id}.json`);
        if (!resolved) {
          console.warn('[Drive] Skipping ghost index entry (no file found):', entry.id, entry.title);
          continue;
        }
        entry.driveFileId = resolved;
      } else if (!fileIdByName.has(`${entry.id}.json`)) {
        console.warn('[Drive] Skipping ghost index entry (file deleted):', entry.id, entry.title);
        continue;
      }
      result.push(entry);
    }
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
  const project: Project = JSON.parse(await decodePayload(raw));
  // Cloud reads must apply the same trash retention as local loads — without
  // this, cloud projects keep every deleted version forever and re-upload
  // them on every save (a project can become 69% trash).
  if (Array.isArray(project.versionTrash)) {
    project.versionTrash = pruneVersionTrash(project.versionTrash);
  }
  if (Array.isArray(project.calendarVersionTrash)) {
    project.calendarVersionTrash = pruneCalendarVersionTrash(project.calendarVersionTrash);
  }
  return project;
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
let _indexCleanupAttempted = false;

export function invalidateDriveIndexCache() {
  _cachedIndexFileId = null;
}

// Older builds orphaned a new `_lemon_schedule_index.json` on every save.
// Best-effort sweep: once per session, delete every index file except the one
// just written. Failure is non-fatal (the extras only cost list flicker).
async function cleanupStaleIndexFiles(accessToken: string, keepFileId: string): Promise<void> {
  if (_indexCleanupAttempted) return;
  _indexCleanupAttempted = true;
  try {
    const files = await listAppDataFiles(accessToken);
    for (const f of files) {
      if (f.name === '_lemon_schedule_index.json' && f.id !== keepFileId) {
        await deleteFile(accessToken, f.id);
      }
    }
  } catch (e) {
    console.warn('[Drive] Index cleanup failed:', e);
    _indexCleanupAttempted = false; // retry on the next save
  }
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
  cleanupStaleIndexFiles(accessToken, fileId);
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
