# Git Commit Heatmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a GitHub-style contribution heatmap to the Dashboard page showing commit activity over the past year.

**Architecture:** New IPC channel (`git:heatmap`) runs `git log` across all repos, aggregates per-day counts. A pure React + Tailwind `GitHeatmap` component renders the grid. Placed in Dashboard between User Info Card and Stats Cards.

**Tech Stack:** Electron IPC, React, TailwindCSS, date-fns (already installed), lucide-react

---

### Task 1: Add IPC Channel Constant

**Files:**
- Modify: `src/shared/ipc-channels.ts:57` (add after `GIT_GET_USER`)

**Step 1: Add the channel constant**

In `src/shared/ipc-channels.ts`, add after line 57 (`GIT_GET_USER = 'git:get-user',`):

```typescript
GIT_HEATMAP = 'git:heatmap',
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to ipc-channels.ts

**Step 3: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat(heatmap): add git:heatmap IPC channel constant"
```

---

### Task 2: Add Heatmap IPC Handler in Main Process

**Files:**
- Modify: `src/main/main.ts:418-426` (after `GIT_GET_USER` handler)

**Step 1: Add the git:heatmap handler**

In `src/main/main.ts`, add after the `GIT_GET_USER` handler block (after line 426). This handler:
- Gets work paths from config
- Scans for repos (reuses the same scanDir logic from `GIT_SCAN_REPOS`)
- Runs `git log --all --since=1year --format=%ad --date=short` per repo
- Aggregates counts per day
- Computes stats: totalCommits, longestStreak, currentStreak, mostActiveMonth, mostActiveDay

```typescript
// Git commit heatmap data
ipcMain.handle(IPCChannels.GIT_HEATMAP, async () => {
  const workPaths = configManager.get('workPaths', []) as string[];
  if (!workPaths.length) return { data: {}, stats: { totalCommits: 0, longestStreak: 0, currentStreak: 0, mostActiveMonth: '', mostActiveDay: '' } };

  const repos: { name: string; path: string }[] = [];

  function scanDir(dir: string, depth: number) {
    if (depth <= 0) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (!entry.isDirectory()) continue;
        if (fs.existsSync(path.join(fullPath, '.git'))) {
          repos.push({ name: entry.name, path: fullPath });
        } else if (depth > 1) {
          scanDir(fullPath, depth - 1);
        }
      }
    } catch { /* skip */ }
  }

  for (const wp of workPaths) {
    try {
      if (fs.existsSync(path.join(wp, '.git'))) {
        repos.push({ name: path.basename(wp), path: wp });
      }
      scanDir(wp, 3);
    } catch { /* skip */ }
  }

  const data: Record<string, number> = {};
  const gitUser = (() => {
    try {
      const name = execSync('git config user.name', { encoding: 'utf-8' }).trim();
      return name;
    } catch { return ''; }
  })();

  for (const repo of repos) {
    try {
      const cmd = gitUser
        ? `git -C "${repo.path}" log --all --author="${gitUser}" --since="1 year ago" --format=%ad --date=short`
        : `git -C "${repo.path}" log --all --since="1 year ago" --format=%ad --date=short`;
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 10000 });
      for (const line of output.trim().split('\n')) {
        const date = line.trim();
        if (date) data[date] = (data[date] || 0) + 1;
      }
    } catch { /* skip repos with no commits or errors */ }
  }

  // Compute stats
  const totalCommits = Object.values(data).reduce((a, b) => a + b, 0);
  const dates = Object.keys(data).sort();

  // Longest streak
  let longestStreak = 0;
  let currentStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const d of dates) {
    const cur = new Date(d);
    if (prevDate) {
      const diffDays = Math.round((cur.getTime() - prevDate.getTime()) / 86400000);
      if (diffDays === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    } else {
      tempStreak = 1;
    }
    if (tempStreak > longestStreak) longestStreak = tempStreak;
    prevDate = cur;
  }

  // Current streak (from today backwards)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streakDate = new Date(today);
  currentStreak = 0;
  while (true) {
    const key = format(streakDate, 'yyyy-MM-dd');
    if (data[key] && data[key] > 0) {
      currentStreak++;
      streakDate.setDate(streakDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Most active month
  const monthCounts: Record<string, number> = {};
  for (const [d, count] of Object.entries(data)) {
    const monthKey = d.slice(0, 7); // YYYY-MM
    monthCounts[monthKey] = (monthCounts[monthKey] || 0) + count;
  }
  const mostActiveMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  // Most active day
  const mostActiveDay = dates.reduce((max, d) => (data[d] > (data[max] || 0) ? d : max), dates[0] || '');

  return {
    data,
    stats: { totalCommits, longestStreak, currentStreak, mostActiveMonth, mostActiveDay },
  };
});
```

