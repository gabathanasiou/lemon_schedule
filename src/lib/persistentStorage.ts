import { Project } from '../types';

const DB_NAME = 'lemon_schedule_storage';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'save_folder_handle';
const INDEX_FILE = '_lemon_schedule_index.json';

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(value: unknown, key: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as T) || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function pickSaveFolder(): Promise<FileSystemDirectoryHandle> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API is not supported in this browser. Use Chrome, Edge, or Brave.');
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'lemon-schedule-save' });
  await ensurePermission(handle);
  await idbPut(handle, HANDLE_KEY);
  return handle;
}

export async function getSavedHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;
  try {
    const handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
    if (!handle) return null;
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return null;
    return handle;
  } catch {
    return null;
  }
}

export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm === 'granted') return true;
  const result = await handle.requestPermission({ mode: 'readwrite' });
  return result === 'granted';
}

export async function clearSavedHandle(): Promise<void> {
  await idbDelete(HANDLE_KEY);
}

export function getFolderDisplayName(handle: FileSystemDirectoryHandle | null | undefined): string {
  if (!handle) return '';
  return handle.name || 'Untitled folder';
}

export interface ProjectIndexEntry {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
}

async function writeJsonFile(handle: FileSystemDirectoryHandle, name: string, data: unknown): Promise<void> {
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

async function readJsonFile<T>(handle: FileSystemDirectoryHandle, name: string): Promise<T | null> {
  try {
    const fileHandle = await handle.getFileHandle(name);
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text()) as T;
  } catch {
    return null;
  }
}

async function deleteFile(handle: FileSystemDirectoryHandle, name: string): Promise<void> {
  try {
    await handle.removeEntry(name);
  } catch {
    // ignore
  }
}

export async function writeProjectToFolder(
  handle: FileSystemDirectoryHandle,
  project: Project
): Promise<void> {
  const ok = await ensurePermission(handle);
  if (!ok) throw new Error('Permission denied to write to save folder');

  await writeJsonFile(handle, `${project.id}.json`, project);

  const index = (await readJsonFile<ProjectIndexEntry[]>(handle, INDEX_FILE)) || [];
  const existing = index.findIndex(e => e.id === project.id);
  const entry: ProjectIndexEntry = {
    id: project.id,
    title: project.title,
    lastModified: Date.now(),
    createdAt: project.id ? (existing >= 0 ? index[existing].createdAt : Date.now()) : Date.now(),
  };
  if (existing >= 0) index[existing] = entry;
  else index.push(entry);
  await writeJsonFile(handle, INDEX_FILE, index);
}

export async function readProjectFromFolder(
  handle: FileSystemDirectoryHandle,
  projectId: string
): Promise<Project | null> {
  const ok = await ensurePermission(handle);
  if (!ok) return null;
  return readJsonFile<Project>(handle, `${projectId}.json`);
}

export async function readIndexFromFolder(
  handle: FileSystemDirectoryHandle
): Promise<ProjectIndexEntry[]> {
  const ok = await ensurePermission(handle);
  if (!ok) return [];
  return (await readJsonFile<ProjectIndexEntry[]>(handle, INDEX_FILE)) || [];
}

export async function deleteProjectFromFolder(
  handle: FileSystemDirectoryHandle,
  projectId: string
): Promise<void> {
  await deleteFile(handle, `${projectId}.json`);
  const index = await readIndexFromFolder(handle);
  const filtered = index.filter(e => e.id !== projectId);
  await writeJsonFile(handle, INDEX_FILE, filtered);
}

export async function listAllProjectsInFolder(
  handle: FileSystemDirectoryHandle
): Promise<Project[]> {
  const ok = await ensurePermission(handle);
  if (!ok) return [];
  const projects: Project[] = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== 'file' || !name.endsWith('.json') || name === INDEX_FILE) continue;
    try {
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const data = JSON.parse(await file.text());
      if (data.id && data.scenes && data.versions) {
        projects.push(data);
      }
    } catch {
      // skip invalid files
    }
  }
  return projects;
}

export async function verifyFolder(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    return perm === 'granted';
  } catch {
    return false;
  }
}
