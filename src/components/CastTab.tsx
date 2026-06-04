import React, { useState } from 'react';
import { useProject } from '../store';
import { CastMember } from '../types';
import { generateUUID } from '../lib/utils';
import { Plus, Pencil, Trash2, X, User, Download } from 'lucide-react';

export const CastTab: React.FC = () => {
  const { state, dispatch } = useProject();
  const project = state.present;
  const castMembers = project.castMembers || [];
  const scenes = project.scenes;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CastMember | null>(null);
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');

  const sceneCount = (castId: string) =>
    scenes.filter(s => s.cast.split(',').map(c => c.trim()).includes(castId)).length;

  const openAdd = () => {
    setEditing(null);
    setFormId('');
    setFormName('');
    setShowForm(true);
  };

  const openEdit = (member: CastMember) => {
    setEditing(member);
    setFormId(member.id);
    setFormName(member.name);
    setShowForm(true);
  };

  const handleSave = () => {
    const id = formId.trim();
    if (!id) return;
    if (editing) {
      dispatch({ type: 'UPDATE_CAST_MEMBER', payload: { id: editing.id, name: formName.trim() } });
    } else {
      dispatch({ type: 'ADD_CAST_MEMBER', payload: { id: generateUUID(), name: formName.trim() || id } });
    }
    setShowForm(false);
  };

  const handleDelete = (member: CastMember) => {
    dispatch({ type: 'DELETE_CAST_MEMBER', payload: member.id });
  };

  const handleImport = () => {
    const existingIds = new Set(castMembers.map(c => c.id));
    for (const scene of scenes) {
      for (const id of (scene.cast || '').split(',').map(c => c.trim()).filter(Boolean)) {
        if (!existingIds.has(id)) {
          existingIds.add(id);
          dispatch({ type: 'ADD_CAST_MEMBER', payload: { id: generateUUID(), name: '' } });
        }
      }
    }
  };

  const sorted = [...castMembers].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  return (
    <div className="flex-1 flex flex-col bg-zinc-200/50 overflow-hidden">
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto w-full p-8 pb-32">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Cast</h1>
              <p className="text-sm text-zinc-500 mt-1">
                {castMembers.length} {castMembers.length === 1 ? 'member' : 'members'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {scenes.some(s => s.cast) && (
                <button
                  onClick={handleImport}
                  className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200 rounded-md px-3 py-2 hover:bg-zinc-50 transition-colors"
                  title="Add any cast IDs found in your scenes that aren't in the list yet"
                >
                  <Download className="w-3.5 h-3.5" />
                  Sync from Scenes
                </button>
              )}
              <button
                onClick={openAdd}
                className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add Member
              </button>
            </div>
          </div>

          {sorted.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-zinc-200 rounded-xl p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-zinc-100 mx-auto mb-4 flex items-center justify-center">
                <User className="w-5 h-5 text-zinc-400" />
              </div>
              <h3 className="text-zinc-900 font-semibold text-base mb-1">No cast members</h3>
              <p className="text-sm text-zinc-500 max-w-md mx-auto mb-6">
                Add cast members here to manage your cast IDs and names.
                Use IDs in your scene breakdown and rules.
              </p>
              {scenes.some(s => s.cast) ? (
                <div className="flex items-center justify-center gap-2">
                  <button onClick={handleImport} className="bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-700 px-4 py-2 rounded-md text-sm font-medium transition-colors">
                    Import from scenes
                  </button>
                  <button onClick={openAdd} className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 transition-colors">
                    <Plus className="w-4 h-4" />
                    Add manually
                  </button>
                </div>
              ) : (
                <button onClick={openAdd} className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 transition-colors">
                  <Plus className="w-4 h-4" />
                  Add your first member
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th className="text-left px-4 py-2 text-xs text-zinc-500 uppercase font-semibold tracking-wider">ID</th>
                    <th className="text-left px-4 py-2 text-xs text-zinc-500 uppercase font-semibold tracking-wider">Name</th>
                    <th className="text-right px-4 py-2 text-xs text-zinc-500 uppercase font-semibold tracking-wider">Scenes</th>
                    <th className="w-20 px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(m => (
                    <tr key={m.id} className="border-b border-zinc-100 hover:bg-zinc-50 group">
                      <td className="px-4 py-2 font-mono text-xs font-medium text-zinc-700">{m.id}</td>
                      <td className="px-4 py-2 text-zinc-900">{m.name || <span className="text-zinc-400 italic">—</span>}</td>
                      <td className="px-4 py-2 text-right text-xs text-zinc-500 tabular-nums">{sceneCount(m.id)}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                          <button onClick={() => openEdit(m)} className="p-1 rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100" title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(m)} className="p-1 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
              <h2 className="text-zinc-900 font-bold text-sm">{editing ? 'Edit member' : 'Add cast member'}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-400 hover:text-zinc-700 p-1 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider block mb-2">ID</label>
                <input
                  value={formId}
                  onChange={e => setFormId(e.target.value)}
                  placeholder="e.g. 1, JOHN, SARAH"
                  className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider block mb-2">Name</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. John Smith"
                  className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-200 bg-zinc-50">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md text-sm text-zinc-700 hover:bg-zinc-200 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} className="px-4 py-2 rounded-md text-sm font-semibold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors">
                {editing ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
