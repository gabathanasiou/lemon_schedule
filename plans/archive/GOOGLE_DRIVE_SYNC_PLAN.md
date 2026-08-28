# Google Drive Sync — Implementation Plan

## Overview

Add Google Drive as an optional sync layer on top of the existing local-first architecture. Users can work entirely offline with localStorage as always, then optionally sign in with Google to sync projects to Drive for cross-device access. localStorage remains the single source of truth at all times.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     App (React)                      │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │  Header   │  │ Project   │  │  Tab Components  │  │
│  │ Sign-in   │  │ Manager   │  │  Breakdown,      │  │
│  │ Save ind. │  │           │  │  Schedule, etc.  │  │
│  │ Sync icon │  │           │  │                  │  │
│  └────┬──────┘  └─────┬─────┘  └────────┬─────────┘  │
│       │               │                 │            │
│  ┌────▼───────────────▼─────────────────▼─────────┐  │
│  │              Store (useReducer + Context)        │  │
│  │  ProjectMeta { driveFileId?, driveModified? }   │  │
│  │  auto-save: 400ms debounce → localStorage       │  │
│  │  auto-sync: 2000ms debounce → Google Drive      │  │
│  └────┬──────────────────────────┬────────────────┘  │
│       │                          │                   │
│  ┌────▼────────┐    ┌────────────▼──────────────┐   │
│  │ localStorage │    │   Google Drive Sync Layer  │   │
│  │  (always on) │    │  ┌──────────────────────┐ │   │
│  │              │    │  │ googleDriveAuth.ts   │ │   │
│  │              │    │  │ googleDriveStorage.ts│ │   │
│  │              │    │  │ syncManager.ts       │ │   │
│  │              │    │  └──────────────────────┘ │   │
│  └──────────────┘    └───────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Data flow:**
```
User action → dispatch(action) → reducer → state.present updated
  ├─ 400ms debounce → localStorage.setItem()   [ALWAYS]
  └─ 2000ms debounce → Google Drive upload      [IF signed in]
```

---

## Dependencies

**One npm package:**

| Package | Size | Weekly DLs | Purpose |
|---|---|---|---|
| `@react-oauth/google` | ~15KB gz | 1.1M | Google Sign-In button + OAuth2 access tokens |

No Drive client SDK needed. The Drive REST API v3 is called via plain `fetch` with `Authorization: Bearer {token}` header. This keeps the bundle small and avoids loading the heavy `gapi` script.

```bash
npm install @react-oauth/google
```

---

## Google Cloud Console Setup (one-time, ~5 min)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. **Enable the Drive API:**
   - Navigate to **APIs & Services → Library**
   - Search for "Google Drive API" → Enable
4. **Configure OAuth consent screen:**
   - **APIs & Services → OAuth consent screen**
   - User type: **Internal** (no verification needed for personal use)
   - App name: "Lemon Schedule"
   - Support email: your email
   - Developer contact: your email
   - Scopes: `https://www.googleapis.com/auth/drive.appdata` (non-sensitive scope)
   - Save and continue
5. **Create OAuth 2.0 Client ID:**
   - **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: "Lemon Schedule"
   - Authorized JavaScript origins:
     - `http://localhost:3000`
     - `https://your-production-domain.com` (when deployed)
   - Create
6. Copy the **Client ID** — this goes into the app config.

---

## Phase 1: Google Auth Provider

### New file: `src/lib/googleDriveAuth.ts`

Purpose: Wrap `@react-oauth/google` in a React context to manage:
- Sign-in state (signed in / signed out)
- Access token storage (in-memory via `useRef`, never localStorage)
- User profile info (avatar, email, name)
- Automatic token refresh

**Exports:**

```ts
// Context provider — wraps the app
export function GoogleAuthProvider({ children, clientId }: Props)

// Hook used by components
export function useGoogleAuth(): {
  isSignedIn: boolean;
  user: { name: string; email: string; picture: string } | null;
  accessToken: string | null;
  signIn: () => void;
  signOut: () => void;
  isReady: boolean;
}
```

