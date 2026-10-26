import React, { createContext, useContext, useEffect, useReducer, useCallback, useState, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { CalendarVersion, Project } from '../types';
import { generateUUID } from '../lib/utils';
import { useGoogleAuth } from '../lib/googleDriveAuth';
import { useSupabaseAuth } from '../lib/supabase/auth';
import { isSupabaseConfigured } from '../lib/supabase/client';
import { listOnlineProjects, uploadProjectOnline, readOnlineProject, saveOnlineProject, renameOnlineProject, deleteOnlineProject } from '../lib/supabase/onlineProjects';
import { getMyRole, type CollaboratorRole } from '../lib/supabase/sharing';
import { getPresenceDiagnostics, notifyLocalSave } from '../lib/supabase/presenceChannel';
import { pushProjectAndUpdateIndex, removeFromDrive } from '../lib/syncManager';
import { readDriveProject, removeFromDriveIndex, formatDriveError } from '../lib/googleDriveStorage';
import { migrateLegacyProject, migrateLegacyCastMirror, migrateElementBoardIds, LegacyMigrationResult } from '../lib/legacyMigration';
import { migrateProjectLinks } from '../lib/links';
import { hasInFlightEdits } from '../lib/inFlightEdits';
import { useRoomTransport } from '../lib/rooms/useRoomTransport';
import { fetchRoomToken } from '../lib/rooms/tokenClient';
import { ROOM_NOTE_MS } from '../lib/rooms/roomNotes';
import { roomsConfigured, roomsUrl, usesDevRoomTokens } from '../lib/rooms/roomsEnv';
import type { RoomQueueInfo, RoomStatus } from '../lib/rooms/roomClient';
import type { RoomRole } from '../lib/rooms/protocol';
import { serializeProject } from '../lib/projectCodec';
import { projectThemeOf, type ProjectTheme } from '../lib/projectTheme';
import { sanitizeProjectReportHtml } from '../lib/reportSanitize';
import {
  LEGACY_KEY,
  INDEX_KEY,
  ProjectMeta,
  getProjectStorageKey,
  saveProjectToStorage,
  loadProjectListFromStorage,
  saveProjectListToStorage,
  loadProjectFromStorage,
  setPendingLegacyMigrationNotice,
  consumePendingLegacyMigrationNotice,
  rememberLastProject,
  readLastProject,
  clearLastProject,
} from './storage';
import { Action, State, reducer, makeBlankProject } from './reducer';
import { installAgentBridge, notifyAgentBridge } from '../lib/debugBridge';

// Friendly message + the raw error text (diagnostic gold for sync failures —
// e.g. Safari's "Load failed" vs a Drive 429 vs an expired token).
function driveErrorDetail(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '').trim();
  const friendly = formatDriveError(err);
  return raw && raw !== friendly ? `${friendly} (${raw.slice(0, 100)})` : friendly;
}

/** A save failure that means "your role no longer allows this" rather than
 *  "the network hiccuped": an RLS rejection, or the 0-rows retry signature
 *  of an update policy that no longer matches (demoted/revoked member). */
function isPermissionFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /permission|row-level security|42501|changed elsewhere/i.test(msg);
}

