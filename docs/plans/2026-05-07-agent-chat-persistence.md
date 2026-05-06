# Agent Chat Persistence — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add conversation sessions with sidebar + chat layout, persistent history, and mid-conversation agent switching.

**Architecture:** New `conversations` table linked to existing `chat_messages` via `conversation_id`. AgentManager gains conversation CRUD methods. IPC channels and preload API bridge main-to-renderer. AgentChat.tsx restructured with conversation sidebar on the left and chat area on the right.

**Tech Stack:** SQLite (better-sqlite3), Electron IPC, React, shadcn/ui components, TypeScript

---

### Task 1: Database migration — conversations table + chat_messages.conversation_id

**Files:**
- Modify: `src/main/database/schema.ts:62-84`

**Step 1: Add migration to schema.ts**

After the existing `add-qwen-deepseek-provider-types` migration block (line 83), add a new migration:

```typescript
  // Migration: add conversations table and conversation_id to chat_messages
  const migration2Name = 'add-conversations';
  const applied2 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration2Name);
  if (!applied2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'New Conversation',
        agent_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      ALTER TABLE chat_messages ADD COLUMN conversation_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON chat_messages(conversation_id, timestamp);
    `);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration2Name);
  }
```

**Step 2: Verify migration runs**

Run: `npm run dev` (or `npm start`)
Expected: App starts without errors. Open DevTools → Application → check that `conversations` table exists.

**Step 3: Commit**

```bash
git add src/main/database/schema.ts
git commit -m "feat(db): add conversations table and conversation_id column migration"
```

---

### Task 2: Shared types — Conversation interface

**Files:**
- Modify: `src/shared/types.ts:47-51`

**Step 1: Add Conversation type**

After the `ChatMessage` interface (line 51), add:

```typescript
export interface Conversation {
  id: string;
  title: string;
  agentId?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add Conversation interface"
```

---

### Task 3: IPC channels for conversations

**Files:**
- Modify: `src/shared/ipc-channels.ts:47-48`

**Step 1: Add conversation channels**

Before the closing `}` of the enum (line 48), add:

```typescript
  // Conversation 相关
  CONVERSATION_CREATE = 'conversation:create',
  CONVERSATION_LIST = 'conversation:list',
  CONVERSATION_MESSAGES = 'conversation:messages',
  CONVERSATION_DELETE = 'conversation:delete',
  CONVERSATION_RENAME = 'conversation:rename',
  CONVERSATION_CHAT = 'conversation:chat',
```

**Step 2: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat(ipc): add conversation channel definitions"
```

---

### Task 4: AgentManager — conversation CRUD + updated chat()

**Files:**
- Modify: `src/main/agent/AgentManager.ts`

**Step 1: Add import for Conversation type**

At line 3, update the import:

```typescript
import { Agent, AgentConfig, ChatMessage, Conversation } from '../../shared/types';
```

**Step 2: Add conversation methods**

After `clearChatHistory()` (line 242), add these methods:

