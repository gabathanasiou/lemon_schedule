import React, { useState, useRef, useCallback } from 'react';
import ToolbarDivider from './ToolbarDivider';
import { List, Sheet, Table2 } from 'lucide-react';
import { Seg } from '@gabriel/ui-kit';
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

export type ProductionSubTab = 'days' | 'crew' | 'locations';

/** Per-sub-sub view modes (roadmap 177): the merged Crew/Locations sub-tabs
 *  toggle manager ↔ Glide; Days toggles Day Manager ↔ Call Sheet editor. */
export interface ProdViews {
  days: 'manager' | 'callsheet';
  crew: 'manager' | 'glide';
  locations: 'manager' | 'glide';
}

interface ProductionTabProps {
  subTab: ProductionSubTab;
  onSubTabChange: (t: ProductionSubTab) => void;
  views: ProdViews;
  onViewChange: (sub: ProductionSubTab, mode: string) => void;
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

/** Production tab shell (roadmap 103, consolidated 177): the Day Manager, the
 *  Crew manager/Glide and the Locations manager/Glide — five former sub-tabs
 *  collapsed to three, with a toolbar toggle for each merged pair. Project
 *  Details and the Call Times settings live in the Day Manager header as
 *  draggable modals (ProductionDetailsModal / CallTimesSettingsModal). */
export default function ProductionTab({ subTab, onSubTabChange, views, onViewChange, poppedOutSubTabs, onToggleSubPopout, onCloseSubPopout, shiftHeld, headerTarget, crewRoleTarget, onCrewRoleTargetChange, locationTypeTarget, onLocationTypeTargetChange, dayTarget, onDayTargetSeen, onOpenScene, onPrintCallSheet, onPopOutDay }: ProductionTabProps) {
  const dialog = useDialog();

  const portalTargetRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  // Second slot, immediately left of the view switcher: the day selector is
  // pinned there in BOTH Days views so it sits in the same spot (roadmap 177).
  const dayPickerTargetRef = useRef<HTMLDivElement>(null);
  const [dayPickerTarget, setDayPickerTarget] = useState<HTMLDivElement | null>(null);
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

  // Manager ↔ alternate view toggles unmount the manager too — same guard.
  const requestViewChange = useCallback((sub: ProductionSubTab, view: string) => {
    void requestUnsavedSave(dialog, () => onViewChange(sub, view));
  }, [dialog, onViewChange]);

  const subTabLabels: Record<string, string> = { days: 'Day Manager', crew: 'Crew', locations: 'Locations' };

  /** Merged-view switcher (roadmap 177): one 2-segment icon control expressing
   *  "manager ↔ alternate view" (Crew/Locations Glide, Days Call Sheet). Pinned
   *  LAST in the toolbar so it never moves when the view's own controls change.
   *  Theme-aware: the Call Sheet editor darkens the Days toolbar. */
  const viewToggle = (sub: ProductionSubTab) => {
    const dark = sub === 'days' && daysChromeDark;
    const alt = sub === 'days'
      ? { active: views.days === 'callsheet', label: 'Call Sheet view', title: 'Call sheet editor', icon: Sheet, mode: 'callsheet' }
      : { active: views[sub] === 'glide', label: 'Glide view', title: `${subTabLabels[sub]} Glide view`, icon: Table2, mode: 'glide' };
    const AltIcon = alt.icon;
    return (
      <Seg
        variant="track"
        theme={dark ? 'dark' : 'light'}
        dense
        value={views[sub]}
        options={[
          { v: 'manager', l: '', title: `${subTabLabels[sub]} manager view`, ariaLabel: 'Manager view', icon: <List className="w-3.5 h-3.5" /> },
          { v: alt.mode, l: '', title: alt.title, ariaLabel: alt.label, icon: <AltIcon className="w-3.5 h-3.5" /> },
        ]}
        onChange={m => { if (views[sub] !== m) requestViewChange(sub, m); }}
        ariaLabel={`${subTabLabels[sub]} view`}
      />
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <PageToolbar
        theme={subTab === 'days' && daysChromeDark ? 'dark' : 'light'}
        tabs={[
          { id: 'days', label: 'Day Manager' },
          { id: 'crew', label: 'Crew' },
          { id: 'locations', label: 'Locations' },
        ]}
        activeTab={subTab}
        onChange={requestSubTabChange}
        onPopout={requestSubTabPopout}
        shiftHeld={shiftHeld}
        rightContent={
          <div className="flex items-center gap-2">
            <div ref={el => { portalTargetRef.current = el; setPortalTarget(el); }} className="flex items-center gap-2" />
            {/* Repeated across BOTH Days views (day selector + view switcher)
                is divided from the view-specific controls. */}
            <ToolbarDivider dark={subTab === 'days' && daysChromeDark} />
            <div ref={el => { dayPickerTargetRef.current = el; setDayPickerTarget(el); }} className="flex items-center gap-2" />
            {viewToggle(subTab)}
          </div>
        }
      />
      {poppedOutSubTabs.has(subTab) ? (
        <PopoutPlaceholder title={subTabLabels[subTab]} onBringBack={() => onCloseSubPopout(subTab)} />
      ) : subTab === 'days' ? (
        <DayManagerPage
          headerTarget={headerTarget ?? portalTarget}
          dayPickerTarget={dayPickerTarget}
          initialDayIndex={dayTarget}
          onTargetSeen={onDayTargetSeen}
          dayMode={views.days}
          onDayModeChange={(mode) => onViewChange('days', mode)}
          onOpenScene={onOpenScene}
          onPrintCallSheet={onPrintCallSheet}
          onPopOutDay={onPopOutDay}
          onChromeModeChange={handleDaysChrome}
        />
      ) : subTab === 'crew' ? (
        views.crew === 'glide' ? (
          <CrewGlideTab
            headerTarget={headerTarget ?? portalTarget}
            onGoToManager={(roleKey) => { onCrewRoleTargetChange?.(roleKey); requestViewChange('crew', 'manager'); }}
          />
        ) : (
          <CrewManager headerTarget={headerTarget ?? portalTarget} initialRole={crewRoleTarget} onRoleChange={r => onCrewRoleTargetChange?.(r)} />
        )
      ) : views.locations === 'glide' ? (
        <LocationsGlideTab
          headerTarget={headerTarget ?? portalTarget}
          onGoToManager={(typeKey) => { onLocationTypeTargetChange?.(typeKey); requestViewChange('locations', 'manager'); }}
        />
      ) : (
        <LocationsManager headerTarget={headerTarget ?? portalTarget} initialType={locationTypeTarget} onTypeChange={t => onLocationTypeTargetChange?.(t)} />
      )}
    </div>
  );
}
