import React from 'react';
import { useProject } from '../store';
import { CastMember } from '../types';
import { Plus, Trash2 } from 'lucide-react';

export const CastTab: React.FC = () => {
  const { state, dispatch } = useProject();
  const cast = state.present.castMembers || [];

  const sorted = [...cast].sort((a, b) => {
    const na = parseInt(a.id, 10);
    const nb = parseInt(b.id, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });

  const update = (oldId: string, changes: Partial<CastMember>) => {
    const member = cast.find(c => c.id === oldId);
    if (!member) return;
    const newId = changes.id ?? oldId;
    const merged = { id: newId, name: changes.name ?? member.name };
    if (newId !== oldId) {
      dispatch({ type: 'DELETE_CAST_MEMBER', payload: oldId });
      dispatch({ type: 'ADD_CAST_MEMBER', payload: merged });
    } else {
      dispatch({ type: 'UPDATE_CAST_MEMBER', payload: merged });
    }
  };

  const add = () => {
    const maxId = cast.reduce((max, c) => {
      const n = parseInt(c.id, 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    dispatch({ type: 'ADD_CAST_MEMBER', payload: { id: String(maxId + 1), name: '' } });
  };

  const remove = (id: string) => {
    dispatch({ type: 'DELETE_CAST_MEMBER', payload: id });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-auto bg-white">
        <div className="min-w-[400px]">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="sticky top-0 bg-white border-b-2 border-zinc-900 z-10">
                <th className="text-left px-3 py-2 text-xs font-mono font-semibold text-zinc-900 w-20">Cast #</th>
                <th className="text-left px-3 py-2 text-xs font-mono font-semibold text-zinc-900">Name</th>
                <th className="w-10 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(m => (
                <tr key={m.id} className="border-b border-zinc-200 hover:bg-zinc-50 group">
                  <td className="px-3 py-1.5">
                    <input
                      value={(m as any).id}
                      onChange={e => update(m.id, { id: e.target.value })}
                      className="w-full bg-transparent outline-none font-mono text-sm"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      value={(m as any).name}
                      onChange={e => update(m.id, { name: e.target.value.toUpperCase() })}
                      placeholder="NAME"
                      className="w-full bg-transparent outline-none font-mono text-sm uppercase placeholder:text-zinc-300"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => remove(m.id)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-zinc-100 border-t border-zinc-300 p-3 flex items-center shadow-inner">
        <button
          onClick={add}
          className="bg-zinc-900 border-2 border-transparent text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Cast
        </button>
        <span className="ml-4 text-xs text-zinc-500 uppercase tracking-wider font-mono">
          {cast.length} {cast.length === 1 ? 'member' : 'members'}
        </span>
      </div>
    </div>
  );
};
