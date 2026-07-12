import React, { useState } from 'react';
import { useGoogleAuth } from '../lib/googleDriveAuth';
import { Cloud, CloudOff, Loader2, AlertCircle, Check } from 'lucide-react';

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error';

interface SyncStatusIconProps {
  syncState: SyncState;
  lastSync?: number | null;
  onRetry?: () => void;
}

export function SyncStatusIcon({ syncState, lastSync, onRetry }: SyncStatusIconProps) {
  const { isSignedIn } = useGoogleAuth();
  const [showTooltip, setShowTooltip] = useState(false);

  if (!isSignedIn) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <CloudOff className="w-3.5 h-3.5 text-zinc-500" />
        {showTooltip && (
          <div className="absolute top-full right-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
            Sign in to sync with Drive
          </div>
        )}
      </div>
    );
  }

  if (syncState === 'syncing') {
    return (
      <div className="relative" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
        <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin" />
        {showTooltip && (
          <div className="absolute top-full right-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
            Syncing...
          </div>
        )}
      </div>
    );
  }

  if (syncState === 'synced') {
    const ago = lastSync ? formatTimeAgo(Date.now() - lastSync) : '';
    return (
      <div className="relative" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
        <Check className="w-3.5 h-3.5 text-green-400" />
        {showTooltip && (
          <div className="absolute top-full right-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
            Synced{ago ? ` ${ago}` : ''}
          </div>
        )}
      </div>
    );
  }

  if (syncState === 'error') {
    return (
      <button
        onClick={onRetry}
        className="relative cursor-pointer"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <AlertCircle className="w-3.5 h-3.5 text-red-400" />
        {showTooltip && (
          <div className="absolute top-full right-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
            Sync failed — tap to retry
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="relative" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      <Cloud className="w-3.5 h-3.5 text-zinc-500" />
      {showTooltip && (
        <div className="absolute top-full right-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
          Waiting to sync
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