**Token lifecycle:**
- Token obtained via `useGoogleLogin` implicit flow with scope `https://www.googleapis.com/auth/drive.appdata`
- Stored in a `useRef<string | null>` (not state — avoids re-renders on token refresh)
- Token expiry is ~1 hour. On 401 response from Drive, call `google.accounts.oauth2.revoke()` then trigger re-auth
- Sign-in state persisted in `sessionStorage` (survives page refresh within same tab, clears on tab close)
- On app mount, if sessionStorage says "signed in", auto-trigger token refresh

### Modified file: `src/main.tsx`

Wrap the app:

```tsx
import { GoogleAuthProvider } from './lib/googleDriveAuth';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID';

<GoogleAuthProvider clientId={CLIENT_ID}>
  <ProjectProvider>
    <App />
  </ProjectProvider>
</GoogleAuthProvider>
```

Add `.env` file:
```
VITE_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
```

---

## Phase 2: Google Sign-In Button

### New file: `src/components/GoogleSignIn.tsx`

Renders the Google Sign-In button using `@react-oauth/google`'s `<GoogleLogin>` component.

**States:**

| State | UI |
|---|---|
| Auth not initialized | No button (hidden) |
| Not signed in | "Sign in with Google" button (`filled_blue` theme, `medium` size) |
| Signed in | User avatar (16px circle) + "Disconnect" text button |
| Signing in | Button shows spinner |
| Error | Red text "Sign-in failed" + retry link |

**Placement in App.tsx header** (right side, after undo/redo, before version dropdown):

```tsx
// In the header's right div:
<div className="flex items-center space-x-3 font-mono text-xs">
  <GoogleSignIn />
  {/* existing undo/redo + version selector */}
</div>
```

### New file: `src/components/SyncStatusIcon.tsx`

Small cloud icon with tooltip showing Drive sync state.

**States:**

| Icon | Color | Tooltip | Condition |
|---|---|---|---|
| `Cloud` | gray-500 | "Sign in to sync with Drive" | Not signed in |
| `Cloud` + check | green-400 | "Synced to Drive" | Last push successful |
| `Cloud` + arrows | yellow-400 | "Syncing..." | Push in progress |
| `Cloud` + `!` | red-400 | "Sync failed — tap to retry" | Last push errored |

Uses `FloatingTooltip` for the tooltip (reuses existing component).

---

## Phase 3: Save Status Indicator

### New file: `src/components/SaveIndicator.tsx`

Small icon left of the project title showing local save status.

**States:**

| Icon | Tooltip | Condition |
|---|---|---|
| `Check` | "Saved just now" | Last save < 5 seconds ago |
| `Check` | "Saved 1 min ago" | Last save < 60 seconds |
| `Check` | "Saved 5 min ago" | Last save >= 60 seconds |
| `Loader` (spinning) | "Saving..." | Change made, debounce pending |
| `WifiOff` | "Saved locally" | Offline (save still works via localStorage) |

**Implementation:**
- Store tracks `lastSavedAt` timestamp via a ref that updates after each save completes
- Exposed via context or a simple hook
- Uses `useInterval` (1s tick) to update the "X ago" text
- On `state.present` change → show spinning for 400ms → checkmark when saved

**Placement in App.tsx header** (left of the project title input):

```tsx
<div className="flex items-center gap-2">
  <SaveIndicator />
  <input value={project.title} ... />
</div>
```

### Modified: `src/store.tsx`

Add `lastSavedAt` tracking:

```ts
// In ProjectProvider:
const saveIndicatorRef = useRef({ saving: false, lastSaved: 0 });

// In the auto-save useEffect, after localStorage.setItem:
saveIndicatorRef.current.lastSaved = Date.now();
saveIndicatorRef.current.saving = false;

// On state.present change (before debounce):
saveIndicatorRef.current.saving = true;

// Expose via context or separate hook
export const SaveContext = createContext(saveIndicatorRef);
```

---

## Phase 4: Google Drive Storage Adapter

### New file: `src/lib/googleDriveStorage.ts`

Mirrors the pattern from `src/lib/persistentStorage.ts` exactly. All functions take an `accessToken` parameter and call the Drive REST API v3 via `fetch`.

