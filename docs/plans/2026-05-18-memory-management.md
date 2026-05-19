# Memory Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Memory Management page with CRUD UI, system prompt injection, and Agent tool calls (suggest_memory / recall_memories).

**Architecture:** Main process manages a `memories` SQLite table via a `MemoryManager` service. IPC channels expose CRUD + preview to the renderer. The `ChatEngine.buildContext()` method appends active memories to the system prompt. Two new tools (`suggest_memory`, `recall_memories`) are registered in `ToolExecutor`.

**Tech Stack:** SQLite (better-sqlite3), Electron IPC, React, shadcn/ui, Zustand (optional), Lucide icons

---

### Task 1: Database Migration — Add `memories` Table

**Files:**
- Modify: `src/main/database/schema.ts` (append after migration 14)

**Step 1: Add the migration**

Append to `runMigrations()` in `schema.ts`, after the `migration14Name` block (after line 411):

```typescript
  // Migration: add memories table
  const migration15Name = 'add-memories';
  const applied15 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration15Name);
  if (!applied15) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('profile', 'preference', 'context', 'custom')),
        source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'agent_suggested')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
    `);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration15Name);
  }
```

**Step 2: Verify**

Run: `npm run dev`
Expected: App starts without errors. Check database file for `memories` table existence.

**Step 3: Commit**

```
feat(memory): add memories table migration
```

---

### Task 2: MemoryManager Service

**Files:**
- Create: `src/main/services/MemoryManager.ts`

**Step 1: Create the service**

```typescript
import { getDatabase } from '../database/connection';
import { randomUUID } from 'crypto';

export interface MemoryRecord {
  id: string;
  content: string;
  category: 'profile' | 'preference' | 'context' | 'custom';
  source: 'manual' | 'agent_suggested';
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export class MemoryManager {
  list(filters?: { category?: string; source?: string; status?: string; search?: string }): MemoryRecord[] {
    const db = getDatabase();
    let sql = 'SELECT * FROM memories WHERE 1=1';
    const params: any[] = [];

    if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
    else { sql += " AND status = 'active'"; }

    if (filters?.category) { sql += ' AND category = ?'; params.push(filters.category); }
    if (filters?.source) { sql += ' AND source = ?'; params.push(filters.source); }
    if (filters?.search) { sql += ' AND content LIKE ?'; params.push(`%${filters.search}%`); }

    sql += ' ORDER BY category, updated_at DESC';
    return db.prepare(sql).all(...params) as MemoryRecord[];
  }

  get(id: string): MemoryRecord | undefined {
    return getDatabase().prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRecord | undefined;
  }

  create(data: { content: string; category: string; source?: string }): MemoryRecord {
    const db = getDatabase();
    const id = randomUUID();
    const source = data.source || 'manual';
    db.prepare(`
      INSERT INTO memories (id, content, category, source, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(id, data.content, data.category, source);
    return this.get(id)!;
  }

  update(id: string, data: { content?: string; category?: string; status?: string }): MemoryRecord | undefined {
    const db = getDatabase();
    const sets: string[] = [];
    const params: any[] = [];

    if (data.content !== undefined) { sets.push('content = ?'); params.push(data.content); }
    if (data.category !== undefined) { sets.push('category = ?'); params.push(data.category); }
    if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status); }

    if (sets.length === 0) return this.get(id);

    sets.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare(`UPDATE memories SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.get(id);
  }

  delete(id: string): void {
    getDatabase().prepare('DELETE FROM memories WHERE id = ?').run(id);
  }

  getActiveMemories(): MemoryRecord[] {
    return this.list({ status: 'active' });
  }

  formatMemoriesForPrompt(): string {
    const memories = this.getActiveMemories();
    if (memories.length === 0) return '';

    const order = ['profile', 'preference', 'context', 'custom'];
    const sorted = [...memories].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));

    const lines = sorted.map(m => `- [${m.category}] ${m.content}`).join('\n');
    return `\n## User Memories\n\nThe following are facts and preferences you should remember about the user:\n\n${lines}\n`;
  }

  estimateTokens(): number {
    const text = this.formatMemoriesForPrompt();
    // Rough estimate: ~4 chars per token
    return Math.ceil(text.length / 4);
  }
}
```

**Step 2: Commit**

```
feat(memory): add MemoryManager service with CRUD and prompt formatting
```

---

### Task 3: IPC Channels

**Files:**
- Modify: `src/shared/ipc-channels.ts`

**Step 1: Add memory IPC channels**

Append to the `IPCChannels` enum, before the closing `}`:

```typescript
  // Memory 相关
  MEMORY_LIST = 'memory:list',
  MEMORY_GET = 'memory:get',
  MEMORY_CREATE = 'memory:create',
  MEMORY_UPDATE = 'memory:update',
  MEMORY_DELETE = 'memory:delete',
  MEMORY_PREVIEW = 'memory:preview',
