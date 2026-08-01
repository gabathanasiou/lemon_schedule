# Cloud Project Connection Loss: Offline Detection, Auth Loss, and Banner Differentiation

## Problem

Cloud projects have three distinct connection loss scenarios, but the app only handles one (API errors in the catch block). The other two fail silently with no user feedback.

| # | Scenario | What happens today |
|---|---|---|
| 1 | Browser goes offline | Save pipeline skips Drive save silently. No banner, no editing block. Edits exist only in memory and are lost on page refresh. |
| 2 | User signs out of Google Drive | Same as above. `auth.isSignedIn` becomes false but `realOnline` stays true. |
| 3 | Token invalidated (silent refresh fails) | `needsReauth` becomes true but `store.tsx` never reads it. SaveIndicator shows a tiny amber icon but no banner and editing is not blocked. Every save silently fails with 401. |
| 4 | API error (500, timeout) | Already handled. `realOnline = false`, red banner, editing blocked. Works correctly. |

Additionally:
- The File menu "Sign out" does not show the user's name because `fetchUserInfo` is never called during silent token refresh.
- Signing out from the File menu while editing a cloud project should close the project and open the Project Manager.

## Cases and Expected Behavior

| Case | Trigger | Banner | Button | Recovery |
|---|---|---|---|---|
| Browser offline | `navigator.onLine = false` | Red: "No Internet Connection - editing is disabled" | Retry Connection | Browser `online` event triggers catch-up sync |
| User signs out | `auth.isSignedIn = false` | Amber: "Signed out of Google Drive - editing is disabled" | Sign in | Sign-in triggers save pipeline recovery |
| Session expired | `auth.needsReauth = true` | Amber: "Session expired - sign in to resume editing" | Sign in | Sign-in triggers save pipeline recovery |
| API error (existing) | Drive save catch block | Red: "No Internet Connection - editing is disabled" | Retry Connection | Heartbeat ping every 30s |
| Connection restored | `realOnline` goes back to true | Green: "Connection restored" (5s) | None | Already works |

When the user clicks "Sign out" in the File menu while editing a cloud project: sign out, close the project (`currentProjectId = null`), and the app renders `<ProjectManager />` (the existing `noProject` path at `App.tsx:482`).

---

## Changes

### 1. `src/store.tsx` - Save pipeline else branch

**Location:** Save pipeline effect, cloud path (~line 1355-1398)

When the cloud save condition at line 1357 fails (for any reason: offline, signed out, no token), set error state so the offline UI activates.

```tsx
if (isCloud) {
  if (skipSaveRef.current) { skipSaveRef.current = false; return; }
  if (auth.isSignedIn && auth.accessToken && isOnline && meta?.driveFileId) {
    // ... existing Drive save logic (unchanged) ...
  } else {
    lastSaveFailedRef.current = true;
    setRealOnline(false);
    setDriveSaveError(true);
  }
}
```

This catches cases 1 (offline) and 2 (signed out) when an edit triggers the save pipeline.

### 2. `src/store.tsx` - Sign-out detection effect

**Location:** Extend the existing sign-in/out effect (~line 1429-1439)

When `auth.isSignedIn` goes from true to false while a cloud project is open, block editing immediately (even without edits triggering the save pipeline).

```tsx
const prevSignedInRef = useRef(auth.isSignedIn);
useEffect(() => {
  const meta = projectListRef.current.find(p => p.id === currentProjectId);
  if (auth.isSignedIn && !prevSignedInRef.current) {
    if (meta?.driveFileId) {
      setDriveSaveError(false);
    }
  } else if (!auth.isSignedIn && prevSignedInRef.current) {
    if (meta?.driveFileId) {
      setRealOnline(false);
      setDriveSaveError(true);
    }
  }
  prevSignedInRef.current = auth.isSignedIn;
}, [auth.isSignedIn, currentProjectId]);
```

### 3. `src/store.tsx` - needsReauth detection effect

**Location:** New effect, after the sign-in/out effect (~line 1439)

When `needsReauth` becomes true (silent refresh failed, token is known invalid), block editing. When it clears, recover.

