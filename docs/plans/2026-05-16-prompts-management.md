# Prompts Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the basic PromptManager into a full-featured Prompts management page with left-right split layout, variable support, test capability, and Chatbox integration.

**Architecture:** Extend the existing `prompt_templates` DB table with new columns (type, variables, category, tags, usage_count). Replace the card+dialog PromptManager with a ToolsPage-style left-right split layout. Add variable extraction/filling and LLM test features. Enhance Chatbox `/` menu to handle variable prompts.

**Tech Stack:** Electron, React, TypeScript, better-sqlite3, shadcn/ui (Tabs, Switch, Badge, Input, Textarea, Select, Dialog, ScrollArea), Tailwind CSS, Framer Motion

---

### Task 1: Database Migration — Add New Columns

**Files:**
- Modify: `src/main/database/schema.ts` (append new migration at end of `runMigrations()`)

**Step 1: Add migration for prompt_templates columns**

Append to `src/main/database/schema.ts` after the last migration block (after line 268):

```typescript
// Migration: extend prompt_templates with type, variables, category, tags, usage_count
const migration9Name = 'extend-prompt-templates';
const applied9 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration9Name);
if (!applied9) {
  const addColumn = (col: string, def: string) => {
    try { db.exec(`ALTER TABLE prompt_templates ADD COLUMN ${col} ${def}`); } catch { /* already exists */ }
  };
  addColumn('type', "TEXT NOT NULL DEFAULT 'task'");
  addColumn('variables', "TEXT DEFAULT '[]'");
  addColumn('category', 'TEXT');
  addColumn('tags', "TEXT DEFAULT '[]'");
  addColumn('usage_count', 'INTEGER DEFAULT 0');
  db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration9Name);
}
```

