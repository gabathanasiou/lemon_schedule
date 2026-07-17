import React, { useState } from 'react';
import PageToolbar from './PageToolbar';
import RibbonTab from './RibbonTab';
import { ColorsTab } from './ColorsTab';
import { PopoutPlaceholder } from './PopoutWindow';

interface DesignTabProps {
  subTab: 'colors' | 'ribbons';
  onSubTabChange: (t: 'colors' | 'ribbons') => void;
  poppedOutSubTabs: Set<string>;
  onToggleSubPopout: (id: string) => void;
  onCloseSubPopout: (id: string) => void;
  shiftHeld?: boolean;
}

export default function DesignTab({ subTab, onSubTabChange, poppedOutSubTabs, onToggleSubPopout, onCloseSubPopout, shiftHeld }: DesignTabProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

  const subTabLabels: Record<string, string> = {
    ribbons: 'Ribbon Designer', colors: 'Colors',
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageToolbar
        theme="dark"
        tabs={[
          { id: 'ribbons', label: 'Ribbon Designer' },
          { id: 'colors', label: 'Colors' },
        ]}
        activeTab={subTab}
        onChange={onSubTabChange}
        onPopout={onToggleSubPopout}
        shiftHeld={shiftHeld}
        rightContent={<div ref={setPortalTarget} className="flex items-center gap-2" />}
      />
      {poppedOutSubTabs.has(subTab) ? (
        <PopoutPlaceholder title={subTabLabels[subTab]} onBringBack={() => onCloseSubPopout(subTab)} />
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
