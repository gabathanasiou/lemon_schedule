import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Check, ChevronDown, Scissors, SplitSquareHorizontal } from 'lucide-react';
import { ElementManager } from './ElementManager';
import DropdownMenu from './DropdownMenu';
import DropdownItem from './DropdownItem';
import { SceneSheet } from './SceneSheet';
import { ScriptView } from './ScriptView';
import SplitManagerModal from './script/SplitManagerModal';
import Button from './Button';
import PageToolbar from './PageToolbar';
import { GlideBreakdownTab } from './BreakdownTabGlide';
import { PopoutPlaceholder } from './PopoutWindow';
import { useDialog } from './Dialog';
import { requestUnsavedSave } from '../lib/unsavedGuard';
import { TEST_IDS } from '../lib/testIds';

export function BreakdownTab({ subTab: externalSubTab, onSubTabChange, savedCat, onCategoryChange, savedSheetIdx, onSheetIdxChange, onOpenSheet, onOpenSchedule, onOpenSheetInPopout, onOpenScheduleInPopout, onUpdateScript, onCutScene, poppedOutSubTabs, onToggleSubPopout, onCloseSubPopout, shiftHeld }: {
  subTab: 'elements' | 'sheet' | 'glide' | 'script';
  onSubTabChange: (t: 'elements' | 'sheet' | 'glide' | 'script') => void;
  savedCat: string;
  onCategoryChange: (c: string) => void;
  savedSheetIdx: number;
  onSheetIdxChange: (i: number) => void;
  onOpenSheet?: (rowIndex: number) => void;
  onOpenSchedule?: (sceneId: string) => void;
  onOpenSheetInPopout?: (rowIndex: number) => void;
  onOpenScheduleInPopout?: (sceneId: string) => void;
  onUpdateScript?: () => void;
  onCutScene?: (sceneId: string, splitIndex?: number) => void;
  poppedOutSubTabs: Set<string>;
  onToggleSubPopout: (id: string) => void;
  onCloseSubPopout: (id: string) => void;
  shiftHeld?: boolean;
}) {
  const subTab = externalSubTab;
  const dialog = useDialog();
  const scrollTops = useRef<Record<string, number>>({});
  useEffect(() => {
    const el = document.querySelector('.tab-scroll');
    if (el && scrollTops.current[subTab] !== undefined) el.scrollTop = scrollTops.current[subTab];
  }, [subTab]);
  const portalTargetRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const [splitManagerOpen, setSplitManagerOpen] = useState(false);
  const [cutMode, setCutMode] = useState(false);
  const [cutMenuOpen, setCutMenuOpen] = useState(false);
  // The razor only makes sense on the script canvas — leave the tool when the
  // sub-tab changes.
  useEffect(() => { if (subTab !== 'script') setCutMode(false); }, [subTab]);

  const subTabLabels: Record<string, string> = {
    sheet: 'Sheet', script: 'Script', elements: 'Element Manager', glide: 'Glide Breakdown',
  };

  // Sub-tab switches/popouts that would unmount the element manager go
  // through the unsaved-changes guard so the prompt fires before leaving.
  const requestSubTabChange = useCallback((id: string) => {
    void requestUnsavedSave(dialog, () => {
      scrollTops.current[subTab] = document.querySelector('.tab-scroll')?.scrollTop || 0;
      onSubTabChange(id as 'elements' | 'sheet' | 'glide' | 'script');
    });
  }, [dialog, subTab, onSubTabChange]);

  const requestSubTabPopout = useCallback((id: string) => {
    void requestUnsavedSave(dialog, () => onToggleSubPopout(id));
  }, [dialog, onToggleSubPopout]);

  return (
    <div className="flex-1 flex flex-col h-full bg-white text-zinc-900 border-x border-zinc-200 overflow-hidden relative select-none">
      <PageToolbar
        tabs={[
          { id: 'sheet', label: 'Sheet' },
          { id: 'script', label: 'Script' },
          { id: 'elements', label: 'Element Manager' },
          { id: 'glide', label: 'Glide Breakdown' },
        ]}
        activeTab={subTab}
        onChange={requestSubTabChange}
        onPopout={requestSubTabPopout}
        shiftHeld={shiftHeld}
        rightContent={
          <div className="flex items-center gap-2">
            {/* Script controls portal in first so the script menu is leftmost. */}
            <div ref={el => { portalTargetRef.current = el; setPortalTarget(el); }} className="flex items-center gap-2" />
            {subTab === 'script' && (
              <DropdownMenu
                open={cutMenuOpen}
                onOpenChange={setCutMenuOpen}
                theme="light"
                width="w-56"
                trigger={
                  <Button variant="subtle" type="button" active={cutMode} aria-pressed={cutMode} data-testid={TEST_IDS.scriptCutToggle}>
                    <Scissors className="w-3.5 h-3.5" /> Cut <ChevronDown className="w-3 h-3.5 text-zinc-400" />
                  </Button>
                }
              >
                <DropdownItem
                  keepOpen
                  icon={<Scissors className="w-3.5 h-3.5" />}
                  trailing={cutMode ? <Check className="w-3 h-3" /> : undefined}
                  onClick={() => setCutMode(v => !v)}
                >
                  Cut scenes
                </DropdownItem>
                <DropdownItem
                  icon={<SplitSquareHorizontal className="w-3.5 h-3.5" />}
                  onClick={() => { setCutMenuOpen(false); setSplitManagerOpen(true); }}
                >
                  Split Manager…
                </DropdownItem>
              </DropdownMenu>
            )}
          </div>
        }
      />
      {poppedOutSubTabs.has(subTab) ? (
        <PopoutPlaceholder title={subTabLabels[subTab]} onBringBack={() => onCloseSubPopout(subTab)} />
      ) : (
        subTab === 'elements' ? <ElementManager initialCategory={savedCat} onCategoryChange={onCategoryChange} headerTarget={portalTarget} /> : subTab === 'sheet' ? <SceneSheet initialIndex={savedSheetIdx} onIndexChange={onSheetIdxChange} headerTarget={portalTarget} onOpenSchedule={onOpenSchedule} onOpenScheduleInPopout={onOpenScheduleInPopout} /> : subTab === 'script' ? <ScriptView headerTarget={portalTarget} onOpenSheet={onOpenSheet} onOpenSchedule={onOpenSchedule} onUpdateScript={onUpdateScript} onCutScene={onCutScene} cutMode={cutMode} onCutModeChange={setCutMode} /> : <GlideBreakdownTab onOpenSheet={onOpenSheet} onOpenSheetInPopout={onOpenSheetInPopout} headerTarget={portalTarget} />
      )}
      {splitManagerOpen && <SplitManagerModal onOpen={onOpenSchedule} onClose={() => setSplitManagerOpen(false)} />}
    </div>
  );
}