```typescript
  // Conversation methods
  createConversation(): Conversation {
    const db = getDatabase();
    const id = `conv-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))
    `).run(id, 'New Conversation');
    return { id, title: 'New Conversation', createdAt: now, updatedAt: now };
  }

  listConversations(): Conversation[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id, title, agent_id, created_at, updated_at FROM conversations
      ORDER BY updated_at DESC
    `).all() as any[];
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      agentId: r.agent_id || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  getConversationMessages(conversationId: string): ChatMessage[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT role, content, timestamp FROM chat_messages
      WHERE conversation_id = ? ORDER BY timestamp ASC LIMIT 100
    `).all(conversationId) as any[];
    return rows.map(r => ({
      role: r.role,
      content: r.content,
      timestamp: r.timestamp
    }));
  }

  deleteConversation(conversationId: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM chat_messages WHERE conversation_id = ?').run(conversationId);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId);
    Logger.info(`Conversation deleted: ${conversationId}`);
  }

  renameConversation(conversationId: string, title: string): void {
    const db = getDatabase();
    db.prepare('UPDATE conversations SET title = ?, updated_at = datetime(\'now\') WHERE id = ?').run(title, conversationId);
  }

  async chatInConversation(conversationId: string, agentId: string, userMessage: string): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const db = getDatabase();

    // Auto-generate title from first user message
    const existingMessages = db.prepare(
      'SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = ?'
    ).get(conversationId) as any;
    if (existingMessages.count === 0) {
      const title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
      db.prepare('UPDATE conversations SET title = ?, agent_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(title, agentId, conversationId);
    }

    // Save user message
    db.prepare(`
      INSERT INTO chat_messages (agent_id, role, content, conversation_id) VALUES (?, 'user', ?, ?)
    `).run(agentId, userMessage, conversationId);

    // Load recent history from DB (last 10 messages in this conversation)
    const rows = db.prepare(`
      SELECT role, content, timestamp FROM chat_messages
      WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT 10
    `).all(conversationId) as any[];
    const history: ChatMessage[] = rows.reverse().map(r => ({
      role: r.role,
      content: r.content,
      timestamp: r.timestamp
    }));

    const systemContent =
      agent.name === 'Daily Reporter'
        ? (this.configManager.get('dailyReporterSystemPrompt') as string | undefined)?.trim() ||
          agent.systemPrompt
        : agent.systemPrompt;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...history
    ];

    try {
      const providerId = this.llmManager.getDefaultProviderId();
      if (!providerId) {
        throw new Error('No LLM providers configured');
      }

      const response = await this.llmManager.chat(providerId, messages);

      // Save assistant response
      db.prepare(`
        INSERT INTO chat_messages (agent_id, role, content, conversation_id) VALUES (?, 'assistant', ?, ?)
      `).run(agentId, response, conversationId);

      // Bump conversation updated_at
      db.prepare('UPDATE conversations SET updated_at = datetime(\'now\') WHERE id = ?').run(conversationId);

      return response;
    } catch (error) {
      Logger.error(`Conversation chat failed:`, error);
      throw error;
    }
  }
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to AgentManager.

**Step 3: Commit**

```bash
git add src/main/agent/AgentManager.ts
git commit -m "feat(agent): add conversation CRUD and chatInConversation methods"
```

---

### Task 5: IPC handlers for conversations in main.ts

**Files:**
- Modify: `src/main/main.ts:94-105`

**Step 1: Add conversation IPC handlers**

After the `AGENT_LIST` handler (line 105), add:

```typescript
  // Conversation 相关
  ipcMain.handle(IPCChannels.CONVERSATION_CREATE, async () => {
    return agentManager.createConversation();
  });

  ipcMain.handle(IPCChannels.CONVERSATION_LIST, async () => {
    return agentManager.listConversations();
  });

  ipcMain.handle(IPCChannels.CONVERSATION_MESSAGES, async (_, conversationId: string) => {
    return agentManager.getConversationMessages(conversationId);
  });

  ipcMain.handle(IPCChannels.CONVERSATION_DELETE, async (_, conversationId: string) => {
    return agentManager.deleteConversation(conversationId);
  });

  ipcMain.handle(IPCChannels.CONVERSATION_RENAME, async (_, conversationId: string, title: string) => {
    return agentManager.renameConversation(conversationId, title);
  });

  ipcMain.handle(IPCChannels.CONVERSATION_CHAT, async (_, conversationId: string, agentId: string, message: string) => {
    return agentManager.chatInConversation(conversationId, agentId, message);
  });
```

**Step 2: Commit**

```bash
git add src/main/main.ts
git commit -m "feat(ipc): register conversation IPC handlers"
```

---

### Task 6: Preload API — conversations bridge

**Files:**
- Modify: `src/main/preload.ts`

**Step 1: Add conversations API**

After the `agents` section (line 19), add:

```typescript
  // Conversation API
  conversations: {
    create: () => ipcRenderer.invoke(IPCChannels.CONVERSATION_CREATE),
    list: () => ipcRenderer.invoke(IPCChannels.CONVERSATION_LIST),
    messages: (conversationId: string) =>
      ipcRenderer.invoke(IPCChannels.CONVERSATION_MESSAGES, conversationId),
    delete: (conversationId: string) =>
      ipcRenderer.invoke(IPCChannels.CONVERSATION_DELETE, conversationId),
    rename: (conversationId: string, title: string) =>
      ipcRenderer.invoke(IPCChannels.CONVERSATION_RENAME, conversationId, title),
    chat: (conversationId: string, agentId: string, message: string) =>
      ipcRenderer.invoke(IPCChannels.CONVERSATION_CHAT, conversationId, agentId, message),
  },
```

**Step 2: Update ElectronAPI interface**

In the `ElectronAPI` interface (after `agents` section, line 69), add:

```typescript
  conversations: {
    create: () => Promise<any>;
    list: () => Promise<any[]>;
    messages: (conversationId: string) => Promise<any[]>;
    delete: (conversationId: string) => Promise<void>;
    rename: (conversationId: string, title: string) => Promise<void>;
    chat: (conversationId: string, agentId: string, message: string) => Promise<string>;
  };
```

**Step 3: Commit**

```bash
git add src/main/preload.ts
git commit -m "feat(preload): add conversations API bridge"
```

---

### Task 7: Rewrite AgentChat.tsx — sidebar + conversation-based chat

**Files:**
- Modify: `src/renderer/components/AgentChat.tsx`

**Step 1: Full rewrite of AgentChat.tsx**

Replace the entire component with:

```tsx
import { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Plus, Trash2, MessageSquare, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
}

interface Conversation {
  id: string;
  title: string;
  agentId?: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export default function AgentChat() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAgents();
    loadConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadAgents = async () => {
    try {
      const result = await window.electronAPI.agents.list();
      setAgents(result);
      if (result.length > 0 && !selectedAgentId) {
        setSelectedAgentId(result[0].id);
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  };

  const loadConversations = async () => {
    try {
      const result = await window.electronAPI.conversations.list();
      setConversations(result);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const handleNewConversation = async () => {
    try {
      const conv = await window.electronAPI.conversations.create();
      setConversations(prev => [conv, ...prev]);
      setCurrentConversationId(conv.id);
      setMessages([]);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSelectConversation = async (conv: Conversation) => {
    setCurrentConversationId(conv.id);
    if (conv.agentId) {
      setSelectedAgentId(conv.agentId);
    }
    try {
      const msgs = await window.electronAPI.conversations.messages(conv.id);
      setMessages(msgs.filter((m: Message) => m.role !== 'system'));
    } catch (error) {
      console.error('Failed to load messages:', error);
      setMessages([]);
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    try {
      await window.electronAPI.conversations.delete(convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (currentConversationId === convId) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleRenameConversation = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await window.electronAPI.conversations.rename(renameTarget.id, renameValue.trim());
      setConversations(prev =>
        prev.map(c => c.id === renameTarget.id ? { ...c, title: renameValue.trim() } : c)
      );
      setRenameDialogOpen(false);
      setRenameTarget(null);
      setRenameValue('');
    } catch (error) {
      console.error('Failed to rename conversation:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !selectedAgentId || isLoading) return;

    // Auto-create conversation if none selected
    let convId = currentConversationId;
    if (!convId) {
      try {
        const conv = await window.electronAPI.conversations.create();
        convId = conv.id;
        setConversations(prev => [conv, ...prev]);
        setCurrentConversationId(convId);
      } catch (error) {
        console.error('Failed to create conversation:', error);
        return;
      }
    }

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await window.electronAPI.conversations.chat(convId, selectedAgentId, input);
      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, assistantMessage]);
      // Refresh conversation list to get updated title/timestamp
      loadConversations();
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  return (
    <div className="h-full flex">
      {/* Conversation Sidebar */}
      <div className="w-64 bg-background border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <Button onClick={handleNewConversation} className="w-full" size="sm">
            <Plus size={16} className="mr-2" />
            New Chat
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                className={cn(
                  'group flex items-center gap-2 p-2 rounded-md cursor-pointer text-sm transition-colors',
                  currentConversationId === conv.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted'
                )}
              >
                <MessageSquare size={14} className="shrink-0 opacity-50" />
                <span className="flex-1 truncate">{conv.title}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      ...
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      setRenameTarget(conv);
                      setRenameValue(conv.title);
                      setRenameDialogOpen(true);
                    }}>
                      <Pencil size={14} className="mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConversation(conv.id);
                    }}>
                      <Trash2 size={14} className="mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header with agent selector */}
        <div className="p-4 border-b border-border bg-background">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot size={24} className="text-primary" />
              {selectedAgent ? (
                <div>
                  <h3 className="font-semibold">{selectedAgent.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedAgent.description}</p>
                </div>
              ) : (
                <div>
                  <h3 className="font-semibold">Select an agent</h3>
                  <p className="text-sm text-muted-foreground">Choose an agent to start chatting</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedAgentId || ''}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="text-sm border border-border rounded-md px-3 py-1.5 bg-background"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <Separator />

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Bot size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Start a conversation with {selectedAgent?.name || 'an agent'}</p>
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex items-start gap-3',
                    message.role === 'user' ? 'flex-row-reverse' : ''
                  )}
                >
                  <div
                    className={cn(
                      'p-2 rounded-lg',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    )}
                  >
                    {message.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                  </div>
                  <div
                    className={cn(
                      'max-w-2xl p-4 rounded-lg',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card'
                    )}
                  >
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Bot size={20} />
                </div>
                <div className="bg-card px-4 py-2 rounded-lg">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.1s]" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        {selectedAgentId && (
          <>
            <Separator />
            <div className="p-4 bg-background">
              <div className="flex gap-3">
                <Input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={`Message ${selectedAgent?.name || 'agent'}...`}
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={isLoading || !input.trim()}
                  size="default"
                >
                  <Send size={18} />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Conversation</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameConversation();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRenameConversation}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

Note: This uses `Dialog` and `DropdownMenu` from shadcn/ui. If not already installed, run:
```bash
npx shadcn@latest add dialog dropdown-menu
```

**Step 2: Install any missing shadcn components**

Run: `npx shadcn@latest add dialog dropdown-menu`
Expected: Components installed or already exist.

**Step 3: Verify the app builds and runs**

Run: `npm run dev`
Expected: App starts, sidebar shows "New Chat" button, conversations list, agent selector in header.

**Step 4: Commit**

```bash
git add src/renderer/components/AgentChat.tsx
git commit -m "feat(ui): rewrite AgentChat with conversation sidebar and persistent history"
```

---

### Task 8: Smoke test — end-to-end verification

**Step 1: Test the full flow manually**

1. Start the app with `npm run dev`
2. Click "New Chat" — empty conversation appears in sidebar
3. Select an agent from the dropdown
4. Type a message and send — verify user + assistant messages appear
5. Verify conversation title auto-updates to first message text
6. Click "New Chat" again — new conversation, previous one in sidebar
7. Click the old conversation — messages load from DB
8. Rename a conversation via ... menu
9. Delete a conversation via ... menu
10. Restart the app — conversations persist

**Step 2: Fix any issues found during testing**

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix: address issues found during e2e testing of conversation persistence"
```
