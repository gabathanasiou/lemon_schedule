import React, { useRef, useState, useEffect } from 'react';
import { useProject, useIsCloudProject } from '../store';
import { ElementManager } from './ElementManager';
import { SceneSheet } from './SceneSheet';
import MiniTab from './MiniTab';
import { GlideBreakdownTab } from './BreakdownTabGlide';
import PopoutWindow, { PopoutPlaceholder } from './PopoutWindow';
import VersionToolbar from './VersionToolbar';

const SUB_TABS = [
  { id: 'sheet', label: 'Sheet' },
  { id: 'elements', label: 'Element Manager' },
  { id: 'glide', label: 'Glide Breakdown' },
] as const;
type SubTabId = typeof SUB_TABS[number]['id'];

export function BreakdownTab({ subTab: externalSubTab, onSubTabChange, savedCat, onCategoryChange, savedSheetIdx, onSheetIdxChange, onOpenSheet, onOpenSchedule, onOpenSheetInPopout, onOpenScheduleInPopout }: {
  subTab: 'elements' | 'sheet' | 'glide';
  onSubTabChange: (t: 'elements' | 'sheet' | 'glide') => void;
  savedCat: string;
  onCategoryChange: (c: string) => void;
  savedSheetIdx: number;
  onSheetIdxChange: (i: number) => void;
  onOpenSheet?: (rowIndex: number) => void;
  onOpenSchedule?: (sceneId: string) => void;
  onOpenSheetInPopout?: (rowIndex: number) => void;
  onOpenScheduleInPopout?: (sceneId: string) => void;
}) {
  const { state, renameProject, currentProjectId, projectList } = useProject();
  const project = state.present;
  const subTab = externalSubTab;
  const scrollTops = useRef<Record<string, number>>({});
  useEffect(() => {
    const el = document.querySelector('.tab-scroll');
    if (el && scrollTops.current[subTab] !== undefined) el.scrollTop = scrollTops.current[subTab];
  }, [subTab]);
  const portalTargetRef = useRef<HTMLDivElement>(null);
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
          if (nextTab) onSubTabChange(nextTab.id);
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
    sheet: 'Sheet', elements: 'Element Manager', glide: 'Glide Breakdown',
  };

  const renameHandler = (v: string) => renameProject(currentProjectId!, v, projectList.find(p => p.id === currentProjectId)?.driveFileId);

  return (
    <div className="flex-1 flex flex-col h-full bg-white text-zinc-900 border-x border-zinc-200 overflow-hidden relative select-none">
      {poppedOutSubTabs.has('sheet') && popoutSubWindowsRef.current.get('sheet') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Sheet`} win={popoutSubWindowsRef.current.get('sheet')!} onClose={() => closeSubPopout('sheet')}>
          <div className="h-screen bg-white flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={renameHandler} tabName="Sheet" onClose={() => closeSubPopout('sheet')} />
            <div className="flex-1 min-h-0">
              <SceneSheet initialIndex={savedSheetIdx} onIndexChange={onSheetIdxChange} onOpenSchedule={onOpenSchedule} onOpenScheduleInPopout={onOpenScheduleInPopout} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutSubTabs.has('elements') && popoutSubWindowsRef.current.get('elements') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Element Manager`} win={popoutSubWindowsRef.current.get('elements')!} onClose={() => closeSubPopout('elements')}>
          <div className="h-screen bg-white flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={renameHandler} tabName="Element Manager" onClose={() => closeSubPopout('elements')} />
            <div className="flex-1 min-h-0">
              <ElementManager initialCategory={savedCat} onCategoryChange={onCategoryChange} />
            </div>
          </div>
        </PopoutWindow>
      )}
      {poppedOutSubTabs.has('glide') && popoutSubWindowsRef.current.get('glide') && (
        <PopoutWindow title={`${project.title || 'Untitled'} — Glide Breakdown`} win={popoutSubWindowsRef.current.get('glide')!} onClose={() => closeSubPopout('glide')}>
          <div className="h-screen bg-white flex flex-col text-[13px] overflow-hidden">
            <VersionToolbar projectTitle={project.title} onProjectTitleChange={renameHandler} tabName="Glide Breakdown" onClose={() => closeSubPopout('glide')} />
            <div className="flex-1 min-h-0">
              <GlideBreakdownTab onOpenSheet={onOpenSheet} onOpenSheetInPopout={onOpenSheetInPopout} />
            </div>
          </div>
        </PopoutWindow>
      )}

      <MiniTab
        tabs={SUB_TABS.map(t => ({ id: t.id, label: t.label }))}
        activeTab={subTab}
        onChange={(id) => {
          scrollTops.current[subTab] = document.querySelector('.tab-scroll')?.scrollTop || 0;
          onSubTabChange(id as 'elements' | 'sheet' | 'glide');
        }}
        onPopout={toggleSubPopout}
        rightContent={
          <div ref={el => { portalTargetRef.current = el; setPortalTarget(el); }} className="flex items-center gap-2" />
        }
      />

      {poppedOutSubTabs.has(subTab) ? (
        <PopoutPlaceholder title={subTabLabels[subTab]} onBringBack={() => closeSubPopout(subTab)} />
      ) : (
        subTab === 'elements' ? <ElementManager initialCategory={savedCat} onCategoryChange={onCategoryChange} headerTarget={portalTarget} /> : subTab === 'sheet' ? <SceneSheet initialIndex={savedSheetIdx} onIndexChange={onSheetIdxChange} headerTarget={portalTarget} onOpenSchedule={onOpenSchedule} onOpenScheduleInPopout={onOpenScheduleInPopout} /> : <GlideBreakdownTab onOpenSheet={onOpenSheet} onOpenSheetInPopout={onOpenSheetInPopout} headerTarget={portalTarget} />
      )}
    </div>
  );
}