**API reference:**

| Operation | Method | Endpoint |
|---|---|---|
| List appdata files | `GET` | `/drive/v3/files?spaces=appDataFolder&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=100` |
| Download file content | `GET` | `/drive/v3/files/{fileId}?alt=media` |
| Create new file | `POST` (multipart) | `/upload/drive/v3/files?uploadType=multipart` |
| Update existing file | `PATCH` (multipart) | `/upload/drive/v3/files/{fileId}?uploadType=multipart` |
| Delete file | `DELETE` | `/drive/v3/files/{fileId}` |

**File naming:**
- Project data: `{projectId}.json`
- Project index: `_lemon_schedule_index.json`

**Functions:**

```ts
export interface DriveProjectMeta {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
  driveFileId: string;
}

export async function listDriveProjects(accessToken: string): Promise<{
  index: DriveProjectMeta[];
  projects: Map<string, Project>;
}>

export async function readDriveProject(
  accessToken: string,
  driveFileId: string
): Promise<Project>

export async function saveDriveProject(
  accessToken: string,
  project: Project,
  existingDriveFileId?: string
): Promise<string> // returns driveFileId

export async function deleteDriveProject(
  accessToken: string,
  driveFileId: string
): Promise<void>

export async function saveDriveIndex(
  accessToken: string,
  index: DriveProjectMeta[],
  existingIndexFileId?: string
): Promise<string> // returns index fileId
```

**Multipart upload helper:**

```ts
async function uploadJson(
  accessToken: string,
  name: string,
  data: unknown,
  existingFileId?: string
): Promise<string> {
  const metadata = {
    name,
    mimeType: 'application/json',
    parents: ['appDataFolder'],
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const method = existingFileId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!res.ok) throw new Error(`Drive API error: ${res.status} ${await res.text()}`);
  const file = await res.json();
  return file.id;
}
```

**Error handling:**
- 401 → token expired → trigger re-auth
- 403 → insufficient scope → trigger re-auth with correct scope
- 404 → file deleted on Drive → treat as new file
- Network errors → `SyncStatusIcon` shows error state, no data loss (localStorage still has it)

---

## Phase 5: Sync Manager

### New file: `src/lib/syncManager.ts`

Orchestrates the sync between localStorage and Google Drive.

**Core functions:**

```ts
export interface Conflict {
  projectId: string;
  localTitle: string;
  localModified: number;
  driveTitle: string;
  driveModified: number;
  resolution: 'keep_local' | 'keep_drive' | 'keep_both' | 'unresolved';
}

export async function pullFromDrive(
  accessToken: string,
  localProjects: ProjectMeta[]
): Promise<{
  newProjects: Project[];        // Projects only on Drive
  updatedProjects: Project[];    // Drive version is newer than local
  conflicts: Conflict[];         // Both modified — needs user input
}>

export async function pushToDrive(
  accessToken: string,
  project: Project,
  driveFileId?: string
): Promise<string> // returns driveFileId

export async function removeFromDrive(
  accessToken: string,
  driveFileId: string
): Promise<void>
```

**Sync algorithm (`pullFromDrive`):**

```
1. Download drive projects + index from Drive
2. Build a Map<projectId, { project, driveFileId, driveModifiedTime }>

For each drive project:
  A. Not in localStorage at all:
     → add to newProjects (offer to import)

  B. In localStorage with matching driveFileId:
     - drive.modifiedTime > local.lastModified → add to updatedProjects (offer to update)
     - drive.modifiedTime <= local.lastModified → skip (local is newer or same)

  C. In localStorage with different driveFileId OR no driveFileId:
     - drive.modifiedTime > local.lastModified → add to conflicts (both modified)
     - drive.modifiedTime <= local.lastModified → skip

Return newProjects, updatedProjects, conflicts
```

**Merge resolution helper:**

```ts
export function resolveConflict(
  conflict: Conflict,
  localProject: Project,
  driveProject: Project
): { action: 'keep_local' | 'keep_drive' | 'keep_both'; project?: Project }
```

---

## Phase 6: Modified Files — Core Integration

### `src/store.tsx` — Changes