**Step 2: Verify migration**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/main/database/schema.ts
git commit -m "feat(db): extend prompt_templates with type, variables, category, tags, usage_count"
```

---

### Task 2: Update TypeScript Types

**Files:**
- Modify: `src/shared/types.ts:54-71` (PromptTemplate and PromptTemplateConfig interfaces)

**Step 1: Update PromptTemplate interface**

Replace the `PromptTemplate` interface in `src/shared/types.ts` (lines 54-63) with:

```typescript
export interface PromptTemplate {
  id: string;
  name: string;
  type: 'system' | 'task';
  trigger: string;
  description: string;
  content: string;
  variables: string[];
  category: string | null;
  tags: string[];
  enabled: boolean;
  usage_count: number;
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Update PromptTemplateConfig interface**

Replace the `PromptTemplateConfig` interface (lines 66-71) with:

```typescript
export interface PromptTemplateConfig {
  name: string;
  type?: 'system' | 'task';
  trigger?: string;
  description?: string;
  content: string;
  category?: string;
  tags?: string[];
  enabled?: boolean;
}
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No type errors (some downstream files may need updates — that's OK, we fix them in next tasks)

**Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add type, variables, category, tags, usage_count to PromptTemplate"
```

---

### Task 3: Update PromptTemplateManager Backend

**Files:**
- Modify: `src/main/services/PromptTemplateManager.ts`

**Step 1: Add variable extraction helper and update rowToPrompt**

Replace the entire `src/main/services/PromptTemplateManager.ts` with:

```typescript
import { randomUUID } from 'crypto';
import { PromptTemplate, PromptTemplateConfig } from '../../shared/types';
import { getDatabase } from '../database/connection';
import { Logger } from '../utils/Logger';

function normalizeTrigger(value: string): string {
  return value.trim().replace(/^\/+/, '').replace(/\s+/g, '-').toLowerCase();
}

function extractVariables(content: string): string[] {
  const matches = content.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

function rowToPrompt(row: any): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    type: row.type || 'task',
    trigger: row.trigger,
    description: row.description || '',
    content: row.content,
    variables: JSON.parse(row.variables || '[]'),
    category: row.category || null,
    tags: JSON.parse(row.tags || '[]'),
    enabled: !!row.enabled,
    usage_count: row.usage_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PromptTemplateManager {
  initialize(): void {
    Logger.info('Initializing Prompt Template Manager...');
  }

  listPrompts(): PromptTemplate[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM prompt_templates
      ORDER BY updated_at DESC
    `).all() as any[];
    return rows.map(rowToPrompt);
  }

  createPrompt(config: PromptTemplateConfig): string {
    const db = getDatabase();
    const id = `prompt-${randomUUID().slice(0, 8)}`;
    const name = config.name.trim();
    const trigger = normalizeTrigger(config.trigger || config.name);
    const description = config.description?.trim() || '';
    const content = config.content.trim();
    const variables = JSON.stringify(extractVariables(content));
    const type = config.type || 'task';
    const category = config.category || null;
    const tags = JSON.stringify(config.tags || []);

    db.prepare(`
      INSERT INTO prompt_templates (id, name, type, trigger, description, content, variables, category, tags, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, type, trigger, description, content, variables, category, tags, config.enabled === false ? 0 : 1);

    Logger.info(`Prompt template created: ${name}`);
    return id;
  }

  updatePrompt(promptId: string, updates: Partial<PromptTemplateConfig>): void {
    const current = getDatabase()
      .prepare('SELECT * FROM prompt_templates WHERE id = ?')
      .get(promptId) as any;

    if (!current) {
      throw new Error(`Prompt template not found: ${promptId}`);
    }

    const content = updates.content !== undefined ? updates.content.trim() : current.content;
    const variables = JSON.stringify(extractVariables(content));

    const next = {
      name: updates.name !== undefined ? updates.name.trim() : current.name,
      type: updates.type !== undefined ? updates.type : (current.type || 'task'),
      trigger: updates.trigger !== undefined ? normalizeTrigger(updates.trigger) : current.trigger,
      description: updates.description !== undefined ? updates.description.trim() : (current.description || ''),
      content,
      variables,
      category: updates.category !== undefined ? updates.category : current.category,
      tags: updates.tags !== undefined ? JSON.stringify(updates.tags) : (current.tags || '[]'),
      enabled: updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : current.enabled,
    };

    getDatabase().prepare(`
      UPDATE prompt_templates
      SET name = ?, type = ?, trigger = ?, description = ?, content = ?, variables = ?, category = ?, tags = ?, enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(next.name, next.type, next.trigger, next.description, next.content, next.variables, next.category, next.tags, next.enabled, promptId);

    Logger.info(`Prompt template updated: ${next.name}`);
  }

  incrementUsage(promptId: string): void {
    getDatabase().prepare(`
      UPDATE prompt_templates SET usage_count = usage_count + 1, updated_at = updated_at WHERE id = ?
    `).run(promptId);
  }

  deletePrompt(promptId: string): void {
    getDatabase().prepare('DELETE FROM prompt_templates WHERE id = ?').run(promptId);
    Logger.info(`Prompt template deleted: ${promptId}`);
  }
}
```

**Step 2: Verify compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/main/services/PromptTemplateManager.ts
git commit -m "feat(prompts): update PromptTemplateManager with variable extraction and new fields"
```

---

### Task 4: Add PROMPT_TEST IPC Channel

**Files:**
- Modify: `src/shared/ipc-channels.ts:21` (add new channel)
- Modify: `src/main/main.ts` (add handler near line 258)
- Modify: `src/main/preload.ts:31-37` (add test method)

**Step 1: Add IPC channel constant**

In `src/shared/ipc-channels.ts`, after `PROMPT_UPDATE` (line 21), add:

```typescript
PROMPT_TEST = 'prompt:test',
```

**Step 2: Add handler in main.ts**

In `src/main/main.ts`, after the `PROMPT_DELETE` handler (after line 258), add:

```typescript
ipcMain.handle(IPCChannels.PROMPT_TEST, async (_, renderedContent: string, model?: string) => {
  const { LLMService } = await import('./llm/LLMService');
  const llmService = new LLMService();
  const messages = [
    { role: 'user' as const, content: renderedContent },
  ];
  const result = await llmService.chat(messages, model || undefined);
  return result;
});
```

Note: Check `src/main/llm/LLMService.ts` for the actual chat API signature and adjust accordingly. The key is to call the LLM with a single user message containing the rendered prompt content and return the full response text.

**Step 3: Add preload method**

