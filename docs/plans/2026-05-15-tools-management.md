# Tools Management Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full-featured Tools management page with CRUD, JSON Schema parameter editing, and an interactive tool tester.

**Architecture:** Left-right split layout (ResizablePanelGroup). Left panel shows searchable/filterable tool cards. Right panel shows a tabbed detail view with Basic Info, Parameters, Test, and Stats tabs. Backend uses a new `ToolPersistenceManager` class with SQLite storage and 6 IPC channels.

**Tech Stack:** Electron IPC, better-sqlite3, React (useState/useEffect), shadcn/ui, lucide-react

---

### Task 1: Add Tool type definitions

**Files:**
- Modify: `src/shared/types.ts` (append after existing Tool types, around line 195)

**Step 1: Add ToolRecord and ToolConfig interfaces**

Append after the existing `ToolCall` interface:

```typescript
// Tool persistence types
export interface ToolRecord {
  id: string;
  name: string;
  display_name: string;
  description: string;
  category: string | null;
  parameters_schema: string | null;
  implementation_type: 'builtin' | 'http' | 'script';
  implementation_config: string | null;
  is_enabled: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ToolCreateConfig {
  name: string;
  display_name: string;
  description?: string;
  category?: string;
  parameters_schema?: string;
  implementation_type?: 'builtin' | 'http' | 'script';
  implementation_config?: string;
  is_enabled?: boolean;
}

export interface ToolUpdateConfig {
  display_name?: string;
  description?: string;
  category?: string;
  parameters_schema?: string;
  implementation_type?: 'builtin' | 'http' | 'script';
  implementation_config?: string;
  is_enabled?: boolean;
}
```

**Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(tools): add ToolRecord type definitions"
```

---

### Task 2: Add IPC channels

**Files:**
- Modify: `src/shared/ipc-channels.ts` (before closing brace of enum, around line 91)

**Step 1: Add Tool IPC channel constants**

Insert before the closing `}` of `IPCChannels` enum, after `ANALYZE_PROJECT`:

```typescript
  // Tool 相关
  TOOL_LIST = 'tool:list',
  TOOL_GET = 'tool:get',
  TOOL_CREATE = 'tool:create',
  TOOL_UPDATE = 'tool:update',
  TOOL_DELETE = 'tool:delete',
  TOOL_EXECUTE = 'tool:execute',
```

**Step 2: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat(tools): add Tool IPC channel constants"
```

---

### Task 3: Add database migration

**Files:**
- Modify: `src/main/database/schema.ts` (append after the last migration block, before closing brace of `runMigrations`)

**Step 1: Add tools table migration**

Insert before the closing `}` of `runMigrations()` function (before the last `}` at line 245):

```typescript
  // Migration: add tools table for tool management
  const migration8Name = 'add-tools-table';
  const applied8 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration8Name);
  if (!applied8) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tools (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        parameters_schema TEXT,
        implementation_type TEXT DEFAULT 'builtin',
        implementation_config TEXT,
        is_enabled INTEGER DEFAULT 1,
        usage_count INTEGER DEFAULT 0,
        last_used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration8Name);
  }
```

**Step 2: Commit**

```bash
git add src/main/database/schema.ts
git commit -m "feat(tools): add tools table database migration"
```

---

### Task 4: Create ToolPersistenceManager

**Files:**
- Create: `src/main/tools/ToolPersistenceManager.ts`

**Step 1: Implement the manager class**

