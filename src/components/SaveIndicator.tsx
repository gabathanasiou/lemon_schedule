import React, { useState, useEffect, useRef } from 'react';
import { Loader2, WifiOff, Save, Cloud } from 'lucide-react';
import { useProject } from '../store';

export interface SaveState {
  status: 'idle' | 'saving' | 'saved' | 'offline';
  lastSavedAt: number | null;
}

export function useSaveIndicator(): SaveState {
  const { readOnly, state } = useProject();
  const [status, setStatus] = useState<SaveState['status']>('idle');
  const lastSavedRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (readOnly) {
      setStatus('offline');
      return;
    }

    setStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastSavedRef.current = Date.now();
      setStatus('saved');
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.present, readOnly]);

  return status === 'offline'
    ? { status: 'offline', lastSavedAt: null }
    : { status, lastSavedAt: lastSavedRef.current };
}

export function SaveIndicator({ isCloudProject }: { isCloudProject?: boolean }) {
  const { status, lastSavedAt } = useSaveIndicator();
  const [showTooltip, setShowTooltip] = useState(false);

  if (status === 'idle') return null;

  if (status === 'offline') {
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <WifiOff className="w-3.5 h-3.5 text-zinc-500" />
        {showTooltip && (
          <div className="absolute top-full left-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
            Saved locally
          </div>
        )}
      </div>
    );
  }

  if (status === 'saving') {
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
        {showTooltip && (
          <div className="absolute top-full left-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
            Saving...
          </div>
        )}
      </div>
    );
  }

  const ago = lastSavedAt ? formatTimeAgo(Date.now() - lastSavedAt) : '';
  const tooltip = isCloudProject ? `Synced to Drive${ago ? ` ${ago}` : ''}` : `Saved locally${ago ? ` ${ago}` : ''}`;
  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {isCloudProject ? (
        <Cloud className="w-3.5 h-3.5 text-zinc-500" />
      ) : (
        <Save className="w-3.5 h-3.5 text-zinc-500" />
      )}
      {showTooltip && (
        <div className="absolute top-full left-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
          {tooltip}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