**1. Extend `ProjectMeta`:**

```ts
export interface ProjectMeta {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
  driveFileId?: string;       // NEW
  driveModifiedTime?: number; // NEW
}
```

**2. Add sync functions to the context:**

```ts
interface ProjectContextType {
  // ... existing fields ...
  syncProjectToDrive: (projectId: string) => Promise<void>;
  pullDriveProjects: () => Promise<{ new: Project[]; updated: Project[]; conflicts: Conflict[] }>;
  importDriveProject: (project: Project, driveFileId: string) => void;
  isDriveSignedIn: boolean;   // from useGoogleAuth()
}
```

**3. Add Drive sync to the auto-save `useEffect`:**

```ts
// After the existing 400ms localStorage auto-save:
const driveSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const auth = useGoogleAuth();

useEffect(() => {
  if (!currentProjectId || !auth.isSignedIn || !auth.accessToken) return;
  if (driveSyncTimerRef.current) clearTimeout(driveSyncTimerRef.current);

  driveSyncTimerRef.current = setTimeout(async () => {
    try {
      const driveFileId = projectList.find(p => p.id === currentProjectId)?.driveFileId;
      const newFileId = await pushToDrive(auth.accessToken!, project, driveFileId);
      // Update projectList with new driveFileId
      setProjectList(prev => {
        const updated = prev.map(p =>
          p.id === currentProjectId
            ? { ...p, driveFileId: newFileId, driveModifiedTime: Date.now() }
            : p
        );
        saveProjectListToStorage(updated);
        return updated;
      });
    } catch (err) {
      // SyncStatusIcon will show error
      console.error('Drive sync failed:', err);
    }
  }, 2000);
  return () => { if (driveSyncTimerRef.current) clearTimeout(driveSyncTimerRef.current); };
}, [state.present, currentProjectId, auth.isSignedIn, auth.accessToken]);
```

**4. Wire `flushCurrentProject` to also push to Drive:**

```ts
const flushCurrentProject = useCallback(async () => {
  if (!currentProjectId) return;
  localStorage.setItem(getProjectStorageKey(currentProjectId), JSON.stringify(state.present));
  // ... existing index update ...

  // Also push to Drive if signed in
  const auth = getAuth(); // via ref to avoid stale closures
  if (auth.isSignedIn && auth.accessToken) {
    const driveFileId = projectList.find(p => p.id === currentProjectId)?.driveFileId;
    pushToDrive(auth.accessToken, state.present, driveFileId).catch(console.error);
  }
}, [currentProjectId, state.present, projectList]);
```

### `src/App.tsx` — Changes

**1. Header additions (inside right-side div):**

```tsx
<div className="flex items-center space-x-3 font-mono text-xs">
  <SyncStatusIcon />
  <GoogleSignIn />
  {/* Divider */}
  <div className="w-px h-4 bg-zinc-700" />
  {/* Existing undo/redo */}
  <div className="flex items-center gap-1 bg-zinc-900 rounded-md p-0.5 border border-zinc-800">
    ...
  </div>
  {/* Existing version selector */}
</div>
```

**2. SaveIndicator placement (left of title, inside left-side div):**

```tsx
<div className="flex items-center gap-2">
  <SaveIndicator />
  <input value={project.title} ... />
</div>
```

**3. File menu additions:**

```tsx
<DropdownItem
  onClick={async () => {
    setShowFileMenu(false);
    try {
      const result = await pullDriveProjects();
      if (result.conflicts.length > 0) {
        setPendingConflicts(result.conflicts);
        setShowConflictModal(true);
      }
      if (result.new.length > 0 || result.updated.length > 0) {
        // Apply imports automatically (with toast notification)
        await applyDriveUpdates(result);
      }
    } catch (err) {
      toast.error('Failed to sync with Drive');
    }
  }}
  icon={<Cloud className="w-3.5 h-3.5" />}
>
  Sync with Google Drive
</DropdownItem>
```

### `src/components/ProjectManager.tsx` — Changes

**Add cloud icon badges:**
- Projects stored on Drive show a small `Cloud` icon next to their name
- "Import from Drive" button in the footer (alongside Import + New Project)
- On "Import from Drive": calls `pullDriveProjects()`, shows preview of found projects, lets user select which to import

