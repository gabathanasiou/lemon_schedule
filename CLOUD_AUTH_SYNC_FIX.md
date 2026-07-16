# Cloud Project Auth, Sync & Reconnection Fix

## Problem Summary

Cloud project users experience:
1. **Frequent sign-outs** — silent token refresh updates a `useRef` without triggering a React re-render, so consumers keep using the expired token until something else causes a re-render
2. **No reconnection after re-sign-in** — `driveSaveError` stays stuck `true`, no mechanism to clear it and force a fresh sync
3. **Offline mode blocks local projects** — `guardedDispatch` drops all actions when offline, even for non-cloud projects
4. **Silent refresh fails silently** — no `error_callback` on GIS token client, no user notification
5. **No catch-up sync** — when coming back online, no sync is attempted because `state.present` didn't change
6. **No heartbeat** — `navigator.onLine` is unreliable (MDN: "inherently unreliable")
7. **`retryDriveSync` uses stale token** — reads from context which may not have updated after refresh
8. **Dead code** — `DriveConflictModal.tsx` and `SyncStatusIcon.tsx` never imported

## Token Lifetime Reality

Google OAuth implicit flow access tokens live ~1 hour by design. This is a security feature — there is no way to extend this without a backend server using the code model with refresh tokens.

The correct approach is **reliable silent refresh** using `prompt: ''`. Google's docs confirm this means "the user will be prompted only the first time your app requests access." The `TokenResponse` includes `expires_in` (seconds) which we should use instead of a hardcoded 55-minute timer.

With these fixes, silent refresh will work indefinitely. Users will only need to re-auth if they close the tab (sessionStorage cleared) or Google revokes the session externally.

---

## Changes

### 1. Fix Stale Token Propagation

**File:** `src/lib/googleDriveAuth.tsx`

**Problem:** `accessTokenRef` is a `useRef`. Updating it does NOT trigger a re-render. The context value `accessToken: accessTokenRef.current` stays stale after a refresh until some other state change causes `GoogleAuthProviderInner` to re-render.

**Fix:** Add a `tokenVersion` state counter. Increment it whenever the token changes. Include it in the context value so consumers re-render when the token refreshes.

```tsx
const [tokenVersion, setTokenVersion] = useState(0);

// In login onSuccess:
setTokenVersion(v => v + 1);

// In doSilentRefresh callback (success branch):
setTokenVersion(v => v + 1);

// Context value:
value={{
  isSignedIn,
  user,
  accessToken: accessTokenRef.current,
  tokenVersion,  // forces re-render on token change
  // ...
}}
```

### 2. Use `expires_in` for Accurate Refresh Timing

**File:** `src/lib/googleDriveAuth.tsx`

**Problem:** Hardcoded 55-minute timer is a guess. Token response includes `expires_in` (seconds).

**Fix:** Capture `expires_in` from the response and schedule refresh 5 minutes before actual expiry.

```tsx
const scheduleTokenRefresh = useCallback((token: string, expiresIn?: number) => {
  if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  const ttl = expiresIn ?? 3600;
  const delay = Math.max((ttl - 300) * 1000, 30_000);
  refreshTimerRef.current = setTimeout(() => {
    doSilentRefresh();
  }, delay);
}, []);

// In login onSuccess:
scheduleTokenRefresh(tokenResponse.access_token, tokenResponse.expires_in);

// In doSilentRefresh callback:
scheduleTokenRefresh(response.access_token, response.expires_in);
```

### 3. Add `error_callback` to GIS Token Client

**File:** `src/lib/googleDriveAuth.tsx`

**Problem:** `initTokenClient` has no `error_callback`. Network errors, popup failures, or popup blocks silently sign the user out.

**Fix:** Add `error_callback` that sets `needsReauth` instead of signing out.

