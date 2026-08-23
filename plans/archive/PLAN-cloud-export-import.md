# Fix Cloud Project Export & Import

## Problem

Cloud projects (Google Drive-backed) cannot be exported or imported. Both the File menu and Project Manager export buttons silently do nothing for cloud projects. The Project Manager's Import button also fails on the cloud tab.

### Root Causes

**Export — two blockers:**

1. `exportProjectFromStorage()` (`src/lib/utils.ts:147`) reads only from `localStorage`, but `flushCurrentProject()` (`src/store.tsx:1543`) explicitly skips cloud projects (`if (!meta || meta.driveFileId) return;`) — so cloud data never reaches localStorage.
2. `ProjectManager.tsx:273` has `if (p.driveFileId) return;` — an explicit guard that blocks cloud export entirely with no fallback.

**Import — two blockers:**

1. The `<input type="file">` element (`ProjectManager.tsx:392`) is rendered inside the `activeTab === 'local'` conditional branch. The cloud tab's Import button (`line 396-401`) calls `fileInputRef.current?.click()`, but `fileInputRef.current` is `null` when the cloud tab is active — so clicking does nothing.
2. `importProjectFromData()` (`store.tsx:1744`) always creates a **local** project. Even if the file input worked, imported projects would never be pushed to Drive.

---

## Changes

### 1. `src/lib/utils.ts` — Add `exportProjectData()` helper

Add a new function that accepts raw JSON string + title and performs the Blob/download. Refactor `exportProjectFromStorage()` to call it.

```ts
export function exportProjectData(data: string, title: string): void {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.lemon`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportProjectFromStorage(projectId: string, title: string): void {
  const key = `lemon_schedule_project_v1_${projectId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return;
  exportProjectData(stored, title);
}
```

### 2. `src/App.tsx` — Fix File menu export

**Line 48:** Add `exportProjectData` to the import from `./lib/utils`.

**Lines 496-498:** Change `handleExportJSON` to serialize from state directly:

```ts
const handleExportJSON = () => {
  exportProjectData(JSON.stringify(project), project.title || 'Export');
};
```

No loading state needed — `JSON.stringify` + Blob download is synchronous and instant.

### 3. `src/components/ProjectManager.tsx` — Fix export

#### 3a. Add `exportingId` state

Add next to `movingId` (line 308):

```ts
const [exportingId, setExportingId] = useState<string | null>(null);
```

#### 3b. Update `isBusy` (line 655)

Include `exportingId`:

```ts
const isBusy = openingId === p.id || deletingId === p.id || movingId === p.id || duplicatingId === p.id || exportingId === p.id;
```

#### 3c. Replace `handleExportJSON` (lines 271-275)

Remove the `if (p.driveFileId) return;` guard. New async handler:

```ts
const handleExportJSON = async (e: React.MouseEvent, p: ProjectMeta) => {
  e.stopPropagation();
  if (p.id === currentProjectId) {
    exportProjectData(JSON.stringify(state.present), p.title);
    return;
  }
  if (p.driveFileId) {
    try {
      setExportingId(p.id);
      const proj = await readDriveProject(auth.accessToken!, p.driveFileId);
      exportProjectData(JSON.stringify(proj), p.title);
    } catch (err: any) {
      dialog.alert({ title: 'Export Failed', message: err?.message || 'Could not load project from Drive.' });
    } finally {
      setExportingId(null);
    }
    return;
  }
  exportProjectFromStorage(p.id, p.title);
};
```

Update the import from `../lib/utils` to include `exportProjectData`.

#### 3d. Export button loading spinner (lines 736-743)

Show a `Loader2` spinner when exporting that specific project:

```tsx
<button
  onClick={e => handleExportJSON(e, p)}
  disabled={isBusy}
  className={`${PM_BTN_PAD} rounded-md transition-colors hover:bg-zinc-700 disabled:opacity-30`}
  title="Export"
>
  {exportingId === p.id
    ? <Loader2 className={`${PM_ICON} text-zinc-400 animate-spin`} />
    : <Save className={`${PM_ICON} text-zinc-400`} />}
</button>
```

### 4. `src/components/ProjectManager.tsx` — Fix import

#### 4a. Move file input outside conditional

Move `<input type="file" accept=".lemon,.json" ref={fileInputRef} onChange={handleImportJSON} className="hidden" />` from inside the `activeTab === 'local'` branch (line 392) to **after** the entire ternary (after the closing `)}` of the `{activeTab === 'local' ? ... : ...}` block, before `</ModalFooter>`). This ensures the file input is always in the DOM regardless of active tab.

#### 4b. Replace `handleImportJSON` (lines 248-269)

Modernize to use `file.text()` and push to Drive when on cloud tab:

```ts
const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setImporting(true);
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.scenes || !data.versions) {
      dialog.alert({ title: 'Invalid File', message: 'Missing scenes or versions.' });
      return;
    }
    const newId = importProjectFromData(data as Project);
    if (activeTab === 'cloud' && auth.isSignedIn && auth.accessToken) {
      const proj = loadProjectFromStorage(newId);
      if (proj) {
        const driveFileId = await pushProjectAndUpdateIndex(auth.accessToken, proj);
        updateProjectMeta(newId, { driveFileId });
      }
    }
    onClose?.();
  } catch {
    dialog.alert({ title: 'Invalid File', message: 'Could not read file.' });
  } finally {
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
};
```

The existing `importing` state + "Importing..." button text provides the loading indicator — no new state needed.

---

## Loading States Summary

| Action | Indicator | Mechanism |
|---|---|---|
| Export current project (File menu) | None needed | Synchronous — instant |
| Export current project from PM | None needed | Synchronous — instant |
| Export non-current local from PM | None needed | Synchronous — instant |
| Export non-current cloud from PM | `Loader2` spinner on card export button | `exportingId` state |
| Import to local (PM) | "Importing..." button text | `importing` state (existing) |
| Import to cloud (PM) | "Importing..." button text | `importing` state (existing) |

## No Changes Needed

- `exportBreakdownCSV` — already reads from `project` state, works for cloud
- File menu "Import Screenplay" — imports into the currently open project via state, works for cloud
