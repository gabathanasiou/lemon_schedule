/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ProjectProvider, useProject } from './store';
import { BreakdownTab } from './components/BreakdownTab';
import { ScheduleTab } from './components/ScheduleTab';
import { Download, Printer } from 'lucide-react';

function AppContent() {
  const { state, dispatch } = useProject();
  const [activeTab, setActiveTab] = useState<'breakdown' | 'schedule'>('breakdown');
  const project = state.present;
  const version = project.versions.find(v => v.id === project.activeVersionId);

  const handleExportJSON = () => {
    const data = JSON.stringify(project, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title || 'Export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleExportCSV = () => {
    // Basic csv export of scenes
    const lines = ["Scene,Pages,ScriptDay,I/E,Set,D/N,Description,Cast,Notes"];
    for(const s of project.scenes) {
      lines.push(`${s.sceneNumber},"${s.pageCount}",${s.scriptDay},${s.intExt},"${s.set}",${s.dayNight},"${s.description}","${s.cast}","${s.notes}"`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title || 'Breakdown'}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-white flex flex-col text-[13px] print:bg-white print:text-black">
      {/* HEADER */}
      <header className="flex items-center justify-between bg-zinc-950 text-zinc-300 px-4 py-2 select-none print:hidden border-b border-zinc-900 border-t-zinc-700/50">
        <div className="flex items-center space-x-6">
          <input 
            value={project.title} 
            onChange={e => dispatch({type: 'UPDATE_PROJECT', payload: {title: e.target.value}})}
            className="bg-transparent border-none text-white font-medium focus:ring-1 focus:ring-zinc-600 rounded px-1 outline-none font-sans"
          />
          <div className="flex space-x-1 bg-zinc-900 rounded-md p-0.5 border border-zinc-800">
            <button 
              onClick={() => setActiveTab('breakdown')} 
              className={`px-3 py-1 rounded-sm transition-colors ${activeTab === 'breakdown' ? 'bg-zinc-700 text-white shadow-sm' : 'hover:text-white'}`}
            >
              Breakdown
            </button>
            <button 
              onClick={() => setActiveTab('schedule')}
              className={`px-3 py-1 rounded-sm transition-colors ${activeTab === 'schedule' ? 'bg-zinc-700 text-white shadow-sm' : 'hover:text-white'}`}
            >
              Schedule
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-4 font-mono text-xs">
          {activeTab === 'schedule' && (
            <div className="flex items-center space-x-2">
              <span className="text-zinc-500">Version:</span>
              <select 
                className="bg-zinc-800 hover:bg-zinc-700 transition-colors border border-zinc-700 text-white px-2 py-1 rounded outline-none"
                value={project.activeVersionId}
                onChange={e => dispatch({type: 'SET_ACTIVE_VERSION', payload: e.target.value})}
              >
                {project.versions.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <button 
                onClick={() => {
                  const name = prompt("New version name?", `${version?.name || 'Version'} copy`);
                  if (name) dispatch({type: 'NEW_VERSION', payload: {name, cloneFromId: project.activeVersionId}});
                }}
                className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 px-2 py-1 rounded transition-colors"
                title="Duplicate version"
              >
                +
              </button>
            </div>
          )}
          
          <div className="flex space-x-2 relative group cursor-pointer z-50">
             <span className="px-3 py-1 items-center flex hover:bg-zinc-800 rounded transition-colors">Export ▾</span>
             <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-800 rounded shadow-2xl hidden group-hover:flex flex-col w-48 text-zinc-300">
               <button onClick={handleExportCSV} className="text-left px-4 py-2 hover:bg-zinc-800 hover:text-white flex items-center gap-2"><Download className="w-3 h-3"/> Breakdown to CSV</button>
               <button onClick={handleExportJSON} className="text-left px-4 py-2 hover:bg-zinc-800 hover:text-white flex items-center gap-2"><Download className="w-3 h-3"/> Save Project as JSON</button>
               <button onClick={() => window.print()} className="text-left px-4 py-2 hover:bg-zinc-800 hover:text-white flex items-center gap-2 border-t border-zinc-800"><Printer className="w-3 h-3"/> Print Schedule</button>
             </div>
          </div>
          <span className="text-zinc-500">Auto-saved</span>
        </div>
      </header>

      {/* CONTENT */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-white">
        {activeTab === 'breakdown' ? <BreakdownTab /> : <ScheduleTab />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <AppContent />
    </ProjectProvider>
  );
}

