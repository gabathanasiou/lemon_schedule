import React, { useState } from 'react';
import MiniTab from './MiniTab';
import RibbonTab from './RibbonTab';
import { ColorsTab } from './ColorsTab';

interface DesignTabProps {
  subTab: 'colors' | 'ribbons';
  onSubTabChange: (t: 'colors' | 'ribbons') => void;
}

export default function DesignTab({ subTab, onSubTabChange }: DesignTabProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <MiniTab
        theme="dark"
        tabs={[
          { id: 'ribbons', label: 'Ribbon Designer' },
          { id: 'colors', label: 'Colors' },
        ]}
        activeTab={subTab}
        onChange={onSubTabChange}
        rightContent={<div ref={setPortalTarget} className="flex items-center gap-2" />}
      />
      {subTab === 'colors' ? (
        <ColorsTab headerTarget={portalTarget} />
      ) : (
        <div className="flex-1 flex overflow-hidden bg-zinc-950"><RibbonTab headerTarget={portalTarget} /></div>
      )}
    </div>
  );
}