```

**Step 2: Commit**

```
feat(memory): add memory IPC channel definitions
```

---

### Task 4: Preload Bridge

**Files:**
- Modify: `src/main/preload.ts`

**Step 1: Add memory API to preload**

In the `contextBridge.exposeInMainWorld('electronAPI', {...})` block, add a `memories` section (after the `mcpDebug` block, before the closing `})`):

```typescript
  // Memory API
  memories: {
    list: (filters?: any) => ipcRenderer.invoke(IPCChannels.MEMORY_LIST, filters),
    get: (id: string) => ipcRenderer.invoke(IPCChannels.MEMORY_GET, id),
    create: (data: any) => ipcRenderer.invoke(IPCChannels.MEMORY_CREATE, data),
    update: (id: string, data: any) => ipcRenderer.invoke(IPCChannels.MEMORY_UPDATE, id, data),
    delete: (id: string) => ipcRenderer.invoke(IPCChannels.MEMORY_DELETE, id),
    preview: () => ipcRenderer.invoke(IPCChannels.MEMORY_PREVIEW),
  },
```

**Step 2: Add type definitions**

In the `ElectronAPI` interface, add:

```typescript
  memories: {
    list: (filters?: any) => Promise<any[]>;
    get: (id: string) => Promise<any>;
    create: (data: any) => Promise<any>;
    update: (id: string, data: any) => Promise<any>;
    delete: (id: string) => Promise<void>;
    preview: () => Promise<{ text: string; tokens: number }>;
  };
```

**Step 3: Commit**

```
feat(memory): add memory preload bridge
```

---

### Task 5: Main Process IPC Handlers

**Files:**
- Modify: `src/main/main.ts`

**Step 1: Import MemoryManager**

At the top imports section, add:

```typescript
import { MemoryManager } from './services/MemoryManager';
```

**Step 2: Initialize MemoryManager**

In the `initializeServices()` function, after the `promptTemplateManager` initialization (around line 179), add:

```typescript
  memoryManager = new MemoryManager();
```

**Step 3: Declare the module-level variable**

Find the area where other service variables are declared (e.g., `let chatService: ChatService`), add:

```typescript
let memoryManager: MemoryManager;
```

**Step 4: Add IPC handlers**

In the `setupIPCHandlers()` function, add a Memory section:

```typescript
  // Memory 相关
  ipcMain.handle(IPCChannels.MEMORY_LIST, async (_, filters?: any) => {
    return memoryManager.list(filters);
  });

  ipcMain.handle(IPCChannels.MEMORY_GET, async (_, id: string) => {
    return memoryManager.get(id);
  });

  ipcMain.handle(IPCChannels.MEMORY_CREATE, async (_, data: any) => {
    return memoryManager.create(data);
  });

  ipcMain.handle(IPCChannels.MEMORY_UPDATE, async (_, id: string, data: any) => {
    return memoryManager.update(id, data);
  });

  ipcMain.handle(IPCChannels.MEMORY_DELETE, async (_, id: string) => {
    memoryManager.delete(id);
  });

  ipcMain.handle(IPCChannels.MEMORY_PREVIEW, async () => {
    return {
      text: memoryManager.formatMemoriesForPrompt(),
      tokens: memoryManager.estimateTokens(),
    };
  });
```

**Step 5: Verify**

Run: `npm run dev`
Expected: App starts. Open DevTools console, run `window.electronAPI.memories.list()` — should return empty array `[]`.

**Step 6: Commit**

```
feat(memory): wire up MemoryManager IPC handlers in main process
```

---

### Task 6: Memory Tools (suggest_memory, recall_memories)

**Files:**
- Create: `src/main/tools/suggestMemoryTool.ts`
- Create: `src/main/tools/recallMemoriesTool.ts`
- Modify: `src/main/main.ts`

**Step 1: Create suggestMemoryTool.ts**

```typescript
import { ToolDefinition } from '../../shared/types';
import { ToolEntry } from './ToolExecutor';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'suggest_memory',
    description: 'Suggest a memory to save about the user. Use this when the user shares personal information, preferences, work habits, or other facts worth remembering for future conversations. The suggestion will be shown to the user for confirmation before saving.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The memory content as a short factual statement, e.g. "用户是前端工程师，精通 React"',
        },
        category: {
          type: 'string',
          enum: ['profile', 'preference', 'context', 'custom'],
          description: 'Category: profile (identity/role), preference (style/habits), context (project/work info), custom (other)',
        },
        reason: {
          type: 'string',
          description: 'Why this is worth remembering (shown to user for context)',
        },
      },
      required: ['content', 'category'],
    },
  },
};

