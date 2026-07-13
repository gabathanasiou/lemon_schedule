import React, { useState, useRef } from 'react';
import { useProject } from '../store';
import MiniTab from './MiniTab';
import RibbonTab from './RibbonTab';
import { ColorsTab } from './ColorsTab';
import PopoutWindow, { PopoutPlaceholder } from './PopoutWindow';
import VersionToolbar from './VersionToolbar';

const SUB_TABS = [
  { id: 'ribbons', label: 'Ribbon Designer' },
  { id: 'colors', label: 'Colors' },
] as const;
type SubTabId = typeof SUB_TABS[number]['id'];

interface DesignTabProps {
  subTab: 'colors' | 'ribbons';
  onSubTabChange: (t: 'colors' | 'ribbons') => void;
}

export default function DesignTab({ subTab, onSubTabChange }: DesignTabProps) {
  const { state, renameProject, currentProjectId, projectList } = useProject();
  const project = state.present;
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

  const [poppedOutSubTabs, setPoppedOutSubTabs] = useState<Set<string>>(new Set());
  const popoutSubWindowsRef = useRef<Map<string, Window>>(new Map());

  const toggleSubPopout = (subTabId: string) => {
    setPoppedOutSubTabs(prev => {
      const next = new Set(prev);
      if (next.has(subTabId)) {
        next.delete(subTabId);
        const w = popoutSubWindowsRef.current.get(subTabId);
        if (w && !w.closed) w.close();
        popoutSubWindowsRef.current.delete(subTabId);
      } else {
        const left = Math.round((screen.width - 1200) / 2);
        const top = Math.round((screen.height - 800) / 2);
        const w = window.open('', `popout_sub_${subTabId}`, `width=1200,height=800,left=${left},top=${top}`);
        if (!w) return prev;
        popoutSubWindowsRef.current.set(subTabId, w);
        next.add(subTabId);
        if (subTabId === subTab) {
          const nextTab = SUB_TABS.find(t => t.id !== subTabId && !next.has(t.id));
          if (nextTab) onSubTabChange(nextTab.id as 'colors' | 'ribbons');
        }
      }
      return next;
    });
  };

  const closeSubPopout = (subTabId: string) => {
    setPoppedOutSubTabs(prev => {
      const next = new Set(prev);
      next.delete(subTabId);
      return next;
    });
    popoutSubWindowsRef.current.delete(subTabId);
  };

  const subTabLabels: Record<string, string> = {
    ribbons: 'Ribbon Designer', colors: 'Colors',
  };

  const renameHandler = (v: string) => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {poppedOutSubTabs.has('ribbons') && popoutSubWindowsRef.current.get('ribbons') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Ribbon Designer`} win={popoutSubWindowsRef.current.get('ribbons')!} onClose={() => closeSubPopout('ribbons')}>
          <div className="h-screen bg-zinc-950 flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={renameHandler} tabName="Ribbon Designer" onClose={() => closeSubPopout('ribbons')} />
            <div className="flex-1 min-h-0 flex"><RibbonTab /></div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutSubTabs.has('colors') && popoutSubWindowsRef.current.get('colors') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Colors`} win={popoutSubWindowsRef.current.get('colors')!} onClose={() => closeSubPopout('colors')}>
          <div className="h-screen bg-zinc-950 flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={renameHandler} tabName="Colors" onClose={() => closeSubPopout('colors')} />
            <div className="flex-1 min-h-0 flex"><ColorsTab /></div>
          </div>
        </PopoutWindow>
      )}

      <MiniTab
        theme="dark"
        tabs={SUB_TABS.map(t => ({ id: t.id, label: t.label }))}
        activeTab={subTab}
        onChange={onSubTabChange}
        onPopout={toggleSubPopout}
        rightContent={<div ref={setPortalTarget} className="flex items-center gap-2" />}
      />

      {poppedOutSubTabs.has(subTab) ? (
        <PopoutPlaceholder title={subTabLabels[subTab]} onBringBack={() => closeSubPopout(subTab)} />
      ) : (
        subTab === 'colors' ? (
          <ColorsTab headerTarget={portalTarget} />
        ) : (
          <div className="flex-1 flex overflow-hidden bg-zinc-950"><RibbonTab headerTarget={portalTarget} /></div>
        )
      )}
    </div>
  );
}
