import React, { useState, useEffect, useRef } from 'react';
import { Loader2, WifiOff, Save, Cloud, CloudOff, HardDrive, Eye } from 'lucide-react';
import { useProject } from '../store';
import { useGoogleAuth } from '../lib/googleDriveAuth';

export interface SaveState {
  status: 'idle' | 'saving' | 'saved' | 'offline' | 'viewOnly';
  lastSavedAt: number | null;
}

export function useSaveIndicator(): SaveState {
  const { readOnly, canEdit, state } = useProject();
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
    // View-only members never write — the eye reads their permission, not sync.
    if (!canEdit) {
      setStatus('viewOnly');
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
  }, [state.present, readOnly, canEdit]);

  return status === 'offline'
    ? { status: 'offline', lastSavedAt: null }
    : { status, lastSavedAt: lastSavedRef.current };
}

export function SaveIndicator({ isCloudProject, isOnlineProject }: { isCloudProject?: boolean; isOnlineProject?: boolean }) {
  const { status, lastSavedAt } = useSaveIndicator();
  const { canEdit, driveSaveError, driveErrorMsg, driveRetryPending, storageQuotaError, retryDriveSync } = useProject();
  const auth = useGoogleAuth();
  const [showTooltip, setShowTooltip] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const iconColor = isCloudProject ? 'text-white' : 'text-zinc-500';

  if (status === 'idle') return null;

  // Permission beats sync state: a view-only member sees the eye (with the
  // reason when access changed mid-session), never a broken retry affordance.
  if (!canEdit) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        data-testid="view-only-indicator"
      >
        <Eye className={`w-3.5 h-3.5 ${iconColor}`} />
        {showTooltip && (
          <div className="absolute top-full left-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
            {driveErrorMsg || 'View only — you can’t make changes to this shared project'}
          </div>
        )}
      </div>
    );
  }

  if (status === 'offline') {
    const tooltipText = !isCloudProject
      ? 'Saved locally'
      : !auth.isSignedIn
        ? 'Signed out - editing disabled'
        : auth.needsReauth
          ? 'Session expired - editing disabled'
          : 'Offline - editing disabled';
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <WifiOff className={`w-3.5 h-3.5 ${iconColor}`} />
        {showTooltip && (
          <div className="absolute top-full left-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
            {tooltipText}
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
        <Loader2 className={`w-3.5 h-3.5 animate-spin ${iconColor}`} />
        {showTooltip && (
          <div className="absolute top-full left-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
            Saving...
          </div>
        )}
      </div>
    );
  }

  const ago = lastSavedAt ? formatTimeAgo(Date.now() - lastSavedAt) : '';

  if (!isCloudProject && storageQuotaError) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <HardDrive className="w-3.5 h-3.5 text-rose-400" />
        {showTooltip && (
          <div className="absolute top-full left-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
            Storage full - changes not saved
          </div>
        )}
      </div>
    );
  }

  if (isCloudProject && auth.needsReauth) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <button
          onClick={() => auth.signIn()}
          className="cursor-pointer"
          title="Sign in to resume sync - click to re-authenticate"
        >
          <CloudOff className="w-3.5 h-3.5 text-amber-400" />
        </button>
        {showTooltip && (
          <div className="absolute top-full left-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
            Sign in to resume sync
          </div>
        )}
      </div>
    );
  }

  if (isCloudProject && driveRetryPending) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Loader2 className={`w-3.5 h-3.5 animate-spin ${iconColor}`} />
        {showTooltip && (
          <div className="absolute top-full left-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
            Retrying sync…
          </div>
        )}
      </div>
    );
  }

  if (isCloudProject && driveSaveError) {
    if (!navigator.onLine) {
      return (
        <div
          className="relative"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <WifiOff className="w-3.5 h-3.5 text-zinc-400" />
          {showTooltip && (
            <div className="absolute top-full left-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
              Working offline
            </div>
          )}
        </div>
      );
    }
    return (
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <button
          onClick={async () => { setRetrying(true); await retryDriveSync(); setRetrying(false); }}
          disabled={retrying}
          className="cursor-pointer"
          title={`Sync failed${driveErrorMsg ? `: ${driveErrorMsg}` : ''} - click to retry`}
        >
          {retrying ? (
            <Loader2 className="w-3.5 h-3.5 text-rose-400 animate-spin" />
          ) : (
            <CloudOff className="w-3.5 h-3.5 text-rose-400" />
          )}
        </button>
        {showTooltip && (
          <div className="absolute top-full left-0 mt-1.5 bg-zinc-900 text-zinc-300 text-[11px] px-2 py-1 rounded border border-zinc-700 whitespace-nowrap z-50">
            {driveErrorMsg ? `Sync failed: ${driveErrorMsg} - click to retry` : 'Sync failed - click to retry'}
          </div>
        )}
      </div>
    );
  }

  const tooltip = isOnlineProject
    ? `Synced to shared projects${ago ? ` ${ago}` : ''}`
    : isCloudProject
      ? `Synced to Drive${ago ? ` ${ago}` : ''}`
      : `Saved locally${ago ? ` ${ago}` : ''}`;
  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {isCloudProject ? (
        <Cloud className={`w-3.5 h-3.5 ${iconColor}`} />
      ) : (
        <Save className={`w-3.5 h-3.5 ${iconColor}`} />
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
