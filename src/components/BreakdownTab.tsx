import React, { useRef, useState, useMemo } from 'react';
import { useProject } from '../store';
import { Scene } from '../types';
import { generateUUID, formatPageCount, parsePageCount } from '../lib/utils';
import { Trash2 } from 'lucide-react';
import Papa from 'papaparse';

export function BreakdownTab() {
  const { state, dispatch } = useProject();
  const project = state.present;
  const scenes = project.scenes;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        // very basic mapping for MVP
        const imported: Scene[] = results.data.map((row: any) => ({
          id: generateUUID(),
          sceneNumber: typeof row['Scene #'] === 'string' ? row['Scene #'] : typeof row['Scene'] === 'string' ? row['Scene'] : String(row['Scene'] || row['Scene #'] || ''),
          pageCount: row['Pages'] || '1',
          pageCountDecimal: parsePageCount(row['Pages'] || '1'),
          scriptDay: row['Script Day'] || '',
          intExt: (row['I/E'] || 'INT') as any,
          set: row['Set'] || '',
          dayNight: (row['D/N'] || 'DAY') as any,
          description: row['Description'] || '',
          cast: row['Cast'] || '',
          notes: row['Notes'] || '',
          shootDay: null
        }));
        if(imported.length > 0) {
            dispatch({ type: 'IMPORT_SCENES', payload: imported });
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  const addScene = () => {
    dispatch({
      type: 'ADD_SCENE',
      payload: {
        id: generateUUID(),
        sceneNumber: '',
        pageCount: '1',
        pageCountDecimal: 1.0,
        scriptDay: '1',
        intExt: 'INT',
        set: 'NEW SET',
        dayNight: 'DAY',
        description: 'New scene',
        cast: '',
        notes: '',
        shootDay: null
      }
    });
  };

  const updateScene = (id: string, updates: Partial<Scene>) => {
    if (updates.pageCount !== undefined) {
      updates.pageCountDecimal = parsePageCount(updates.pageCount);
    }
    dispatch({ type: 'UPDATE_SCENE', payload: { id, ...updates } });
  };

  const deleteScene = (id: string) => {
    if (window.confirm("Delete scene?")) {
      dispatch({ type: 'DELETE_SCENE', payload: id });
    }
  };

  const totalPagesDecimal = scenes.reduce((sum, s) => sum + (s.pageCountDecimal || 0), 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-white text-zinc-900 border-x border-zinc-200 shadow-xl overflow-hidden relative">
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-left border-collapse select-none">
          <thead className="sticky top-0 bg-white border-b-2 border-zinc-950 text-xs font-mono font-semibold z-10">
            <tr>
              <th className="px-2 py-2 w-[60px] border-r border-zinc-200">Scene #</th>
              <th className="px-2 py-2 w-[80px] border-r border-zinc-200">Pages</th>
              <th className="px-2 py-2 w-[80px] border-r border-zinc-200">Script Day</th>
              <th className="px-2 py-2 w-[80px] border-r border-zinc-200">I/E</th>
              <th className="px-2 py-2 w-[200px] border-r border-zinc-200">Set</th>
              <th className="px-2 py-2 w-[90px] border-r border-zinc-200">D/N</th>
              <th className="px-2 py-2 border-r border-zinc-200">Description</th>
              <th className="px-2 py-2 w-[120px] border-r border-zinc-200">Cast</th>
              <th className="px-2 py-2 w-[200px] border-r border-zinc-200">Notes</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="font-sans text-[13px]">
            {scenes.map(s => (
              <tr key={s.id} className="group hover:bg-zinc-50 border-b border-zinc-200">
                <td className="border-r border-zinc-200 p-0">
                  <input value={s.sceneNumber} onChange={e => updateScene(s.id, {sceneNumber: e.target.value})} className="w-full bg-transparent px-2 py-2 outline-none focus:ring-1 focus:ring-inset focus:ring-zinc-400 font-mono font-medium" />
                </td>
                <td className="border-r border-zinc-200 p-0">
                  <input value={s.pageCount} onChange={e => updateScene(s.id, {pageCount: e.target.value})} className="w-full bg-transparent px-2 py-2 outline-none focus:ring-1 focus:ring-inset focus:ring-zinc-400 font-mono" />
                </td>
                <td className="border-r border-zinc-200 p-0">
                  <input value={s.scriptDay} onChange={e => updateScene(s.id, {scriptDay: e.target.value})} className="w-full bg-transparent px-2 py-2 outline-none focus:ring-1 focus:ring-inset focus:ring-zinc-400 font-mono" />
                </td>
                <td className="border-r border-zinc-200 p-0">
                  <select value={s.intExt} onChange={e => updateScene(s.id, {intExt: e.target.value as any})} className="w-full h-full bg-transparent px-2 py-2 outline-none opacity-80 cursor-pointer">
                    <option value="INT">INT</option><option value="EXT">EXT</option><option value="INT/EXT">INT/EXT</option>
                  </select>
                </td>
                <td className="border-r border-zinc-200 p-0">
                  <input value={s.set} onChange={e => updateScene(s.id, {set: e.target.value})} className="w-full bg-transparent px-2 py-2 outline-none focus:ring-1 focus:ring-inset focus:ring-zinc-400 font-medium" />
                </td>
                <td className="border-r border-zinc-200 p-0">
                  <select value={s.dayNight} onChange={e => updateScene(s.id, {dayNight: e.target.value as any})} className="w-full h-full bg-transparent px-2 py-2 outline-none opacity-80 cursor-pointer">
                    <option value="DAY">DAY</option><option value="NIGHT">NIGHT</option><option value="EVENING">EVENING</option><option value="DAWN">DAWN</option><option value="DUSK">DUSK</option>
                  </select>
                </td>
                <td className="border-r border-zinc-200 p-0">
                  <input value={s.description} onChange={e => updateScene(s.id, {description: e.target.value})} className="w-full bg-transparent px-2 py-2 outline-none focus:ring-1 focus:ring-inset focus:ring-zinc-400 text-zinc-600" />
                </td>
                <td className="border-r border-zinc-200 p-0">
                  <input value={s.cast} onChange={e => updateScene(s.id, {cast: e.target.value})} className="w-full bg-transparent px-2 py-2 outline-none font-mono text-zinc-500 focus:ring-1 focus:ring-inset focus:ring-zinc-400" />
                </td>
                <td className="border-r border-zinc-200 p-0">
                  <input value={s.notes} onChange={e => updateScene(s.id, {notes: e.target.value})} className="w-full bg-transparent px-2 py-2 outline-none text-zinc-500 text-xs focus:ring-1 focus:ring-inset focus:ring-zinc-400" />
                </td>
                <td className="p-0 text-center relative cursor-pointer group/btn" onClick={() => deleteScene(s.id)}>
                   <Trash2 className="w-4 h-4 mx-auto text-red-700 opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FOOTER BAR */}
      <div className="bg-zinc-100 border-t border-zinc-300 p-3 flex items-center justify-between shadow-inner">
        <div className="flex items-center space-x-4">
          <button onClick={addScene} className="bg-zinc-900 border-2 border-transparent text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-zinc-800 transition-colors">
            + Add Scene
          </button>
          <button onClick={() => dispatch({type: 'SORT_SCENES'})} className="bg-white border border-zinc-300 px-4 py-1.5 text-zinc-700 rounded text-sm hover:bg-zinc-50 transition-colors">
            Sort by Scene #
          </button>
          
          <div className="relative">
            <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImport} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="bg-white border border-zinc-300 px-3 py-1.5 text-zinc-700 rounded text-sm hover:bg-zinc-50 transition-colors">
              Import CSV
            </button>
          </div>
        </div>
        <div className="flex font-mono text-xs items-center space-x-8 text-zinc-600">
          <div className="flex flex-col">
            <span className="uppercase text-[10px] text-zinc-400 font-semibold tracking-widest">Scenes</span>
            <span className="text-zinc-900 font-medium text-sm">{scenes.length}</span>
          </div>
          <div className="flex flex-col">
            <span className="uppercase text-[10px] text-zinc-400 font-semibold tracking-widest">Total Pages</span>
            <span className="text-zinc-900 font-medium text-sm">{formatPageCount(totalPagesDecimal)} <span className="text-zinc-400 font-normal">({totalPagesDecimal.toFixed(3)})</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