export function createSuggestMemoryTool(
  getMemoryManager: () => import('../services/MemoryManager').MemoryManager,
): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params: Record<string, any>) => {
      try {
        const mm = getMemoryManager();
        const memory = mm.create({
          content: params.content,
          category: params.category,
          source: 'agent_suggested',
        });
        return JSON.stringify({
          success: true,
          message: `Memory suggestion saved: "${memory.content}" (${memory.category})`,
          memory: { id: memory.id, content: memory.content, category: memory.category },
        });
      } catch (error: any) {
        return JSON.stringify({ success: false, error: error.message || String(error) });
      }
    },
  };
}
```

**Step 2: Create recallMemoriesTool.ts**

```typescript
import { ToolDefinition } from '../../shared/types';
import { ToolEntry } from './ToolExecutor';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'recall_memories',
    description: 'Recall stored memories about the user. Returns relevant facts and preferences to personalize responses. Use this when you need context about the user.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to look up about the user (for future semantic search, currently returns all)',
        },
        limit: {
          type: 'number',
          description: 'Max memories to return (default: 10)',
        },
      },
    },
  },
};

export function createRecallMemoriesTool(
  getMemoryManager: () => import('../services/MemoryManager').MemoryManager,
): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params: Record<string, any>) => {
      try {
        const mm = getMemoryManager();
        const limit = params.limit || 10;
        const memories = mm.getActiveMemories().slice(0, limit);
        return JSON.stringify({
          count: memories.length,
          memories: memories.map(m => ({ content: m.content, category: m.category })),
        });
      } catch (error: any) {
        return JSON.stringify({ error: error.message || String(error) });
      }
    },
  };
}
```

**Step 3: Register tools in main.ts**

In `initializeServices()`, after the existing tool registrations (around line 166), add:

```typescript
  toolExecutor.register(createSuggestMemoryTool(() => memoryManager));
  toolExecutor.register(createRecallMemoriesTool(() => memoryManager));
