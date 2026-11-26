import React from 'react';
import { HardDrive } from 'lucide-react';
import Modal, { ModalFooter } from './Modal';
import ModalFooterButton from './ModalFooterButton';

export interface RestoreFolderEntry {
  id: string;
  title: string;
  lastModified: number;
}

interface RestoreFolderModalProps {
  open: boolean;
  /** Every project found in the save folder (the list below the intro). */
  entries: RestoreFolderEntry[];
  /** How many of them have readable data to import (footer count + disable). */
  restorableCount: number;
  onClose: () => void;
  onRestore: () => void;
}

/** "Restore from Folder" — the File menu's folder read-back, extracted from
 *  App.tsx so the Modals Studio previews the real list. App owns the import. */
export function RestoreFolderModal({ open, entries, restorableCount, onClose, onRestore }: RestoreFolderModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Restore from Folder"
      icon={<HardDrive className="w-4 h-4" />}
      width="max-w-xl"
      footer={
        <ModalFooter>
          <ModalFooterButton variant="ghost" onClick={onClose}>
            Cancel
          </ModalFooterButton>
          <ModalFooterButton disabled={restorableCount === 0} onClick={onRestore}>
            Restore {restorableCount > 0 ? `(${restorableCount})` : ''}
          </ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="px-5 py-3 text-[color:var(--ui-text-muted)] text-xs border-b border-[color:var(--ui-border)]">
        {entries.length} {entries.length === 1 ? 'project' : 'projects'} found in your save folder.
        Restoring will merge them with your current projects.
      </div>
      <div className="p-2">
        {entries.length === 0 ? (
          <div className="text-[color:var(--ui-text-faint)] text-center py-12 text-xs">No projects in folder.</div>
        ) : (
          entries.map(entry => (
            <div key={entry.id} className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-[var(--ui-panel-bg)]">
              <div className="min-w-0">
                <div className="text-[color:var(--ui-text-strong)] text-sm font-semibold truncate">{entry.title || 'Untitled'}</div>
                <div className="text-[color:var(--ui-text-faint)] text-[11px] mt-0.5">
                  Last saved {new Date(entry.lastModified).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
