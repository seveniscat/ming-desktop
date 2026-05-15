# Tools Management Page Design

## Goal

Add a dedicated Tools management page to the Agent system for creating, editing, testing, and managing tools (Tool CRUD + online testing).

## Layout

Left-right split using `ResizablePanelGroup`:
- **Left (30%)**: Tool list — search bar, category filter, card list with enable/disable toggle
- **Right (70%)**: Tool detail — 4 tabs (Basic Info, Parameters, Test, Stats)

## Data Model

```sql
CREATE TABLE tools (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT,                -- file | code | web | system | custom
  parameters_schema TEXT,       -- JSON Schema string
  implementation_type TEXT,     -- builtin | http | script
  implementation_config TEXT,   -- JSON config string
  is_enabled INTEGER DEFAULT 1,
  usage_count INTEGER DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

## Backend

- **New file**: `src/main/tools/ToolPersistenceManager.ts` — CRUD via better-sqlite3
- **IPC channels**: `tools:list`, `tools:get`, `tools:create`, `tools:update`, `tools:delete`, `tools:execute`
- **Execute dispatch**: `builtin` → existing ToolExecutor, `http` → fetch (reserved), `script` → child_process (reserved)

## Frontend Components

```
src/renderer/pages/ToolsPage.tsx              — Main page (split layout)
src/renderer/components/tools/ToolList.tsx     — Left: search + filter + cards
src/renderer/components/tools/ToolDetail.tsx   — Right: Tabs container
src/renderer/components/tools/ToolBasicForm.tsx — Tab 1: name, description, category, type, enabled
src/renderer/components/tools/ToolParamsEditor.tsx — Tab 2: JSON Schema textarea + validation
src/renderer/components/tools/ToolTester.tsx   — Tab 3: auto-generated form from schema → execute → result
src/renderer/components/tools/ToolStats.tsx    — Tab 4: usage_count, last_used_at, timestamps (read-only)
```

## State Management

Follow existing project pattern: `useState` + `useEffect` + `window.electronAPI` IPC. No Zustand.

## Navigation

- NavRail: `{ id: 'tools', icon: Wrench, label: 'Tools' }`
- App.tsx: add route condition

## Key Design Decisions

1. **No Monaco Editor** — Use `<textarea>` with JSON validation to avoid heavy dependency
2. **Auto-generated test form** — Parse `parameters_schema` to render form fields dynamically
3. **Implementation types** — `builtin`/`http`/`script` dispatch in execute, only `builtin` is fully functional initially
4. **Category filter** — Fixed set: file, code, web, system, custom