```tsx
const client = gis.initTokenClient({
  client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  scope: 'https://www.googleapis.com/auth/drive.appdata',
  callback: (response: any) => { ... },
  error_callback: (error: any) => {
    console.warn('GIS token client error:', error?.type);
    setNeedsReauth(true);
  },
});
```

### 4. `needsReauth` State Instead of Silent Sign-Out

**File:** `src/lib/googleDriveAuth.tsx`

**Problem:** When silent refresh fails (no `access_token` in response), the app immediately signs the user out with no notification. The user only discovers this when they try to save and see "Sync failed."

**Fix:** Add `needsReauth` boolean to context. When silent refresh fails, set `needsReauth = true` but keep `isSignedIn` as-is for display purposes. The SaveIndicator shows "Sign in to sync" instead of a generic sync error. When the user signs in again, clear `needsReauth`.

```tsx
const [needsReauth, setNeedsReauth] = useState(false);

// In doSilentRefresh callback (failure branch):
// Don't sign out — just flag that re-auth is needed
setNeedsReauth(true);

// In login onSuccess:
setNeedsReauth(false);

// In signOut:
setNeedsReauth(false);

// Context value includes needsReauth
```

Also update the `GoogleAuthContextValue` interface:
```tsx
interface GoogleAuthContextValue {
  // ... existing fields
  needsReauth: boolean;
  tokenVersion: number;
}
```

### 5. Auto-Retry Save After 401

**File:** `src/store.tsx` (save effect, ~line 1351)

**Problem:** On 401, `auth.refreshToken()` is called but the save is never retried. User must manually click retry in the SaveIndicator.

**Fix:** After calling `refreshToken()`, wait 2 seconds (for the new token to propagate through sessionStorage), then retry the save once.

```tsx
} catch (err: any) {
  console.error('Drive save failed:', err);
  if (err?.message?.includes('401')) {
    auth.refreshToken();
    setTimeout(async () => {
      try {
        const token = sessionStorage.getItem('lemon_google_token');
        if (token && meta?.driveFileId) {
          await pushProjectAndUpdateIndex(token, project, meta.driveFileId);
          setDriveSaveError(false);
        }
      } catch {
        // Give up — user can manually retry
      }
    }, 2000);
  }
  setDriveSaveError(true);
}
```

### 6. Clear Errors and Force Sync on Re-Authentication

**File:** `src/store.tsx`

**Problem:** After re-signing in, `driveSaveError` stays `true`. The main save effect re-fires (since `auth.isSignedIn`/`auth.accessToken` are in its deps) but the error state isn't cleared.

**Fix:** Add a separate effect watching `auth.isSignedIn`. When it transitions `false → true` and the current project is a cloud project, clear `driveSaveError`. The main save effect will handle the actual sync.

```tsx
const prevSignedInRef = useRef(auth.isSignedIn);
useEffect(() => {
  if (auth.isSignedIn && !prevSignedInRef.current) {
    const meta = projectListRef.current.find(p => p.id === currentProjectId);
    if (meta?.driveFileId) {
      setDriveSaveError(false);
    }
  }
  prevSignedInRef.current = auth.isSignedIn;
}, [auth.isSignedIn, currentProjectId]);
```

### 7. Don't Block Local Project Editing When Offline

**File:** `src/store.tsx` (~line 1214)

**Problem:** `guardedDispatch` blocks ALL actions when `isOnline === false`, even for local-only projects that save to localStorage and could function fine offline.

**Fix:** Only block dispatches when offline AND the current project is a cloud project (has `driveFileId`). Use a ref for `projectList` to avoid re-creating the callback on every project list change.

```tsx
const projectListRef = useRef(projectList);
projectListRef.current = projectList;

const guardedDispatch = useCallback((action: Action) => {
  if (!isOnline && action.type !== 'LOAD') {
    const meta = projectListRef.current.find(p => p.id === currentProjectId);
    if (meta?.driveFileId) return;
  }
  dispatch(action);
}, [isOnline, currentProjectId]);
```