In `src/main/preload.ts`, inside the `prompts` object (after `delete` on line 36), add:

```typescript
test: (renderedContent: string, model?: string) =>
  ipcRenderer.invoke(IPCChannels.PROMPT_TEST, renderedContent, model),
```

Also update the `ElectronAPI` interface at the bottom of preload.ts, inside the `prompts` object:

```typescript
test: (renderedContent: string, model?: string) => Promise<string>;
```

**Step 4: Verify compiles**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/main.ts src/main/preload.ts
git commit -m "feat(prompts): add PROMPT_TEST IPC channel for prompt testing"
```

---

### Task 5: Create PromptsPage (Left-Right Split Layout)

**Files:**
- Create: `src/renderer/pages/PromptsPage.tsx`
- Modify: `src/renderer/App.tsx:8,115` (update import and usage)

**Step 1: Create PromptsPage.tsx**

Create `src/renderer/pages/PromptsPage.tsx` following the exact same pattern as `src/renderer/pages/ToolsPage.tsx` but adapted for prompts:

- Left panel: search, type filter pills (All / System / Task), category pills, prompt cards
- Right panel: PromptDetail component (or empty state)
- Resizable divider (same drag pattern as ToolsPage)
- Card shows: name, type badge, trigger, description, variable count, usage count, enabled badge

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import type { PromptTemplate } from '../../shared/types';
import PromptDetail from '../components/prompts/PromptDetail';

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'system', label: 'System' },
  { value: 'task', label: 'Task' },
] as const;

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'coding', label: 'Coding' },
  { value: 'writing', label: 'Writing' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'general', label: 'General' },
] as const;

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [sidebarWidth, setSidebarWidth] = useState(300);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadPrompts = useCallback(async () => {
    try {
      const list = await window.electronAPI.prompts.list();
      setPrompts(list || []);
    } catch (error) {
      console.error('Failed to load prompts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  const selectedPrompt = prompts.find((p) => p.id === selectedId) || null;

  const filtered = prompts.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.trigger.toLowerCase().includes(search.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || p.type === typeFilter;
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesType && matchesCategory;
  });

  const handleCreate = async () => {
    try {
      const name = `New Prompt`;
      const id = await window.electronAPI.prompts.create({
        name,
        type: 'task',
        trigger: `prompt-${Date.now().toString(36)}`,
        description: '',
        content: '',
        category: 'general',
      });
      await loadPrompts();
      setSelectedId(id);
    } catch (error) {
      console.error('Failed to create prompt:', error);
    }
  };

  const handleDelete = async (promptId: string) => {
    const prompt = prompts.find((p) => p.id === promptId);
    if (!prompt) return;
    if (!confirm(`Delete prompt "${prompt.name}"?`)) return;
    await window.electronAPI.prompts.delete(promptId);
    if (selectedId === promptId) setSelectedId(null);
    await loadPrompts();
  };

  const handleToggleEnabled = async (prompt: PromptTemplate) => {
    await window.electronAPI.prompts.update(prompt.id, { enabled: !prompt.enabled });
    await loadPrompts();
  };

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = moveEvent.clientX - containerRect.left;
      setSidebarWidth(Math.max(220, Math.min(containerRect.width * 0.45, newWidth)));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full flex">
      {/* Left panel: prompt list */}
      <div
        className="h-full flex-shrink-0 overflow-hidden border-r border-[hsl(var(--border))]"
        style={{ width: sidebarWidth }}
      >
        <div className="h-full flex flex-col">
          <div className="p-4 space-y-3 border-b border-[hsl(var(--border))]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Prompts</h2>
              <Button size="sm" onClick={handleCreate} className="h-8 gap-1.5">
                <Plus size={14} />
                New
              </Button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search prompts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setTypeFilter(f.value)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    typeFilter === f.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f.label}
                </button>
              ))}
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

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {loading ? (
                <div className="text-center text-sm text-muted-foreground py-8">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  {search || typeFilter !== 'all' || categoryFilter !== 'all' ? 'No matching prompts' : 'No prompts yet'}
                </div>
              ) : (
                filtered.map((prompt) => (
                  <button
                    key={prompt.id}
                    onClick={() => setSelectedId(prompt.id)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      selectedId === prompt.id
                        ? 'border-primary bg-primary/5'
                        : 'border-[hsl(var(--border))] hover:border-primary/40 hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{prompt.name}</span>
                          {!prompt.enabled && (
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              Disabled
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {prompt.description || `/${prompt.trigger}`}
                        </p>
                      </div>
                      <Badge
                        variant={prompt.type === 'system' ? 'default' : 'secondary'}
                        className="text-[10px] shrink-0"
                      >
                        {prompt.type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">/{prompt.trigger}</span>
                      {prompt.variables.length > 0 && (
                        <span>{prompt.variables.length} vars</span>
                      )}
                      <span>{prompt.usage_count} uses</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="w-1 h-full flex-shrink-0 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors"
        onMouseDown={handleResizeMouseDown}
      />

      {/* Right panel: detail */}
      <div className="flex-1 h-full min-w-0">
        {selectedPrompt ? (
          <PromptDetail
            prompt={selectedPrompt}
            onUpdate={loadPrompts}
            onDelete={() => handleDelete(selectedPrompt.id)}
            onToggleEnabled={() => handleToggleEnabled(selectedPrompt)}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg">Select a prompt to view details</p>
              <p className="text-sm mt-1">Or create a new one from the sidebar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Update App.tsx import and usage**

In `src/renderer/App.tsx`:
- Change line 8 from `import PromptManager from './components/PromptManager';` to `import PromptsPage from './pages/PromptsPage';`
- Change line 115 from `{activeTab === 'prompts' && <PromptManager />}` to `{activeTab === 'prompts' && <PromptsPage />}`

**Step 3: Verify compiles**

Run: `npx tsc --noEmit`
Note: Will have errors about missing `PromptDetail` component — that's expected, we create it next.

**Step 4: Commit**

```bash
git add src/renderer/pages/PromptsPage.tsx src/renderer/App.tsx
git commit -m "feat(prompts): create PromptsPage with left-right split layout"
```

---

### Task 6: Create PromptDetail Component

**Files:**
- Create: `src/renderer/components/prompts/PromptDetail.tsx`

**Step 1: Create the detail component with tabs**

Create `src/renderer/components/prompts/PromptDetail.tsx`:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import type { PromptTemplate } from '../../../shared/types';
import PromptBasicForm from './PromptBasicForm';
import PromptTester from './PromptTester';

interface PromptDetailProps {
  prompt: PromptTemplate;
  onUpdate: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
}

export default function PromptDetail({ prompt, onUpdate, onDelete, onToggleEnabled }: PromptDetailProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[hsl(var(--border))]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">{prompt.name}</h2>
            <Badge variant={prompt.type === 'system' ? 'default' : 'secondary'} className="text-xs">
              {prompt.type}
            </Badge>
            {prompt.category && (
              <Badge variant="outline" className="text-xs">{prompt.category}</Badge>
            )}
            {prompt.variables.length > 0 && (
              <Badge variant="outline" className="text-xs font-mono">
                {prompt.variables.length} vars
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Enabled</span>
              <Switch checked={prompt.enabled} onCheckedChange={onToggleEnabled} />
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
              <TabsTrigger value="test" className="text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2">Test</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="basic" className="mt-0 p-6">
              <PromptBasicForm prompt={prompt} onUpdate={onUpdate} />
            </TabsContent>
            <TabsContent value="test" className="mt-0 p-6">
              <PromptTester prompt={prompt} />
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
mkdir -p src/renderer/components/prompts
git add src/renderer/components/prompts/PromptDetail.tsx
git commit -m "feat(prompts): create PromptDetail with Basic Info and Test tabs"
```

