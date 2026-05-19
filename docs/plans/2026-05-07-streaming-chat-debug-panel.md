# Streaming Chat + Debug Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add streaming output to the chat page and a debug panel for troubleshooting model API calls.

**Architecture:** Change IPC from `invoke/handle` (request-response) to `send/on` + `webContents.send` (event-driven streaming). LLM SDK calls use `stream: true`. Renderer listens to chunk events and incrementally updates UI. A debug panel subscribes to model call events and renders them in real-time.

**Tech Stack:** Electron IPC (webContents.send / ipcRenderer.on), OpenAI SDK streaming, Anthropic SDK streaming, React, shadcn/ui

---

## Task 1: Add IPC channels and streaming types

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/types.ts`

**Step 1: Add new IPC channels**

Add to `IPCChannels` enum in `src/shared/ipc-channels.ts`:

```typescript
// Streaming 相关
CONVERSATION_STREAM_CHUNK = 'conversation:stream-chunk',
CONVERSATION_STREAM_END = 'conversation:stream-end',
CONVERSATION_STREAM_ERROR = 'conversation:stream-error',

// Debug 相关
DEBUG_MODEL_CALL = 'debug:model-call',
```

**Step 2: Add streaming/debug types**

Add to `src/shared/types.ts`:

```typescript
// Streaming 相关
export interface StreamChunk {
  conversationId: string;
  content: string;
}

export interface StreamEnd {
  conversationId: string;
  fullContent: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface StreamError {
  conversationId: string;
  error: string;
}

// Debug 相关
export interface DebugModelCall {
  type: 'request' | 'response' | 'chunk' | 'error';
  timestamp: number;
  data: {
    provider?: string;
    model?: string;
    messages?: Array<{ role: string; content: string }>;
    content?: string;
    usage?: Record<string, any>;
    error?: string;
    duration?: number;
  };
}
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit` (or the project's type-check command)
Expected: No errors

**Step 4: Commit**

```bash
git add src/shared/ipc-channels.ts src/shared/types.ts
git commit -d "feat: add streaming IPC channels and debug types"
```

---

## Task 2: Add streaming methods to LLMProviderManager

**Files:**
- Modify: `src/main/llm/LLMProviderManager.ts`

**Step 1: Add `chatStream()` public method**

Add after the existing `chat()` method (line 193). This method accepts callbacks for chunks and debug events, and returns the full accumulated content + usage.

```typescript
async chatStream(
  providerId: string,
  messages: ChatMessage[],
  model: string | undefined,
  onChunk: (text: string) => void,
  onDebug: (event: import('../../shared/types').DebugModelCall) => void
): Promise<{ fullContent: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }> {
  const provider = this.providers.get(providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }

  const client = this.clients.get(providerId);
  if (!client) {
    throw new Error(`Provider client not initialized: ${providerId}`);
  }

  const resolvedModel = model || provider.models[0] || 'gpt-4';

  onDebug({
    type: 'request',
    timestamp: Date.now(),
    data: {
      provider: provider.name,
      model: resolvedModel,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    },
  });

  const startTime = Date.now();

  try {
    let result: { fullContent: string; usage?: any };

    if (provider.type === 'openai' || provider.type === 'custom' || provider.type === 'qwen' || provider.type === 'deepseek') {
      result = await this.chatStreamOpenAI(client as OpenAI, provider, messages, resolvedModel, onChunk, onDebug);
    } else if (provider.type === 'anthropic') {
      result = await this.chatStreamAnthropic(client as Anthropic, provider, messages, resolvedModel, onChunk, onDebug);
    } else {
      throw new Error(`Unsupported provider type: ${provider.type}`);
    }

    onDebug({
      type: 'response',
      timestamp: Date.now(),
      data: {
        provider: provider.name,
        model: resolvedModel,
        content: result.fullContent.slice(0, 200) + (result.fullContent.length > 200 ? '...' : ''),
        usage: result.usage,
        duration: Date.now() - startTime,
      },
    });

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    onDebug({
      type: 'error',
      timestamp: Date.now(),
      data: {
        provider: provider.name,
        model: resolvedModel,
        error: errorMsg,
        duration: Date.now() - startTime,
      },
    });
    throw error;
  }
}
```

**Step 2: Add `chatStreamOpenAI()` private method**

```typescript
private async chatStreamOpenAI(
  client: OpenAI,
  provider: LLMProvider,
  messages: ChatMessage[],
  model: string,
  onChunk: (text: string) => void,
  onDebug: (event: import('../../shared/types').DebugModelCall) => void
): Promise<{ fullContent: string; usage?: any }> {
  const stream = await client.chat.completions.create({
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: 0.7,
    max_tokens: 2048,
    stream: true,
  });

  let fullContent = '';
  let reasoningContent = '';
  let usage: any = undefined;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;

    // Handle reasoning_content (DeepSeek/Qwen)
    const reasoning = (delta as any)?.reasoning_content;
    if (reasoning) {
      reasoningContent += reasoning;
    }

    if (delta?.content) {
      fullContent += delta.content;
      onChunk(delta.content);
    }

    // Debug: log each chunk
    onDebug({
      type: 'chunk',
      timestamp: Date.now(),
      data: {
        content: delta?.content || '',
        provider: provider.name,
        model,
      },
    });

    // Capture usage from final chunk (some providers include it)
    if ((chunk as any).usage) {
      usage = {
        promptTokens: (chunk as any).usage.prompt_tokens,
        completionTokens: (chunk as any).usage.completion_tokens,
        totalTokens: (chunk as any).usage.total_tokens,
      };
    }
  }

