# User Identities ("Who Are You") Feature Design

## Problem

A single user may have multiple git identities (name/email pairs) across repositories. The Dashboard needs to let the user declare which identities belong to them, so that heatmap, commit history, and daily reports reflect only their work.

## Design

### Data Layer

**SQLite table:**

```sql
CREATE TABLE user_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  UNIQUE(name, email)
);
```

**New IPC APIs:**

- `git.getMyIdentities()` → `{name, email}[]`
- `git.setMyIdentities(identities: {name, email}[])` → clears table, inserts new rows

**Modified IPC APIs (multi-author filtering):**

- `git.heatmap(authors?: string[])` — accept array of author names instead of single author
- `git.commits` / commit-fetching logic — accept `authors[]` param, filter with OR matching
- `generate_daily_report.py` — support multiple `--author` flags

### UI

**Identity Selector Sheet:**

- Triggered automatically when `workPaths` changes and new authors are discovered
- All git authors shown as capsule badges (clickable to toggle selection)
- Previously selected identities are pre-selected
- Confirm button saves to SQLite

**Dashboard top bar:**

- Remove the single-author dropdown (`selectedAuthor` / `<Select>`)
- Show a compact summary of selected identities (e.g. avatar-like chips)
- Clicking opens the identity selector Sheet

### Filtering Logic

All data-fetching uses the saved identity list for OR-matching:

- **Heatmap**: only counts commits from selected identities
- **Commit history**: only shows commits from selected identities
- **Daily report generation**: only includes commits from selected identities
- If no identities are saved yet, show all data (fallback)

### Persistence

SQLite. Selected identities survive app restart.