```

Add imports at the top:

```typescript
import { createSuggestMemoryTool } from './tools/suggestMemoryTool';
import { createRecallMemoriesTool } from './tools/recallMemoriesTool';
```

**Step 4: Verify**

Run: `npm run dev`
Expected: App starts. Chat with the agent and ask it to suggest a memory or recall memories.

**Step 5: Commit**

```
feat(memory): add suggest_memory and recall_memories tools
```

---

### Task 7: Inject Memories into System Prompt

**Files:**
- Modify: `src/main/chat/ChatEngine.ts`

**Step 1: Add memory injection to buildContext**

The `ChatEngine` constructor needs a new parameter to load memories. Update the constructor:

```typescript
export class ChatEngine {
  constructor(
    private llmManager: LLMProviderManager,
    private toolExecutor: ToolExecutor,
    private loadAgent: (id: string) => Agent | undefined,
    private loadSkills: (ids: string[]) => Skill[],
    private loadHistory: (conversationId: string, limit: number) => ChatMessage[],
    private getMemoryPrompt: () => string,
  ) {}
```

**Step 2: Append memory prompt in buildContext**

In the `buildContext` method, after the systemContent is assembled (around line 131), append:

```typescript
    // Inject user memories
    const memoryPrompt = this.getMemoryPrompt();
    if (memoryPrompt) {
      systemContent += '\n' + memoryPrompt;
    }
```

**Step 3: Update ChatService to pass the new parameter**

In `src/main/chat/ChatService.ts`, find where `ChatEngine` is instantiated and add the memory prompt callback:

```typescript
new ChatEngine(
  this.llmManager,
  this.toolExecutor,
  // ... existing params
  () => memoryManager.formatMemoriesForPrompt(),
)
```

Note: The exact file/line depends on how ChatService creates ChatEngine. Check the constructor and adjust accordingly.

**Step 4: Verify**

Run: `npm run dev`
Create a memory manually via DevTools: `window.electronAPI.memories.create({content: '测试记忆', category: 'profile'})`
Start a new chat. Check the `context` tool event in execution details — system prompt should include the memory.

**Step 5: Commit**

```
feat(memory): inject active memories into chat system prompt
```

---

### Task 8: Memory Management Page UI

**Files:**
- Create: `src/renderer/pages/MemoryPage.tsx`

**Step 1: Create the page component**

This is the main UI. Use the same two-panel layout pattern as `ToolsPage.tsx` — left sidebar with memory list, right panel with preview.

Key sections:

**A. Imports and constants:**
```typescript
import { useState, useEffect, useCallback } from 'react';
import { Brain, Plus, Search, Archive, Edit3, Check, X, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
```

**B. Category filter options:**
```typescript
const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'profile', label: 'Profile' },
  { value: 'preference', label: 'Preference' },
  { value: 'context', label: 'Context' },
  { value: 'custom', label: 'Custom' },
] as const;

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'manual', label: 'Manual' },
  { value: 'agent_suggested', label: 'Agent' },
] as const;
```

**C. Main component structure:**

Left panel:
- Search input + category filter + source filter
- "New Memory" button
- Memory list: each item shows content preview, category badge (color-coded), source badge, timestamp
- Click to select, inline edit support

Right panel (two tabs):
- Tab 1 "Preview": shows formatted system prompt injection text + token count
- Tab 2 "Recall Test": input field to simulate a message, shows all active memories (MVP)

**D. State:**
```typescript
const [memories, setMemories] = useState<any[]>([]);
const [selectedId, setSelectedId] = useState<string | null>(null);
const [search, setSearch] = useState('');
const [categoryFilter, setCategoryFilter] = useState('all');
const [sourceFilter, setSourceFilter] = useState('all');
const [loading, setLoading] = useState(true);
const [preview, setPreview] = useState<{ text: string; tokens: number } | null>(null);
const [showArchived, setShowArchived] = useState(false);
const [editingId, setEditingId] = useState<string | null>(null);
const [editContent, setEditContent] = useState('');
const [editCategory, setEditCategory] = useState('');
const [showCreateDialog, setShowCreateDialog] = useState(false);
const [newContent, setNewContent] = useState('');
const [newCategory, setNewCategory] = useState('profile');
const [recallQuery, setRecallQuery] = useState('');
```

**E. Category badge colors:**
```typescript
const categoryColors: Record<string, string> = {
  profile: 'bg-blue-500/10 text-blue-500',
  preference: 'bg-purple-500/10 text-purple-500',
  context: 'bg-green-500/10 text-green-500',
  custom: 'bg-orange-500/10 text-orange-500',
};
```

**Step 2: Commit**

```
feat(memory): add Memory Management page with CRUD, preview, and recall test
```

---

### Task 9: Register Page in Navigation

**Files:**
- Modify: `src/renderer/components/NavRail.tsx`
- Modify: `src/renderer/App.tsx`

**Step 1: Add to NavRail navItems**

In `NavRail.tsx`, add to imports:

```typescript
import { Brain } from 'lucide-react';
```

Add to `navItems` array (after the `prompts` entry):

```typescript
  { id: 'memories', icon: Brain, label: 'Memories' },
```

**Step 2: Add to App.tsx**

In `App.tsx`, add import:

```typescript
import MemoryPage from './pages/MemoryPage';
```

Add to the rendering section:

```typescript
{activeTab === 'memories' && <MemoryPage />}
```

**Step 3: Verify**

Run: `npm run dev`
Expected: "Memories" appears in the navigation rail with a brain icon. Clicking it shows the Memory Management page with empty state.

**Step 4: Commit**

```
feat(memory): add Memory page to navigation
```

---

### Task 10: End-to-End Manual Test

**Step 1: Test CRUD**
1. Navigate to Memories page
2. Create a memory: content = "用户是前端工程师", category = profile
3. Create another: content = "回复偏好：简洁中文", category = preference
4. Verify both appear in the list with correct badges
5. Edit the first memory, change content
6. Archive the second memory
7. Toggle "Show Archived" to verify it appears there

**Step 2: Test Preview**
1. Click the Preview tab on the right panel
2. Verify the formatted system prompt text shows both memories
3. Check token count display

**Step 3: Test Recall**
1. Click the Recall Test tab
2. Type a simulated message
3. Verify all active memories are shown as matches

**Step 4: Test Chat Integration**
1. Start a new chat conversation
2. Verify the agent knows the user info from memories
3. Tell the agent something about yourself (e.g., "我最喜欢用 TypeScript")
4. Check if the agent calls `suggest_memory` tool
5. Verify the memory appears in the Memories page

**Step 5: Final commit**

```
feat(memory): complete memory management system
```
