import React, { useState, useEffect, useRef } from 'react';
import { Loader2, WifiOff, Save, Cloud, CloudOff, HardDrive, Eye, RefreshCw } from 'lucide-react';
import { useProject, useIsOnlineProject } from '../store';
import { useGoogleAuth } from '../lib/googleDriveAuth';
import { roomBadgeState, roomBadgeText } from '../lib/rooms/roomBadge';
import { roomsConfigured } from '../lib/rooms/roomsEnv';
import { useHoverTip } from '../lib/useHoverTip';

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

/**
 * The header save control + its S3.5 companion.
 *
 * "Changes available · Reload" appears when a collaborator's save ping landed
 * while this client has unsaved edits (the store never auto-applies over local
 * work — docs/COLLABORATION.md §6 S3.5). Clicking re-reads and loads the shared
 * project, discarding the local unsaved edits (the user chose to).
 *
 * The cloud also carries the room-status badge (roadmap 239): on a shared
 * project whose collaboration room is not live, an amber "!" explains that
 * changes queue locally and will sync when the connection returns (stage 2
 * buffer — the tooltip shows the pending count).
 */
export function SaveIndicator({ isCloudProject }: { isCloudProject?: boolean }) {
  const { onlineChangesAvailable, reloadOnlineProject } = useProject();
  const [reloading, setReloading] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <SaveIndicatorStatus isCloudProject={isCloudProject} />
      {onlineChangesAvailable && (
        <button
          data-testid="changes-available"
          onClick={async () => {
            setReloading(true);
            try {
              await reloadOnlineProject();
            } finally {
              setReloading(false);
            }
          }}
          disabled={reloading}
          title="A collaborator saved changes — reload to see them"
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${isCloudProject ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-amber-100 text-amber-900 hover:bg-amber-200'}`}
        >
          <RefreshCw className={`w-3 h-3 ${reloading ? 'animate-spin' : ''}`} />
          Changes available · Reload
        </button>
      )}
    </div>
  );
}

/** A normal join (connect → sync) and the role fetch must never flash the
 *  room badge — show it only once the degraded state has PERSISTED this long. */
const ROOM_BADGE_GRACE_MS = 2500;

/** True once `flag` has been continuously true for `ms`; resets instantly. */
function useSustained(flag: boolean, ms: number): boolean {
  const [sustained, setSustained] = useState(false);
  useEffect(() => {
    if (!flag) {
      setSustained(false);
      return;
    }
    const timer = setTimeout(() => setSustained(true), ms);
    return () => clearTimeout(timer);
  }, [flag, ms]);
  return sustained;
}

