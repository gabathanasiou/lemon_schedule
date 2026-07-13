import React, { useRef, useState, useEffect } from 'react';
import { ElementManager } from './ElementManager';
import { SceneSheet } from './SceneSheet';
import MiniTab from './MiniTab';
import { GlideBreakdownTab } from './BreakdownTabGlide';
import { PopoutPlaceholder } from './PopoutWindow';

export function BreakdownTab({ subTab: externalSubTab, onSubTabChange, savedCat, onCategoryChange, savedSheetIdx, onSheetIdxChange, onOpenSheet, onOpenSchedule, onOpenSheetInPopout, onOpenScheduleInPopout, poppedOutSubTabs, onToggleSubPopout, onCloseSubPopout }: {
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
  poppedOutSubTabs: Set<string>;
  onToggleSubPopout: (id: string) => void;
  onCloseSubPopout: (id: string) => void;
}) {
  const subTab = externalSubTab;
  const scrollTops = useRef<Record<string, number>>({});
  useEffect(() => {
    const el = document.querySelector('.tab-scroll');
    if (el && scrollTops.current[subTab] !== undefined) el.scrollTop = scrollTops.current[subTab];
  }, [subTab]);
  const portalTargetRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

  const subTabLabels: Record<string, string> = {
    sheet: 'Sheet', elements: 'Element Manager', glide: 'Glide Breakdown',
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white text-zinc-900 border-x border-zinc-200 overflow-hidden relative select-none">
      <MiniTab
        tabs={[
          { id: 'sheet', label: 'Sheet' },
          { id: 'elements', label: 'Element Manager' },
          { id: 'glide', label: 'Glide Breakdown' },
        ]}
        activeTab={subTab}
        onChange={(id) => {
          scrollTops.current[subTab] = document.querySelector('.tab-scroll')?.scrollTop || 0;
          onSubTabChange(id as 'elements' | 'sheet' | 'glide');
        }}
        onPopout={onToggleSubPopout}
        rightContent={
          <div ref={el => { portalTargetRef.current = el; setPortalTarget(el); }} className="flex items-center gap-2" />
        }
      />
      {poppedOutSubTabs.has(subTab) ? (
        <PopoutPlaceholder title={subTabLabels[subTab]} onBringBack={() => onCloseSubPopout(subTab)} />
      ) : (
        subTab === 'elements' ? <ElementManager initialCategory={savedCat} onCategoryChange={onCategoryChange} headerTarget={portalTarget} /> : subTab === 'sheet' ? <SceneSheet initialIndex={savedSheetIdx} onIndexChange={onSheetIdxChange} headerTarget={portalTarget} onOpenSchedule={onOpenSchedule} onOpenScheduleInPopout={onOpenScheduleInPopout} /> : <GlideBreakdownTab onOpenSheet={onOpenSheet} onOpenSheetInPopout={onOpenSheetInPopout} headerTarget={portalTarget} />
      )}
    </div>
  );
}
