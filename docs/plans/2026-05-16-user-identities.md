# User Identities Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users select which git identities (name/email pairs) belong to them, so heatmap, commits, and daily reports reflect only their work.

**Architecture:** New `user_identities` SQLite table + two new IPC channels (`git:get-my-identities`, `git:set-my-identities`). Existing `git.heatmap` and `dailyReport.fetch` gain multi-author support. Dashboard replaces the single-author dropdown with a capsule-badge selector Sheet.

**Tech Stack:** SQLite (better-sqlite3), Electron IPC, React (Sheet + Badge components), git CLI `--author` flag (supports multiple `--author` flags for OR logic).

---

### Task 1: Add `user_identities` table migration

**Files:**
- Modify: `src/main/database/schema.ts` (append new migration at end of `runMigrations`)

**Step 1: Add migration**

Append to `runMigrations()` in `src/main/database/schema.ts`, after the last migration block:

```typescript
// Migration: add user_identities table
const migration12Name = 'add-user-identities';
const applied12 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration12Name);
if (!applied12) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      UNIQUE(name, email)
    );
  `);
  db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration12Name);
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit` — should compile without errors.

**Step 3: Commit**

```bash
git add src/main/database/schema.ts
git commit -m "feat: add user_identities table migration"
```

---

### Task 2: Add IPC channels for identity CRUD

**Files:**
- Modify: `src/shared/ipc-channels.ts` — add two new channel names
- Modify: `src/main/preload.ts` — add `getMyIdentities` and `setMyIdentities` to git API + update ElectronAPI type
- Modify: `src/main/main.ts` — add IPC handlers using SQLite directly

**Step 1: Add channel names**

In `src/shared/ipc-channels.ts`, add after the existing `GIT_` entries:

```typescript
GIT_GET_MY_IDENTITIES = 'git:get-my-identities',
GIT_SET_MY_IDENTITIES = 'git:set-my-identities',
```

**Step 2: Add preload bindings**

In `src/main/preload.ts`, add to the `git` object (after `clearCache`):

```typescript
getMyIdentities: () => ipcRenderer.invoke(IPCChannels.GIT_GET_MY_IDENTITIES),
setMyIdentities: (identities: { name: string; email: string }[]) =>
  ipcRenderer.invoke(IPCChannels.GIT_SET_MY_IDENTITIES, identities),
```

In the `ElectronAPI` interface's `git` section, update the type:

```typescript
git: {
  scanRepos: () => Promise<{ name: string; path: string }[]>;
  getUser: () => Promise<{ name: string; email: string }>;
  getAllAuthors: () => Promise<{ name: string; email: string }[]>;
  heatmap: (author?: string) => Promise<{
    data: Record<string, number>;
    stats: {
      totalCommits: number;
      longestStreak: number;
      currentStreak: number;
      mostActiveMonth: string;
      mostActiveDay: string;
    };
  }>;
  clearCache: () => Promise<{ success: boolean }>;
  getMyIdentities: () => Promise<{ name: string; email: string }[]>;
  setMyIdentities: (identities: { name: string; email: string }[]) => Promise<void>;
};
```

**Step 3: Add IPC handlers in main.ts**

In `src/main/main.ts`, add after the `GIT_CLEAR_CACHE` handler (around line 679), inside the main function body where other git handlers live. Import `getDatabase` at the top if not already imported:

```typescript
import { getDatabase } from './database/connection';
```

Then add the handlers:

```typescript
// Get user's selected identities
ipcMain.handle(IPCChannels.GIT_GET_MY_IDENTITIES, () => {
  const db = getDatabase();
  const rows = db.prepare('SELECT name, email FROM user_identities').all() as { name: string; email: string }[];
  return rows;
});

// Set user's selected identities (replaces all)
ipcMain.handle(IPCChannels.GIT_SET_MY_IDENTITIES, (_, identities: { name: string; email: string }[]) => {
  const db = getDatabase();
  const insert = db.prepare('INSERT OR IGNORE INTO user_identities (name, email) VALUES (?, ?)');
  db.transaction(() => {
    db.exec('DELETE FROM user_identities');
    for (const id of identities) {
      insert.run(id.name, id.email);
    }
  })();
});
```

**Step 4: Verify**

Run: `npx tsc --noEmit` — should compile without errors.

**Step 5: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/preload.ts src/main/main.ts
git commit -m "feat: add IPC channels for user identity CRUD"
```

---

### Task 3: Make `git.heatmap` support multi-author filtering

**Files:**
- Modify: `src/main/main.ts` — update the `GIT_HEATMAP` handler signature and git command

**Step 1: Update handler signature**

