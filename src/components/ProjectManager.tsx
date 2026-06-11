import React, { useRef, useState, useMemo } from 'react';
import { useProject, ProjectMeta } from '../store';
import { Project } from '../types';
import { X, Plus, Download, Pencil, Copy, Trash2, Check, FolderOpen, CheckCircle2, ArrowUpDown } from 'lucide-react';
import { useDialog } from './Dialog';

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
        dialog.alert({ title: 'Invalid File', message: 'Could not parse JSON.' });
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
    a.download = `${p.title}.json`;
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 shrink-0">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-6 h-6 text-zinc-700" />
            <h1 className="text-xl font-bold text-zinc-900">Projects</h1>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-500 hover:text-zinc-800"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!hasProjects ? (
            <div className="text-center py-16 text-zinc-400">
              <FolderOpen className="w-16 h-16 mx-auto mb-4 text-zinc-300" />
              <p className="text-lg font-medium text-zinc-500">No projects yet</p>
              <p className="text-sm mt-1">Create a new project or import one to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-medium">{projectList.length} project{projectList.length !== 1 ? 's' : ''}</span>
                <div className="relative">
                  <button
                    onClick={() => setShowSortMenu(p => !p)}
                    className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <ArrowUpDown className="w-3 h-3" />
                    {sortOptions.find(o => o.key === sortKey)?.label}
                  </button>
                  {showSortMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-xl z-50 py-1 min-w-[140px]">
                        {sortOptions.map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => { setSortKey(opt.key); setShowSortMenu(false); }}
                            className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors ${
                              sortKey === opt.key ? 'text-zinc-900 bg-zinc-100' : 'text-zinc-500 hover:bg-zinc-50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
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
                    className={`group flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                      isActive
                        ? 'bg-zinc-900 border-zinc-700 text-white'
                        : 'bg-white border-zinc-200 hover:border-zinc-400 hover:shadow-sm text-zinc-900'
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
                          className="flex-1 bg-zinc-800 border border-zinc-600 text-white px-2.5 py-1.5 rounded-lg text-sm outline-none focus:ring-2 focus:ring-zinc-500"
                          onClick={e => e.stopPropagation()}
                        />
                        <button
                          onClick={e => { e.stopPropagation(); confirmRename(); }}
                          className="p-1.5 hover:bg-emerald-800/60 rounded-lg text-emerald-400 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setRenamingId(null); }}
                          className="p-1.5 hover:bg-rose-800/60 rounded-lg text-rose-400 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate text-sm">{p.title}</h3>
                            {isActive && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <p className={`text-xs mt-0.5 ${isActive ? 'text-zinc-500' : 'text-zinc-400'}`}>
                            {isActive ? 'Currently open' : formatDate(p.lastModified)}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => startRenaming(p)}
                            className={`p-1.5 rounded-lg transition-colors ${isActive ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
                            title="Rename"
                          >
                            <Pencil className="w-4 h-4 text-zinc-400" />
                          </button>
                          <button
                            onClick={() => duplicateProject(p.id)}
                            className={`p-1.5 rounded-lg transition-colors ${isActive ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
                            title="Duplicate"
                          >
                            <Copy className="w-4 h-4 text-zinc-400" />
                          </button>
                          <button
                            onClick={e => handleExportJSON(e, p)}
                            className={`p-1.5 rounded-lg transition-colors ${isActive ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
                            title="Export as JSON"
                          >
                            <Download className="w-4 h-4 text-zinc-400" />
                          </button>
                          <button
                            onClick={async () => { const ok = await dialog.confirm({ title: `Delete "${p.title}"?`, message: 'This cannot be undone.', danger: true }); if (ok) deleteProject(p.id); }}
                            className={`p-1.5 rounded-lg transition-colors ${isActive ? 'hover:bg-rose-900/40' : 'hover:bg-rose-50'}`}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-zinc-400 hover:text-rose-500 transition-colors" />
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

        <div className="p-6 border-t border-zinc-200 flex items-center gap-3 shrink-0">
          <button
            onClick={() => { createProject(); onClose?.(); }}
            className="bg-zinc-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-colors flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Project
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="bg-white border border-zinc-300 text-zinc-700 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-zinc-50 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> {importing ? 'Importing...' : 'Import'}
          </button>
          <input type="file" accept=".json" ref={fileInputRef} onChange={handleImportJSON} className="hidden" />
        </div>
      </div>
    </div>
  );
}