```typescript
import { getDatabase } from '../database/connection';
import { ToolExecutor } from './ToolExecutor';
import type { ToolRecord, ToolCreateConfig, ToolUpdateConfig } from '../../shared/types';
import { Logger } from '../utils/Logger';
import { randomUUID } from 'crypto';

const CATEGORIES = ['file', 'code', 'web', 'system', 'custom'] as const;
const IMPL_TYPES = ['builtin', 'http', 'script'] as const;

export class ToolPersistenceManager {
  private toolExecutor: ToolExecutor;

  constructor(toolExecutor: ToolExecutor) {
    this.toolExecutor = toolExecutor;
  }

  list(): ToolRecord[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM tools ORDER BY updated_at DESC').all() as any[];
    return rows.map(this.rowToRecord);
  }

  get(toolId: string): ToolRecord | undefined {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM tools WHERE id = ?').get(toolId) as any;
    return row ? this.rowToRecord(row) : undefined;
  }

  create(config: ToolCreateConfig): string {
    const db = getDatabase();
    const id = `tool-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO tools (id, name, display_name, description, category, parameters_schema, implementation_type, implementation_config, is_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      config.name.trim(),
      config.display_name.trim(),
      config.description || null,
      config.category || null,
      config.parameters_schema || null,
      config.implementation_type || 'builtin',
      config.implementation_config || null,
      config.is_enabled !== false ? 1 : 0,
      now,
      now,
    );

    Logger.info(`Tool created: ${config.name} (${id})`);
    return id;
  }

  update(toolId: string, config: ToolUpdateConfig): void {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM tools WHERE id = ?').get(toolId) as any;
    if (!existing) throw new Error(`Tool not found: ${toolId}`);

    const sets: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(config)) {
      if (key === 'is_enabled') {
        sets.push('is_enabled = ?');
        values.push(value ? 1 : 0);
      } else {
        sets.push(`${key} = ?`);
        values.push(value ?? null);
      }
    }

    sets.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(toolId);

    db.prepare(`UPDATE tools SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    Logger.info(`Tool updated: ${toolId}`);
  }

  delete(toolId: string): void {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM tools WHERE id = ?').get(toolId) as any;
    if (!existing) throw new Error(`Tool not found: ${toolId}`);

    db.prepare('DELETE FROM tools WHERE id = ?').run(toolId);
    Logger.info(`Tool deleted: ${toolId}`);
  }

  async execute(toolId: string, params: Record<string, any>): Promise<{ result: string; duration: number }> {
    const db = getDatabase();
    const tool = db.prepare('SELECT * FROM tools WHERE id = ?').get(toolId) as any;
    if (!tool) throw new Error(`Tool not found: ${toolId}`);
    if (!tool.is_enabled) throw new Error(`Tool is disabled: ${tool.name}`);

    const start = Date.now();
    let result: string;

    switch (tool.implementation_type) {
      case 'builtin':
        result = await this.toolExecutor.executeByName(tool.name, params);
        break;
      case 'http': {
        const config = JSON.parse(tool.implementation_config || '{}');
        if (!config.url) throw new Error('HTTP tool missing url in implementation_config');
        const resp = await fetch(config.url, {
          method: config.method || 'POST',
          headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
          body: JSON.stringify(params),
        });
        result = JSON.stringify(await resp.json());
        break;
      }
      case 'script': {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const config = JSON.parse(tool.implementation_config || '{}');
        if (!config.command) throw new Error('Script tool missing command in implementation_config');
        const { stdout, stderr } = await execAsync(
          config.command,
          { timeout: config.timeout || 30000, env: { ...process.env, ...params } }
        );
        result = stderr ? `stderr: ${stderr}\nstdout: ${stdout}` : stdout;
        break;
      }
      default:
        throw new Error(`Unknown implementation type: ${tool.implementation_type}`);
    }

    const duration = Date.now() - start;

    // Update usage stats
    db.prepare(`
      UPDATE tools SET usage_count = usage_count + 1, last_used_at = ? WHERE id = ?
    `).run(new Date().toISOString(), toolId);

    return { result, duration };
  }

  private rowToRecord(row: any): ToolRecord {
    return {
      id: row.id,
      name: row.name,
      display_name: row.display_name,
      description: row.description || '',
      category: row.category,
      parameters_schema: row.parameters_schema,
      implementation_type: row.implementation_type || 'builtin',
      implementation_config: row.implementation_config,
      is_enabled: !!row.is_enabled,
      usage_count: row.usage_count || 0,
      last_used_at: row.last_used_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
```

**Step 2: Commit**

```bash
git add src/main/tools/ToolPersistenceManager.ts
git commit -m "feat(tools): add ToolPersistenceManager with CRUD and execute"
```

---

### Task 5: Wire up IPC (preload + main)

**Files:**
- Modify: `src/main/preload.ts` (add tools API section)
- Modify: `src/main/main.ts` (instantiate manager + register IPC handlers)
- Modify: `src/renderer/App.tsx` (add tools to ElectronAPI type)

**Step 1: Add tools API to preload.ts**

Insert before the closing `});` of `contextBridge.exposeInMainWorld`, after the `techStack` block:

```typescript
  // Tool API
  tools: {
    list: () => ipcRenderer.invoke(IPCChannels.TOOL_LIST),
    get: (toolId: string) => ipcRenderer.invoke(IPCChannels.TOOL_GET, toolId),
    create: (config: any) => ipcRenderer.invoke(IPCChannels.TOOL_CREATE, config),
    update: (toolId: string, updates: any) => ipcRenderer.invoke(IPCChannels.TOOL_UPDATE, toolId, updates),
    delete: (toolId: string) => ipcRenderer.invoke(IPCChannels.TOOL_DELETE, toolId),
    execute: (toolId: string, params: any) => ipcRenderer.invoke(IPCChannels.TOOL_EXECUTE, toolId, params),
  },
```

Also add the same to the `ElectronAPI` interface at the bottom of preload.ts:

```typescript
  tools: {
    list: () => Promise<any[]>;
    get: (toolId: string) => Promise<any>;
    create: (config: any) => Promise<string>;
    update: (toolId: string, updates: any) => Promise<void>;
    delete: (toolId: string) => Promise<void>;
    execute: (toolId: string, params: any) => Promise<{ result: string; duration: number }>;
  };
```

**Step 2: Add ElectronAPI type in App.tsx**

Add `tools` section to the `ElectronAPI` interface (after `techStack`):

```typescript
  tools: {
    list: () => Promise<any[]>;
    get: (toolId: string) => Promise<any>;
    create: (config: any) => Promise<string>;
    update: (toolId: string, updates: any) => Promise<void>;
    delete: (toolId: string) => Promise<void>;
    execute: (toolId: string, params: any) => Promise<{ result: string; duration: number }>;
  };
```

**Step 3: Instantiate manager in main.ts**

Add import at top of main.ts:

```typescript
import { ToolPersistenceManager } from './tools/ToolPersistenceManager';
```

Add variable declaration after `toolExecutor` declaration:

```typescript
let toolPersistenceManager: ToolPersistenceManager;
```

In `initializeServices()`, after `toolExecutor.register(...)` line:

```typescript
  toolPersistenceManager = new ToolPersistenceManager(toolExecutor);
```

**Step 4: Add IPC handlers in setupIPCHandlers()**

Add before the TechStack handlers section:

```typescript
  // Tool 相关
  ipcMain.handle(IPCChannels.TOOL_LIST, async () => {
    return toolPersistenceManager.list();
  });

  ipcMain.handle(IPCChannels.TOOL_GET, async (_, toolId: string) => {
    return toolPersistenceManager.get(toolId);
  });

  ipcMain.handle(IPCChannels.TOOL_CREATE, async (_, config: any) => {
    return toolPersistenceManager.create(config);
  });

  ipcMain.handle(IPCChannels.TOOL_UPDATE, async (_, toolId: string, updates: any) => {
    return toolPersistenceManager.update(toolId, updates);
  });

  ipcMain.handle(IPCChannels.TOOL_DELETE, async (_, toolId: string) => {
    return toolPersistenceManager.delete(toolId);
  });

  ipcMain.handle(IPCChannels.TOOL_EXECUTE, async (_, toolId: string, params: any) => {
    return toolPersistenceManager.execute(toolId, params);
  });
```

**Step 5: Commit**

```bash
git add src/main/preload.ts src/main/main.ts src/renderer/App.tsx
git commit -m "feat(tools): wire up IPC channels for tool management"
```

---

### Task 6: Add navigation entry

**Files:**
- Modify: `src/renderer/components/NavRail.tsx` (add tools to navItems, after skills entry)
- Modify: `src/renderer/App.tsx` (add import + route)

**Step 1: Add nav item in NavRail.tsx**

In the `navItems` array, after the `{ id: 'skills', ... }` entry, add:

```typescript
  { id: 'tools', icon: Wrench, label: 'Tools' },
```

Note: `Wrench` is already imported at line 2. But since skills uses it, change the skills icon to `Zap` and use `Wrench` for tools. Update the import line to add `Zap`:

```typescript
import { Home, LayoutDashboard, MessageSquare, Bot, Zap, Wrench, FileText, Search, Settings, Sun, Moon, Monitor, PanelLeftClose, PanelLeft, Bug } from 'lucide-react';
```

Change skills icon from `Wrench` to `Zap`:

```typescript
  { id: 'skills', icon: Zap, label: 'Skills' },
  { id: 'tools', icon: Wrench, label: 'Tools' },
```

**Step 2: Add route in App.tsx**

Add import at top:

```typescript
import ToolsPage from './pages/ToolsPage';
```

Add route condition in the content area, after the agents route:

```typescript
{activeTab === 'tools' && <ToolsPage />}
```

**Step 3: Commit**

```bash
git add src/renderer/components/NavRail.tsx src/renderer/App.tsx
git commit -m "feat(tools): add Tools page navigation and route"
```

---

### Task 7: Create ToolsPage main component

**Files:**
- Create: `src/renderer/pages/ToolsPage.tsx`

**Step 1: Create directory and main page component**

```bash
mkdir -p src/renderer/pages
mkdir -p src/renderer/components/tools
```

**Step 2: Implement ToolsPage.tsx**

```tsx
import { useState, useEffect, useCallback } from 'react';
import { Plus, Search } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../components/ui/resizable';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import type { ToolRecord } from '../../shared/types';
import ToolDetail from '../components/tools/ToolDetail';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'file', label: 'File' },
  { value: 'code', label: 'Code' },
  { value: 'web', label: 'Web' },
  { value: 'system', label: 'System' },
  { value: 'custom', label: 'Custom' },
] as const;

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const loadTools = useCallback(async () => {
    try {
      const list = await window.electronAPI.tools.list();
      setTools(list || []);
    } catch (error) {
      console.error('Failed to load tools:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  const selectedTool = tools.find((t) => t.id === selectedId) || null;

  const filtered = tools.filter((t) => {
    const matchesSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.display_name.toLowerCase().includes(search.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleCreate = async () => {
    const name = `custom-tool-${Date.now().toString(36)}`;
    const id = await window.electronAPI.tools.create({
      name,
      display_name: 'New Tool',
      description: '',
      category: 'custom',
      implementation_type: 'builtin',
    });
    await loadTools();
    setSelectedId(id);
  };

  const handleDelete = async (toolId: string) => {
    const tool = tools.find((t) => t.id === toolId);
    if (!tool) return;
    if (!confirm(`Delete tool "${tool.display_name}"?`)) return;
    await window.electronAPI.tools.delete(toolId);
    if (selectedId === toolId) setSelectedId(null);
    await loadTools();
  };

  const handleToggleEnabled = async (tool: ToolRecord) => {
    await window.electronAPI.tools.update(tool.id, { is_enabled: !tool.is_enabled });
    await loadTools();
  };

  return (
    <div className="h-full">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Left panel: tool list */}
        <ResizablePanel defaultSize={30} minSize={20} maxSize={45}>
          <div className="h-full flex flex-col border-r border-[hsl(var(--border))]">
            {/* Header */}
            <div className="p-4 space-y-3 border-b border-[hsl(var(--border))]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Tools</h2>
                <Button size="sm" onClick={handleCreate} className="h-8 gap-1.5">
                  <Plus size={14} />
                  New
                </Button>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tools..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setCategoryFilter(cat.value)}
                    className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                      categoryFilter === cat.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tool cards */}
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {loading ? (
                  <div className="text-center text-sm text-muted-foreground py-8">Loading...</div>
                ) : filtered.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    {search || categoryFilter !== 'all' ? 'No matching tools' : 'No tools yet'}
                  </div>
                ) : (
                  filtered.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => setSelectedId(tool.id)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        selectedId === tool.id
                          ? 'border-primary bg-primary/5'
                          : 'border-[hsl(var(--border))] hover:border-primary/40 hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{tool.display_name}</span>
                            {!tool.is_enabled && (
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                Disabled
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {tool.description || tool.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {tool.category && (
                            <Badge variant="secondary" className="text-[10px]">
                              {tool.category}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span>{tool.usage_count} uses</span>
                        <span>{tool.implementation_type}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right panel: detail */}
        <ResizablePanel defaultSize={70} minSize={40}>
          {selectedTool ? (
            <ToolDetail
              tool={selectedTool}
              onUpdate={loadTools}
              onDelete={() => handleDelete(selectedTool.id)}
              onToggleEnabled={() => handleToggleEnabled(selectedTool)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <p className="text-lg">Select a tool to view details</p>
                <p className="text-sm mt-1">Or create a new one from the sidebar</p>
              </div>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/renderer/pages/ToolsPage.tsx
git commit -m "feat(tools): create ToolsPage with left-right split layout"
```

---

### Task 8: Create ToolDetail component (Tabs container)

**Files:**
- Create: `src/renderer/components/tools/ToolDetail.tsx`

**Step 1: Implement ToolDetail.tsx**

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import type { ToolRecord } from '../../../shared/types';
import ToolBasicForm from './ToolBasicForm';
import ToolParamsEditor from './ToolParamsEditor';
import ToolTester from './ToolTester';
import ToolStats from './ToolStats';

interface ToolDetailProps {
  tool: ToolRecord;
  onUpdate: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
}

export default function ToolDetail({ tool, onUpdate, onDelete, onToggleEnabled }: ToolDetailProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[hsl(var(--border))]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">{tool.display_name}</h2>
            <Badge variant="secondary" className="text-xs">{tool.implementation_type}</Badge>
            {tool.category && <Badge variant="outline" className="text-xs">{tool.category}</Badge>}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Enabled</span>
              <Switch checked={tool.is_enabled} onCheckedChange={onToggleEnabled} />
            </div>
            <button
              onClick={onDelete}
              className="text-sm text-muted-foreground hover:text-destructive transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="basic" className="h-full flex flex-col">
          <div className="px-6 pt-3 border-b border-[hsl(var(--border))]">
            <TabsList className="bg-transparent p-0 h-auto gap-4">
              <TabsTrigger value="basic" className="text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2">Basic Info</TabsTrigger>
              <TabsTrigger value="params" className="text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2">Parameters</TabsTrigger>
              <TabsTrigger value="test" className="text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2">Test</TabsTrigger>
              <TabsTrigger value="stats" className="text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2">Stats</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="basic" className="mt-0 p-6">
              <ToolBasicForm tool={tool} onUpdate={onUpdate} />
            </TabsContent>
            <TabsContent value="params" className="mt-0 p-6">
              <ToolParamsEditor tool={tool} onUpdate={onUpdate} />
            </TabsContent>
            <TabsContent value="test" className="mt-0 p-6">
              <ToolTester tool={tool} />
            </TabsContent>
            <TabsContent value="stats" className="mt-0 p-6">
              <ToolStats tool={tool} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/tools/ToolDetail.tsx
git commit -m "feat(tools): add ToolDetail with tabbed layout"
```

---

### Task 9: Create ToolBasicForm component

**Files:**
- Create: `src/renderer/components/tools/ToolBasicForm.tsx`

**Step 1: Implement ToolBasicForm.tsx**

```tsx
import { useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { ToolRecord } from '../../../shared/types';

interface ToolBasicFormProps {
  tool: ToolRecord;
  onUpdate: () => void;
}

const CATEGORIES = [
  { value: 'file', label: 'File' },
  { value: 'code', label: 'Code' },
  { value: 'web', label: 'Web' },
  { value: 'system', label: 'System' },
  { value: 'custom', label: 'Custom' },
];

const IMPL_TYPES = [
  { value: 'builtin', label: 'Built-in' },
  { value: 'http', label: 'HTTP Request' },
  { value: 'script', label: 'Script' },
];

export default function ToolBasicForm({ tool, onUpdate }: ToolBasicFormProps) {
  const [form, setForm] = useState({
    display_name: tool.display_name,
    description: tool.description || '',
    category: tool.category || '',
    implementation_type: tool.implementation_type,
    implementation_config: tool.implementation_config || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.tools.update(tool.id, {
        display_name: form.display_name.trim(),
        description: form.description.trim(),
        category: form.category || null,
        implementation_type: form.implementation_type,
        implementation_config: form.implementation_config.trim() || null,
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to update tool:', error);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    form.display_name !== tool.display_name ||
    form.description !== (tool.description || '') ||
    form.category !== (tool.category || '') ||
    form.implementation_type !== tool.implementation_type ||
    form.implementation_config !== (tool.implementation_config || '');

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Label className="mb-2 block text-sm">Tool Name (identifier)</Label>
        <Input value={tool.name} disabled className="bg-muted/50" />
        <p className="text-xs text-muted-foreground mt-1">Unique identifier, cannot be changed after creation</p>
      </div>

      <div>
        <Label className="mb-2 block text-sm">Display Name</Label>
        <Input
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          placeholder="e.g., Daily Report Generator"
        />
      </div>

      <div>
        <Label className="mb-2 block text-sm">Description</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What does this tool do?"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="mb-2 block text-sm">Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="mb-2 block text-sm">Implementation Type</Label>
          <Select value={form.implementation_type} onValueChange={(v: any) => setForm({ ...form, implementation_type: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMPL_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {(form.implementation_type === 'http' || form.implementation_type === 'script') && (
        <div>
          <Label className="mb-2 block text-sm">
            Implementation Config (JSON)
          </Label>
          <Textarea
            value={form.implementation_config}
            onChange={(e) => setForm({ ...form, implementation_config: e.target.value })}
            placeholder={
              form.implementation_type === 'http'
                ? '{"url": "https://...", "method": "POST", "headers": {}}'
                : '{"command": "python3 script.py", "timeout": 30000}'
            }
            rows={4}
            className="font-mono text-sm"
          />
        </div>
      )}

      <div className="pt-2">
        <Button onClick={handleSave} disabled={saving || !hasChanges || !form.display_name.trim()}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/tools/ToolBasicForm.tsx
git commit -m "feat(tools): add ToolBasicForm for editing tool metadata"
```

---

### Task 10: Create ToolParamsEditor component

**Files:**
- Create: `src/renderer/components/tools/ToolParamsEditor.tsx`

**Step 1: Implement ToolParamsEditor.tsx**

```tsx
import { useState } from 'react';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { ToolRecord } from '../../../shared/types';

interface ToolParamsEditorProps {
  tool: ToolRecord;
  onUpdate: () => void;
}

const EXAMPLE_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    input: {
      type: 'string',
      description: 'The input text to process',
    },
    maxResults: {
      type: 'number',
      description: 'Maximum number of results',
    },
  },
  required: ['input'],
}, null, 2);

export default function ToolParamsEditor({ tool, onUpdate }: ToolParamsEditorProps) {
  const [schema, setSchema] = useState(tool.parameters_schema || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateJSON = (text: string): boolean => {
    if (!text.trim()) {
      setError(null);
      return true;
    }
    try {
      const parsed = JSON.parse(text);
      if (parsed.type !== 'object') {
        setError('Root type must be "object"');
        return false;
      }
      if (!parsed.properties || typeof parsed.properties !== 'object') {
        setError('Must have a "properties" object');
        return false;
      }
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
      return false;
    }
  };

  const handleSave = async () => {
    if (!validateJSON(schema)) return;
    setSaving(true);
    try {
      await window.electronAPI.tools.update(tool.id, {
        parameters_schema: schema.trim() || null,
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to update schema:', error);
    } finally {
      setSaving(false);
    }
  };

  const parsedProps = (() => {
    if (!tool.parameters_schema) return [];
    try {
      const parsed = JSON.parse(tool.parameters_schema);
      return Object.entries(parsed.properties || {}).map(([key, val]: [string, any]) => ({
        name: key,
        type: val.type || 'any',
        description: val.description || '',
        required: parsed.required?.includes(key) ?? false,
      }));
    } catch {
      return [];
    }
  })();

  const hasChanges = schema !== (tool.parameters_schema || '');

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Label className="mb-2 block text-sm">Parameters JSON Schema</Label>
        <p className="text-xs text-muted-foreground mb-3">
          Define the input parameters this tool accepts using JSON Schema format.
        </p>
        <Textarea
          value={schema}
          onChange={(e) => {
            setSchema(e.target.value);
            validateJSON(e.target.value);
          }}
          placeholder={EXAMPLE_SCHEMA}
          rows={14}
          className="font-mono text-sm"
        />
        {error && (
          <p className="text-sm text-destructive mt-2">{error}</p>
        )}
      </div>

      {/* Preview parsed parameters */}
      {parsedProps.length > 0 && (
        <div>
          <Label className="mb-2 block text-sm">Detected Parameters</Label>
          <div className="rounded-lg border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
            {parsedProps.map((prop) => (
              <div key={prop.name} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-sm font-mono font-medium">{prop.name}</span>
                <Badge variant="secondary" className="text-[10px]">{prop.type}</Badge>
                {prop.required && (
                  <Badge variant="outline" className="text-[10px] text-orange-500 border-orange-500/30">required</Badge>
                )}
                <span className="text-xs text-muted-foreground">{prop.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-2">
        <Button onClick={handleSave} disabled={saving || !hasChanges || !!error}>
          {saving ? 'Saving...' : 'Save Schema'}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/tools/ToolParamsEditor.tsx
git commit -m "feat(tools): add ToolParamsEditor with JSON Schema validation"
```

---

### Task 11: Create ToolTester component (core feature)

**Files:**
- Create: `src/renderer/components/tools/ToolTester.tsx`

**Step 1: Implement ToolTester.tsx**

```tsx
import { useState, useMemo } from 'react';
import { Play, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import type { ToolRecord } from '../../../shared/types';

interface ToolTesterProps {
  tool: ToolRecord;
}

interface ParamField {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enumValues?: string[];
}

export default function ToolTester({ tool }: ToolTesterProps) {
  const [params, setParams] = useState<Record<string, any>>({});
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{ data: string; duration: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fields: ParamField[] = useMemo(() => {
    if (!tool.parameters_schema) return [];
    try {
      const schema = JSON.parse(tool.parameters_schema);
      return Object.entries(schema.properties || {}).map(([key, val]: [string, any]) => ({
        name: key,
        type: val.type || 'string',
        description: val.description || '',
        required: schema.required?.includes(key) ?? false,
        enumValues: val.enum,
      }));
    } catch {
      return [];
    }
  }, [tool.parameters_schema]);

  const handleExecute = async () => {
    setExecuting(true);
    setResult(null);
    setError(null);
    try {
      // Parse numeric and boolean values from string inputs
      const parsed: Record<string, any> = {};
      for (const [key, val] of Object.entries(params)) {
        if (val === '' || val === undefined) continue;
        const field = fields.find((f) => f.name === key);
        if (field?.type === 'number') {
          parsed[key] = Number(val);
        } else if (field?.type === 'boolean') {
          parsed[key] = val === 'true';
        } else if (field?.type === 'array') {
          try { parsed[key] = JSON.parse(val); } catch { parsed[key] = val; }
        } else {
          parsed[key] = val;
        }
      }
      const res = await window.electronAPI.tools.execute(tool.id, parsed);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  };

  const formatResult = (text: string): string => {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  };

  if (!tool.parameters_schema) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-lg border border-[hsl(var(--border))] p-6 text-center">
          <p className="text-muted-foreground">No parameters defined for this tool.</p>
          <p className="text-sm text-muted-foreground mt-1">Go to the Parameters tab to define the input schema first.</p>
        </div>
        <div className="mt-4">
          <Button onClick={handleExecute} disabled={executing || !tool.is_enabled} className="gap-2">
            {executing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Execute (no params)
          </Button>
        </div>
        {result && <ResultDisplay result={result} />}
        {error && <ErrorDisplay error={error} />}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Auto-generated form from schema */}
      <div>
        <h3 className="text-sm font-medium mb-3">Input Parameters</h3>
        <div className="space-y-4 rounded-lg border border-[hsl(var(--border))] p-4">
          {fields.map((field) => (
            <div key={field.name}>
              <Label className="mb-1.5 flex items-center gap-2 text-sm">
                <span className="font-mono">{field.name}</span>
                <Badge variant="secondary" className="text-[10px]">{field.type}</Badge>
                {field.required && (
                  <Badge variant="outline" className="text-[10px] text-orange-500 border-orange-500/30">required</Badge>
                )}
              </Label>
              {field.description && (
                <p className="text-xs text-muted-foreground mb-1.5">{field.description}</p>
              )}
              {field.enumValues ? (
                <select
                  value={params[field.name] || ''}
                  onChange={(e) => setParams({ ...params, [field.name]: e.target.value })}
                  className="w-full h-9 rounded-md border border-[hsl(var(--border))] bg-background px-3 text-sm"
                >
                  <option value="">Select...</option>
                  {field.enumValues.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              ) : field.type === 'array' ? (
                <Textarea
                  value={params[field.name] || ''}
                  onChange={(e) => setParams({ ...params, [field.name]: e.target.value })}
                  placeholder='["item1", "item2"]'
                  rows={2}
                  className="font-mono text-sm"
                />
              ) : (
                <Input
                  value={params[field.name] || ''}
                  onChange={(e) => setParams({ ...params, [field.name]: e.target.value })}
                  placeholder={field.type === 'number' ? '0' : field.type === 'boolean' ? 'true/false' : `Enter ${field.name}...`}
                  type={field.type === 'number' ? 'number' : 'text'}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Execute button */}
      <Button
        onClick={handleExecute}
        disabled={executing || !tool.is_enabled}
        className="gap-2"
      >
        {executing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
        {executing ? 'Executing...' : 'Execute Tool'}
      </Button>

      {!tool.is_enabled && (
        <p className="text-sm text-destructive">This tool is disabled. Enable it to test.</p>
      )}

      <ResultDisplay result={result} />
      <ErrorDisplay error={error} />
    </div>
  );
}

function ResultDisplay({ result }: { result: { data: string; duration: number } | null }) {
  if (!result) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 size={16} className="text-green-500" />
        <h3 className="text-sm font-medium">Result</h3>
        <Badge variant="secondary" className="text-[10px]">{result.duration}ms</Badge>
      </div>
      <pre className="rounded-lg bg-muted/50 border border-[hsl(var(--border))] p-4 text-sm overflow-auto max-h-[400px] font-mono whitespace-pre-wrap">
        {(() => {
          try { return JSON.stringify(JSON.parse(result.data), null, 2); } catch { return result.data; }
        })()}
      </pre>
    </div>
  );
}

function ErrorDisplay({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle size={16} className="text-destructive" />
        <h3 className="text-sm font-medium text-destructive">Error</h3>
      </div>
      <pre className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-sm overflow-auto max-h-[200px] font-mono whitespace-pre-wrap">
        {error}
      </pre>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/tools/ToolTester.tsx
git commit -m "feat(tools): add ToolTester with auto-generated form from schema"
```

---

### Task 12: Create ToolStats component

**Files:**
- Create: `src/renderer/components/tools/ToolStats.tsx`

**Step 1: Implement ToolStats.tsx**

```tsx
import { Activity, Clock, Calendar, Hash } from 'lucide-react';
import type { ToolRecord } from '../../../shared/types';

interface ToolStatsProps {
  tool: ToolRecord;
}

export default function ToolStats({ tool }: ToolStatsProps) {
  const stats = [
    { label: 'Total Calls', value: tool.usage_count.toString(), icon: Activity },
    { label: 'Last Used', value: tool.last_used_at ? new Date(tool.last_used_at).toLocaleString() : 'Never', icon: Clock },
    { label: 'Created', value: new Date(tool.created_at).toLocaleString(), icon: Calendar },
    { label: 'Updated', value: new Date(tool.updated_at).toLocaleString(), icon: Calendar },
    { label: 'ID', value: tool.id, icon: Hash },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">Usage Statistics</h3>
      <div className="rounded-lg border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex items-center gap-3 px-4 py-3">
              <Icon size={16} className="text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground w-24 shrink-0">{stat.label}</span>
              <span className="text-sm font-mono">{stat.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/tools/ToolStats.tsx
git commit -m "feat(tools): add ToolStats for usage statistics display"
```

---

### Task 13: Verify and test

**Step 1: Start the dev server**

```bash
cd /Users/bloks/bzdev/playground/ming-desktop && npm run dev
```

**Step 2: Verify in browser**

1. Open the app, click "Tools" in the sidebar
2. Click "New" to create a tool
3. Edit the tool's basic info, save
4. Go to Parameters tab, add a JSON Schema, save
5. Go to Test tab, fill the form, execute
6. Go to Stats tab, verify usage count incremented

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "feat(tools): complete Tools management page"
```