  // Prepend reasoning content if present
  if (reasoningContent) {
    const prefix = `<think>${reasoningContent}</think>\n`;
    fullContent = prefix + fullContent;
    // Re-emit the full content as the final state (renderer will get it from stream-end)
  }

  return { fullContent, usage };
}
```

**Step 3: Add `chatStreamAnthropic()` private method**

```typescript
private async chatStreamAnthropic(
  client: Anthropic,
  provider: LLMProvider,
  messages: ChatMessage[],
  model: string,
  onChunk: (text: string) => void,
  onDebug: (event: import('../../shared/types').DebugModelCall) => void
): Promise<{ fullContent: string; usage?: any }> {
  const stream = client.messages.stream({
    model,
    max_tokens: 2048,
    messages: messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    system: messages.find(m => m.role === 'system')?.content || '',
  });

  let fullContent = '';
  let thinkingContent = '';

  stream.on('text', (text: string) => {
    fullContent += text;
    onChunk(text);
    onDebug({
      type: 'chunk',
      timestamp: Date.now(),
      data: { content: text, provider: provider.name, model },
    });
  });

  // Handle thinking events (extended thinking)
  stream.on('thinking', (thinking: string) => {
    thinkingContent += thinking;
  });

  const finalMessage = await stream.finalMessage();

  // Extract usage
  const usage = finalMessage.usage ? {
    promptTokens: finalMessage.usage.input_tokens,
    completionTokens: finalMessage.usage.output_tokens,
    totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
  } : undefined;

  // Prepend thinking if present
  if (thinkingContent) {
    const prefix = `<think>${thinkingContent}</think>\n`;
    fullContent = prefix + fullContent;
  }

  return { fullContent, usage };
}
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/main/llm/LLMProviderManager.ts
git commit -m "feat: add streaming chat methods to LLMProviderManager"
```

---

## Task 3: Add streaming conversation method to AgentManager

**Files:**
- Modify: `src/main/agent/AgentManager.ts`

**Step 1: Add `chatInConversationStream()` method**

Add after the existing `chatInConversation()` method (line 367). This method takes a `WebContents` reference to push streaming events.

```typescript
async chatInConversationStream(
  conversationId: string,
  agentId: string,
  userMessage: string,
  model: string | undefined,
  webContents: Electron.WebContents
): Promise<void> {
  const agent = this.agents.get(agentId);
  if (!agent) {
    webContents.send(IPCChannels.CONVERSATION_STREAM_ERROR, {
      conversationId,
      error: `Agent not found: ${agentId}`,
    });
    return;
  }

  const db = getDatabase();

  // Auto-generate title from first user message
  const existingMessages = db.prepare(
    'SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = ?'
  ).get(conversationId) as any;
  if (existingMessages.count === 0) {
    const title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
    db.prepare("UPDATE conversations SET title = ?, agent_id = ?, updated_at = datetime('now') WHERE id = ?")
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

    const result = await this.llmManager.chatStream(
      providerId,
      messages,
      model,
      // onChunk: push to renderer
      (text: string) => {
        webContents.send(IPCChannels.CONVERSATION_STREAM_CHUNK, {
          conversationId,
          content: text,
        });
      },
      // onDebug: push debug event to renderer
      (event) => {
        webContents.send(IPCChannels.DEBUG_MODEL_CALL, event);
      }
    );

    // Save assistant response
    db.prepare(`
      INSERT INTO chat_messages (agent_id, role, content, conversation_id) VALUES (?, 'assistant', ?, ?)
    `).run(agentId, result.fullContent, conversationId);

    // Bump conversation updated_at
    db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);

    // Send stream end
    webContents.send(IPCChannels.CONVERSATION_STREAM_END, {
      conversationId,
      fullContent: result.fullContent,
      usage: result.usage,
    });

  } catch (error) {
    Logger.error(`Conversation streaming chat failed:`, error);
    webContents.send(IPCChannels.CONVERSATION_STREAM_ERROR, {
      conversationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
```

**Step 2: Add import for IPCChannels at the top of the file**

```typescript
import { IPCChannels } from '../../shared/ipc-channels';
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/main/agent/AgentManager.ts
git commit -m "feat: add streaming conversation method to AgentManager"
```

---

## Task 4: Update IPC handlers and preload bridge

**Files:**
- Modify: `src/main/main.ts` (lines 128-130)
- Modify: `src/main/preload.ts` (lines 31-33, 87-94)

**Step 1: Change CONVERSATION_CHAT handler in main.ts from `handle` to `on`**

Replace lines 128-130:

```typescript
// Before:
// ipcMain.handle(IPCChannels.CONVERSATION_CHAT, async (_, conversationId, agentId, message, model) => {
//   return agentManager.chatInConversation(conversationId, agentId, message, model);
// });

// After:
ipcMain.on(IPCChannels.CONVERSATION_CHAT, (event, conversationId, agentId, message, model) => {
  const webContents = event.sender;
  agentManager.chatInConversationStream(conversationId, agentId, message, model, webContents);
});
```

**Step 2: Update preload.ts — change `chat` from `invoke` to `send`, add `on` methods**

Replace the conversations section (lines 21-33):

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
  // Changed: fire-and-forget, response comes via stream events
  chat: (conversationId: string, agentId: string, message: string, model?: string) => {
    ipcRenderer.send(IPCChannels.CONVERSATION_CHAT, conversationId, agentId, message, model);
  },
  // Streaming listeners
  onStreamChunk: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPCChannels.CONVERSATION_STREAM_CHUNK, listener);
    return () => ipcRenderer.removeListener(IPCChannels.CONVERSATION_STREAM_CHUNK, listener);
  },
  onStreamEnd: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPCChannels.CONVERSATION_STREAM_END, listener);
    return () => ipcRenderer.removeListener(IPCChannels.CONVERSATION_STREAM_END, listener);
  },
  onStreamError: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPCChannels.CONVERSATION_STREAM_ERROR, listener);
    return () => ipcRenderer.removeListener(IPCChannels.CONVERSATION_STREAM_ERROR, listener);
  },
},
```

Add debug listener section (after conversations, before llm):

```typescript
// Debug API
debug: {
  onModelCall: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPCChannels.DEBUG_MODEL_CALL, listener);
    return () => ipcRenderer.removeListener(IPCChannels.DEBUG_MODEL_CALL, listener);
  },
},
```

**Step 3: Update the ElectronAPI TypeScript interface**

Replace the conversations type (lines 87-94):

```typescript
conversations: {
  create: () => Promise<any>;
  list: () => Promise<any[]>;
  messages: (conversationId: string) => Promise<any[]>;
  delete: (conversationId: string) => Promise<void>;
  rename: (conversationId: string, title: string) => Promise<void>;
  chat: (conversationId: string, agentId: string, message: string, model?: string) => void;
  onStreamChunk: (callback: (data: any) => void) => () => void;
  onStreamEnd: (callback: (data: any) => void) => () => void;
  onStreamError: (callback: (data: any) => void) => () => void;
};
```

Add debug type:

```typescript
debug: {
  onModelCall: (callback: (data: any) => void) => () => void;
};
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/main/main.ts src/main/preload.ts
git commit -m "feat: update IPC to streaming mode with debug listeners"
```

---

## Task 5: Update AgentChat.tsx for streaming and debug panel

**Files:**
- Modify: `src/renderer/components/AgentChat.tsx`

**Step 1: Update `handleSendMessage` to use streaming**

Replace the `handleSendMessage` function (lines 254-301) with streaming logic:

```typescript
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

  // Add empty assistant message that will be filled incrementally
  const assistantIndex = messages.length + 1; // after user message
  setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date().toISOString() }]);

  // Set up streaming listeners
  const removeChunk = window.electronAPI.conversations.onStreamChunk((data) => {
    if (data.conversationId !== convId) return;
    setMessages(prev => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'assistant') {
        updated[updated.length - 1] = { ...last, content: last.content + data.content };
      }
      return updated;
    });
  });

  const removeEnd = window.electronAPI.conversations.onStreamEnd((data) => {
    if (data.conversationId !== convId) return;
    setIsLoading(false);
    removeChunk();
    removeEnd();
    removeError();
    // Refresh conversation list to get updated title/timestamp
    loadConversations();
  });

  const removeError = window.electronAPI.conversations.onStreamError((data) => {
    if (data.conversationId !== convId) return;
    setMessages(prev => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'assistant') {
        updated[updated.length - 1] = { ...last, content: `Error: ${data.error}` };
      }
      return updated;
    });
    setIsLoading(false);
    removeChunk();
    removeEnd();
    removeError();
  });

  // Send the message (fire-and-forget, response comes via listeners)
  window.electronAPI.conversations.chat(convId!, selectedAgentId, input, selectedModel || undefined);
};
```

**Step 2: Add Debug Panel state and component**

Add state variables:

```typescript
const [debugLogs, setDebugLogs] = useState<any[]>([]);
const [debugPanelOpen, setDebugPanelOpen] = useState(false);
```

Add effect for debug listener:

```typescript
useEffect(() => {
  const remove = window.electronAPI.debug?.onModelCall((data) => {
    setDebugLogs(prev => [...prev.slice(-49), data]); // keep last 50 entries
  });
  return () => remove?.();
}, []);
```

**Step 3: Add Debug Panel UI**

Add a debug panel button in the header (next to the model selector), and a collapsible panel below the header. Insert this after the header `<Separator />` (line 426):

```tsx
{/* Debug Panel Toggle */}
<div className="flex items-center gap-2 px-4 py-1.5 bg-muted/50 border-b border-border">
  <Button
    variant="ghost"
    size="sm"
    className="text-xs h-6"
    onClick={() => setDebugPanelOpen(!debugPanelOpen)}
  >
    {debugPanelOpen ? 'Hide' : 'Show'} Debug ({debugLogs.length})
  </Button>
  {debugPanelOpen && (
    <Button
      variant="ghost"
      size="sm"
      className="text-xs h-6"
      onClick={() => setDebugLogs([])}
    >
      Clear
    </Button>
  )}
</div>

{/* Debug Panel Content */}
{debugPanelOpen && (
  <div className="border-b border-border bg-black text-green-400 font-mono text-xs overflow-auto max-h-64">
    {debugLogs.length === 0 ? (
      <div className="p-4 text-muted-foreground">No debug logs yet. Send a message to see API calls.</div>
    ) : (
      <div className="p-2 space-y-1">
        {debugLogs.map((log, i) => (
          <details key={i} className="group">
            <summary className="cursor-pointer hover:bg-white/5 px-2 py-1 rounded flex items-center gap-2">
              <span className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase',
                log.type === 'request' ? 'bg-blue-600 text-white' :
                log.type === 'response' ? 'bg-green-600 text-white' :
                log.type === 'chunk' ? 'bg-yellow-600 text-black' :
                'bg-red-600 text-white'
              )}>
                {log.type}
              </span>
              <span className="text-muted-foreground">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              {log.data.provider && <span className="text-cyan-400">{log.data.provider}</span>}
              {log.data.model && <span className="text-purple-400">{log.data.model}</span>}
              {log.data.duration != null && <span className="text-muted-foreground">{log.data.duration}ms</span>}
            </summary>
            <div className="ml-4 mt-1 p-2 bg-white/5 rounded overflow-auto max-h-48">
              <pre className="whitespace-pre-wrap break-all">{JSON.stringify(log.data, null, 2)}</pre>
            </div>
          </details>
        ))}
      </div>
    )}
  </div>
)}
```

**Step 4: Update the loading indicator**

When streaming, the loading indicator should not show if the assistant message already has content. Update the loading condition (around line 443):

```tsx
{isLoading && messages[messages.length - 1]?.content === '' && (
  <div className="flex items-center gap-3">
    <div className="p-2 rounded-lg bg-muted">
      <Bot size={20} />
    </div>
    <div className="bg-muted px-4 py-2 rounded-lg">
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.1s]" />
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
      </div>
    </div>
  </div>
)}
```

**Step 5: Verify build works**

Run: `npm run build` (or the project's build command)
Expected: Successful build

**Step 6: Manual test**

1. Launch the app: `npm run dev`
2. Open chat, select an agent and model
3. Send a message — verify text streams in character by character
4. Open the debug panel — verify request/chunk/response entries appear
5. Test error case: disable the provider and send a message — verify error shows in both chat and debug panel

**Step 7: Commit**

```bash
git add src/renderer/components/AgentChat.tsx
git commit -m "feat: add streaming chat UI and debug panel"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/shared/ipc-channels.ts` | +4 streaming/debug channels |
| `src/shared/types.ts` | +StreamChunk, StreamEnd, StreamError, DebugModelCall types |
| `src/main/llm/LLMProviderManager.ts` | +chatStream, chatStreamOpenAI, chatStreamAnthropic methods |
| `src/main/agent/AgentManager.ts` | +chatInConversationStream method |
| `src/main/main.ts` | CONVERSATION_CHAT from handle→on |
| `src/main/preload.ts` | chat from invoke→send, +onStreamChunk/End/Error, +debug.onModelCall |
| `src/renderer/components/AgentChat.tsx` | Streaming message updates, debug panel UI |