---

## Phase 7: Conflict Resolution Modal

### New file: `src/components/DriveConflictModal.tsx`

Shown when `pullDriveProjects()` detects conflicts (both local and Drive versions modified independently).

**UI:**
- Title: "Sync Conflict"
- Lists each conflicting project with:
  - Project name
  - Local version: title + "Last modified: [timestamp]"
  - Drive version: title + "Last modified: [timestamp]"
  - Per-project action buttons: "Keep Local", "Keep Drive", "Keep Both (rename)"
- Bottom: "Resolve All" button
- Shows a preview of the actual difference (scene count, version count) — not a full JSON diff, just metadata summary

**Behavior:**
- "Keep Local" → overwrites Drive with local version
- "Keep Drive" → loads Drive version into localStorage
- "Keep Both" → imports Drive version as a new project named "{Title} (from Drive)"

---

## Phase 8: Sync Flow Summary

### On app start (user already signed in from previous session):

```
1. Load projects from localStorage (existing behavior — always works)
2. Check sessionStorage for "google_signed_in" flag
3. If signed in:
   a. Refresh access token silently
   b. pullDriveProjects() in background
   c. Compare with localStorage projects
   d. Auto-import: Drive-only projects → toast "X new projects found on Drive"
   e. Auto-update: Drive-newer versions → silently update localStorage
   f. Conflicts: both modified → show DriveConflictModal
   g. Local-only (no driveFileId): auto-push to Drive
```

### On every change (debounced):

```
1. 400ms → save to localStorage (existing)
2. 2000ms → if signed in, push to Google Drive
   - First push: create new Drive file, store driveFileId in ProjectMeta
   - Subsequent: update existing Drive file
```

### On sign-in (user clicks "Sign in with Google"):

```
1. OAuth flow completes → access token obtained
2. Pull all projects from Drive
3. Merge: import new, update newer, show conflicts
4. Push any local-only projects to Drive
5. SyncStatusIcon → green checkmark
```

### On sign-out:

```
1. Flush any pending Drive syncs
2. Revoke access token via google.accounts.oauth2.revoke()
3. Clear token from memory
4. Clear sessionStorage flag
5. SyncStatusIcon → gray
6. localStorage data remains intact — user can continue working locally
```

### Offline behavior:

```
- localStorage always works (existing readOnly guard)
- Drive sync silently skips (catches network errors)
- SyncStatusIcon shows gray "Sign in to sync"
- When back online: next save triggers Drive push automatically
```

---

## Data Model Changes Summary

### `ProjectMeta` (store.tsx — extended)

```ts
export interface ProjectMeta {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
  driveFileId?: string;        // NEW: undefined = local-only
  driveModifiedTime?: number;  // NEW: last known Drive modifiedTime
}
```

### Drive Index File (`_lemon_schedule_index.json` in appDataFolder)

```json
[
  {
    "id": "uuid-1",
    "title": "My Project",
    "lastModified": 1715702400000,
    "createdAt": 1715616000000
  }
]
```

Same shape as `ProjectMeta` minus `driveFileId` (that's the file's own ID on Drive).

### `Project` type — no changes

The `Project` type remains identical. Drive stores the exact same JSON blob as localStorage.

---

## File Manifest

### New files (7)

| File | Purpose |
|---|---|
| `src/lib/googleDriveAuth.ts` | Auth context + `useGoogleAuth()` hook |
| `src/lib/googleDriveStorage.ts` | Drive REST API calls |
| `src/lib/syncManager.ts` | Sync orchestration + conflict detection |
| `src/components/GoogleSignIn.tsx` | Sign-in / sign-out button |
| `src/components/SyncStatusIcon.tsx` | Cloud sync status badge |
| `src/components/SaveIndicator.tsx` | Local save status icon |
| `src/components/DriveConflictModal.tsx` | Conflict resolution modal |
| `.env` | `VITE_GOOGLE_CLIENT_ID` |

### Modified files (4)

