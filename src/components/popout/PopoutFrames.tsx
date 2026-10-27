import React from 'react';
import PopoutWindow from '../PopoutWindow';
import VersionToolbar from '../VersionToolbar';
import PageToolbar from '../PageToolbar';

interface PopoutFrameProps {
  win: Window;
  onClose: () => void;
  title: string;
  tabName: string;
  projectTitle: string;
  onProjectTitleChange: (v: string) => void;
  bg?: string;
  children: React.ReactNode;
}

/** Shell for top-level tab popout windows: window + version toolbar + content. */
export function PopoutFrame({ win, onClose, title, tabName, projectTitle, onProjectTitleChange, bg = 'bg-white', children }: PopoutFrameProps) {
  return (
    <PopoutWindow title={title} win={win} onClose={onClose}>
      <div className={`h-screen ${bg} flex flex-col text-[13px] overflow-hidden`}>
        <VersionToolbar projectTitle={projectTitle} onProjectTitleChange={onProjectTitleChange} tabName={tabName} onClose={onClose} />
        <div className="flex-1 min-h-0 flex flex-col">
          {children}
        </div>
      </div>
    </PopoutWindow>
  );
}

interface SubTabPopoutFrameProps {
  win: Window;
  onClose: () => void;
  title: string;
  tabName: string;
  subTabId: string;
  tabLabel: string;
  projectTitle: string;
  onProjectTitleChange: (v: string) => void;
  headerTarget: HTMLElement | null | undefined;
  setHeaderTarget: (el: HTMLElement | null) => void;
  theme?: 'light' | 'dark';
  bg?: string;
  rightContent?: React.ReactNode;
  children: React.ReactNode;
}

/** Shell for sub-tab popout windows: window + version toolbar + decorative PageToolbar with header portal. */
export function SubTabPopoutFrame({
  win, onClose, title, tabName, subTabId, tabLabel, projectTitle, onProjectTitleChange,
  headerTarget, setHeaderTarget, theme = 'light', bg = 'bg-white', rightContent, children,
}: SubTabPopoutFrameProps) {
  return (
    <PopoutWindow title={title} win={win} onClose={onClose}>
      <div className={`h-screen ${bg} flex flex-col text-[13px] overflow-hidden`}>
        <VersionToolbar projectTitle={projectTitle} onProjectTitleChange={onProjectTitleChange} tabName={tabName} onClose={onClose} />
        <PageToolbar
          theme={theme}
          tabs={[{ id: subTabId, label: tabLabel }]}
          activeTab={subTabId}
          onChange={() => {}}
          rightContent={
            <div className="flex items-center gap-2">
              {rightContent}
              <div ref={el => { if (el && headerTarget !== el) setHeaderTarget(el); }} className="flex items-center gap-2" />
            </div>
          }
        />
        <div className="flex-1 min-h-0 flex flex-col">
          {children}
        </div>
      </div>
    </PopoutWindow>
  );
}
