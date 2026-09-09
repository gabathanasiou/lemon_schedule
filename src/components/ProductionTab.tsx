import React, { useState, useRef, useCallback } from 'react';
import { ReportBlock, ReportDesign } from '../types';
import PageToolbar from './PageToolbar';
import { PopoutPlaceholder } from './PopoutWindow';
import { useDialog } from './Dialog';
import { requestUnsavedSave } from '../lib/unsavedGuard';
import DayManagerPage from './production/day/DayManagerPage';
import { CrewManager } from './CrewManager';
import { CrewGlideTab } from './CrewGlideTab';
import { LocationsManager } from './LocationsManager';
import { LocationsGlideTab } from './LocationsGlideTab';
import type { DayView } from '../lib/dayView';

export type ProductionSubTab = 'days' | 'crew' | 'crewGlide' | 'locations' | 'locationsGlide';

interface ProductionTabProps {
  subTab: ProductionSubTab;
  onSubTabChange: (t: ProductionSubTab) => void;
  poppedOutSubTabs: Set<string>;
  onToggleSubPopout: (id: string) => void;
  onCloseSubPopout: (id: string) => void;
  shiftHeld?: boolean;
  headerTarget?: HTMLElement | null;
  crewRoleTarget?: string | null;
  onCrewRoleTargetChange?: (role: string | null) => void;
  locationTypeTarget?: string | null;
  onLocationTypeTargetChange?: (type: string | null) => void;
  /** Pending Day Manager target (section index) from an entry point. */
  dayTarget?: number | null;
  onDayTargetSeen?: () => void;
  onOpenScene?: (sceneId: string) => void;
  onPrintCallSheet?: (day: DayView, design: ReportDesign, zoneBlocks?: ReportBlock[]) => void;
  onPopOutDay?: (day: DayView) => void;
}

/** Production tab shell (roadmap 103): the Day Manager plus the Crew /
 *  Locations manager pages and their Glide views. Project Details and the
 *  Call Times settings live in the Day Manager header as draggable modals
 *  (ProductionDetailsModal / CallTimesSettingsModal) — no sub-tabs for them. */
export default function ProductionTab({ subTab, onSubTabChange, poppedOutSubTabs, onToggleSubPopout, onCloseSubPopout, shiftHeld, headerTarget, crewRoleTarget, onCrewRoleTargetChange, locationTypeTarget, onLocationTypeTargetChange, dayTarget, onDayTargetSeen, onOpenScene, onPrintCallSheet, onPopOutDay }: ProductionTabProps) {
  const dialog = useDialog();

  const portalTargetRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  // The Days sub-tab's call-sheet editor is a full-surface DARK mode — its
  // chrome extends up into the sub-tab bar so the light tabs don't float over
  // the dark editor.
  const [daysChromeDark, setDaysChromeDark] = useState(false);
  const handleDaysChrome = useCallback((dark: boolean) => setDaysChromeDark(dark), []);

  // Sub-tab switches/popouts that would unmount the crew manager go through
  // the unsaved-changes guard so the prompt fires before leaving.
  const requestSubTabChange = useCallback((id: string) => {
    void requestUnsavedSave(dialog, () => onSubTabChange(id as ProductionSubTab));
  }, [dialog, onSubTabChange]);

  const requestSubTabPopout = useCallback((id: string) => {
    void requestUnsavedSave(dialog, () => onToggleSubPopout(id));
  }, [dialog, onToggleSubPopout]);

  const subTabLabels: Record<string, string> = { days: 'Day Manager', crew: 'Crew', crewGlide: 'Crew Glide', locations: 'Locations', locationsGlide: 'Locations Glide' };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <PageToolbar
        theme={subTab === 'days' && daysChromeDark ? 'dark' : 'light'}
        tabs={[
          { id: 'days', label: 'Day Manager' },
          { id: 'crew', label: 'Crew' },
          { id: 'crewGlide', label: 'Crew Glide' },
          { id: 'locations', label: 'Locations' },
          { id: 'locationsGlide', label: 'Locations Glide' },
        ]}
        activeTab={subTab}
        onChange={requestSubTabChange}
        onPopout={requestSubTabPopout}
        shiftHeld={shiftHeld}
        rightContent={
          <div ref={el => { portalTargetRef.current = el; setPortalTarget(el); }} className="flex items-center gap-2" />
        }
      />
      {poppedOutSubTabs.has(subTab) ? (
        <PopoutPlaceholder title={subTabLabels[subTab]} onBringBack={() => onCloseSubPopout(subTab)} />
      ) : subTab === 'days' ? (
        <DayManagerPage
          headerTarget={headerTarget ?? portalTarget}
          initialDayIndex={dayTarget}
          onTargetSeen={onDayTargetSeen}
          onOpenScene={onOpenScene}
          onPrintCallSheet={onPrintCallSheet}
          onPopOutDay={onPopOutDay}
          onChromeModeChange={handleDaysChrome}
        />
      ) : subTab === 'crew' ? (
        <CrewManager headerTarget={headerTarget ?? portalTarget} initialRole={crewRoleTarget} onRoleChange={r => onCrewRoleTargetChange?.(r)} />
      ) : subTab === 'crewGlide' ? (
        <CrewGlideTab
          headerTarget={headerTarget ?? portalTarget}
          onGoToManager={(roleKey) => { onCrewRoleTargetChange?.(roleKey); onSubTabChange('crew'); }}
        />
      ) : subTab === 'locations' ? (
        <LocationsManager headerTarget={headerTarget ?? portalTarget} initialType={locationTypeTarget} onTypeChange={t => onLocationTypeTargetChange?.(t)} />
      ) : (
        <LocationsGlideTab
          headerTarget={headerTarget ?? portalTarget}
          onGoToManager={(typeKey) => { onLocationTypeTargetChange?.(typeKey); onSubTabChange('locations'); }}
        />
      )}
    </div>
  );
}
