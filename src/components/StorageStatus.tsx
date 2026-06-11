import React, { useState, useEffect } from 'react';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import DropdownDivider from './DropdownDivider';
import {
  pickSaveFolder, getSavedHandle, clearSavedHandle, ensurePermission,
  isFileSystemAccessSupported, getFolderDisplayName, verifyFolder, readIndexFromFolder,
} from '../lib/persistentStorage';
import type { ProjectIndexEntry } from '../lib/persistentStorage';
import { useDialog } from './Dialog';
export type { ProjectIndexEntry };
import { HardDrive, FolderOpen, Check, AlertTriangle, Loader2, X, RefreshCw } from 'lucide-react';

export type SaveStatus = 'unsupported' | 'idle' | 'saving' | 'saved' | 'error' | 'no-permission';

interface StorageStatusProps {
  handle: FileSystemDirectoryHandle | null;
  status: SaveStatus;
  errorMessage?: string;
  onHandleChange: (h: FileSystemDirectoryHandle | null) => void;
  onStatusChange: (s: SaveStatus, error?: string) => void;
  onRestoreClick: (entries: ProjectIndexEntry[], projects: { id: string; data: string }[]) => void;
}

export const StorageStatus: React.FC<StorageStatusProps> = ({
  handle, status, errorMessage, onHandleChange, onStatusChange, onRestoreClick,
}) => {
  const dialog = useDialog();
  const [menuOpen, setMenuOpen] = useState(false);
  const supported = isFileSystemAccessSupported();

  const handlePick = async () => {
    setMenuOpen(false);
    try {
      const h = await pickSaveFolder();
      onHandleChange(h);
      onStatusChange('saved');
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      onStatusChange('error', e?.message || 'Could not access folder');
    }
  };

  const handleRegrant = async () => {
    setMenuOpen(false);
    if (!handle) return;
    const ok = await ensurePermission(handle);
    if (ok) onStatusChange('saved');
    else onStatusChange('no-permission', 'Permission denied');
  };

  const handleClear = async () => {
    setMenuOpen(false);
    const ok = await dialog.confirm({ title: 'Stop saving to this folder?', message: 'Files in the folder will remain on disk, but new changes won\'t be mirrored there until you pick a folder again.' });
    if (!ok) return;
    await clearSavedHandle();
    onHandleChange(null);
    onStatusChange('idle');
  };

  const handleListForRestore = async () => {
    setMenuOpen(false);
    if (!handle) return;
    try {
      const ok = await verifyFolder(handle);
      if (!ok) {
        onStatusChange('no-permission', 'Permission denied');
        return;
      }
      const entries = await readIndexFromFolder(handle);
      const projects: { id: string; data: string }[] = [];
      for (const entry of entries) {
        try {
          const fileHandle = await handle.getFileHandle(`${entry.id}.json`);
          const file = await fileHandle.getFile();
          projects.push({ id: entry.id, data: await file.text() });
        } catch {
          // skip
        }
      }
      onRestoreClick(entries, projects);
    } catch (e: any) {
      onStatusChange('error', e?.message || 'Could not read folder');
    }
  };

  if (!supported) {
    return (
      <button
        disabled
        title="Folder-based autosave requires Chrome, Edge, or Brave. Projects are saved to browser cache only."
        className="flex items-center gap-1.5 text-amber-400/80 text-xs px-2.5 py-1 rounded cursor-not-allowed"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        Cache only
      </button>
    );
  }

  // No folder configured
  if (!handle) {
    return (
      <button
        onClick={handlePick}
        className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 text-xs px-2.5 py-1 rounded hover:bg-zinc-800 transition-colors"
        title="Pick a folder so your projects are saved to disk and survive browser cache clearing"
      >
        <HardDrive className="w-3.5 h-3.5" />
        Set save folder
      </button>
    );
  }

  // Folder configured - status indicator with dropdown
  const icon = status === 'saving'
    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
    : status === 'error' || status === 'no-permission'
    ? <AlertTriangle className="w-3.5 h-3.5" />
    : <Check className="w-3.5 h-3.5" />;

  const colorClass = status === 'saving'
    ? 'text-sky-400'
    : status === 'error' || status === 'no-permission'
    ? 'text-rose-400'
    : 'text-emerald-400';

  const label = status === 'saving'
    ? 'Saving…'
    : status === 'error'
    ? 'Save error'
    : status === 'no-permission'
    ? 'Permission needed'
    : `Saved to ${getFolderDisplayName(handle)}`;

  return (
      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        width="w-64"
        align="right"
        trigger={
          <button
            className={`flex items-center gap-1.5 ${colorClass} text-xs px-2.5 py-1 rounded hover:bg-zinc-800 transition-colors`}
          title={errorMessage || label}
        >
          {icon}
          <span className="truncate max-w-[180px]">{label}</span>
        </button>
      }
    >
      <div className="px-3 py-2 border-b border-zinc-800">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Save folder</div>
        <div className="text-white text-xs font-semibold mt-0.5 truncate" title={getFolderDisplayName(handle)}>
          {getFolderDisplayName(handle)}
        </div>
        {errorMessage && (
          <div className="text-rose-400 text-[10px] mt-1">{errorMessage}</div>
        )}
      </div>

      {(status === 'no-permission' || status === 'error') && (
        <DropdownItem onClick={handleRegrant} icon={<RefreshCw className="w-3.5 h-3.5" />}>
          Re-grant access
        </DropdownItem>
      )}

      <DropdownItem onClick={handlePick} icon={<FolderOpen className="w-3.5 h-3.5" />}>
        Change folder…
      </DropdownItem>
      <DropdownItem onClick={handleListForRestore} icon={<HardDrive className="w-3.5 h-3.5" />}>
        Restore projects from folder
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem onClick={handleClear} icon={<X className="w-3.5 h-3.5" />} variant="danger">
        Stop folder backup
      </DropdownItem>
    </DropdownMenu>
  );
};

export const useStorage = () => {
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    if (!isFileSystemAccessSupported()) {
      setStatus('unsupported');
      return;
    }
    getSavedHandle().then(h => {
      if (h) {
        setHandle(h);
        setStatus('saved');
      }
    });
  }, []);

  const setStatusWithError = (s: SaveStatus, error?: string) => {
    setStatus(s);
    setErrorMessage(error);
  };

  return { handle, setHandle, status, setStatus: setStatusWithError, errorMessage };
};