---

### Task 7: Create PromptBasicForm Component

**Files:**
- Create: `src/renderer/components/prompts/PromptBasicForm.tsx`

**Step 1: Create the form component**

Create `src/renderer/components/prompts/PromptBasicForm.tsx`:

```tsx
import { useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { PromptTemplate } from '../../../shared/types';

const CATEGORIES = ['coding', 'writing', 'analysis', 'general'];

function extractVariables(content: string): string[] {
  const matches = content.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

interface PromptBasicFormProps {
  prompt: PromptTemplate;
  onUpdate: () => void;
}

export default function PromptBasicForm({ prompt, onUpdate }: PromptBasicFormProps) {
  const [name, setName] = useState(prompt.name);
  const [type, setType] = useState<'system' | 'task'>(prompt.type);
  const [trigger, setTrigger] = useState(prompt.trigger);
  const [description, setDescription] = useState(prompt.description);
  const [content, setContent] = useState(prompt.content);
  const [category, setCategory] = useState(prompt.category || 'general');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(prompt.tags);
  const [saving, setSaving] = useState(false);

  const detectedVars = extractVariables(content);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.prompts.update(prompt.id, {
        name: name.trim(),
        type,
        trigger: trigger.trim(),
        description: description.trim(),
        content: content.trim(),
        category,
        tags,
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to save prompt:', error);
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const hasChanges =
    name !== prompt.name ||
    type !== prompt.type ||
    trigger !== prompt.trigger ||
    description !== prompt.description ||
    content !== prompt.content ||
    category !== (prompt.category || 'general') ||
    JSON.stringify(tags) !== JSON.stringify(prompt.tags);

  return (
    <div className="max-w-2xl space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="mb-2 block">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prompt name" />
        </div>
        <div>
          <Label className="mb-2 block">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as 'system' | 'task')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="task">Task Prompt</SelectItem>
              <SelectItem value="system">System Prompt</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="mb-2 block">Trigger</Label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-sm">/</span>
            <Input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="e.g. review" />
          </div>
        </div>
        <div>
          <Label className="mb-2 block">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Description</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of this prompt"
        />
      </div>

      <div>
        <Label className="mb-2 block">Content</Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[240px] font-mono text-sm"
          placeholder="Prompt content. Use {variable_name} for variables."
        />
      </div>

      {detectedVars.length > 0 && (
        <div>
          <Label className="mb-2 block">Detected Variables</Label>
          <div className="flex flex-wrap gap-1.5">
            {detectedVars.map((v) => (
              <Badge key={v} variant="outline" className="font-mono text-xs">
                {'{' + v + '}'}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <Label className="mb-2 block">Tags</Label>
        <div className="flex items-center gap-2 mb-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addTag(); }
            }}
            placeholder="Type and press Enter to add"
            className="h-8 text-sm"
          />
          <Button size="sm" variant="secondary" onClick={addTag} className="h-8">
            Add
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="cursor-pointer hover:bg-destructive/20"
                onClick={() => removeTag(tag)}
              >
                {tag} ×
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving || !name.trim() || !hasChanges}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
        {!hasChanges && (
          <span className="text-xs text-muted-foreground">No changes</span>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify shadcn Select component exists**

Check that `src/renderer/components/ui/select.tsx` exists. If not, run `npx shadcn@latest add select`.

**Step 3: Commit**

```bash
git add src/renderer/components/prompts/PromptBasicForm.tsx
git commit -m "feat(prompts): create PromptBasicForm with variable detection and tag editing"
```

---

### Task 8: Create PromptTester Component

**Files:**
- Create: `src/renderer/components/prompts/PromptTester.tsx`

**Step 1: Create the tester component**

Create `src/renderer/components/prompts/PromptTester.tsx`:

```tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import type { PromptTemplate } from '../../../shared/types';

