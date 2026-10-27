import React, { useState, useMemo } from 'react';
import { useProject } from '../store';
import { ELEMENT_CATEGORIES } from '../lib/categories';
import DoodsTab from './DoodsTab';
import ElementBreakdownView from './ElementBreakdownView';
import { Printer, GanttChart, Layers } from 'lucide-react';
import PageToolbar from './PageToolbar';
import Button from './Button';
import { PopoutPlaceholder } from './PopoutWindow';
import { ReportCategorySidebar } from './reports/ReportCategorySidebar';

interface ReportsTabProps {
  subTab: 'doods' | 'elementBreakdown';
  onSubTabChange: (t: 'doods' | 'elementBreakdown') => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  onPrint?: () => void;
  poppedOutSubTabs: Set<string>;
  onToggleSubPopout: (id: string) => void;
  onCloseSubPopout: (id: string) => void;
}

export default function ReportsTab({ subTab, onSubTabChange, selectedCategory, onCategoryChange, onPrint, poppedOutSubTabs, onToggleSubPopout, onCloseSubPopout }: ReportsTabProps) {
  const { state } = useProject();
  const project = state.present;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

  const hiddenSet = useMemo(() => new Set(project.hiddenCategories || []), [project.hiddenCategories]);

  const allCategoryKeys = useMemo(() => {
    const keys: { key: string; isCustom: boolean }[] = [];
    for (const c of ELEMENT_CATEGORIES) {
      if (!hiddenSet.has(c.key)) keys.push({ key: c.key, isCustom: false });
    }
    for (const c of project.customCategories || []) {
      if (!hiddenSet.has(c.key)) keys.push({ key: c.key, isCustom: true });
    }
    return keys;
  }, [project.customCategories, hiddenSet]);

  const subTabLabels: Record<string, string> = {
    doods: 'Day Out of Days', elementBreakdown: 'Element Breakdown',
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageToolbar
        theme="dark"
        tabs={[
          { id: 'doods', label: 'Day Out of Days', icon: <GanttChart className="w-3.5 h-3.5" /> },
          { id: 'elementBreakdown', label: 'Element Breakdown', icon: <Layers className="w-3.5 h-3.5" /> },
        ]}
        activeTab={subTab}
        onChange={onSubTabChange}
        onPopout={onToggleSubPopout}
        rightContent={
          <div className="flex items-center gap-2">
            <div ref={setPortalTarget} className="flex items-center gap-2" />
            {onPrint ? (
              <Button theme="dark" onClick={onPrint}>
                <Printer className="w-3.5 h-3.5" />
                Print
              </Button>
            ) : undefined}
          </div>
        }
      />
      {poppedOutSubTabs.has(subTab) ? (
        <PopoutPlaceholder title={subTabLabels[subTab]} onBringBack={() => onCloseSubPopout(subTab)} />
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0">
        <ReportCategorySidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={setSidebarCollapsed}
          keys={allCategoryKeys}
          selected={selectedCategory}
          onSelect={onCategoryChange}
          project={project}
        />

        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {subTab === 'doods' ? (
            <DoodsTab selectedCategory={selectedCategory} />
          ) : (
            <ElementBreakdownView selectedCategory={selectedCategory} />
          )}
        </div>
        </div>
      )}
    </div>
  );
}

