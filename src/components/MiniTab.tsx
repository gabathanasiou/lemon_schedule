import React, { useRef, useState, useEffect } from 'react';
import { useIsCloudProject } from '../store';
import { ExternalLink } from 'lucide-react';
import { IS_COARSE } from '../lib/device';

interface MiniTabItem {
  id: string;
  label: string;
}

interface MiniTabProps {
  tabs: MiniTabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  rightContent?: React.ReactNode;
  theme?: 'light' | 'dark';
  onPopout?: (tabId: string) => void;
}

const THEME = {
  light: {
    bar: 'bg-white border-zinc-200',
    inactive: 'text-zinc-500 hover:text-zinc-900',
    hoverBg: 'bg-zinc-200/70',
  },
  dark: {
    bar: 'bg-zinc-900 border-zinc-800',
    inactive: 'text-zinc-500 hover:text-zinc-300',
    hoverBg: 'bg-zinc-700/70',
  },
} as const;

export default function MiniTab({ tabs, activeTab, onChange, rightContent, theme = 'light', onPopout }: MiniTabProps) {
  const t = THEME[theme];
  const isCloud = useIsCloudProject();
  const activeBg = theme === 'light' && isCloud ? 'bg-blue-950' : 'bg-zinc-950';
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({ opacity: 0 });
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [hoverStyle, setHoverStyle] = useState<React.CSSProperties>({});

  const measureOverlay = () => {
    const el = tabRefs.current.get(activeTab);
    const container = containerRef.current;
    if (!el || !container) return;
    const cr = container.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const left = er.left - cr.left;
    const width = er.width;
      setOverlayStyle({ left, width, opacity: 1, transform: 'translateY(0)' });
  };

  useEffect(() => {
    const el = tabRefs.current.get(activeTab);
    if (!el) return;
    const ro = new ResizeObserver(() => measureOverlay());
    ro.observe(el);
    measureOverlay();
    return () => ro.disconnect();
  }, [activeTab]);

  const updateHover = (tabId: string | null) => {
    setHoveredTab(tabId);
    if (tabId && tabId !== activeTab) {
      const el = tabRefs.current.get(tabId);
      const container = containerRef.current;
      if (!el || !container) return;
      const cr = container.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      setHoverStyle({ left: er.left - cr.left, width: er.width });
    }
  };

  return (
    <div className={`flex items-center justify-between px-3 pt-2 pb-2 border-b shrink-0 ${t.bar}`}>
      <div ref={containerRef} className="relative flex items-center gap-1">
        {/* Hover overlay (rendered behind active overlay) */}
        {hoveredTab && hoveredTab !== activeTab && (
          <span
              className={`absolute -top-2 -bottom-0 rounded-b-md pointer-events-none ${t.hoverBg}`}
            style={{ ...hoverStyle, transition: 'none' }}
          />
        )}
        {/* Active overlay */}
        <span
          className={`absolute -top-2 -bottom-0 ${activeBg} rounded-b-md pointer-events-none ${theme === 'dark' ? 'border-l border-r border-zinc-600' : ''}`}
          style={{ ...overlayStyle, transition: 'none' }}
        />
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={el => { if (el) tabRefs.current.set(tab.id, el); }}
              onClick={() => onChange(tab.id)}
              onMouseEnter={() => updateHover(tab.id)}
              onMouseLeave={() => updateHover(null)}
              className={`relative group px-3 py-1.5 text-xs font-semibold rounded-b-md transition-colors ${
                active ? 'text-white' : t.inactive
              }`}
            >
              <span className="relative">{tab.label}</span>
              {onPopout && (
                <span
                  onClick={(e) => { e.stopPropagation(); onPopout(tab.id); }}
                  className={`ml-1.5 inline-flex items-center transition-opacity cursor-pointer text-zinc-400 hover:text-zinc-200 ${IS_COARSE ? '' : 'opacity-0 group-hover:opacity-100 hover:opacity-100'}`}
                  title="Open in separate window"
                >
                  <ExternalLink className="w-3 h-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {rightContent && <div className="flex items-center gap-2">{rightContent}</div>}
    </div>
  );
}