| File | Changes |
|---|---|
| `src/main.tsx` | Wrap with `<GoogleAuthProvider>` |
| `src/store.tsx` | Extend `ProjectMeta`, add sync functions to context, add Drive auto-sync |
| `src/App.tsx` | Add `SaveIndicator`, `GoogleSignIn`, `SyncStatusIcon` to header; add File menu sync items |
| `src/components/ProjectManager.tsx` | Add Drive cloud badges, "Import from Drive" button |

---

## Edge Cases

| Scenario | Handling |
|---|---|
| **Offline** | localStorage always works. Drive sync silently skips. SaveIndicator shows "Saved locally". |
| **Token expires** | `@react-oauth/google` handles token refresh. On 401 from Drive, retry once with fresh token. |
| **Drive quota exceeded** | 15GB free per Google account. App data files are tiny (KB). If quota hit, show error toast, keep working locally. |
| **Two tabs open** | Same Google account → same appDataFolder. Each tab saves independently; Drive's last write wins. No cross-tab coordination needed since localStorage is source of truth per-tab. |
| **Different Google accounts** | Each account has a separate appDataFolder in Drive. Switching accounts shows different project sets. |
| **User revokes Drive access** | Next sync call gets 401. Show re-auth prompt in SyncStatusIcon. localStorage data untouched. |
| **Corrupted Drive file** | `JSON.parse` catches this. Skip the file, log warning, continue with other projects. |
| **User deletes a project locally** | On next Drive sync, detect Drive file has no matching localStorage entry → delete from Drive too. |
| **User deletes a project from another device** | On next pull, detect Drive file missing → remove driveFileId from local ProjectMeta. Keep local copy. |
| **Network timeout during upload** | Retry once. If still failing, show error in SyncStatusIcon. Data safe in localStorage. |
| **Concurrent edits from two devices** | Detected as conflict on next pull (both modified). User resolves via DriveConflictModal. |

---

## Implementation Order

| Step | Description | Est. time |
|---|---|---|
| 1 | Google Cloud Console setup (client ID, enable Drive API) | 5 min |
| 2 | Install `@react-oauth/google` | 1 min |
| 3 | `src/lib/googleDriveAuth.ts` — auth context | 30 min |
| 4 | `src/components/GoogleSignIn.tsx` — button | 15 min |
| 5 | `src/components/SaveIndicator.tsx` — save status | 15 min |
| 6 | `src/components/SyncStatusIcon.tsx` — cloud status | 15 min |
| 7 | `src/lib/googleDriveStorage.ts` — Drive API adapter | 45 min |
| 8 | `src/lib/syncManager.ts` — sync logic | 45 min |
| 9 | `src/store.tsx` — extend ProjectMeta, add sync triggers | 30 min |
| 10 | `src/App.tsx` — wire in header components, File menu | 20 min |
| 11 | `src/main.tsx` — wrap with GoogleAuthProvider | 5 min |
| 12 | `src/components/ProjectManager.tsx` — Drive badges | 15 min |
| 13 | `src/components/DriveConflictModal.tsx` — conflicts | 30 min |
| 14 | `.env` — client ID | 1 min |
| 15 | Testing (manual, with two browser profiles) | 30 min |

**Total estimated: ~5 hours**

---

## Testing Plan

### Manual test scenarios:

1. **Fresh start:**
   - Clear localStorage, sign in → verify Drive projects are pulled down

2. **Local to Drive push:**
   - Create project while not signed in → sign in → verify project appears on Drive

3. **Drive to local pull:**
   - Sign in on device A, create project → sign in on device B → verify project appears

4. **Conflict:**
   - Device A edits project while offline → Device B edits same project → Device A comes online → verify conflict modal appears

5. **Offline resilience:**
   - Sign in, work, go offline → verify SaveIndicator works → come back online → verify sync resumes

6. **Sign-out persistence:**
   - Sign in, create projects → sign out → verify localStorage data intact → verify Drive data intact (next sign-in restores)

7. **Multiple Google accounts:**
   - Sign in with account A, create project → sign out → sign in with account B → verify account B sees only its own projects

8. **Quota edge case:**
   - (Mock by returning 403 from Drive) → verify error handling