```tsx
const prevNeedsReauthRef = useRef(auth.needsReauth);
useEffect(() => {
  const meta = projectListRef.current.find(p => p.id === currentProjectId);
  if (!meta?.driveFileId) return;
  if (auth.needsReauth && !prevNeedsReauthRef.current) {
    setRealOnline(false);
    setDriveSaveError(true);
  } else if (!auth.needsReauth && prevNeedsReauthRef.current) {
    setDriveSaveError(false);
  }
  prevNeedsReauthRef.current = auth.needsReauth;
}, [auth.needsReauth, currentProjectId]);
```

### 4. `src/store.tsx` - Expose `closeProject`

**Location:** Add to `ProjectContextType` interface (~line 1167) and context value (~line 1765)

Add a `closeProject` function that sets `currentProjectId` to null. This is used by the File menu sign-out handler.

```tsx
const closeProject = useCallback(() => {
  setCurrentProjectId(null);
}, []);
```

Add to interface:
```tsx
closeProject: () => void;
```

Add to context value:
```tsx
closeProject,
```

### 5. `src/App.tsx` - Differentiate offline banner

**Location:** Offline banner (~line 532-542)

Check the cause of `readOnly` and show different messaging:

- If `isCloudProject` AND (`!driveCtx.isSignedIn` OR `driveCtx.needsReauth`): amber banner with "Sign in" button
- Otherwise: red banner with "Retry Connection" button (existing)

```tsx
{readOnly && (() => {
  const isAuthIssue = isCloudProject && (!driveCtx.isSignedIn || driveCtx.needsReauth);
  return (
    <div className={`${isAuthIssue ? 'bg-amber-600' : 'bg-red-600'} text-white px-4 py-1.5 flex items-center justify-between text-xs shrink-0 print:hidden`}>
      <span className="font-medium">
        {isAuthIssue
          ? (driveCtx.needsReauth ? 'Session expired - sign in to resume editing' : 'Signed out of Google Drive - editing is disabled')
          : 'No Internet Connection - editing is disabled'}
      </span>
      {isAuthIssue ? (
        <button
          onClick={() => driveCtx.signIn()}
          className="ml-3 px-2.5 py-1 rounded bg-amber-700 hover:bg-amber-500 transition-colors font-semibold"
        >
          Sign in
        </button>
      ) : (
        <button
          onClick={handleRetryConnection}
          className="ml-3 px-2.5 py-1 rounded bg-red-700 hover:bg-red-500 transition-colors font-semibold"
        >
          Retry Connection
        </button>
      )}
    </div>
  );
})()}
```

### 6. `src/App.tsx` - Differentiate offline modal

**Location:** Offline modal (~line 543-560)

Same cause check. Auth issue gets different title, body text, and a Sign in button instead of OK.

```tsx
{showOfflineModal && (() => {
  const isAuthIssue = isCloudProject && (!driveCtx.isSignedIn || driveCtx.needsReauth);
  return (
    <Modal open={showOfflineModal} onClose={() => setShowOfflineModal(false)}
      title={isAuthIssue ? 'Signed out' : "You're offline"}
      icon={isAuthIssue ? <CloudOff className="w-5 h-5 text-amber-400" /> : <WifiOff className="w-5 h-5 text-zinc-400" />}
      width="max-w-md"
      footer={
        <ModalFooter>
          <button
            onClick={() => { setShowOfflineModal(false); if (isAuthIssue) driveCtx.signIn(); }}
            className="px-6 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-colors"
          >
            {isAuthIssue ? 'Sign in' : 'OK'}
          </button>
        </ModalFooter>
      }
    >
      <div className="px-5 py-3 text-zinc-400 text-xs border-b border-zinc-800">
        {isAuthIssue
          ? 'You have been signed out of Google Drive. Sign in again to resume editing your cloud project.'
          : 'Lemon Schedule requires an internet connection. You can continue to browse your project, but all editing controls are currently disabled.'}
      </div>
    </Modal>
  );
})()}
```

Add `CloudOff` to the lucide-react import in App.tsx.

### 7. `src/App.tsx` - File menu sign-out: close project and open Project Manager

**Location:** File menu sign-out handler (~line 617)

When signing out while editing a cloud project, call `closeProject()` which sets `currentProjectId = null`. The app then renders `<ProjectManager />` via the existing `noProject` path at line 482.