interface PromptTesterProps {
  prompt: PromptTemplate;
}

export default function PromptTester({ prompt }: PromptTesterProps) {
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [response, setResponse] = useState('');
  const [testing, setTesting] = useState(false);
  const [model, setModel] = useState('');
  const [providers, setProviders] = useState<any[]>([]);
  const abortRef = useRef(false);

  useEffect(() => {
    window.electronAPI.llm.listProviders().then((list: any[]) => {
      const enabled = list.filter((p) => p.enabled);
      setProviders(enabled);
      const saved = localStorage.getItem('selectedModel');
      if (saved && enabled.some((p) => (p.enabledModels || []).includes(saved))) {
        setModel(saved);
      } else if (enabled.length > 0) {
        const first = enabled.find((p) => (p.enabledModels || []).length > 0);
        if (first) setModel(first.enabledModels[0]);
      }
    }).catch(() => {});
  }, []);

  const renderContent = useCallback(() => {
    let result = prompt.content;
    for (const [key, value] of Object.entries(varValues)) {
      result = result.replaceAll(`{${key}}`, value);
    }
    return result;
  }, [prompt.content, varValues]);

  const handleTest = async () => {
    setTesting(true);
    setResponse('');
    abortRef.current = false;

    const rendered = renderContent();
    try {
      const result = await window.electronAPI.prompts.test(rendered, model || undefined);
      if (!abortRef.current) {
        setResponse(result || '(empty response)');
      }
    } catch (error) {
      if (!abortRef.current) {
        setResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      setTesting(false);
    }
  };

  const handleAbort = () => {
    abortRef.current = true;
    setTesting(false);
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Model:</span>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="bg-transparent border border-[hsl(var(--border))] rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {providers.map((provider) =>
            (provider.enabledModels || []).map((m: string) => (
              <option key={`${provider.id}-${m}`} value={m}>{m}</option>
            ))
          )}
        </select>
      </div>

      {prompt.variables.length > 0 && (
        <div>
          <Label className="mb-3 block">Fill Variables</Label>
          <div className="space-y-3">
            {prompt.variables.map((v) => (
              <div key={v}>
                <Label className="mb-1 block text-xs font-mono text-muted-foreground">{'{' + v + '}'}</Label>
                <Input
                  value={varValues[v] || ''}
                  onChange={(e) => setVarValues({ ...varValues, [v]: e.target.value })}
                  placeholder={`Value for ${v}`}
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <Label className="mb-2 block">Rendered Preview</Label>
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[var(--surface)] p-3 text-sm font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
          {renderContent() || '(empty)'}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleTest} disabled={testing || !model}>
          {testing ? 'Running...' : 'Run Test'}
        </Button>
        {testing && (
          <Button variant="ghost" onClick={handleAbort}>Cancel</Button>
        )}
      </div>

      {response && (
        <div>
          <Label className="mb-2 block">Response</Label>
          <ScrollArea className="rounded-lg border border-[hsl(var(--border))] bg-[var(--surface)] p-3 max-h-[300px]">
            <div className="text-sm whitespace-pre-wrap">{response}</div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/prompts/PromptTester.tsx
git commit -m "feat(prompts): create PromptTester with variable filling and LLM test"
```

---

### Task 9: Create VariableFillDialog for Chatbox

**Files:**
- Create: `src/renderer/components/chat/VariableFillDialog.tsx`

**Step 1: Create the variable fill dialog**

Create `src/renderer/components/chat/VariableFillDialog.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface VariableFillDialogProps {
  open: boolean;
  variables: string[];
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export default function VariableFillDialog({ open, variables, onConfirm, onCancel }: VariableFillDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {};
      variables.forEach((v) => { initial[v] = ''; });
      setValues(initial);
    }
  }, [open, variables]);

  const handleConfirm = () => {
    onConfirm(values);
  };

  const allFilled = variables.every((v) => values[v]?.trim());

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fill Variables</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {variables.map((v) => (
            <div key={v}>
              <Label className="mb-1 block text-xs font-mono text-muted-foreground">{'{' + v + '}'}</Label>
              <Input
                value={values[v] || ''}
                onChange={(e) => setValues({ ...values, [v]: e.target.value })}
                placeholder={`Value for ${v}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && allFilled) handleConfirm();
                }}
                autoFocus
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!allFilled}>Insert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/chat/VariableFillDialog.tsx
git commit -m "feat(chat): create VariableFillDialog for prompt variable filling"
```

---

### Task 10: Update useChatInput for Variable Prompts

**Files:**
- Modify: `src/renderer/components/chat/hooks/useChatInput.ts`

**Step 1: Add variable-aware prompt application**

Update `src/renderer/components/chat/hooks/useChatInput.ts` to:
1. Add `pendingVariablePrompt` state
2. Change `applyPromptSuggestion` to check for variables
3. If variables exist, set `pendingVariablePrompt` instead of directly inserting
4. Add `applyVariableValues` method that fills variables and inserts

Replace the entire file with:

```typescript
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { PromptSuggestion, PromptTemplate } from '../types';

function extractVariables(content: string): string[] {
  const matches = content.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

export function useChatInput({
  promptTemplates,
  isLoading,
}: {
  promptTemplates: PromptTemplate[];
  isLoading: boolean;
}) {
  const [input, setInput] = useState('');
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const [tools, setTools] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [pendingVariablePrompt, setPendingVariablePrompt] = useState<PromptSuggestion | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    window.electronAPI.tools.list().then((list: any[]) => {
      setTools(list.filter(t => t.is_enabled));
    }).catch(() => {});
    window.electronAPI.skills.list().then((list: any[]) => {
      setSkills(list.filter((s: any) => s.enabled));
    }).catch(() => {});
  }, []);

  const slashQuery = input.startsWith('/') ? input.slice(1).trim().toLowerCase() : null;

  const promptSuggestions = useMemo<PromptSuggestion[]>(() => {
    if (slashQuery === null) return [];

    const toolItems: PromptSuggestion[] = tools.map((tool) => ({
      id: `tool-${tool.name}`,
      name: tool.display_name || tool.name,
      trigger: tool.name,
      description: tool.description || '',
      content: `/${tool.name} `,
      type: 'tool' as const,
    }));

    const skillItems: PromptSuggestion[] = skills.map((skill) => ({
      id: `skill-${skill.id}`,
      name: skill.name,
      trigger: skill.name.toLowerCase(),
      description: skill.description || '',
      content: skill.prompt,
      type: 'skill' as const,
    }));

    const promptItems: PromptSuggestion[] = promptTemplates
      .filter((prompt) => prompt.enabled)
      .map<PromptSuggestion>((prompt) => ({
        id: prompt.id,
        name: prompt.name,
        trigger: prompt.trigger || prompt.name.toLowerCase(),
        description: prompt.description,
        content: prompt.content,
        type: 'prompt' as const,
      }));

    const all = [...toolItems, ...skillItems, ...promptItems];
    if (!slashQuery) return all.slice(0, 10);

    return all
      .filter((item) => {
        const haystack = `${item.name} ${item.trigger} ${item.description}`.toLowerCase();
        return haystack.includes(slashQuery);
      })
      .slice(0, 10);
  }, [tools, skills, promptTemplates, slashQuery]);

  const promptMenuOpen = slashQuery !== null && promptSuggestions.length > 0 && !isLoading;

  useEffect(() => {
    setSelectedPromptIndex(0);
  }, [slashQuery]);

  const applyPromptSuggestion = useCallback((suggestion: PromptSuggestion) => {
    const vars = extractVariables(suggestion.content);
    if (vars.length > 0 && suggestion.type === 'prompt') {
      setPendingVariablePrompt(suggestion);
    } else {
      setInput(suggestion.content);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    setSelectedPromptIndex(0);
  }, []);

  const applyVariableValues = useCallback((values: Record<string, string>) => {
    if (!pendingVariablePrompt) return;
    let rendered = pendingVariablePrompt.content;
    for (const [key, value] of Object.entries(values)) {
      rendered = rendered.replaceAll(`{${key}}`, value);
    }
    setInput(rendered);
    setPendingVariablePrompt(null);
    // Increment usage count in background
    window.electronAPI.prompts.update(pendingVariablePrompt.id, {}).catch(() => {});
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [pendingVariablePrompt]);

  const cancelVariableFill = useCallback(() => {
    setPendingVariablePrompt(null);
  }, []);

  return {
    input,
    setInput,
    inputRef,
    slashQuery,
    promptSuggestions,
    promptMenuOpen,
    selectedPromptIndex,
    setSelectedPromptIndex,
    applyPromptSuggestion,
    pendingVariablePrompt,
    applyVariableValues,
    cancelVariableFill,
  };
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/chat/hooks/useChatInput.ts
git commit -m "feat(chat): update useChatInput with variable-aware prompt application"
```

---

### Task 11: Wire VariableFillDialog into ChatLayout

**Files:**
- Modify: `src/renderer/components/chat/ChatLayout.tsx`

**Step 1: Add VariableFillDialog to ChatLayout**

In `src/renderer/components/chat/ChatLayout.tsx`:

1. Add import: `import VariableFillDialog from './VariableFillDialog';`

2. Destructure the new values from `useChatInput`:
   Add `pendingVariablePrompt`, `applyVariableValues`, `cancelVariableFill` to the destructured return of `useChatInput` (around line 64-72).

3. Add the `VariableFillDialog` component before the closing `</div>` of the main container (before line 285):

```tsx
<VariableFillDialog
  open={!!pendingVariablePrompt}
  variables={pendingVariablePrompt ? extractVariables(pendingVariablePrompt.content) : []}
  onConfirm={applyVariableValues}
  onCancel={cancelVariableFill}
/>
```

4. Add the `extractVariables` helper function at the top of the file (or import from a shared util):
```typescript
function extractVariables(content: string): string[] {
  const matches = content.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}
```

**Step 2: Verify compiles and app runs**

Run: `npx tsc --noEmit && npm run dev`

**Step 3: Commit**

```bash
git add src/renderer/components/chat/ChatLayout.tsx
git commit -m "feat(chat): wire VariableFillDialog into ChatLayout for variable prompts"
```

---

### Task 12: Seed Default Prompts

**Files:**
- Modify: `src/main/database/schema.ts` (add seed data after migration 9)

**Step 1: Add seed prompts in the migration**

After the migration 9 block added in Task 1, add seed data:

```typescript
// Seed default prompts if table is empty
const promptCount = db.prepare('SELECT COUNT(*) as count FROM prompt_templates').get() as any;
if (promptCount.count === 0) {
  const seedPrompts = [
    {
      id: 'prompt-code-review',
      name: 'Code Review',
      type: 'task',
      trigger: 'review',
      description: 'Review code for quality, bugs, and improvements',
      content: 'Please review the following code from {project_name}. Focus on:\n1. Code quality and readability\n2. Potential bugs or issues\n3. Performance considerations\n4. Suggestions for improvement\n\nCode:\n{code}',
      category: 'coding',
      tags: JSON.stringify(['review', 'quality']),
    },
    {
      id: 'prompt-explain',
      name: 'Explain Code',
      type: 'task',
      trigger: 'explain',
      description: 'Explain code in plain language',
      content: 'Please explain the following code in simple terms. What does it do, how does it work, and why might it be written this way?\n\n{code}',
      category: 'coding',
      tags: JSON.stringify(['explain', 'learning']),
    },
    {
      id: 'prompt-assistant',
      name: 'Helpful Assistant',
      type: 'system',
      trigger: 'assistant',
      description: 'A friendly, helpful AI assistant',
      content: 'You are a helpful, friendly AI assistant. Be concise but thorough. Use examples when helpful. If you are unsure about something, say so.',
      category: 'general',
      tags: JSON.stringify(['general', 'assistant']),
    },
  ];

  const insertSeed = db.prepare(`
    INSERT INTO prompt_templates (id, name, type, trigger, description, content, variables, category, tags, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  for (const p of seedPrompts) {
    const vars = p.content.match(/\{(\w+)\}/g);
    const variables = vars ? JSON.stringify([...new Set(vars.map((m: string) => m.slice(1, -1)))]) : '[]';
    insertSeed.run(p.id, p.name, p.type, p.trigger, p.description, p.content, variables, p.category, p.tags);
  }
}
```

**Step 2: Commit**

```bash
git add src/main/database/schema.ts
git commit -m "feat(prompts): seed default prompts (code review, explain, assistant)"
```

---

### Task 13: Final Verification and Cleanup

**Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Start the app and test manually**

Run: `npm run dev`

Verify:
1. Prompts page shows left-right split layout
2. Default seed prompts appear in the list
3. Type and category filters work
4. Clicking a prompt shows detail with Basic Info and Test tabs
5. Basic Info form: edit name, type, trigger, description, content, category, tags — Save works
6. Variable detection works when typing `{variable}` in content
7. Test tab: fill variables, run test, see LLM response
8. In Chatbox: type `/` → see prompts in suggestion list
9. Select a prompt with variables → VariableFillDialog appears
10. Fill variables → content is inserted into input
11. Enable/disable toggle works
12. Delete prompt works with confirmation

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(prompts): final cleanup and fixes"
```
