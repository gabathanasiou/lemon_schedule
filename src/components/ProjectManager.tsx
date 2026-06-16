import React, { useRef, useState, useMemo } from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { useProject, ProjectMeta } from '../store';
import { Project } from '../types';
import { Plus, Download, Pencil, Copy, Trash2, Check, FolderOpen, CheckCircle2, ArrowUpDown, ChevronDown } from 'lucide-react';
import { useDialog } from './Dialog';
import Modal from './Modal';
import { ModalFooter } from './Modal';

interface ProjectManagerProps {
  onClose?: () => void;
}

type SortKey = 'lastModified' | 'createdAt' | 'title';

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'lastModified', label: 'Last Modified' },
  { key: 'createdAt', label: 'Created' },
  { key: 'title', label: 'A–Z' },
];

function formatDate(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function ProjectManager({ onClose }: ProjectManagerProps) {
  const {
    projectList,
    currentProjectId,
    createProject,
    openProject,
    deleteProject,
    renameProject,
    duplicateProject,
    importProjectFromData,
  } = useProject();
  const dialog = useDialog();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('lastModified');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const sortedList = useMemo(() => {
    const list = [...projectList];
    if (sortKey === 'lastModified') {
      list.sort((a, b) => b.lastModified - a.lastModified);
    } else if (sortKey === 'createdAt') {
      list.sort((a, b) => b.createdAt - a.createdAt);
    } else if (sortKey === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [projectList, sortKey]);

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.scenes && data.versions) {
          importProjectFromData(data as Project);
          onClose?.();
        } else {
          dialog.alert({ title: 'Invalid File', message: 'Missing scenes or versions.' });
        }
      } catch {
        dialog.alert({ title: 'Invalid File', message: 'Could not read file.' });
      }
      setImporting(false);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExportJSON = (e: React.MouseEvent, p: ProjectMeta) => {
    e.stopPropagation();
    const key = `lemon_schedule_project_v1_${p.id}`;
    const stored = localStorage.getItem(key);
    if (!stored) return;
    const blob = new Blob([stored], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.title}.lemon`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCardClick = (p: ProjectMeta) => {
    if (renamingId) return;
    if (p.id === currentProjectId) {
      onClose?.();
      return;
    }
    openProject(p.id);
    onClose?.();
  };

  const startRenaming = (p: ProjectMeta) => {
    setRenamingId(p.id);
    setRenameTitle(p.title);
  };

  const confirmRename = () => {
    if (renamingId && renameTitle.trim()) {
      renameProject(renamingId, renameTitle.trim());
    }
    setRenamingId(null);
  };

  const hasProjects = projectList.length > 0;

  return (
    <Modal open onClose={() => onClose?.()} title="Projects" icon={<FolderOpen className="w-4 h-4" />} width="max-w-3xl"
      footer={
        <ModalFooter>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-6 py-2 text-zinc-400 text-xs font-medium rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" /> {importing ? 'Importing...' : 'Import'}
          </button>
          <button
            onClick={() => { createProject(); onClose?.(); }}
            className="px-6 py-2 bg-zinc-900 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> New Project
          </button>
          <input type="file" accept=".lemon,.json" ref={fileInputRef} onChange={handleImportJSON} className="hidden" />
        </ModalFooter>
      }
    >
      <div className="px-6 py-4">
        {!hasProjects ? (
          <div className="text-center py-16 text-zinc-500">
            <FolderOpen className="w-16 h-16 mx-auto mb-4 text-zinc-700" />
            <p className="text-sm font-medium text-zinc-400">No projects yet</p>
            <p className="text-xs mt-1 text-zinc-600">Create a new project or import one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{projectList.length} project{projectList.length !== 1 ? 's' : ''}</span>
              <div className="relative">
                <RadixDropdownMenu.Root open={showSortMenu} onOpenChange={(o) => setShowSortMenu(o)} modal={true}>
                  <RadixDropdownMenu.Trigger asChild>
                    <button className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-500 hover:text-zinc-300 bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1 rounded-md transition-colors">
                      <ArrowUpDown className="w-3 h-3" />
                      {sortOptions.find(o => o.key === sortKey)?.label}
                    </button>
                  </RadixDropdownMenu.Trigger>
                  <RadixDropdownMenu.Portal>
                    <RadixDropdownMenu.Content
                      className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[10001] py-1 min-w-[140px]"
                      align="end"
                      sideOffset={4}
                      collisionPadding={8}
                    >
                      {sortOptions.map(opt => (
                        <RadixDropdownMenu.Item
                          key={opt.key}
                          onSelect={() => setSortKey(opt.key)}
                          className={`text-left px-3 py-1.5 text-xs transition-colors outline-none cursor-pointer ${
                            sortKey === opt.key ? 'text-white bg-zinc-800' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 focus-visible:bg-zinc-900 focus-visible:text-zinc-200'
                          }`}
                        >
                          {opt.label}
                        </RadixDropdownMenu.Item>
                      ))}
                    </RadixDropdownMenu.Content>
                  </RadixDropdownMenu.Portal>
                </RadixDropdownMenu.Root>
              </div>
            </div>

            {sortedList.map(p => {
              const isActive = p.id === currentProjectId;
              const isRenaming = renamingId === p.id;

              return (
                <div
                  key={p.id}
                  onClick={() => handleCardClick(p)}
                  onDoubleClick={isRenaming ? undefined : () => startRenaming(p)}
                  className={`group flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer select-none ${
                    isActive
                      ? 'bg-zinc-800 border-zinc-700 text-white'
                      : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                  }`}
                >
                  {isRenaming ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <input
                        value={renameTitle}
                        onChange={e => setRenameTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') confirmRename();
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        autoFocus
                        className="flex-1 bg-zinc-950 border border-zinc-600 text-white px-2.5 py-1.5 rounded-md text-xs outline-none focus:ring-2 focus:ring-zinc-500"
                        onClick={e => e.stopPropagation()}
                      />
                      <button
                        onClick={e => { e.stopPropagation(); confirmRename(); }}
                        className="p-1.5 hover:bg-emerald-800/60 rounded-md text-emerald-400 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setRenamingId(null); }}
                        className="p-1.5 hover:bg-rose-800/60 rounded-md text-rose-400 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate text-xs">{p.title}</h3>
                          {isActive && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                        </div>
                        <p className={`text-[10px] mt-0.5 ${isActive ? 'text-zinc-500' : 'text-zinc-500'}`}>
                          {isActive ? 'Currently open' : formatDate(p.lastModified)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => startRenaming(p)}
                          className="p-1.5 rounded-md transition-colors hover:bg-zinc-700"
                          title="Rename"
                        >
                          <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                        <button
                          onClick={() => duplicateProject(p.id)}
                          className="p-1.5 rounded-md transition-colors hover:bg-zinc-700"
                          title="Duplicate"
                        >
                          <Copy className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                        <button
                          onClick={e => handleExportJSON(e, p)}
                          className="p-1.5 rounded-md transition-colors hover:bg-zinc-700"
                           title="Export"
                        >
                          <Download className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                        <button
                          onClick={async () => { const ok = await dialog.confirm({ title: `Delete "${p.title}"?`, message: 'This cannot be undone.', danger: true }); if (ok) deleteProject(p.id); }}
                          className="p-1.5 rounded-md transition-colors hover:bg-rose-900/40"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-zinc-400 hover:text-rose-400 transition-colors" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