```tsx
<DropdownItem onClick={() => {
  setShowFileMenu(false);
  if (isCloudProject) closeProject();
  driveCtx.signOut();
}} icon={<LogOut className="w-3.5 h-3.5" />}>
  Sign out{driveCtx.user ? ` (${driveCtx.user.name})` : ''}
</DropdownItem>
```

Add `closeProject` to the destructured values from `useProject()` at line 64.

Note: `closeProject()` must be called BEFORE `signOut()` so that `isCloudProject` is still true when we check it. After `signOut()`, `auth.isSignedIn` is false but the project meta still has `driveFileId`, so `isCloudProject` would still be true. Either order works, but calling `closeProject()` first is cleaner because it unmounts the project view before clearing auth state.

### 8. `src/lib/googleDriveAuth.tsx` - Fix missing user name in File menu

**Location:** Move `fetchUserInfo` above `doSilentRefresh` and call it on silent refresh success.

**Step A:** Move `fetchUserInfo` (lines 84-98) above `doSilentRefresh` (lines 50-73) so it is accessible in `doSilentRefresh`'s closure.

**Step B:** Add `fetchUserInfo(response.access_token)` to the silent refresh success callback:

```tsx
callback: (response: any) => {
  if (response.access_token) {
    accessTokenRef.current = response.access_token;
    sessionStorage.setItem(TOKEN_KEY, response.access_token);
    setNeedsReauth(false);
    setTokenVersion(v => v + 1);
    fetchUserInfo(response.access_token);
    scheduleTokenRefresh(response.access_token, response.expires_in);
  } else {
    setNeedsReauth(true);
  }
},
```

**Step C:** Update `doSilentRefresh` deps to `[fetchUserInfo]`. Since `fetchUserInfo` is stable (empty deps `useCallback`), `doSilentRefresh` remains stable too, so `scheduleTokenRefresh` (which depends on `doSilentRefresh`) is unaffected.

### 9. `src/components/SaveIndicator.tsx` - Show offline state for cloud projects when browser is offline

**Location:** `driveSaveError` branch (~line 133-158)

When `driveSaveError` is true AND the browser is offline, show a `WifiOff` icon with "Working offline" tooltip instead of the red `CloudOff` "Sync failed" state. This provides correct visual feedback in the header icon alongside the full banner.

```tsx
if (isCloudProject && driveSaveError) {
  if (!navigator.onLine) {
    return (
      <div className="relative"
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
  // ... existing red CloudOff "Sync failed - click to retry" ...
}
```

---

## File Summary

| File | Changes |
|---|---|
| `src/store.tsx` | Save pipeline else branch, sign-out effect, needsReauth effect, expose `closeProject` |
| `src/App.tsx` | Differentiate banner/modal for auth vs offline, File menu sign-out closes project, add `CloudOff` import |
| `src/lib/googleDriveAuth.tsx` | Move `fetchUserInfo`, call it on silent refresh success |
| `src/components/SaveIndicator.tsx` | Show `WifiOff` when offline + `driveSaveError` |

## Recovery Flows

**Browser goes offline then comes back:**
1. `isOnline = false` -> save pipeline else branch -> `realOnline = false` -> red banner + modal
2. `isOnline = true` (browser `online` event) -> save pipeline effect re-fires (`isOnline` in deps) -> Drive save succeeds -> `setRealOnline(true)` -> `readOnly = false` -> green "Connection restored" banner

**User signs out then signs back in:**
1. `auth.isSignedIn = false` -> sign-out effect -> `realOnline = false` -> amber banner + modal (or project closed if from File menu)
2. User clicks "Sign in" -> `auth.isSignedIn = true` -> sign-in effect clears `driveSaveError` -> save pipeline re-fires (`auth.accessToken` changed) -> Drive save succeeds -> `setRealOnline(true)` -> green banner

**Token invalidated then user re-authenticates:**
1. Silent refresh fails -> `needsReauth = true` -> needsReauth effect -> `realOnline = false` -> amber banner + modal
2. User clicks "Sign in" -> `auth.isSignedIn` stays true, new token obtained -> `needsReauth = false` -> needsReauth effect clears `driveSaveError` -> save pipeline re-fires -> recovery

**File menu sign out while editing cloud project:**
1. `closeProject()` -> `currentProjectId = null` -> app renders `<ProjectManager />`
2. `driveCtx.signOut()` -> clears auth state
3. User sees Project Manager, can pick a local project or sign in again