Change the `GIT_HEATMAP` handler (around line 537) from accepting `author?: string` to `authors?: string[]`:

```typescript
ipcMain.handle(IPCChannels.GIT_HEATMAP, async (_event, authors?: string[]) => {
```

**Step 2: Build multi-author git command**

Replace the single-author logic (lines ~582-596):

```typescript
    // Build author flags for git log (multiple --author flags = OR logic)
    let authorFlags = '';
    if (authors && authors.length > 0) {
      authorFlags = authors.map(a => `--author="${a}"`).join(' ');
    } else {
      // Fallback: try git config user.name
      try {
        const name = await execAsync('git config user.name');
        const trimmed = name.trim();
        if (trimmed) {
          authorFlags = `--author="${trimmed}"`;
        }
      } catch { /* no git user configured */ }
    }
```

Then in the loop, replace the command construction:

```typescript
        const cmd = authorFlags
          ? `git -C "${repo.path}" log --all ${authorFlags} --since="1 year ago" --format=%ad --date=short`
          : `git -C "${repo.path}" log --all --since="1 year ago" --format=%ad --date=short`;
```

**Step 3: Update cache condition**

The cache should only be used when no author filter is applied:

```typescript
    if (!authors || authors.length === 0) {
      const cachedHeatmap = GitCacheManager.loadHeatmapCache();
      if (cachedHeatmap) { ... }
    }
```

And similarly for saving cache:

```typescript
    if (!authors || authors.length === 0) {
      GitCacheManager.saveHeatmapCache(heatmapData);
    }
```

**Step 4: Update preload type**

In `src/main/preload.ts`, update the heatmap call signature:

```typescript
heatmap: (authors?: string[]) => ipcRenderer.invoke(IPCChannels.GIT_HEATMAP, authors),
```

And in ElectronAPI:

```typescript
heatmap: (authors?: string[]) => Promise<{ ... }>;
```

**Step 5: Verify**

Run: `npx tsc --noEmit`

**Step 6: Commit**

```bash
git add src/main/main.ts src/main/preload.ts
git commit -m "feat: heatmap supports multi-author filtering"
```

---

### Task 4: Make `dailyReport.fetch` support multi-author filtering

**Files:**
- Modify: `src/main/main.ts` — update the `DAILY_REPORT_FETCH` handler to pass `authors[]` to the daily report tool/Python script

**Step 1: Understand current flow**

The `DAILY_REPORT_FETCH` handler accepts `params` which includes `author?: string`. The daily report is generated by `src/main/tools/dailyReportTool.ts` which calls `scripts/generate_daily_report.py`.

**Step 2: Update params handling**

In the `DAILY_REPORT_FETCH` handler and in `src/main/tools/dailyReportTool.ts`, change `author` param to accept `authors: string[]`. The Python script already supports multiple `--author` flags (since `argparse` with `action='append'` handles this).

If the Python script uses a single `--author`, update it to use `nargs='+'` or `action='append'`.

