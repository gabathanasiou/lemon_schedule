import React from 'react';
import { Loader2, Cloud, Users, CheckCircle2, Pencil, CopyPlus, Save, CloudUpload, HardDriveDownload, Trash2, Check } from 'lucide-react';
import { ProjectMeta } from '../store';
import { useDialog } from './Dialog';
import { PM_BTN_PAD, PM_ICON, PM_ICON_SM, PM_INPUT, PM_TITLE, PM_SUBTITLE } from './projectManagerStyles';

interface ProjectCardProps {
  p: ProjectMeta;
  isActive: boolean;
  activeTab: 'local' | 'cloud' | 'online';
  authSignedIn: boolean;
  renameTitle: string;
  setRenameTitle: (v: string) => void;
  renamingId: string | null;
  setRenamingId: (v: string | null) => void;
  openingId: string | null;
  deletingId: string | null;
  movingId: string | null;
  duplicatingId: string | null;
  exportingId: string | null;
  onCardClick: (p: ProjectMeta) => void;
  onStartRenaming: (p: ProjectMeta) => void;
  onConfirmRename: () => void;
  onDuplicate: (p: ProjectMeta) => void;
  onExport: (e: React.MouseEvent, p: ProjectMeta) => void;
  onMoveToDrive: (p: ProjectMeta) => void;
  onMoveToLocal: (p: ProjectMeta) => void;
  onDelete: (p: ProjectMeta) => void;
  formatDate: (ts: number) => string;
}

export default function ProjectCard({
  p, isActive, activeTab, authSignedIn, renameTitle, setRenameTitle, renamingId, setRenamingId,
  openingId, deletingId, movingId, duplicatingId, exportingId,
  onCardClick, onStartRenaming, onConfirmRename, onDuplicate, onExport, onMoveToDrive, onMoveToLocal, onDelete, formatDate,
}: ProjectCardProps) {
  const dialog = useDialog();
  const isRenaming = renamingId === p.id;
  const isBusy = openingId === p.id || deletingId === p.id || movingId === p.id || duplicatingId === p.id || exportingId === p.id;

  return (
    <div
      onClick={() => { if (!isBusy) onCardClick(p); }}
      onDoubleClick={isRenaming || isBusy ? undefined : () => onStartRenaming(p)}
      className={`group flex items-center gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
        isActive
          ? 'bg-[var(--ui-input-bg)] border-[color:var(--ui-card-border)] text-[color:var(--ui-text-strong)]'
          : 'bg-[var(--ui-panel-bg)] border-[color:var(--ui-border)] hover:border-[color:var(--ui-card-border)] text-[color:var(--ui-text)]'
      }`}
    >
      {isRenaming ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <input
            value={renameTitle}
            onChange={e => setRenameTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onConfirmRename();
              if (e.key === 'Escape') setRenamingId(null);
            }}
            autoFocus
            className={`flex-1 bg-[var(--ui-seg-track-bg)] border border-[color:var(--ui-border-strong)] text-[color:var(--ui-text-strong)] ${PM_INPUT} rounded-md outline-none focus:ring-2 focus:ring-[color:var(--ui-input-focus-border)]`}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={e => { e.stopPropagation(); onConfirmRename(); }}
            className={`${PM_BTN_PAD} hover:bg-emerald-800/60 rounded-md text-emerald-400 transition-colors`}
          >
            <Check className={`${PM_ICON}`} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setRenamingId(null); }}
            className={`${PM_BTN_PAD} hover:bg-rose-800/60 rounded-md text-rose-400 transition-colors`}
          >
            <svg className={`${PM_ICON}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {(openingId === p.id || deletingId === p.id || movingId === p.id || duplicatingId === p.id) && (
                <Loader2 className={`${PM_ICON_SM} text-[color:var(--ui-text-muted)] animate-spin shrink-0`} />
              )}
              <h3 className={`font-semibold truncate ${PM_TITLE}`}>{p.title}</h3>
              {p.onlineId ? (
                <Users className={`${PM_ICON_SM} text-emerald-500/90 shrink-0`} aria-label="Shared project" />
              ) : p.driveFileId ? (
                <Cloud className={`${PM_ICON_SM} text-[color:var(--ui-text-faint)] shrink-0`} aria-label="Cloud project" />
              ) : null}
              {isActive && (
                <CheckCircle2 className={`${PM_ICON} text-emerald-400 shrink-0`} />
              )}
            </div>
            <p className={`${PM_SUBTITLE} mt-0.5 ${isActive ? 'text-[color:var(--ui-text-faint)]' : 'text-[color:var(--ui-text-faint)]'}`}>
              {isActive ? 'Currently open' : formatDate(p.lastModified)}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0 hover-reveal transition-opacity" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onStartRenaming(p)}
              disabled={isBusy}
              className={`${PM_BTN_PAD} rounded-md transition-colors hover:bg-[var(--ui-item-active-bg)] disabled:opacity-30`}
              title="Rename"
            >
              <Pencil className={`${PM_ICON} text-[color:var(--ui-text-muted)]`} />
            </button>
            <button
              onClick={() => onDuplicate(p)}
              disabled={isBusy}
              className={`${PM_BTN_PAD} rounded-md transition-colors hover:bg-[var(--ui-item-active-bg)] disabled:opacity-30`}
              title="Duplicate"
            >
              <CopyPlus className={`${PM_ICON} text-[color:var(--ui-text-muted)]`} />
            </button>
            <button
              onClick={e => onExport(e, p)}
              disabled={isBusy}
              className={`${PM_BTN_PAD} rounded-md transition-colors hover:bg-[var(--ui-item-active-bg)] disabled:opacity-30`}
              title="Export"
            >
              {exportingId === p.id
                ? <Loader2 className={`${PM_ICON} text-[color:var(--ui-text-muted)] animate-spin`} />
                : <Save className={`${PM_ICON} text-[color:var(--ui-text-muted)]`} />}
            </button>
            {activeTab === 'local' && authSignedIn && (
              <button
                onClick={() => onMoveToDrive(p)}
                disabled={isBusy}
                className={`${PM_BTN_PAD} rounded-md transition-colors hover:bg-[var(--ui-item-active-bg)] disabled:opacity-30`}
                title="Move to Drive"
              >
                <CloudUpload className={`${PM_ICON} text-[color:var(--ui-text-muted)]`} />
              </button>
            )}
            {activeTab === 'cloud' && (
              <button
                onClick={() => onMoveToLocal(p)}
                disabled={isBusy}
                className={`${PM_BTN_PAD} rounded-md transition-colors hover:bg-[var(--ui-item-active-bg)] disabled:opacity-30`}
                title="Move to Local"
              >
                <HardDriveDownload className={`${PM_ICON} text-[color:var(--ui-text-muted)]`} />
              </button>
            )}
            <button
              onClick={async () => { const ok = await dialog.confirm({ title: `Delete "${p.title}"?`, message: 'This cannot be undone.', danger: true, suppressKey: 'lemon_schedule_dnwa_delete_project' }); if (ok) onDelete(p); }}
              disabled={isBusy}
              className={`${PM_BTN_PAD} rounded-md transition-colors hover:bg-rose-900/40 disabled:opacity-30`}
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5 text-[color:var(--ui-text-muted)] hover:text-[color:var(--ui-danger-text)] transition-colors" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