Note: You need to import `format` from `date-fns` at the top of `main.ts`. Add this import:

```typescript
import { format } from 'date-fns';
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/main/main.ts
git commit -m "feat(heatmap): add git:heatmap IPC handler with yearly commit aggregation"
```

---

### Task 3: Expose Heatmap API in Preload

**Files:**
- Modify: `src/main/preload.ts:125-128` (git section) and `src/main/preload.ts:207-210` (ElectronAPI type)

**Step 1: Add heatmap to the git API object**

In `src/main/preload.ts`, inside the `git` object (line 125-128), add a `heatmap` method:

```typescript
// Git API
git: {
  scanRepos: () => ipcRenderer.invoke(IPCChannels.GIT_SCAN_REPOS),
  getUser: () => ipcRenderer.invoke(IPCChannels.GIT_GET_USER),
  heatmap: () => ipcRenderer.invoke(IPCChannels.GIT_HEATMAP),
},
```

**Step 2: Add heatmap to the ElectronAPI type**

In the same file, in the `ElectronAPI` interface's `git` section (around line 207-210):

```typescript
git: {
  scanRepos: () => Promise<{ name: string; path: string }[]>;
  getUser: () => Promise<{ name: string; email: string }>;
  heatmap: () => Promise<{
    data: Record<string, number>;
    stats: {
      totalCommits: number;
      longestStreak: number;
      currentStreak: number;
      mostActiveMonth: string;
      mostActiveDay: string;
    };
  }>;
};
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/main/preload.ts
git commit -m "feat(heatmap): expose git.heatmap() in preload bridge"
```

---

### Task 4: Create GitHeatmap Component

**Files:**
- Create: `src/renderer/components/GitHeatmap.tsx`

**Step 1: Create the component**

Create `src/renderer/components/GitHeatmap.tsx` with the full implementation:

```tsx
import { useMemo, useState } from 'react';
import { format, subYears, startOfWeek, addDays, startOfDay, getDay, getMonth, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';

interface HeatmapData {
  data: Record<string, number>;
  stats: {
    totalCommits: number;
    longestStreak: number;
    currentStreak: number;
    mostActiveMonth: string;
    mostActiveDay: string;
  };
}

interface GitHeatmapProps {
  heatmapData: HeatmapData | null;
  isLoading: boolean;
}

function getColorLevel(count: number): string {
  if (count === 0) return 'bg-transparent';
  if (count <= 2) return 'bg-green-200 dark:bg-green-900';
  if (count <= 5) return 'bg-green-400 dark:bg-green-700';
  if (count <= 9) return 'bg-green-600 dark:bg-green-500';
  return 'bg-green-800 dark:bg-green-400';
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

interface TooltipInfo {
  date: string;
  count: number;
  x: number;
  y: number;
}

export default function GitHeatmap({ heatmapData, isLoading }: GitHeatmapProps) {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  const { cells, monthLabels } = useMemo(() => {
    const today = startOfDay(new Date());
    const oneYearAgo = subYears(today, 1);

    // Start from the Sunday of the week containing oneYearAgo
    const startDate = startOfWeek(oneYearAgo, { weekStartsOn: 0 });

    const cells: { date: Date; dateStr: string; count: number }[] = [];
    let current = new Date(startDate);

    while (current <= today) {
      const dateStr = format(current, 'yyyy-MM-dd');
      cells.push({
        date: new Date(current),
        dateStr,
        count: heatmapData?.data[dateStr] || 0,
      });
      current = addDays(current, 1);
    }

    // Pad to full weeks (fill remaining days of the last week)
    while (cells.length % 7 !== 0) {
      const dateStr = format(current, 'yyyy-MM-dd');
      cells.push({
        date: new Date(current),
        dateStr,
        count: heatmapData?.data[dateStr] || 0,
      });
      current = addDays(current, 1);
    }

    const numWeeks = cells.length / 7;

    // Calculate month label positions (which week column each month starts at)
    const monthLabels: { label: string; col: number }[] = [];
    let lastMonth = -1;
    for (let week = 0; week < numWeeks; week++) {
      const sundayDate = cells[week * 7].date;
      const month = getMonth(sundayDate);
      if (month !== lastMonth) {
        monthLabels.push({ label: MONTH_LABELS[month], col: week });
        lastMonth = month;
      }
    }

    return { cells, monthLabels, numWeeks };
  }, [heatmapData]);

  const numWeeks = cells.length / 7;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        Loading heatmap...
      </div>
    );
  }

  const stats = heatmapData?.stats;

  return (
    <div>
      {/* Heatmap grid */}
      <div className="relative overflow-x-auto">
        {/* Month labels */}
        <div className="flex ml-8 mb-1" style={{ width: numWeeks * 14 }}>
          {monthLabels.map(({ label, col }, i) => (
            <span
              key={i}
              className="text-[10px] text-muted-foreground absolute"
              style={{ left: col * 14 + 32 }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Grid with day labels */}
        <div className="flex">
          {/* Day labels */}
          <div className="flex flex-col shrink-0" style={{ width: 32 }}>
            {DAY_LABELS.map((label, i) => (
              <span
                key={i}
                className="text-[10px] text-muted-foreground text-right pr-1"
                style={{ height: 13, lineHeight: '13px' }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Cells grid */}
          <div
            className="grid"
            style={{
              gridTemplateRows: 'repeat(7, 11px)',
              gridTemplateColumns: `repeat(${numWeeks}, 11px)`,
              gap: '2px',
            }}
          >
            {cells.map((cell, i) => (
              <div
                key={cell.dateStr}
                className={cn(
                  'rounded-sm cursor-pointer transition-colors',
                  getColorLevel(cell.count)
                )}
                style={{ width: 11, height: 11 }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    date: cell.dateStr,
                    count: cell.count,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </div>
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="fixed z-50 px-2 py-1 text-xs rounded-md bg-popover text-popover-foreground border shadow-md pointer-events-none"
            style={{
              left: tooltip.x,
              top: tooltip.y - 36,
              transform: 'translateX(-50%)',
            }}
          >
            <span className="font-medium">{tooltip.count}</span> commit{tooltip.count !== 1 ? 's' : ''} on {tooltip.date}
          </div>
        )}
      </div>

      {/* Legend + Stats */}
      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span>Less</span>
          <div className={cn('rounded-sm', 'bg-transparent border border-border')} style={{ width: 11, height: 11 }} />
          <div className={cn('rounded-sm', 'bg-green-200 dark:bg-green-900')} style={{ width: 11, height: 11 }} />
          <div className={cn('rounded-sm', 'bg-green-400 dark:bg-green-700')} style={{ width: 11, height: 11 }} />
          <div className={cn('rounded-sm', 'bg-green-600 dark:bg-green-500')} style={{ width: 11, height: 11 }} />
          <div className={cn('rounded-sm', 'bg-green-800 dark:bg-green-400')} style={{ width: 11, height: 11 }} />
          <span>More</span>
        </div>

        {stats && (
          <div className="flex items-center gap-4">
            {stats.mostActiveMonth && (
              <span>Most Active Month: <strong className="text-foreground">{format(new Date(stats.mostActiveMonth + '-01'), 'MMM yyyy')}</strong></span>
            )}
            {stats.mostActiveDay && (
              <span>Most Active Day: <strong className="text-foreground">{stats.mostActiveDay}</strong></span>
            )}
            {stats.longestStreak > 0 && (
              <span>Longest Streak: <strong className="text-foreground">{stats.longestStreak}d</strong></span>
            )}
            {stats.currentStreak > 0 && (
              <span>Current Streak: <strong className="text-foreground">{stats.currentStreak}d</strong></span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to GitHeatmap.tsx

**Step 3: Commit**

```bash
git add src/renderer/components/GitHeatmap.tsx
git commit -m "feat(heatmap): create GitHeatmap component with grid, tooltip, and stats"
```

---

### Task 5: Integrate Heatmap into Dashboard

**Files:**
- Modify: `src/renderer/components/Dashboard.tsx:287-313` (after User Info Card, before Work Paths)

**Step 1: Add heatmap state and fetch logic**

In `Dashboard.tsx`, add state variables after the existing state declarations (around line 57):

```typescript
const [heatmapData, setHeatmapData] = useState<{
  data: Record<string, number>;
  stats: {
    totalCommits: number;
    longestStreak: number;
    currentStreak: number;
    mostActiveMonth: string;
    mostActiveDay: string;
  };
} | null>(null);
const [isHeatmapLoading, setIsHeatmapLoading] = useState(false);