### 8. Catch-Up Sync on Reconnection

**File:** `src/store.tsx`

**Problem:** When coming back online, the save effect only fires if `state.present` changed. But since editing was blocked while offline, `state.present` never changed, so no sync is attempted. `driveSaveError` stays stuck.

**Fix:** When `isOnline` transitions `false → true` for a cloud project with `driveSaveError`, trigger an immediate save attempt by reading from `sessionStorage` (most up-to-date token source).

```tsx
const prevOnlineRef = useRef(isOnline);
useEffect(() => {
  if (isOnline && !prevOnlineRef.current) {
    const meta = projectListRef.current.find(p => p.id === currentProjectId);
    if (meta?.driveFileId && driveSaveError) {
      const token = sessionStorage.getItem('lemon_google_token');
      if (token) {
        pushProjectAndUpdateIndex(token, { ...presentRef.current }, meta.driveFileId)
          .then(() => setDriveSaveError(false))
          .catch(() => {});
      }
    }
  }
  prevOnlineRef.current = isOnline;
}, [isOnline, currentProjectId, driveSaveError]);
```

### 9. Heartbeat: Piggyback + Conditional Ping

**File:** `src/store.tsx`

**Problem:** `navigator.onLine` is unreliable — it reports `true` when connected to a LAN with no internet (captive portals, router without upstream, DNS failures). The app thinks it's online, save attempts fail silently, and the user sees "Sync failed" with no explanation.

**Fix:** Two-layer approach:

**Layer 1 — Save-result piggyback (zero extra requests):**
- Save succeeds → we're truly online (proof: Google responded)
- Save fails with network error (not 401, not quota) → mark as truly offline via a new `realOnline` state

**Layer 2 — Conditional HEAD ping (only when uncertain):**
- When `navigator.onLine` is `true` but the last save failed with a network error, start a 30s interval pinging `https://www.googleapis.com/drive/v3/about?fields=kind` (HEAD request, ~0 bytes body)
- When a ping succeeds, mark as online and stop the interval
- This means: no pings in the common case, only when we're genuinely unsure

```tsx
const [realOnline, setRealOnline] = useState(navigator.onLine);
const lastSaveFailedRef = useRef(false);

// In the save effect catch block (non-401 network errors):
lastSaveFailedRef.current = true;
setRealOnline(false);

// In the save effect success path:
lastSaveFailedRef.current = false;
setRealOnline(true);

// Conditional ping effect:
useEffect(() => {
  if (!navigator.onLine || !lastSaveFailedRef.current) return;
  if (realOnline) return;

  const ping = async () => {
    try {
      const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=kind', {
        method: 'HEAD',
      });
      if (res.ok || res.status === 401 || res.status === 403) {
        setRealOnline(true);
        lastSaveFailedRef.current = false;
      }
    } catch {
      // Still offline
    }
  };

  const interval = setInterval(ping, 30_000);
  return () => clearInterval(interval);
}, [realOnline]);

// Use realOnline instead of isOnline for guardedDispatch and readOnly
```

Note: `401`/`403` responses from Google mean we DO have internet (just auth issues). Only network-level failures (catch branch) mean we're truly offline.

### 10. Fix `retryDriveSync` Stale Token

**File:** `src/store.tsx` (~line 1638)