**Step 3: Verify**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/main/main.ts src/main/tools/dailyReportTool.ts scripts/generate_daily_report.py
git commit -m "feat: daily report supports multi-author filtering"
```

---

### Task 5: Add Identity Selector Sheet UI to Dashboard

**Files:**
- Modify: `src/renderer/components/Dashboard.tsx` — add new state, Sheet, and replace old dropdown

**Step 1: Add new state variables**

After the existing state declarations (around line 94), add:

```typescript
const [myIdentities, setMyIdentities] = useState<{ name: string; email: string }[]>([]);
const [identitySheetOpen, setIdentitySheetOpen] = useState(false);
const [selectedIdentities, setSelectedIdentities] = useState<Set<string>>(new Set());
```

**Step 2: Load saved identities on mount**

Add a function and useEffect:

```typescript
const loadMyIdentities = useCallback(async () => {
  const identities = await window.electronAPI.git.getMyIdentities();
  setMyIdentities(identities);
  setSelectedIdentities(new Set(identities.map(i => `${i.name}|${i.email}`)));
}, []);
```

Call `loadMyIdentities()` in the initial useEffect (alongside `loadWorkPaths`).

**Step 3: Replace author dropdown with identity selector trigger**

Remove the `Select` block for git author (lines ~512-534). Replace with identity chips + "Manage" button:

```tsx
{/* My Identities */}
{gitAuthors.length > 0 && (
  <div className="pt-3 border-t border-[hsl(var(--border))]">
    <div className="flex items-center gap-2 mb-2">
      <User size={14} className="text-muted-foreground" />
      <span className="text-sm font-medium text-secondary-foreground">
        My Identities
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-6 text-xs"
        onClick={() => {
          setSelectedIdentities(new Set(myIdentities.map(i => `${i.name}|${i.email}`)));
          setIdentitySheetOpen(true);
        }}
      >
        Manage
      </Button>
    </div>
    {myIdentities.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {myIdentities.map((id, i) => (
          <Badge key={i} variant="secondary" className="text-xs">
            {id.name}
          </Badge>
        ))}
      </div>
    ) : (
      <div className="text-xs text-muted-foreground">
        Click "Manage" to select your identities
      </div>
    )}
  </div>
)}
```

**Step 4: Add Identity Selector Sheet**

After the existing Commit Detail Sheet, add:

```tsx
{/* Identity Selector Sheet */}
<Sheet open={identitySheetOpen} onOpenChange={setIdentitySheetOpen}>
  <SheetContent side="right" className="w-full sm:max-w-md">
    <SheetHeader>
      <SheetTitle className="flex items-center gap-2">
        <User size={18} />
        Select Your Identities
      </SheetTitle>
      <SheetDescription>
        Choose which git identities belong to you. This affects heatmap, commits, and reports.
      </SheetDescription>
    </SheetHeader>
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        {gitAuthors.map((author, i) => {
          const key = `${author.name}|${author.email}`;
          const isSelected = selectedIdentities.has(key);
          return (
            <button
              key={i}
              onClick={() => {
                setSelectedIdentities(prev => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors border',
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-[hsl(var(--border))] hover:border-primary/50'
              )}
            >
              <span className="font-medium">{author.name}</span>
              {author.email && <span className="text-xs opacity-70">({author.email})</span>}
            </button>
          );
        })}
      </div>
    </div>
    <div className="mt-6 flex justify-end">
      <Button
        onClick={async () => {
          const identities = gitAuthors.filter(a => selectedIdentities.has(`${a.name}|${a.email}`));
          await window.electronAPI.git.setMyIdentities(identities);
          setMyIdentities(identities);
          setIdentitySheetOpen(false);
          // Refresh data with new identities
          cachedStatsData = null;
          cachedHeatmapData = null;
          fetchStats(true);
          fetchHeatmap(true);
        }}
        disabled={selectedIdentities.size === 0}
      >
        Confirm ({selectedIdentities.size} selected)
      </Button>
    </div>
  </SheetContent>
</Sheet>
```

**Step 5: Auto-open sheet when workPaths changes and identities not set**

In the useEffect that fires when `workPaths` changes (line ~207), after loading authors:

```typescript
window.electronAPI.git.getAllAuthors().then(async authors => {
  setGitAuthors(authors || []);
  const savedIdentities = await window.electronAPI.git.getMyIdentities();
  if (savedIdentities.length === 0 && authors.length > 1) {
    // No identities saved yet, and there are multiple authors — prompt user
    setIdentitySheetOpen(true);
  }
}).catch(() => {});
```

**Step 6: Update data-fetching to use multi-author**

Replace `selectedAuthor` usage in `buildReportParams` and `fetchHeatmap`:

```typescript
// In buildReportParams:
if (myIdentities.length > 0) {
  params.authors = myIdentities.map(i => i.name);
}

// In fetchHeatmap call:
const authorNames = myIdentities.length > 0 ? myIdentities.map(i => i.name) : undefined;
heatmapFetchPromise = window.electronAPI.git.heatmap(authorNames)
```

**Step 7: Remove old `selectedAuthor` state**

Delete: `const [selectedAuthor, setSelectedAuthor] = useState<string>('__all__');`
Delete: all references to `selectedAuthor`.

**Step 8: Update User Info Card**

Replace the single `gitUser` card with a multi-identity display. If `myIdentities` is set, show those; otherwise show `gitUser` as before.

**Step 9: Verify**

Run: `npx tsc --noEmit`

**Step 10: Commit**

```bash
git add src/renderer/components/Dashboard.tsx
git commit -m "feat: add identity selector Sheet UI to Dashboard"
```

---

### Task 6: End-to-end verification

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Test scenarios**

1. Open Dashboard — if no identities saved and multiple authors exist, Sheet should auto-open
2. Select 2-3 identities → confirm → Sheet closes
3. Heatmap updates to show only selected identities' commits
4. Commit history (click "Commits" card) shows only selected identities
5. "Generate in Chat" button includes only selected identities' commits
6. Refresh page — identities persist (loaded from SQLite)
7. Click "Manage" to re-open Sheet → previously selected are pre-highlighted
8. Change workPaths → Sheet auto-opens if new authors discovered

**Step 3: Fix any issues found**

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: polish identity selector based on testing"
```
