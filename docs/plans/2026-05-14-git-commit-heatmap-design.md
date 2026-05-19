# Git Commit Heatmap Design

## Overview
Add a GitHub-style contribution heatmap to the Dashboard page, showing commit activity over the past year with summary statistics.

## Architecture

### 1. New IPC Channel (`git:heatmap`)
Main process handler that aggregates commit counts per day across all scanned repos.

**Implementation:**
- Run `git log --all --since=1year --format=%ad --date=short` per repo
- Aggregate commit counts into `Map<YYYY-MM-DD, number>`
- Compute stats: totalCommits, longestStreak, currentStreak, mostActiveMonth, mostActiveDay
- Return via IPC

### 2. `GitHeatmap` Component
Pure React + Tailwind calendar grid at `src/renderer/components/GitHeatmap.tsx`.

**Features:**
- 53 columns (weeks) x 7 rows (Mon-Sun)
- 4-level green color scale
- Month labels on top (J, F, M, A, M, J, J, A, S, O, N, D)
- Day labels on left (Mon, Wed, Fri)
- Hover tooltip showing date + commit count
- Legend bar (Fewer → More)
- Summary stats row: Most Active Month, Most Active Day, Longest Streak, Current Streak

### 3. Placement
In Dashboard.tsx, between the User Info Card and the Stats Cards.

## Color Mapping
- 0: transparent
- 1-2: green-200 (light)
- 3-5: green-400
- 6-9: green-600
- 10+: green-800

Dark mode variants included.

## Data Flow
Dashboard → electronAPI.git.heatmap() → IPC → git log across repos → aggregate → GitHeatmap renders
