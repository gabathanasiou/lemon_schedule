import React, { useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface NewProjectModalProps {
  open: boolean;
  isCloud: boolean;
  name: string;
  onNameChange: (v: string) => void;
  creating: boolean;
  onCancel: () => void;
  onCreate: () => void;
}

export default function NewProjectModal({ open, isCloud, name, onNameChange, creating, onCancel, onCreate }: NewProjectModalProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => nameInputRef.current?.select(), 50);
  }, [open]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-10 bg-zinc-900/95 flex items-center justify-center">
      <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-5 w-64 space-y-3">
        <h3 className="text-sm font-bold text-white">{isCloud ? "New Cloud Project" : "New Project"}</h3>
        <input
          ref={nameInputRef}
          value={name}
          onChange={e => onNameChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onCreate(); }}
          disabled={creating}
          placeholder="Project name"
          autoFocus
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 disabled:opacity-50"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={creating}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={creating || !name.trim()}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-zinc-700 text-white hover:bg-zinc-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {creating && <Loader2 className="w-3 h-3 animate-spin" />}
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