**Problem:** `retryDriveSync` reads `auth.accessToken` from context, which may not have updated after a refresh (same stale-ref bug as Issue #1).

**Fix:** Read the token directly from `sessionStorage` as a fallback.

```tsx
const retryDriveSync = useCallback(async () => {
  if (!currentProjectId) return;
  const meta = projectList.find(p => p.id === currentProjectId);
  if (!meta?.driveFileId) return;
  const token = sessionStorage.getItem('lemon_google_token');
  if (!token) return;
  try {
    await pushProjectAndUpdateIndex(token, { ...presentRef.current }, meta.driveFileId);
    setDriveSaveError(false);
  } catch (err: any) {
    if (err?.message?.includes('401')) {
      auth.refreshToken();
    }
    setDriveSaveError(true);
  }
}, [currentProjectId, projectList]);
```

### 11. Update SaveIndicator for `needsReauth` State

**File:** `src/components/SaveIndicator.tsx`

**Problem:** SaveIndicator shows a generic "Sync failed — click to retry" when the real issue is expired auth. The user clicks retry, it fails again (no token), creating a frustrating loop.

**Fix:** When `needsReauth` is true (from auth context), show "Sign in to sync — click to re-authenticate" that calls `auth.signIn()` instead of `retryDriveSync()`.

```tsx
import { useGoogleAuth } from '../lib/googleDriveAuth';

// Inside SaveIndicator component:
const auth = useGoogleAuth();

if (isCloudProject && auth.needsReauth) {
  return (
    <div className="relative" ...>
      <button
        onClick={() => auth.signIn()}
        className="cursor-pointer"
        title="Sign in to sync — click to re-authenticate"
      >
        <CloudOff className="w-3.5 h-3.5 text-amber-400" />
      </button>
      {showTooltip && (
        <div className="absolute top-full ...">
          Sign in to resume sync
        </div>
      )}
    </div>
  );
}
```

### 12. Remove Dead Code

**Files to delete:**
- `src/components/DriveConflictModal.tsx` — never imported or used anywhere
- `src/components/SyncStatusIcon.tsx` — never imported or used anywhere

---

## Files Summary

| File | Action | Changes |
|---|---|---|
| `src/lib/googleDriveAuth.tsx` | Modified | 1, 2, 3, 4 |
| `src/store.tsx` | Modified | 5, 6, 7, 8, 9, 10 |
| `src/components/SaveIndicator.tsx` | Modified | 11 |
| `src/components/DriveConflictModal.tsx` | Deleted | 12 |
| `src/components/SyncStatusIcon.tsx` | Deleted | 12 |

## Issue → Change Mapping

| Issue | Change(s) |
|---|---|
| Frequent sign-outs (stale token) | 1 |
| Hardcoded 55-min timer | 2 |
| Silent refresh no error callback | 3 |
| Silent sign-out without notification | 4 |
| No retry after 401 | 5 |
| No reconnection after re-sign-in | 6 |
| Offline blocks local editing | 7 |
| No catch-up sync | 8 |
| No heartbeat / unreliable navigator.onLine | 9 |
| retryDriveSync stale token | 10 |
| Generic "sync failed" for auth issues | 11 |
| Dead code | 12 |

## Verification

1. `npm run lint` — typecheck passes
2. `npm run build` — production build succeeds
3. **Auth flow:** Sign in to a cloud project, edit, verify sync works
4. **Token refresh:** Wait for the refresh timer (or temporarily reduce to 2 min for testing), verify no sign-out occurs
5. **Local offline editing:** Go offline (browser DevTools → Network → Offline), verify local projects remain editable while cloud projects show read-only
6. **Reconnection:** Come back online, verify cloud project auto-reconnects and clears sync error
7. **Silent refresh failure:** Revoke Google access externally (myaccount.google.com → Security → Third-party apps), verify "Sign in to resume sync" prompt appears instead of silent sign-out
8. **Captive portal scenario:** Connect to a network with no internet, verify the heartbeat detects it and shows offline state
9. **Retry with fresh token:** Trigger a 401 (e.g., by manually invalidating the token), verify auto-retry succeeds without manual intervention

## Security Notes

- Access tokens remain in `sessionStorage` only (cleared on tab close) — no `localStorage`
- `needsReauth` does not expose the token — it's just a boolean flag
- The heartbeat `HEAD` request includes no auth headers — it only checks network reachability
- No secrets are logged or exposed in error messages
- `tokenVersion` in context is just a counter — no sensitive data