const fetchHeatmap = useCallback(async () => {
  setIsHeatmapLoading(true);
  try {
    const result = await window.electronAPI.git.heatmap();
    setHeatmapData(result);
  } catch (error) {
    console.error('Failed to fetch heatmap:', error);
  } finally {
    setIsHeatmapLoading(false);
  }
}, []);
```

Add a useEffect to fetch heatmap data when workPaths are available (after line 156, the existing useEffect for fetchStats):

```typescript
useEffect(() => {
  if (workPaths.length > 0) {
    fetchHeatmap();
  }
}, [workPaths, fetchHeatmap]);
```

**Step 2: Import GitHeatmap component**

Add to the imports at top of file:

```typescript
import GitHeatmap from './GitHeatmap';
```

**Step 3: Add the heatmap card to JSX**

After the User Info Card closing `</Card>` (line 313) and before the Work Paths section (line 316), add:

```tsx
{/* Git Commit Heatmap */}
<Card className="mb-6">
  <CardContent className="pt-6">
    <div className="flex items-center gap-2 mb-4">
      <Activity size={16} className="text-muted-foreground" />
      <span className="text-sm font-medium text-secondary-foreground">
        Commit Activity
      </span>
      {heatmapData && (
        <span className="text-sm text-muted-foreground ml-1">
          {heatmapData.stats.totalCommits.toLocaleString()} commits in the last year
        </span>
      )}
    </div>
    <GitHeatmap heatmapData={heatmapData} isLoading={isHeatmapLoading} />
  </CardContent>
</Card>
```

**Step 4: Verify it compiles and run the app**

Run: `npx tsc --noEmit`
Expected: No errors

Run: `npm run dev`
Expected: App launches, Dashboard shows heatmap between User Info Card and Stats Cards

**Step 5: Commit**

```bash
git add src/renderer/components/Dashboard.tsx
git commit -m "feat(heatmap): integrate GitHeatmap into Dashboard page"
```

---

### Task 6: Visual Verification and Polish

**Step 1: Run the app and verify**

Run: `npm run dev`

Check these things in the Dashboard:
1. Heatmap renders between User Info Card and Stats Cards
2. Grid shows 52-53 week columns with correct month labels
3. Day labels (Mon, Wed, Fri) show on the left
4. Hovering a cell shows tooltip with date and commit count
5. Color levels reflect commit frequency correctly
6. Stats row shows: Most Active Month, Most Active Day, Longest Streak, Current Streak
7. Legend (Less → More) renders correctly
8. Dark mode looks correct

**Step 2: Fix any visual issues**

Adjust spacing, colors, or layout as needed based on visual inspection.

**Step 3: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix(heatmap): polish heatmap layout and styling"
```