export interface ProjectContextType {
  state: State;
  dispatch: React.Dispatch<Action>;
  /** The ONE undo/redo affordance (keyboard, header + popout toolbar buttons,
   *  popout windows): element-manager local history first, then the room for a
   *  shared project, else the local transcript. Never a local-only undo on a
   *  shared project — that diverges this window from its peers. */
  undo: () => boolean;
  redo: () => boolean;
  /** The room's per-USER undo/redo availability (a live room + something to
   *  undo/redo for this user) — the second enablement source for the buttons. */
  canRoomUndo: boolean;
  canRoomRedo: boolean;
  /** Local-transcript availability for the buttons — false on a shared project
   *  (its transcript holds peer edits too; the room owns that history). */
  canLocalUndo: boolean;
  canLocalRedo: boolean;
  /** The S4 room transport status for the open shared project (roadmap 239) —
   *  'open' = live editing; any other value on a shared project means the
   *  room is connecting/unreachable (the header badge reflects it). */
  roomStatus: RoomStatus;
  /** The room's offline buffer (roadmap 239 stage 2): edits accepted while the
   *  room is not open are queued and replayed after the next welcome. */
  roomPending: RoomQueueInfo;
  /** The room's latest advisory message (roadmap 242) — a blocked undo, an
   *  empty stack, a refusal. Shown as ONE transient note near the header
   *  undo/redo buttons; never blocks editing. */
  roomNote: { id: number; message: string } | null;
  /** The active calendar version (production window + day statuses/events) —
   *  drives every calendar surface AND the stripboard's dates. Independent of
   *  the active schedule version (item 66). */
  activeCalendarVersion: CalendarVersion | undefined;
  projectList: ProjectMeta[];
  currentProjectId: string | null;
  initialized: boolean;
  /** Connectivity lock — driven ONLY by the probe/auth events (see the
   *  connectivity model in docs/STORE-AND-SYNC.md). Never carries permission
   *  meaning. */
  readOnly: boolean;
  /** Permission flag (roadmap 229 S2): false when the signed-in user is a
   *  view-only member of the open shared project. Independent of `readOnly`. */
  canEdit: boolean;
  /** The editing gate for UI surfaces: `readOnly || !canEdit`. Use it on
   *  write affordances; keep the two source flags separate. */
  locked: boolean;
  createProject: (title?: string, cloud?: boolean) => Promise<string>;
  openProject: (id: string, cloudDriveFileId?: string, onlineId?: string) => Promise<void>;
  deleteProject: (id: string, cloudDriveFileId?: string) => Promise<void>;
  renameProject: (id: string, title: string, driveFileId?: string) => void;
  duplicateProject: (id: string, cloudDriveFileId?: string) => Promise<void>;
  importProjectFromData: (data: Project) => string;
  updateProjectMeta: (id: string, updates: Partial<ProjectMeta>) => void;
  registerPostSaveHandler: (handler: ((project: Project) => Promise<void>) | null) => void;
  driveSaveError: boolean;
  driveErrorMsg: string | null;
  driveRetryPending: boolean;
  storageQuotaError: boolean;
  /** Shared (Supabase) projects for the Project Manager's Shared tab —
   *  session state only, never persisted to the local index. */
  onlineProjects: ProjectMeta[];
  onlineLoading: boolean;
  onlineError: string | null;
  refetchOnlineProjects: () => void;
  /** Copy a project online (Collaborate) — the online copy becomes its
   *  synced identity; the offline original is left untouched. */
  collaborateProject: (id: string) => Promise<void>;
  /** S3.5: a peer saved while this client has unsaved edits — show the
   *  "Changes available · Reload" chip (never auto-applied). */
  onlineChangesAvailable: boolean;
  /** S3.5: a peer's save ping landed at `revision` (from presence). */
  applyPeerSave: (revision: number) => void;
  /** S3.5: re-read + LOAD the open shared project (the reload chip action). */
  reloadOnlineProject: () => Promise<void>;
  /** S3 access push: the server told us our role changed (`null` = revoked).
   *  Applies the gate immediately and returns the PREVIOUS role (so the
   *  caller can phrase the message). RLS stays the enforcement point. */
  applyAccessPush: (role: CollaboratorRole | null) => CollaboratorRole | null;
  retryDriveSync: () => Promise<void>;
  retryConnectivity: () => Promise<boolean>;
  closeProject: () => void;
  consumeLegacyMigrationNotice: () => LegacyMigrationResult | null;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projectList, setProjectList] = useState<ProjectMeta[]>(() => loadProjectListFromStorage());
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const auth = useGoogleAuth();
  const driveFileIdRef = useRef<string | undefined>(undefined);
  const [driveSaveError, setDriveSaveError] = useState(false);
  const [driveErrorMsg, setDriveErrorMsg] = useState<string | null>(null);
  const [driveRetryPending, setDriveRetryPending] = useState(false);
  const [storageQuotaError, setStorageQuotaError] = useState(false);

  const blank = makeBlankProject();

  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: blank,
    future: [],
    _batchDepth: 0,
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const presentRef = useRef(state.present);
  presentRef.current = state.present;

  // Offline detection - block cloud project mutations when offline; local projects keep working
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [realOnline, setRealOnline] = useState(navigator.onLine);
  const lastSaveFailedRef = useRef(false);
  const projectListRef = useRef(projectList);
  projectListRef.current = projectList;
  const currentProjectIdRef = useRef(currentProjectId);
  currentProjectIdRef.current = currentProjectId;
  const authStateRef = useRef({ isSignedIn: auth.isSignedIn, needsReauth: auth.needsReauth });
  authStateRef.current = { isSignedIn: auth.isSignedIn, needsReauth: auth.needsReauth };
  const probeRef = useRef<() => Promise<boolean>>(async () => false);

  // ---- Online projects (roadmap 229 S1, docs/COLLABORATION.md) --------------
  // The online copy's optimistic-concurrency counter lives in a ref — the
  // save pipeline bumps it per accepted write (server-side rooms replace
  // this at S4).
  const sbAuth = useSupabaseAuth();
  const onlineRevisionRef = useRef(0);
  const sbAccountRef = useRef(sbAuth.account);
  sbAccountRef.current = sbAuth.account;
  const [onlineProjects, setOnlineProjects] = useState<ProjectMeta[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const onlineProjectsRef = useRef(onlineProjects);
  onlineProjectsRef.current = onlineProjects;

  // The caller's membership role on the OPEN shared project (S2). Keyed by
  // project id so a stale role can never leak onto the next project. Null =
  // unknown (local/Drive project, or a role fetch that failed) — the server
  // still enforces on every write; only a resolved 'viewer' locks editing.
  const [onlineRole, setOnlineRole] = useState<{ projectId: string; role: CollaboratorRole } | null>(null);
  // S3.5: set when a peer's save ping lands while we have unsaved edits — the
  // SaveIndicator shows the "Changes available · Reload" chip. Never auto-applies.
  const [onlineChangesAvailable, setOnlineChangesAvailable] = useState(false);
  const onlineChangesAvailableRef = useRef(false);
  onlineChangesAvailableRef.current = onlineChangesAvailable;
  // S3.5's clean/dirty gate: every accepted write dispatch bumps the change
  // counter; LOADs and successful online saves re-anchor the baseline. A
  // counter (not object identity) because the reducer returns fresh objects
  // for every action — including LOAD (ensureAllScenesHaveRows spreads).
  const changeCounterRef = useRef(0);
  const persistedAtCounterRef = useRef(0);
  /** LOAD + re-anchor the persisted baseline (open/reload/peer apply/import). */
  const loadBaseline = useCallback((project: Project) => {
    persistedAtCounterRef.current = changeCounterRef.current;
    // Roadmap 274: the single decode entrance (local, Drive, online, room
    // welcome) strips stored report markup before it becomes state. Identity
    // for projects without report designs.
    dispatch({ type: 'LOAD', payload: sanitizeProjectReportHtml(project) });
  }, []);
  const currentMetaForRole = projectList.find(p => p.id === currentProjectId);
  const currentOnlineRole: CollaboratorRole | null =
    currentMetaForRole?.onlineId && onlineRole?.projectId === currentProjectId ? onlineRole.role : null;
  const canEdit = currentOnlineRole !== 'viewer';
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const onlineRoleRef = useRef<CollaboratorRole | null>(currentOnlineRole);
  onlineRoleRef.current = currentOnlineRole;

  // ── S4 room transport (stage 1: actions + sync; per-user undo is the next
  // unit). One socket for the open shared project; hooked into the write path
  // (guardedDispatch sends, welcome/remote apply) and the save pipeline below.
  const currentOnlineId = currentMetaForRole?.onlineId ?? null;
  const sbUserId = sbAuth.account?.id ?? null;
  // The identity the ROOM sees for this window (from the accepted welcome) —
  // a diagnostic, since per-user undo is per ROOM user: two windows sharing a
  // roomUserId share one undo history by design (same account), and two
  // accounts must show two different ids.
  const roomIdentityRef = useRef<{ userId: string; role: RoomRole } | null>(null);
  // Per-USER room undo/redo availability, pushed by the room (join, own action,
  // undo, redo) — enables/disables the header buttons for THIS user only.
  const [roomUndoState, setRoomUndoState] = useState({ canUndo: false, canRedo: false });
  // The room's offline buffer (roadmap 239 stage 2) — edits accepted while the
  // room is not open queue in the client and replay after the next welcome.
  const [roomQueue, setRoomQueue] = useState<RoomQueueInfo>({ pending: 0, dropped: 0 });
  // Roadmap 242: every room error becomes ONE transient note near the header
  // undo/redo buttons (blocked undo/redo, empty stacks, refusals). Advisory —
  // never blocks editing; the `id` re-arms the auto-hide on repeats.
  const [roomNote, setRoomNote] = useState<{ id: number; message: string } | null>(null);
  const roomNoteSeqRef = useRef(0);
  const roomNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showRoomNote = useCallback((message: string) => {
    roomNoteSeqRef.current += 1;
    setRoomNote({ id: roomNoteSeqRef.current, message });
    if (roomNoteTimerRef.current) clearTimeout(roomNoteTimerRef.current);
    roomNoteTimerRef.current = setTimeout(() => setRoomNote(null), ROOM_NOTE_MS);
  }, []);
  const showRoomNoteRef = useRef(showRoomNote);
  showRoomNoteRef.current = showRoomNote;
  useEffect(() => {
    roomIdentityRef.current = null;
    setRoomUndoState({ canUndo: false, canRedo: false });
    setRoomQueue({ pending: 0, dropped: 0 });
    setRoomNote(null);
  }, [currentOnlineId, sbUserId]);
  useEffect(() => () => {
    if (roomNoteTimerRef.current) clearTimeout(roomNoteTimerRef.current);
  }, []);
  const { clientRef: roomClientRef, status: roomStatus } = useRoomTransport({
    onlineId: currentOnlineId,
    userId: sbUserId,
    getToken: async (projectId) => {
      // `dev:` tokens are LOOPBACK-ONLY (DEV_AUTH lives in the local worker's
      // .dev.vars). A dev build pointed at the DEPLOYED worker (VITE_ROOMS_URL)
      // is a real-server test — real accounts, real tokens, HMR included — so
      // it mints through the function like any production client.
      if (usesDevRoomTokens(roomsUrl(), import.meta.env.DEV)) {
        return `dev:${sbUserId}:${onlineRoleRef.current ?? 'editor'}`;
      }
      return fetchRoomToken(projectId);
    },
    getInitProject: () => (canEditRef.current ? serializeProject(presentRef.current) : null),
    onWelcome: (welcome) => {
      // The room's snapshot is the truth while connected: rebaseline, then fold
      // the replay as REMOTE applies — raw dispatch, never counted as local
      // changes, never pushed back (the room already has them).
      roomIdentityRef.current = { userId: welcome.userId, role: welcome.role };
      loadBaseline(welcome.project);
      for (const entry of welcome.replay) {
        dispatch(entry.action);
        notifyAgentBridge(entry.action);
      }
    },
    onUndoState: (state) => setRoomUndoState(state),
    onReplayQueued: (action) => {
      // Roadmap 239 stage 2: the welcome reset the state to the room's
      // snapshot; re-apply the buffered edit locally so the UI never flashes
      // it away, then streamAction sends it right after (its echo is deduped
      // like every optimistic local apply).
      dispatch(action);
      notifyAgentBridge(action);
    },
    onPendingChange: (info) => setRoomQueue(prev =>
      prev.pending === info.pending && prev.dropped === info.dropped ? prev : info),
    onRemote: (remote) => {
      // A peer's room undo arrives as a normal update carrying the rebased
      // state as a `LOAD` action — re-anchor the persisted baseline instead of
      // counting it as a local change (it is never pushed back; the room owns
      // the log). Everything else folds through the plain dispatch path.
      if (remote.action.type === 'LOAD') loadBaseline(remote.action.payload);
      else dispatch(remote.action);
      notifyAgentBridge(remote.action);
    },
    onError: (message) => {
      console.warn('[rooms]', message);
      // Roadmap 242: room errors are advisory UI now (blocked undo, empty
      // stacks, refusals) — the ONE transient note near the undo/redo buttons.
      showRoomNoteRef.current(message);
    },
  });
  const roomStatusRef = useRef<RoomStatus>('closed');
  roomStatusRef.current = roomStatus;
  const roomQueueRef = useRef(roomQueue);
  roomQueueRef.current = roomQueue;
  /** True while the room owns this project's writes (connected / reconnecting). */
  const roomActive = useCallback(() => roomStatusRef.current !== 'closed', []);
  /** True while a room transport is MOUNTED for this project (any status):
   *  the room's action log + offline buffer are then the ONE write path — the
   *  Supabase blob must never be pushed while a room owns the project (a stale
   *  whole-blob save is last-write-wins, and the room's next welcome/undo
   *  would drop it — roadmap 239). Shared projects WITHOUT a transport (rooms
   *  not configured / signed out) keep the pre-S4 blob path. */
  const roomOwnsProject = useCallback(() => roomClientRef.current != null, []);

  /** Re-read the open shared project's role (focus + after a permission-ish
   *  save failure): a demotion locks the UI, a revocation locks it AND
   *  surfaces the reason (role changes take effect on the next request). */
  const recheckOnlineRole = useCallback(async () => {
    const meta = projectListRef.current.find(p => p.id === currentProjectIdRef.current);
    if (!meta?.onlineId || !sbAccountRef.current) return;
    try {
      const role = await getMyRole(meta.onlineId);
      if (role) {
        setOnlineRole({ projectId: meta.id, role });
      } else {
        // Membership row gone (revoked): lock — the server rejects the next write anyway.
        setOnlineRole({ projectId: meta.id, role: 'viewer' });
        setDriveErrorMsg('You no longer have access to this shared project.');
        setDriveSaveError(true);
      }
    } catch {
      // Transient — keep the current role.
    }
  }, []);

  /**
   * S3.5 — a peer's whole-blob save landed at `remoteRevision`. When this
   * client has NO unsaved changes it silently re-reads and applies (LOAD
   * clears history — acceptable while clean); with local edits — committed or
   * still in flight (a manager field / Report Designer text being typed,
   * `inFlightEdits`) — it only raises the "Changes available · Reload" flag:
   * local edits are never clobbered (saves stay last-write-wins until S4).
   * Saves are the peers' own; revisions are monotonic so out-of-order reads
   * can't regress.
   */
  const applyPeerSave = useCallback(async (remoteRevision: number) => {
    const meta = projectListRef.current.find(p => p.id === currentProjectIdRef.current);
    if (!meta?.onlineId || !sbAccountRef.current) return;
    // S4: while the room owns the writes, peer save pings are moot — the room
    // broadcasts every accepted edit, a blob reload would only regress state.
    if (roomActive()) return;
    if (!(remoteRevision > onlineRevisionRef.current)) return;
    try {
      const fresh = await readOnlineProject(meta.onlineId);
      if (!(fresh.revision > onlineRevisionRef.current)) return; // resolved meanwhile
      if (changeCounterRef.current === persistedAtCounterRef.current && !hasInFlightEdits()) {
        onlineRevisionRef.current = fresh.revision;
        setOnlineChangesAvailable(false);
        loadBaseline(fresh.project);
      } else {
        setOnlineChangesAvailable(true);
      }
    } catch (e) {
      // Leave both the flag and the local state alone — the next open/reload
      // (or the peer's next ping) re-reads from the server.
      console.warn('[presence] could not re-read the peer save:', e);
    }
  }, [loadBaseline]);

  /** The explicit "Changes available · Reload" action: re-read + LOAD the open
   *  project, discarding local unsaved edits (the user chose to). */
  const reloadOnlineProject = useCallback(async () => {
    const meta = projectListRef.current.find(p => p.id === currentProjectIdRef.current);
    if (!meta?.onlineId || !sbAccountRef.current) return;
    try {
      const fresh = await readOnlineProject(meta.onlineId);
      onlineRevisionRef.current = fresh.revision;
      setOnlineChangesAvailable(false);
      loadBaseline(fresh.project);
    } catch (e: any) {
      console.warn('[presence] reload failed:', e);
      setDriveErrorMsg(e?.message || 'Could not reload the shared project.');
    }
  }, [loadBaseline]);

  // The S3.5 flag is per project — clear it whenever the open project changes.
  useEffect(() => { setOnlineChangesAvailable(false); }, [currentProjectId]);

  /**
   * S3 access push (user request 2026-10-12): the server broadcasts role
   * changes and revocations on the presence channel. Apply them immediately —
   * a demoted editor locks now, a revoked member is locked here and the caller
   * kicks them out (closes the project). No-op for anything but the open
   * shared project; returns the previous role for the message.
   */
  const applyAccessPush = useCallback((role: CollaboratorRole | null): CollaboratorRole | null => {
    const meta = projectListRef.current.find(p => p.id === currentProjectIdRef.current);
    if (!meta?.onlineId) return null;
    const previous = onlineRoleRef.current;
    if (role) {
      setOnlineRole({ projectId: meta.id, role });
    } else {
      setOnlineRole({ projectId: meta.id, role: 'viewer' });
      setDriveErrorMsg('You no longer have access to this shared project.');
      setDriveSaveError(true);
    }
    return previous;
  }, []);

  const refetchOnlineProjects = useCallback(() => {
    if (!sbAuth.account) {
      setOnlineProjects([]);
      setOnlineError(null);
      setOnlineLoading(false);
      return;
    }
    setOnlineLoading(true);
    listOnlineProjects()
      .then(metas => {
        setOnlineProjects(metas);
        setOnlineError(null);
      })
      .catch((e: any) => setOnlineError(e?.message || 'Failed to load online projects'))
      .finally(() => setOnlineLoading(false));
  }, [sbAuth.account]);

  useEffect(() => { refetchOnlineProjects(); }, [refetchOnlineProjects]);

  // The OPEN shared project's row in the Shared catalog mirrors the open
  // DOCUMENT's title (roadmap 249/253): a peer's rename arrives as a room
  // action (or an undo / welcome `LOAD`), the header updates instantly — and
  // the Project Manager's row for that project must not lag behind it, nor
  // may a fetch that resolved just before the rename push overwrite it back.
  // Runs whenever either side changes; the equality guard stops the loop.
  useEffect(() => {
    if (!currentOnlineId) return;
    setOnlineProjects(prev => {
      const idx = prev.findIndex(p => p.onlineId === currentOnlineId);
      if (idx < 0 || prev[idx].title === state.present.title) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], title: state.present.title };
      return next;
    });
  }, [currentOnlineId, state.present.title, onlineProjects]);

  // Live connectivity/sync snapshot for the agent bridge diagnostics()
  const connStateRef = useRef({
    isOnline: navigator.onLine,
    realOnline: navigator.onLine,
    driveSaveError: false,
    driveRetryPending: false,
    driveErrorMsg: null as string | null,
  });
  connStateRef.current = { isOnline, realOnline, driveSaveError, driveRetryPending, driveErrorMsg };
  const syncDiagRef = useRef({
    lastProbeAt: 0,
    lastProbeOk: true,
    lastProbeError: null as string | null,
    saveRetryCount: 0,
    lastPayloadBytes: 0,
  });

  // Bounded auto-retry for transient network-level save failures (Safari
  // dropping the upload mid-flight, flaky Wi-Fi, Google edge blips,
  // ad-blocker interference that stalls uploads ~25% of the time). Each
  // retry is a fresh connection — the failure mode self-heals. Exponential
  // backoff 2s/4s/8s/16s; every save attempt gets a fresh budget (the reset
  // lives at the top of the save effect), so a bad episode can never exhaust
  // retries for later edits. Retries chain until the budget runs out: the
  // header keeps its loading spinner while `driveRetryPending` is true and
  // only flips to the red `driveSaveError` state once the budget is spent.
  const MAX_SAVE_RETRIES = 4;
  const retryCountRef = useRef(0);
  const scheduleSaveRetry = useCallback(() => {
    if (retryCountRef.current >= MAX_SAVE_RETRIES) {
      // Budget exhausted — the failure is terminal, surface the red state.
      setDriveRetryPending(false);
      setDriveSaveError(true);
      return;
    }
    const attempt = ++retryCountRef.current;
    syncDiagRef.current.saveRetryCount = retryCountRef.current;
    setDriveRetryPending(true);
    setTimeout(() => {
      const meta = projectListRef.current.find(p => p.id === currentProjectIdRef.current);
      if (meta?.onlineId) {
        if (!sbAccountRef.current) {
          setDriveRetryPending(false);
          setDriveSaveError(true);
          return;
        }
        console.warn(`[sync] save retry ${attempt}/${MAX_SAVE_RETRIES}… (online)`);
        const project = { ...presentRef.current };
        const counterAtSave = changeCounterRef.current;
        saveOnlineProject(meta.onlineId, project, onlineRevisionRef.current)
          .then(nextRevision => {
            onlineRevisionRef.current = nextRevision;
            persistedAtCounterRef.current = counterAtSave;
            setOnlineChangesAvailable(false);
            notifyLocalSave(nextRevision);
            setDriveSaveError(false);
            setDriveErrorMsg(null);
            setDriveRetryPending(false);
            lastSaveFailedRef.current = false;
            setRealOnline(true);
            retryCountRef.current = 0;
            syncDiagRef.current.saveRetryCount = 0;
          })
          .catch((err2: any) => {
            console.error('Online save retry failed:', err2);
            if (isPermissionFailure(err2)) {
              void recheckOnlineRole();
              setDriveErrorMsg('View only — you do not have permission to save this shared project.');
              setDriveRetryPending(false);
              setDriveSaveError(true);
              return;
            }
            setDriveErrorMsg(driveErrorDetail(err2));
            scheduleSaveRetry();
          });
        return;
      }
      const token = sessionStorage.getItem('lemon_google_token');
      if (!token || !meta?.driveFileId) {
        setDriveRetryPending(false);
        setDriveSaveError(true);
        return;
      }
      console.warn(`[sync] save retry ${attempt}/${MAX_SAVE_RETRIES}…`);
      pushProjectAndUpdateIndex(token, { ...presentRef.current }, meta.driveFileId)
        .then(() => {
          setDriveSaveError(false);
          setDriveErrorMsg(null);
          lastSaveFailedRef.current = false;
          setRealOnline(true);
          retryCountRef.current = 0;
          syncDiagRef.current.saveRetryCount = 0;
          setDriveRetryPending(false);
        })
        .catch((err2: any) => {
          console.error('Drive save retry failed:', err2);
          setDriveErrorMsg(driveErrorDetail(err2));
          scheduleSaveRetry();
        });
    }, Math.pow(2, attempt) * 2000);
  }, []);

  // Proactive connectivity probe - the browser `offline` event is slow/unreliable (Wi-Fi
  // drops can leave navigator.onLine true for a long time), so ping Google on a
  // 10s interval plus key events. Auth state wins over probe results: an HTTP
  // response (even 401/403) proves the network is up, but never unlocks editing
  // while the session is signed out or expired. Uses the no-auth captive-portal
  // endpoint (204) — no 401 console spam and no token involvement.
  useEffect(() => {
    const currentMeta = () => projectListRef.current.find(p => p.id === currentProjectIdRef.current);
    const isCloudContext = () => !!currentMeta()?.driveFileId || !!currentMeta()?.onlineId || authStateRef.current.isSignedIn || !!sbAccountRef.current;
    const probe = async (): Promise<boolean> => {
      if (!isCloudContext()) return true;
      try {
        // Any HTTP response (200/401/403/204/429/5xx…) proves the network is up —
        // only a thrown fetch (no response) means offline. Never classify a
        // Drive API hiccup as "no internet" (that locks the project and drops
        // edits while the connection is actually fine).
        // gstatic/generate_204 is Google's captive-portal endpoint: no auth,
        // always 204, and `no-cors` keeps the fetch opaque-but-resolving so
        // CORS can never turn a healthy network into an "offline" verdict.
        await fetch('https://www.gstatic.com/generate_204', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store',
        });
        syncDiagRef.current.lastProbeAt = Date.now();
        syncDiagRef.current.lastProbeOk = true;
        syncDiagRef.current.lastProbeError = null;
        setIsOnline(true);
        lastSaveFailedRef.current = false;
        const meta = currentMeta();
        if (meta?.onlineId) {
          if (sbAccountRef.current) setRealOnline(true);
        } else if (meta?.driveFileId && authStateRef.current.isSignedIn && !authStateRef.current.needsReauth) {
          setRealOnline(true);
        }
        return meta?.onlineId
          ? !!sbAccountRef.current
          : !meta?.driveFileId || (authStateRef.current.isSignedIn && !authStateRef.current.needsReauth);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        syncDiagRef.current.lastProbeAt = Date.now();
        syncDiagRef.current.lastProbeOk = false;
        syncDiagRef.current.lastProbeError = detail;
        console.warn('[connectivity] probe failed:', detail);
        setIsOnline(false);
        if (currentMeta()?.driveFileId || currentMeta()?.onlineId) setRealOnline(false);
        lastSaveFailedRef.current = true;
        return false;
      }
    };
    probeRef.current = probe;
    const onOffline = () => {
      setIsOnline(false);
      if (currentMeta()?.driveFileId || currentMeta()?.onlineId) setRealOnline(false);
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void probe();
      // A demotion/promotion/revoke applies on the next request; picking it
      // up on focus keeps the UI honest without polling.
      void recheckOnlineRole();
    };
    const conn = (navigator as any).connection;
    conn?.addEventListener?.('change', probe);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', probe);
    window.addEventListener('online', probe);
    window.addEventListener('offline', onOffline);
    probe();
    const interval = setInterval(probe, 10_000);
    return () => {
      clearInterval(interval);
      conn?.removeEventListener?.('change', probe);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', probe);
      window.removeEventListener('online', probe);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  const isCurrentCloudProject = useCallback(() => {
    const meta = projectListRef.current.find(p => p.id === currentProjectId);
    return !!meta?.driveFileId || !!meta?.onlineId;
  }, [currentProjectId]);
  /** View-only members of a shared project: every write dispatch is dropped
   *  (the server rejects them too — this only keeps the client honest). */
  const isCurrentOnlineProject = useCallback(() => {
    return !!projectListRef.current.find(p => p.id === currentProjectIdRef.current)?.onlineId;
  }, []);
  const guardedDispatch = useCallback((action: Action, opts?: { notify?: boolean }) => {
    if (action.type !== 'LOAD') {
      if (!realOnline && isCurrentCloudProject()) return;
      if (isCurrentOnlineProject() && !canEditRef.current) return;
      changeCounterRef.current++;
    } else {
      // A LOAD through the UI/bridge defines the persisted baseline (the store
      // owns its own LOADs via loadBaseline). Never count it as an edit.
      persistedAtCounterRef.current = changeCounterRef.current;
    }
    dispatch(action);
    // S4: every accepted local edit streams to the room (optimistic local apply
    // above; the room is the ordering authority). LOAD/UNDO/REDO match the
    // room's own refuse-set — undo becomes a room operation in the per-user
    // undo unit, so it is deliberately not sent yet.
    if (action.type !== 'LOAD' && action.type !== 'UNDO' && action.type !== 'REDO') {
      roomClientRef.current?.sendAction(generateUUID(), action);
    }
    // Roadmap 296: every ACCEPTED dispatch through this seam notifies onAction
    // subscribers — UI edits used to be silent. The bridge path opts out and
    // notifies itself after its flushSync, so listeners that read state see
    // the committed action.
    if (opts?.notify !== false) notifyAgentBridge(action);
  }, [realOnline, isCurrentCloudProject, isCurrentOnlineProject]);

  /**
   * The ONE undo/redo routing for EVERY affordance — Cmd+Z / Cmd+Shift+Z, the
   * header + popout-toolbar buttons, and popout windows: for a SHARED project
   * the room (per-user undo), else the local transcript. A shared project NEVER
   * falls back to the local transcript: that UNDO is deliberately not
   * transported (`guardedDispatch` excludes it), so it would revert this window
   * alone and silently diverge it from every peer — the "undo lands on me but
   * not my peer" report. Returns true when the affordance ran (or warned).
   *
   * Roadmap 250/251: every edit is dispatched when it finishes (commit on
   * blur), so there is no surface-local history to consult first — undo
   * granularity is one committed edit.
   */
  const undo = useCallback((): boolean => {
    if (isCurrentOnlineProject()) {
      if (!roomClientRef.current?.sendUndo()) {
        console.warn('[rooms] undo unavailable — the shared project is not connected to the room');
        showRoomNoteRef.current('Undo needs a live room connection');
      }
      return true;
    }
    guardedDispatch({ type: 'UNDO' });
    return true;
  }, [guardedDispatch, isCurrentOnlineProject]);
  const redo = useCallback((): boolean => {
    if (isCurrentOnlineProject()) {
      if (!roomClientRef.current?.sendRedo()) {
        console.warn('[rooms] redo unavailable — the shared project is not connected to the room');
        showRoomNoteRef.current('Redo needs a live room connection');
      }
      return true;
    }
    guardedDispatch({ type: 'REDO' });
    return true;
  }, [guardedDispatch, isCurrentOnlineProject]);
  /** The room's per-USER availability, gated by a LIVE room (open only — while
   *  the room is connecting/unreachable the buttons are refused: there is
   *  nothing to rebase, and the offline buffer holds edits, never undo) and
   *  write permission. */
  const roomCanUndoRedo = !!currentOnlineId && roomStatus === 'open' && canEdit;
  const canRoomUndo = roomCanUndoRedo && roomUndoState.canUndo;
  const canRoomRedo = roomCanUndoRedo && roomUndoState.canRedo;
  /**
   * The LOCAL transcript only backs undo/redo on a LOCAL/Drive project. On a
   * shared project the transcript also accumulates PEER edits (every `remote`
   * folds through the reducer), so a transcript undo would revert someone
   * else's work in this window alone — the buttons must ignore it there (the
   * unsaved element-manager history stays valid for both kinds).
   */
  const canLocalUndo = !currentOnlineId && state.past.length > 0;
  const canLocalRedo = !currentOnlineId && state.future.length > 0;

  // Agentic debug bridge (dev builds or localStorage LEMON_AGENT=1): exposes
  // state reads + dispatch as window.__lemonSchedule — see AGENTS.md.
  // Notify the bridge of every action (it no-ops when uninstalled).
  const bridgeDispatch = useCallback((action: Action) => {
    // flushSync: agent dispatches must be visible to an immediately-following
    // getState() read (React would otherwise batch the update to the next
    // render, making same-tick dispatch→read pairs return stale state).
    flushSync(() => { guardedDispatch(action, { notify: false }); });
    notifyAgentBridge(action);
  }, [guardedDispatch]);

  useEffect(() => {
    const uninstall = installAgentBridge({
      getState: () => stateRef.current,
      getProject: () => stateRef.current.present,
      dispatch: (action) => bridgeDispatch(action),
      getProjectList: () => projectListRef.current,
      getCurrentProjectId: () => currentProjectIdRef.current,
      getConnectivity: () => ({
        ...connStateRef.current,
        ...syncDiagRef.current,
        signedIn: authStateRef.current.isSignedIn,
        needsReauth: authStateRef.current.needsReauth,
        projectIsCloud: !!projectListRef.current.find(p => p.id === currentProjectIdRef.current)?.driveFileId,
        supabaseConfigured: isSupabaseConfigured,
        supabaseSignedIn: !!sbAccountRef.current,
        projectIsOnline: !!projectListRef.current.find(p => p.id === currentProjectIdRef.current)?.onlineId,
        onlineProjectCount: onlineProjectsRef.current.length,
        navigatorOnLine: navigator.onLine,
        readOnly: !connStateRef.current.realOnline,
        onlineRole: onlineRoleRef.current,
        canEdit: canEditRef.current,
        editLocked: !canEditRef.current || !connStateRef.current.realOnline,
        presence: getPresenceDiagnostics(),
        onlineChangesAvailable: onlineChangesAvailableRef.current,
        roomsConfigured: roomsConfigured(),
        roomStatus: roomStatusRef.current,
        roomPending: roomQueueRef.current,
        roomUserId: roomIdentityRef.current?.userId ?? null,
        roomRole: roomIdentityRef.current?.role ?? null,
      }),
    });
    return uninstall;
  }, [bridgeDispatch]);

  // On mount: migrate legacy data or load project list (no auto-open)
  useEffect(() => {
    const legacyData = localStorage.getItem(LEGACY_KEY);
    if (legacyData) {
      try {
        const parsed = JSON.parse(legacyData);
        if (parsed.scenes && parsed.versions) {
          const id = generateUUID();
          for (const v of parsed.versions || []) {
            for (const r of v.rows || []) {
              if (r.type === 'DAYBREAK' && r.daybreakCallTime == null) {
                r.daybreakCallTime = '08:00';
              }
            }
          }
          const migrationResult = migrateLegacyProject(parsed);
          migrateLegacyCastMirror(migrationResult.project);
          migrateElementBoardIds(migrationResult.project);
          migrateProjectLinks(migrationResult.project);
          if (migrationResult.migrated) {
            setPendingLegacyMigrationNotice(migrationResult);
          }
          saveProjectToStorage(id, migrationResult.project);
          localStorage.removeItem(LEGACY_KEY);
          const meta: ProjectMeta = { id, title: migrationResult.project.title || 'Project', lastModified: Date.now(), createdAt: Date.now() };
          saveProjectListToStorage([meta]);
          setProjectList([meta]);
          loadBaseline(migrationResult.project);
          setCurrentProjectId(id);
          setInitialized(true);
          return;
        }
      } catch (e) {
        console.error("Failed to migrate legacy project", e);
      }
    }

    const list = loadProjectListFromStorage();
    if (list.length > 0) {
      setProjectList(list);
    }

    const validIds = new Set(list.map(p => p.id));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('lemon_schedule_') && key !== INDEX_KEY) {
        const m = key.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
        if (m && !validIds.has(m[0])) localStorage.removeItem(key);
      }
    }

    setInitialized(true);
  }, []);

  const postSaveHandlerRef = useRef<((project: Project) => Promise<void>) | null>(null);
  const registerPostSaveHandler = useCallback((handler: ((project: Project) => Promise<void>) | null) => {
    postSaveHandlerRef.current = handler;
  }, []);

  // Consolidated save pipeline - localStorage for local projects, Drive for cloud projects
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveProjectRef = useRef(state.present);
  saveProjectRef.current = state.present;

  useEffect(() => {
    if (!currentProjectId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const project = saveProjectRef.current;
      const meta = projectList.find(p => p.id === currentProjectId);
      const isCloud = !!meta?.driveFileId;
      const isOnlineProject = !!meta?.onlineId;
      // S3.5 clean marker for this save episode: any dispatch AFTER this point
      // (during the in-flight upload) leaves the client dirty again.
      const counterAtSave = changeCounterRef.current;

      // Fresh retry budget per save attempt: retryCountRef must not carry over
      // between episodes, or one bad episode exhausts it permanently and every
      // later failure saves without retrying (sticky red cloud).
      retryCountRef.current = 0;

      if (isOnlineProject) {
        // Online projects save the whole blob to Supabase (S1) — the source
        // of truth is the online copy; the offline file is not written.
        // A view-only member (S2) has nothing to write: the dispatch guard
        // already blocks edits, so a pending save here means the role just
        // changed — lock via recheck instead of pushing a rejected write.
        if (!canEditRef.current) return;
        // S4: the room transport OWNS this project's writes whenever it is
        // mounted — connected or not. Offline edits buffer in the client and
        // replay after the welcome (roadmap 239 stage 2), so the stale
        // Supabase blob must never be pushed: whole-blob saves during an
        // outage are last-write-wins (two editors clobber each other) and the
        // room's next welcome/undo would drop them. A shared project WITHOUT
        // a room transport (rooms not configured / signed out) keeps the
        // pre-S4 blob path below.
        if (roomOwnsProject()) return;
        // S3.5: LOADing a peer's save (or reopening) anchors the persisted
        // baseline — pushing it back would bump the revision and start a
        // save-ping echo. No new edits since the last persist ⇒ nothing to push.
        if (changeCounterRef.current === persistedAtCounterRef.current) return;
        if (sbAuth.account && isOnline) {
          try {
            const nextRevision = await saveOnlineProject(meta!.onlineId!, project, onlineRevisionRef.current);
            onlineRevisionRef.current = nextRevision;
            persistedAtCounterRef.current = counterAtSave;
            setOnlineChangesAvailable(false);
            notifyLocalSave(nextRevision);
            lastSaveFailedRef.current = false;
            setRealOnline(true);
            setProjectList(prev => {
              const updated = prev.map(p =>
                p.id === currentProjectId
                  ? { ...p, title: project.title, lastModified: Date.now() }
                  : p
              );
              saveProjectListToStorage(updated);
              return updated;
            });
            setDriveSaveError(false);
            setDriveErrorMsg(null);
            setDriveRetryPending(false);
          } catch (err: any) {
            console.error('Online save failed:', err);
            if (isPermissionFailure(err)) {
              // Demoted/revoked mid-session — retries cannot succeed. Re-read
              // the role (locks the UI) and surface the reason instead.
              void recheckOnlineRole();
              setDriveErrorMsg('View only — you do not have permission to save this shared project.');
              lastSaveFailedRef.current = true;
              setDriveRetryPending(false);
              setDriveSaveError(true);
              return;
            }
            setDriveErrorMsg(driveErrorDetail(err));
            // Same policy as Drive: a failed upload is not proof of being
            // offline — bounded auto-retries self-heal, the probe classifies.
            lastSaveFailedRef.current = true;
            scheduleSaveRetry();
          }
        } else {
          lastSaveFailedRef.current = true;
          setRealOnline(false);
          setDriveSaveError(true);
          setDriveErrorMsg(sbAuth.account ? 'No internet connection' : 'Sign in to save this shared project');
          setDriveRetryPending(false);
        }
      } else if (isCloud) {
        if (skipSaveRef.current) { skipSaveRef.current = false; return; }
        if (auth.isSignedIn && auth.accessToken && isOnline && meta?.driveFileId) {
          try {
            // Diagnostic: payload size drives upload fragility (Safari drops big
            // multipart bodies mid-flight more often than small ones).
            syncDiagRef.current.lastPayloadBytes = new Blob([JSON.stringify(project)]).size;
            const newFileId = await pushProjectAndUpdateIndex(
              auth.accessToken, project, meta.driveFileId,
            );
            driveFileIdRef.current = newFileId;
            lastSaveFailedRef.current = false;
            setRealOnline(true);
            setProjectList(prev => {
              const updated = prev.map(p =>
                p.id === currentProjectId
                  ? { ...p, title: project.title, driveFileId: newFileId, lastModified: Date.now() }
                  : p
              );
              saveProjectListToStorage(updated);
              return updated;
            });
            setDriveSaveError(false);
            setDriveErrorMsg(null);
            setDriveRetryPending(false);
            retryCountRef.current = 0;
          } catch (err: any) {
            console.error('Drive save failed:', err);
            setDriveErrorMsg(driveErrorDetail(err));
            if (err?.message?.includes('401')) {
              auth.refreshToken();
              setTimeout(async () => {
                try {
                  const token = sessionStorage.getItem('lemon_google_token');
                  if (token && meta?.driveFileId) {
                    await pushProjectAndUpdateIndex(token, project, meta.driveFileId);
                    setDriveSaveError(false);
                    setDriveErrorMsg(null);
                    lastSaveFailedRef.current = false;
                    setRealOnline(true);
                    retryCountRef.current = 0;
                  }
                } catch {
                  // Give up - user can manually retry
                }
              }, 2000);
              setDriveSaveError(true);
              setDriveRetryPending(false);
            } else {
              // A failed Drive write is NOT "offline" — the network can be fine
              // while Google hiccups or Safari drops the upload mid-flight
              // ("The network connection was lost"). Bounded auto-retries
              // self-heal transient drops on a fresh connection; the probe
              // independently detects real disconnects. Don't flip the header
              // red here — scheduleSaveRetry keeps the spinner going and only
              // surfaces `driveSaveError` once the retry budget is exhausted.
              lastSaveFailedRef.current = true;
              scheduleSaveRetry();
            }
          }
        } else {
          lastSaveFailedRef.current = true;
          setRealOnline(false);
          setDriveSaveError(true);
          setDriveRetryPending(false);
        }
      } else {
        try {
          saveProjectToStorage(currentProjectId, project);
          setStorageQuotaError(false);
        } catch (e: any) {
          if (e.name === 'QuotaExceededError') {
            setStorageQuotaError(true);
            console.error('localStorage quota exceeded - project not saved');
          } else {
            console.error('localStorage save failed:', e);
          }
          return;
        }
        setProjectList(prev => {
          const existing = prev.find(p => p.id === currentProjectId);
          if (!existing) return prev;
          const updated = prev.map(p =>
            p.id === currentProjectId
              ? { ...p, title: project.title, lastModified: Date.now() }
              : p
          );
          saveProjectListToStorage(updated);
          return updated;
        });
        postSaveHandlerRef.current?.(project).catch(() => {});
      }
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state.present, currentProjectId, auth.isSignedIn, auth.accessToken, isOnline, sbAuth.account]);

  // Clear sync errors and force a fresh sync when the user re-authenticates
  // Also block editing when the user signs out while editing a cloud project
  const prevSignedInRef = useRef(auth.isSignedIn);
  useEffect(() => {
    const meta = projectListRef.current.find(p => p.id === currentProjectId);
    if (auth.isSignedIn && !prevSignedInRef.current) {
      if (meta?.driveFileId) {
        setDriveSaveError(false);
        setDriveErrorMsg(null);
      }
    } else if (!auth.isSignedIn && prevSignedInRef.current) {
      if (meta?.driveFileId) {
        setRealOnline(false);
        setDriveSaveError(true);
        setDriveRetryPending(false);
      }
    }
    prevSignedInRef.current = auth.isSignedIn;
  }, [auth.isSignedIn, currentProjectId]);

  // Online projects need the Supabase session: signing out locks editing and
  // surfaces the reason; signing back in clears it (the probe re-verifies).
  const prevSbAccountRef = useRef(sbAuth.account);
  useEffect(() => {
    const meta = projectListRef.current.find(p => p.id === currentProjectId);
    if (meta?.onlineId) {
      if (!sbAuth.account) {
        setRealOnline(false);
        setDriveSaveError(true);
        setDriveErrorMsg('Sign in to keep editing this shared project');
        setDriveRetryPending(false);
      } else if (!prevSbAccountRef.current) {
        setDriveSaveError(false);
        setDriveErrorMsg(null);
      }
    }
    prevSbAccountRef.current = sbAuth.account;
  }, [sbAuth.account, currentProjectId]);

  // When the token becomes invalid (silent refresh failed), block editing
  const prevNeedsReauthRef = useRef(auth.needsReauth);
  useEffect(() => {
    const meta = projectListRef.current.find(p => p.id === currentProjectId);
    if (!meta?.driveFileId) return;
    if (auth.needsReauth && !prevNeedsReauthRef.current) {
      setRealOnline(false);
      setDriveSaveError(true);
      setDriveRetryPending(false);
    } else if (!auth.needsReauth && prevNeedsReauthRef.current) {
      setDriveSaveError(false);
      setDriveErrorMsg(null);
    }
    prevNeedsReauthRef.current = auth.needsReauth;
  }, [auth.needsReauth, currentProjectId]);

  // Catch-up sync when reconnecting; immediately lock cloud projects when going offline
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      const meta = projectListRef.current.find(p => p.id === currentProjectId);
      if (meta?.driveFileId && driveSaveError) {
        const token = sessionStorage.getItem('lemon_google_token');
        if (token) {
          pushProjectAndUpdateIndex(token, { ...presentRef.current }, meta.driveFileId)
            .then(() => { setDriveSaveError(false); setDriveErrorMsg(null); lastSaveFailedRef.current = false; setRealOnline(true); })
            .catch(() => {});
        }
      }
    } else if (!isOnline && prevOnlineRef.current) {
      const meta = projectListRef.current.find(p => p.id === currentProjectId);
      if (meta?.driveFileId) {
        setRealOnline(false);
        setDriveSaveError(true);
        setDriveRetryPending(false);
        lastSaveFailedRef.current = true;
      }
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, currentProjectId, driveSaveError]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentProjectId) return;
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      // Shift makes e.key uppercase ('Z'), so normalize BEFORE comparing — the
      // old `e.key === 'z' && e.shiftKey` branch was unreachable on real
      // keyboards (roadmap 238).
      const key = e.key.toLowerCase();
      // The room owns undo for a connected shared project: per-user undo is a
      // ROOM operation (rebase) — a local transcript UNDO would diverge from
      // the room's log. Local behaviour is unchanged when no room is active.
      // The element manager's unsaved edits stay local-first.
      if (cmdOrCtrl && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (cmdOrCtrl && key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      if (cmdOrCtrl && key === 's') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentProjectId, undo, redo]);

  // Flush current project to localStorage immediately (local projects only —
  // Drive and online projects have their own writers).
  const flushCurrentProject = useCallback(() => {
    if (!currentProjectId) return;
    const meta = projectList.find(p => p.id === currentProjectId);
    if (!meta || meta.driveFileId || meta.onlineId) return;
    try {
      saveProjectToStorage(currentProjectId, state.present);
      setStorageQuotaError(false);
    } catch (e: any) {
      if (e.name === 'QuotaExceededError') setStorageQuotaError(true);
      return;
    }
    setProjectList(prev => {
      const existing = prev.find(p => p.id === currentProjectId);
      if (!existing) return prev;
      const updated = prev.map(p =>
        p.id === currentProjectId
          ? { ...p, title: state.present.title, lastModified: Date.now() }
          : p
      );
      saveProjectListToStorage(updated);
      return updated;
    });
  }, [currentProjectId, state.present, projectList]);

  // Guard to skip the save-pipeline push right after creating a cloud project
  const skipSaveRef = useRef(false);

  const createProject = useCallback(async (title?: string, cloud?: boolean): Promise<string> => {
    flushCurrentProject();
    const newProject = makeBlankProject(title);
    const id = newProject.id;

    if (cloud && auth.isSignedIn && auth.accessToken) {
      try {
        const newFileId = await pushProjectAndUpdateIndex(auth.accessToken, newProject);
        const meta: ProjectMeta = {
          id, title: newProject.title, lastModified: Date.now(), createdAt: Date.now(),
          driveFileId: newFileId,
        };
        setProjectList(prev => { const u = [...prev, meta]; return u; });
        loadBaseline(newProject);
        setCurrentProjectId(id);
        driveFileIdRef.current = newFileId;
        skipSaveRef.current = true;
        return id;
      } catch (e) {
        console.error('Failed to upload new project to Drive:', e);
      }
    }

    saveProjectToStorage(id, newProject);
    const meta: ProjectMeta = { id, title: newProject.title, lastModified: Date.now(), createdAt: Date.now() };
    setProjectList(prev => { const u = [...prev, meta]; saveProjectListToStorage(u); return u; });
    loadBaseline(newProject);
    setCurrentProjectId(id);
    return id;
  }, [flushCurrentProject, auth.isSignedIn, auth.accessToken]);

  const openProject = useCallback(async (id: string, cloudDriveFileId?: string, onlineId?: string) => {
    flushCurrentProject();
    const meta = projectList.find(p => p.id === id) ?? onlineProjects.find(p => p.id === id);
    const driveFileId = meta?.driveFileId || cloudDriveFileId;
    const resolvedOnlineId = meta?.onlineId || onlineId;

    if (resolvedOnlineId) {
      // Online project: read the blob from Supabase (RLS 404s for non-members)
      // and the caller's membership role (S2) — editing gates off for viewers
      // from the project's first render.
      try {
        const [{ project, revision }, myRole] = await Promise.all([
          readOnlineProject(resolvedOnlineId),
          getMyRole(resolvedOnlineId).catch(() => null),
        ]);
        onlineRevisionRef.current = revision;
        setOnlineRole(myRole ? { projectId: project.id, role: myRole } : null);
        setProjectList(prev => {
          if (prev.find(p => p.id === project.id)) {
            return prev.map(p => p.id === project.id ? { ...p, onlineId: resolvedOnlineId } : p);
          }
          return [...prev, {
            id: project.id,
            title: project.title,
            lastModified: Date.now(),
            createdAt: Date.now(),
            onlineId: resolvedOnlineId,
          }];
        });
        loadBaseline(project);
        setCurrentProjectId(project.id);
      } catch (e) {
        console.error('Failed to open online project:', e);
        throw e;
      }
      return;
    }

    if (driveFileId && auth.accessToken) {
      try {
        const project = await readDriveProject(auth.accessToken, driveFileId);
        if (meta && meta.title !== project.title) {
          project.title = meta.title;
        }
        setProjectList(prev => {
          if (prev.find(p => p.id === project.id)) return prev;
          return [...prev, {
            id: project.id,
            title: project.title,
            lastModified: Date.now(),
            createdAt: Date.now(),
            driveFileId,
          }];
        });
        loadBaseline(project);
        setCurrentProjectId(project.id);
        driveFileIdRef.current = driveFileId;
      } catch (e) {
        console.error('Failed to open cloud project:', e);
        throw e;
      }
    } else {
      const project = loadProjectFromStorage(id);
      if (project) {
        loadBaseline(project);
        setCurrentProjectId(id);
      }
    }
  }, [flushCurrentProject, auth.accessToken, projectList, onlineProjects]);

  // Remember the last successfully-opened project (roadmap 178) so a refresh
  // can auto-open it within the TTL — local and cloud alike.
  useEffect(() => {
    if (!currentProjectId) return;
    const meta = projectList.find(p => p.id === currentProjectId);
    // An online identity wins: never record a stale Drive id alongside it
    // (the offline/Drive copies are detached from this project's identity).
    const driveId = meta?.onlineId ? undefined : (meta?.driveFileId ?? driveFileIdRef.current);
    rememberLastProject(currentProjectId, driveId, meta?.onlineId);
  }, [currentProjectId, projectList]);

  // Boot auto-open (once per app load): the last project when it was loaded in
  // the past hour. Cloud projects wait for the silent GIS session restore.
  const autoOpenTriedRef = useRef(false);
  useEffect(() => {
    if (!initialized || currentProjectId || autoOpenTriedRef.current) return;
    const rec = readLastProject();
    if (!rec) return;
    if (rec.onlineId) {
      if (!sbAuth.account) return; // wait for the restored Supabase session
      autoOpenTriedRef.current = true;
      void openProject(rec.id, undefined, rec.onlineId).catch(() => {});
      return;
    }
    if (rec.driveFileId) {
      if (!auth.isSignedIn || !auth.accessToken) return; // wait for the silent restore
      autoOpenTriedRef.current = true;
      void openProject(rec.id, rec.driveFileId).catch(() => {});
      return;
    }
    autoOpenTriedRef.current = true;
    void openProject(rec.id).catch(() => {});
  }, [initialized, currentProjectId, auth.isSignedIn, auth.accessToken, openProject, sbAuth.account]);

  const deleteProject = useCallback(async (id: string, cloudDriveFileId?: string) => {    const meta = projectList.find(p => p.id === id) ?? onlineProjects.find(p => p.id === id);
    const driveFileId = meta?.driveFileId || cloudDriveFileId;

    if (meta?.onlineId) {
      // Owner-only at the server; failures throw so the caller can surface
      // them (the project stays listed until the server confirms the delete).
      await deleteOnlineProject(meta.onlineId);
      setOnlineProjects(prev => prev.filter(p => p.id !== id));
    }

    if (driveFileId && auth.isSignedIn && auth.accessToken) {
      try {
        await removeFromDrive(auth.accessToken, driveFileId);
        await removeFromDriveIndex(auth.accessToken, id);
      } catch (e) {
        console.error('Failed to delete project from Drive:', e);
      }
    }

    if (!driveFileId) {
      localStorage.removeItem(getProjectStorageKey(id));
    }

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.includes(id)) localStorage.removeItem(key);
    }

    const currentIndex = loadProjectListFromStorage();
    const remaining = currentIndex.filter(p => p.id !== id);
    saveProjectListToStorage(remaining);
    setProjectList(prev => prev.filter(p => p.id !== id));

    if (currentProjectId === id) {
      clearLastProject();
      setCurrentProjectId(null);
    }
  }, [currentProjectId, openProject, projectList, onlineProjects, auth.isSignedIn, auth.accessToken]);

  const renameProject = useCallback((id: string, title: string, driveFileId?: string) => {
    if (currentProjectId === id) {
      // `guardedDispatch`, NOT the raw reducer dispatch: the title is project
      // data and must ride the SAME write path as every other edit — for a
      // shared project that means the room transport (a raw dispatch applied
      // the rename in THIS window only and never reached peers — the
      // "rename doesn't sync between users" report, roadmap 253).
      guardedDispatch({ type: 'UPDATE_PROJECT', payload: { title } });
    }
    let existingMeta: ProjectMeta | undefined;
    setProjectList(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx >= 0) {
        existingMeta = prev[idx];
        const updated = [...prev];
        updated[idx] = { ...updated[idx], title };
        saveProjectListToStorage(updated);
        return updated;
      }
      if (!driveFileId) return prev;
      const updated = [...prev, { id, title, lastModified: Date.now(), createdAt: Date.now(), driveFileId }];
      saveProjectListToStorage(updated);
      return updated;
    });
    const meta = projectList.find(p => p.id === id) ?? onlineProjects.find(p => p.id === id);
    if (meta?.onlineId && sbAuth.account) {
      // Push the title straight to the ROW — for the OPEN project too: its next
      // whole-blob save is NOT guaranteed (the room transport owns the writes
      // while mounted, so there are no blob saves at all; without a room the
      // save debounce can still lose to a reload/close), and online entries are
      // dropped from the persisted project list — the row title is what the
      // Project Manager's Shared list shows after any reload. Refresh the list
      // so the manager reflects the rename immediately.
      renameOnlineProject(meta.onlineId, title)
        .then(() => refetchOnlineProjects())
        .catch(e => console.error('Failed to push rename online:', e));
    }
    if (driveFileId && auth.accessToken) {
      if (currentProjectId === id) {
        pushProjectAndUpdateIndex(auth.accessToken, { ...presentRef.current, title }, driveFileId)
          .catch(e => console.error('Failed to push rename to Drive:', e));
      } else {
        readDriveProject(auth.accessToken, driveFileId)
          .then(project => {
            project.title = title;
            pushProjectAndUpdateIndex(auth.accessToken, project, driveFileId)
              .catch(e => console.error('Failed to push rename to Drive:', e));
          })
          .catch(e => console.error('Failed to read project for rename:', e));
      }
    }
  }, [currentProjectId, auth.accessToken, projectList, onlineProjects, sbAuth.account, refetchOnlineProjects, guardedDispatch]);

  const duplicateProject = useCallback(async (id: string, cloudDriveFileId?: string) => {
    const meta = projectList.find(p => p.id === id) ?? onlineProjects.find(p => p.id === id);
    const driveFileId = meta?.driveFileId || cloudDriveFileId;
    if (!meta && !driveFileId) return;

    // The original comes from wherever the project actually lives — the copy
    // comes back to the same place.
    let original: Project | null = null;
    let sourceOnline = false;
    if (meta?.onlineId) {
      try {
        original = (await readOnlineProject(meta.onlineId)).project;
        sourceOnline = true;
      } catch (e) {
        console.error('[duplicate] failed to read online project:', e);
        return;
      }
    } else if (driveFileId && auth.accessToken) {
      try {
        original = await readDriveProject(auth.accessToken, driveFileId);
      } catch (e) {
        console.error('[duplicate] failed to read cloud project:', e);
        return;
      }
    } else if (!driveFileId) {
      original = id === currentProjectId ? state.present : loadProjectFromStorage(id);
    }
    if (!original) return;

    flushCurrentProject();
    const newId = generateUUID();
    const newProject: Project = {
      ...original,
      id: newId,
      title: `${original.title} Copy`,
      versions: original.versions.map(v => ({
        ...v,
        id: generateUUID(),
        rows: v.rows.map(r => ({ ...r, id: generateUUID() }))
      })),
      ribbonDesigns: original.ribbonDesigns || [],
      activeRibbonId: original.activeRibbonId || '',
    };

    if (sourceOnline) {
      try {
        await uploadProjectOnline(newProject);
        refetchOnlineProjects();
      } catch (e) {
        console.error('[duplicate] failed to upload online copy:', e);
      }
    } else if (driveFileId && auth.accessToken) {
      const newFileId = await pushProjectAndUpdateIndex(auth.accessToken, newProject);
      const newMeta: ProjectMeta = { id: newId, title: newProject.title, lastModified: Date.now(), createdAt: Date.now(), driveFileId: newFileId };
      setProjectList(prev => [...prev, newMeta]);
    } else {
      saveProjectToStorage(newId, newProject);
      const newMeta: ProjectMeta = { id: newId, title: newProject.title, lastModified: Date.now(), createdAt: Date.now() };
      setProjectList(prev => { const u = [...prev, newMeta]; saveProjectListToStorage(u); return u; });
    }
  }, [flushCurrentProject, currentProjectId, state.present, projectList, onlineProjects, auth.accessToken, refetchOnlineProjects]);

  const importProjectFromData = useCallback((data: Project): string => {
    flushCurrentProject();
    const id = generateUUID();
    const migrationResult = migrateLegacyProject(data);
    migrateLegacyCastMirror(migrationResult.project);
    migrateElementBoardIds(migrationResult.project);
    migrateProjectLinks(migrationResult.project);
    if (migrationResult.migrated) {
      setPendingLegacyMigrationNotice(migrationResult);
    }
    saveProjectToStorage(id, migrationResult.project);
    const meta: ProjectMeta = { id, title: migrationResult.project.title || 'Imported Project', lastModified: Date.now(), createdAt: Date.now() };
    setProjectList(prev => { const u = [...prev, meta]; saveProjectListToStorage(u); return u; });
    loadBaseline(migrationResult.project);
    setCurrentProjectId(id);
    return id;
  }, [flushCurrentProject]);

  const updateProjectMeta = useCallback((id: string, updates: Partial<ProjectMeta>) => {
    setProjectList(prev => {
      const idx = prev.findIndex(p => p.id === id);
      let updated: ProjectMeta[];
      if (idx >= 0) {
        updated = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      } else {
        // Upsert: a Drive-only project (not in the localStorage index, e.g. after
        // a reload) must be added when it comes back local (move-to-local), or it
        // would vanish from the index entirely.
        const base: ProjectMeta = {
          id,
          title: updates.title || 'Project',
          lastModified: updates.lastModified ?? Date.now(),
          createdAt: updates.createdAt ?? Date.now(),
        };
        updated = [...prev, { ...base, ...updates }];
      }
      saveProjectListToStorage(updated);
      return updated;
    });
    if (id === currentProjectId && 'driveFileId' in updates) {
      driveFileIdRef.current = updates.driveFileId;
    }
  }, [currentProjectId]);

  const closeProject = useCallback(() => {
    // Local projects save on a 500ms debounce the save effect cancels when
    // currentProjectId flips to null — flush first so the last edit before
    // Close isn't dropped (parity with open/create/duplicate/import, which
    // all flush before switching away). Cloud/shared projects have no local
    // copy; the close-project flow guards those with a confirm.
    flushCurrentProject();
    clearLastProject();
    setCurrentProjectId(null);
  }, [flushCurrentProject]);

  const retryConnectivity = useCallback(async (): Promise<boolean> => {
    return probeRef.current();
  }, []);

  const retryDriveSync = useCallback(async () => {
    if (!currentProjectId) return;
    const meta = projectList.find(p => p.id === currentProjectId);
    if (meta?.onlineId) {
      if (!sbAuth.account) return;
      if (!canEditRef.current) return;
      try {
        const project = { ...presentRef.current };
        const counterAtSave = changeCounterRef.current;
        const nextRevision = await saveOnlineProject(meta.onlineId, project, onlineRevisionRef.current);
        onlineRevisionRef.current = nextRevision;
        persistedAtCounterRef.current = counterAtSave;
        setOnlineChangesAvailable(false);
        notifyLocalSave(nextRevision);
        setDriveSaveError(false);
        setDriveErrorMsg(null);
        lastSaveFailedRef.current = false;
        setRealOnline(true);
        setDriveRetryPending(false);
        retryCountRef.current = 0;
        syncDiagRef.current.saveRetryCount = 0;
      } catch (err: any) {
        if (isPermissionFailure(err)) {
          void recheckOnlineRole();
          setDriveErrorMsg('View only — you do not have permission to save this shared project.');
        } else {
          setDriveErrorMsg(driveErrorDetail(err));
        }
        setDriveSaveError(true);
        setDriveRetryPending(false);
      }
      return;
    }
    if (!meta?.driveFileId) return;
    const token = sessionStorage.getItem('lemon_google_token') ?? auth.accessToken;
    if (!token) return;
    try {
      await pushProjectAndUpdateIndex(token, { ...presentRef.current }, meta.driveFileId);
      setDriveSaveError(false);
      setDriveErrorMsg(null);
      lastSaveFailedRef.current = false;
      setRealOnline(true);
      setDriveRetryPending(false);
      retryCountRef.current = 0;
      syncDiagRef.current.saveRetryCount = 0;
    } catch (err: any) {
      setDriveErrorMsg(driveErrorDetail(err));
      if (err?.message?.includes('401')) {
        auth.refreshToken();
        setTimeout(async () => {
          try {
            const token = sessionStorage.getItem('lemon_google_token');
            if (token && meta?.driveFileId) {
              await pushProjectAndUpdateIndex(token, { ...presentRef.current }, meta.driveFileId);
              setDriveSaveError(false);
              setDriveErrorMsg(null);
              lastSaveFailedRef.current = false;
              setRealOnline(true);
              setDriveRetryPending(false);
              retryCountRef.current = 0;
              syncDiagRef.current.saveRetryCount = 0;
            }
          } catch (err2: any) {
            setDriveErrorMsg(driveErrorDetail(err2));
            setDriveSaveError(true);
          }
        }, 2000);
      } else {
        // Same as the save pipeline: a failed retry is not proof of being
        // offline — keep editing and let the probe classify connectivity.
        lastSaveFailedRef.current = true;
      }
      setDriveSaveError(true);
      setDriveRetryPending(false);
    }
  }, [currentProjectId, auth.accessToken, projectList, sbAuth.account]);

  /** The Collaborate action (docs/COLLABORATION.md §1): copy a project to the
   *  online workspace and make the online copy its synced identity. The
   *  offline file (and any Drive file) stays untouched on its own. */
  const collaborateProject = useCallback(async (id: string): Promise<void> => {
    if (!sbAuth.account) throw new Error('Sign in to collaborate.');
    const project = id === currentProjectIdRef.current
      ? { ...presentRef.current }
      : loadProjectFromStorage(id);
    if (!project) throw new Error('Could not load the project.');
    await uploadProjectOnline(project);
    onlineRevisionRef.current = 0;
    // The uploaded copy is the persisted baseline for the clean/dirty gate.
    persistedAtCounterRef.current = changeCounterRef.current;
    // The caller owns the copy it just uploaded.
    setOnlineRole({ projectId: id, role: 'owner' });
    setProjectList(prev => {
      const exists = prev.find(p => p.id === id);
      const updated = exists
        ? prev.map(p => p.id === id ? { ...p, onlineId: id, driveFileId: undefined } : p)
        : [...prev, { id, title: project.title, lastModified: Date.now(), createdAt: Date.now(), onlineId: id }];
      saveProjectListToStorage(updated);
      return updated;
    });
    refetchOnlineProjects();
  }, [sbAuth.account, refetchOnlineProjects]);

  const consumeLegacyMigrationNotice = useCallback((): LegacyMigrationResult | null => {
    return consumePendingLegacyMigrationNotice();
  }, []);

  const contextValue = useMemo(() => ({
    state,
    dispatch: guardedDispatch,
    undo,
    redo,
    canRoomUndo,
    canRoomRedo,
    canLocalUndo,
    canLocalRedo,
    roomStatus,
    roomPending: roomQueue,
    roomNote,
    activeCalendarVersion: state.present.calendarVersions.find(v => v.id === state.present.activeCalendarVersionId),
    projectList,
    currentProjectId,
    initialized,
    readOnly: !realOnline,
    canEdit,
    locked: !realOnline || !canEdit,
    createProject,
    openProject,
    deleteProject,
    renameProject,
    duplicateProject,
    importProjectFromData,
    updateProjectMeta,
    registerPostSaveHandler,
    driveSaveError,
    driveErrorMsg,
    driveRetryPending,
    storageQuotaError,
    onlineProjects,
    onlineLoading,
    onlineError,
    refetchOnlineProjects,
    collaborateProject,
    onlineChangesAvailable,
    applyPeerSave,
    reloadOnlineProject,
    applyAccessPush,
    retryDriveSync,
    retryConnectivity,
    closeProject,
    consumeLegacyMigrationNotice,
  }), [state, guardedDispatch, undo, redo, canRoomUndo, canRoomRedo, canLocalUndo, canLocalRedo, roomStatus, roomQueue, roomNote, projectList, currentProjectId, initialized, realOnline, canEdit, createProject, openProject, deleteProject, renameProject, duplicateProject, importProjectFromData, updateProjectMeta, registerPostSaveHandler, driveSaveError, driveErrorMsg, driveRetryPending, storageQuotaError, onlineProjects, onlineLoading, onlineError, refetchOnlineProjects, collaborateProject, onlineChangesAvailable, applyPeerSave, reloadOnlineProject, applyAccessPush, retryDriveSync, retryConnectivity, closeProject, consumeLegacyMigrationNotice]);

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProject must be used within ProjectProvider");
  return context;
}

/** Is the open project SHARED (S1 onlineId)? The semantic predicate (chrome
 *  colors come from `useProjectTheme()`). */
export function useIsOnlineProject(): boolean {
  const { projectList, currentProjectId } = useProject();
  return projectThemeOf(projectList.find(p => p.id === currentProjectId)) === 'shared';
}

/** The open project's chrome theme (roadmap 248): local zinc / Drive blue /
 *  shared emerald. ONE source for every colored-chrome surface — derive
 *  colors through `lib/projectTheme` (tokens + kit accent values), never from
 *  ad-hoc `isCloud` checks. */
export function useProjectTheme(): ProjectTheme {
  const { projectList, currentProjectId } = useProject();
  return projectThemeOf(projectList.find(p => p.id === currentProjectId));
}