function SaveIndicatorStatus({ isCloudProject }: { isCloudProject?: boolean }) {
  const { status, lastSavedAt } = useSaveIndicator();
  const { canEdit, readOnly, roomStatus, roomPending, driveSaveError, driveErrorMsg, driveRetryPending, storageQuotaError, retryDriveSync } = useProject();
  const isOnlineProject = useIsOnlineProject();
  const auth = useGoogleAuth();
  const [pinned, setPinned] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const tip = useHoverTip<HTMLDivElement>();

  const iconColor = isCloudProject ? 'text-white' : 'text-[color:var(--ui-text-faint)]';

  // Roadmap 239 stage 1: the room badge (a pure mapping in lib/rooms/roomBadge).
  const roomBadge = roomBadgeState({
    roomsConfigured: roomsConfigured(),
    onlineProject: isOnlineProject,
    networkOnline: !readOnly,
    status: roomStatus,
  });
  const roomDegraded = useSustained(roomBadge !== 'hidden', ROOM_BADGE_GRACE_MS);
  useEffect(() => {
    if (roomBadge === 'hidden') setPinned(false);
  }, [roomBadge]);

  if (status === 'idle') return null;

  // Permission beats sync state: a view-only member sees the eye (with the
  // reason when access changed mid-session), never a broken retry affordance.
  if (!canEdit) {
    return (
      <div
        className="relative"
        ref={tip.ref}
        {...tip.bind}
        data-testid="view-only-indicator"
      >
        <Eye className={`w-3.5 h-3.5 ${iconColor}`} />
        {tip.show && (
          <div className="absolute top-full left-0 mt-1.5 bg-[var(--ui-panel-bg)] text-[color:var(--ui-text)] text-[11px] px-2 py-1 rounded border border-[color:var(--ui-card-border)] whitespace-nowrap z-50">
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
        ref={tip.ref}
        {...tip.bind}
      >
        <WifiOff className={`w-3.5 h-3.5 ${iconColor}`} />
        {tip.show && (
          <div className="absolute top-full left-0 mt-1.5 bg-[var(--ui-panel-bg)] text-[color:var(--ui-text)] text-[11px] px-2 py-1 rounded border border-[color:var(--ui-card-border)] whitespace-nowrap z-50">
            {tooltipText}
          </div>
        )}
      </div>
    );
  }

  // Room-status badge (roadmap 239 stage 1): a shared project whose room is
  // not live — the cloud gets an amber "!" with the reason. Click pins the
  // tooltip open (touch); clicking again closes it.
  if (roomBadge !== 'hidden' && roomDegraded) {
    const text = roomBadgeText(roomBadge, roomPending);
    return (
      <div
        className="relative"
        ref={tip.ref}
        {...tip.bind}
      >
        <button
          type="button"
          data-testid="room-status-badge"
          onClick={() => setPinned(p => !p)}
          className="relative cursor-pointer"
          title={text}
        >
          <Cloud className={`w-3.5 h-3.5 ${iconColor}`} />
          <span className="absolute -top-1 -right-1 flex items-center justify-center w-2.5 h-2.5 rounded-full bg-amber-400 text-[7px] font-bold text-black leading-none">
            !
          </span>
        </button>
        {(tip.show || pinned) && (
          <div className="absolute top-full left-0 mt-1.5 bg-[var(--ui-panel-bg)] text-[color:var(--ui-text)] text-[11px] px-2 py-1 rounded border border-[color:var(--ui-card-border)] w-56 whitespace-normal z-50">
            {text}
          </div>
        )}
      </div>
    );
  }

  if (status === 'saving') {
    return (
      <div
        className="relative"
        ref={tip.ref}
        {...tip.bind}
      >
        <Loader2 className={`w-3.5 h-3.5 animate-spin ${iconColor}`} />
        {tip.show && (
          <div className="absolute top-full left-0 mt-1.5 bg-[var(--ui-panel-bg)] text-[color:var(--ui-text)] text-[11px] px-2 py-1 rounded border border-[color:var(--ui-card-border)] whitespace-nowrap z-50">
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
        ref={tip.ref}
        {...tip.bind}
      >
        <HardDrive className="w-3.5 h-3.5 text-rose-400" />
        {tip.show && (
          <div className="absolute top-full left-0 mt-1.5 bg-[var(--ui-panel-bg)] text-[color:var(--ui-text)] text-[11px] px-2 py-1 rounded border border-[color:var(--ui-card-border)] whitespace-nowrap z-50">
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
        ref={tip.ref}
        {...tip.bind}
      >
        <button
          onClick={() => auth.signIn()}
          className="cursor-pointer"
          title="Sign in to resume sync - click to re-authenticate"
        >
          <CloudOff className="w-3.5 h-3.5 text-amber-400" />
        </button>
        {tip.show && (
          <div className="absolute top-full left-0 mt-1.5 bg-[var(--ui-panel-bg)] text-[color:var(--ui-text)] text-[11px] px-2 py-1 rounded border border-[color:var(--ui-card-border)] whitespace-nowrap z-50">
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
        ref={tip.ref}
        {...tip.bind}
      >
        <Loader2 className={`w-3.5 h-3.5 animate-spin ${iconColor}`} />
        {tip.show && (
          <div className="absolute top-full left-0 mt-1.5 bg-[var(--ui-panel-bg)] text-[color:var(--ui-text)] text-[11px] px-2 py-1 rounded border border-[color:var(--ui-card-border)] whitespace-nowrap z-50">
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
          ref={tip.ref}
          {...tip.bind}
        >
          <WifiOff className="w-3.5 h-3.5 text-[color:var(--ui-text-muted)]" />
          {tip.show && (
            <div className="absolute top-full left-0 mt-1.5 bg-[var(--ui-panel-bg)] text-[color:var(--ui-text)] text-[11px] px-2 py-1 rounded border border-[color:var(--ui-card-border)] whitespace-nowrap z-50">
              Working offline
            </div>
          )}
        </div>
      );
    }
    return (
      <div
        className="relative"
        ref={tip.ref}
        {...tip.bind}
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
        {tip.show && (
          <div className="absolute top-full left-0 mt-1.5 bg-[var(--ui-panel-bg)] text-[color:var(--ui-text)] text-[11px] px-2 py-1 rounded border border-[color:var(--ui-card-border)] whitespace-nowrap z-50">
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
      ref={tip.ref}
      {...tip.bind}
    >
      {isCloudProject ? (
        <Cloud className={`w-3.5 h-3.5 ${iconColor}`} />
      ) : (
        <Save className={`w-3.5 h-3.5 ${iconColor}`} />
      )}
      {tip.show && (
        <div className="absolute top-full left-0 mt-1.5 bg-[var(--ui-panel-bg)] text-[color:var(--ui-text)] text-[11px] px-2 py-1 rounded border border-[color:var(--ui-card-border)] whitespace-nowrap z-50">
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
