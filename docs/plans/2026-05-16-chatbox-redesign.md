# ChatBox Redesign — ChatEngine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace AgentManager's chat logic with a new streaming-first ChatEngine that supports real-time tool calling.

**Architecture:** New `ChatEngine` class handles the LLM + tool loop with streaming throughout. `ChatService` is a thin adapter that wires ChatEngine to Electron IPC. `LLMProviderManager` gets a new `chatStreamWithTools()` method that streams text AND detects tool_calls.

**Tech Stack:** Electron, TypeScript, OpenAI SDK, Anthropic SDK, SQLite (better-sqlite3)

---

## Task 1: Add `chatStreamWithTools()` to LLMProviderManager

This is the foundational change — enabling streaming + tool_call detection simultaneously. Currently `chat()` supports tools but doesn't stream; `chatStream()` streams but ignores tools.

**Files:**
- Modify: `src/main/llm/LLMProviderManager.ts:195-265` (add new method after `chatStream`)

**Step 1: Define the return types and method signature**

Add these types and the new method to `LLMProviderManager`. It calls the provider-specific streaming method and accumulates both text and tool_calls.

```typescript
// Add near top of file, after existing imports

export interface StreamToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface StreamWithToolsResult {
  fullContent: string;
  toolCalls: StreamToolCall[];
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

// New method on LLMProviderManager class, after chatStream():

async chatStreamWithTools(
  providerId: string,
  messages: ChatMessage[],
  model: string | undefined,
  tools: ToolDefinition[] | undefined,
  onChunk: (text: string) => void,
  onDebug: (event: import('../../shared/types').DebugModelCall) => void,
  signal?: AbortSignal
): Promise<StreamWithToolsResult> {
  const provider = this.providers.get(providerId);
  if (!provider) throw new Error(`Provider not found: ${providerId}`);

  const client = this.clients.get(providerId);
  if (!client) throw new Error(`Provider client not initialized: ${providerId}`);

  const resolvedModel = model || provider.models[0] || 'gpt-4';

  onDebug({
    type: 'request',
    timestamp: Date.now(),
    data: {
      provider: provider.name,
      model: resolvedModel,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      tools: tools?.map(t => t.function.name),
    },
  });

  const startTime = Date.now();

  try {
    let result: StreamWithToolsResult;

    if (provider.type === 'openai' || provider.type === 'custom' || provider.type === 'qwen' || provider.type === 'deepseek') {
      result = await this.chatStreamWithToolsOpenAI(client as OpenAI, provider, messages, resolvedModel, tools, onChunk, onDebug, signal);
    } else if (provider.type === 'anthropic') {
      result = await this.chatStreamWithToolsAnthropic(client as Anthropic, provider, messages, resolvedModel, tools, onChunk, onDebug, signal);
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
        tools: result.toolCalls.map(tc => tc.function.name),
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
      data: { provider: provider.name, model: resolvedModel, error: errorMsg, duration: Date.now() - startTime },
    });
    throw error;
  }
}
```

**Step 2: Add OpenAI streaming + tools implementation**

Add as a private method on `LLMProviderManager`:

```typescript
private async chatStreamWithToolsOpenAI(
  client: OpenAI,
  provider: LLMProvider,
  messages: ChatMessage[],
  model: string,
  tools: ToolDefinition[] | undefined,
  onChunk: (text: string) => void,
  onDebug: (event: import('../../shared/types').DebugModelCall) => void,
  signal?: AbortSignal
): Promise<StreamWithToolsResult> {
  const createOptions: any = {
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: 0.7,
    max_tokens: 2048,
    stream: true,
  };

  if (tools && tools.length > 0) {
    createOptions.tools = tools;
  }

  const stream = await client.chat.completions.create(createOptions, { signal });

  let fullContent = '';
  let usage: any = undefined;

  // Accumulate tool calls from stream chunks
  // OpenAI streams tool_calls as: each chunk has tool_calls[i].function.name (first chunk)
  // then subsequent chunks have tool_calls[i].function.arguments (delta)
  const toolCallAccumulators: Map<number, { id: string; name: string; arguments: string }> = new Map();

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta;

    // Handle reasoning_content (DeepSeek/Qwen)
    const reasoning = (delta as any)?.reasoning_content;
    if (reasoning) {
      fullContent += reasoning;
      onChunk(reasoning);
    }

    if (delta?.content) {
      fullContent += delta.content;
      onChunk(delta.content);
    }

    // Accumulate tool_calls from stream
    if ((delta as any)?.tool_calls) {
      for (const tc of (delta as any).tool_calls) {
        const idx = tc.index;
        if (!toolCallAccumulators.has(idx)) {
          toolCallAccumulators.set(idx, {
            id: tc.id || '',
            name: tc.function?.name || '',
            arguments: '',
          });
        }
        const acc = toolCallAccumulators.get(idx)!;
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name = tc.function.name;
        if (tc.function?.arguments) acc.arguments += tc.function.arguments;
      }
    }

    if ((chunk as any).usage) {
      usage = {
        promptTokens: (chunk as any).usage.prompt_tokens,
        completionTokens: (chunk as any).usage.completion_tokens,
        totalTokens: (chunk as any).usage.total_tokens,
      };
    }
  }

  const toolCalls: StreamToolCall[] = Array.from(toolCallAccumulators.values())
    .filter(acc => acc.id && acc.name)
    .map(acc => ({
      id: acc.id,
      type: 'function' as const,
      function: { name: acc.name, arguments: acc.arguments },
    }));

  return { fullContent, toolCalls, usage };
}
```

**Step 3: Add Anthropic streaming + tools implementation**

Add as a private method on `LLMProviderManager`:

```typescript
private async chatStreamWithToolsAnthropic(
  client: Anthropic,
  provider: LLMProvider,
  messages: ChatMessage[],
  model: string,
  tools: ToolDefinition[] | undefined,
  onChunk: (text: string) => void,
  onDebug: (event: import('../../shared/types').DebugModelCall) => void,
  signal?: AbortSignal
): Promise<StreamWithToolsResult> {
  const createOptions: any = {
    model,
    max_tokens: 2048,
    messages: messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    system: messages.find(m => m.role === 'system')?.content || '',
  };

  if (tools && tools.length > 0) {
    createOptions.tools = tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  const stream = client.messages.stream(createOptions, { signal });

  let fullContent = '';
  const toolCallMap: Map<string, { name: string; input: string }> = new Map();

  // Anthropic streams different event types
  stream.on('text', (text: string) => {
    fullContent += text;
    onChunk(text);
  });

  // Handle content_block_start for tool_use
  stream.on('event', (event: any) => {
    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      toolCallMap.set(event.content_block.id, {
        name: event.content_block.name,
        input: '',
      });
    }
    if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
      // We need the tool_use block ID — find it from the index
      // Anthropic sends content_block_start with index, then deltas for that index
    }
  });

  // The final message has complete tool_use blocks
  const finalMessage = await stream.finalMessage();

  const toolCalls: StreamToolCall[] = finalMessage.content
    .filter((block: any) => block.type === 'tool_use')
    .map((block: any) => ({
      id: block.id,
      type: 'function' as const,
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input),
      },
    }));

  const usage = finalMessage.usage ? {
    promptTokens: finalMessage.usage.input_tokens,
    completionTokens: finalMessage.usage.output_tokens,
    totalTokens: (finalMessage.usage.input_tokens || 0) + (finalMessage.usage.output_tokens || 0),
  } : undefined;

  return { fullContent, toolCalls, usage };
}
```

**Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add src/main/llm/LLMProviderManager.ts
git commit -m "feat: add chatStreamWithTools() for streaming + tool_call detection"
```

---

## Task 2: Create ChatEngine

The core chat loop — loads agent config, injects skills, runs the streaming tool loop.

**Files:**
- Create: `src/main/chat/ChatEngine.ts`

**Step 1: Create the ChatEngine class**

```typescript
// src/main/chat/ChatEngine.ts

import { ChatMessage, Agent, Skill, ToolDefinition, ToolCall, DebugModelCall } from '../../shared/types';
import { LLMProviderManager, StreamWithToolsResult } from '../llm/LLMProviderManager';
import { ToolExecutor } from '../tools/ToolExecutor';
import { Logger } from '../utils/Logger';

export interface ToolStreamEvent {
  event: 'tool_start' | 'tool_result' | 'tool_error';
  toolName: string;
  args?: Record<string, any>;
  result?: string;
  error?: string;
  duration?: number;
  timestamp: number;
}

export interface ChatRequest {
  conversationId: string;
  userMessage: string;
  agentId?: string;
  injectedSkills?: string[];
  model?: string;
}

export interface ChatResult {
  fullContent: string;
  toolRounds: number;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

export interface ChatCallbacks {
  onChunk: (text: string) => void;
  onToolEvent: (event: ToolStreamEvent) => void;
  onDebug: (event: DebugModelCall) => void;
  onEnd: (result: ChatResult) => void;
  onError: (error: string) => void;
}

const MAX_TOOL_ROUNDS = 5;
const DEFAULT_HISTORY_LIMIT = 20;

export class ChatEngine {
  constructor(
    private llmManager: LLMProviderManager,
    private toolExecutor: ToolExecutor,
    private loadAgent: (id: string) => Agent | undefined,
    private loadSkills: (ids: string[]) => Skill[],
    private loadHistory: (conversationId: string, limit: number) => ChatMessage[],
  ) {}

  async chatStream(
    req: ChatRequest,
    callbacks: ChatCallbacks,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const { messages, toolDefs } = this.buildContext(req);

      const providerId = this.llmManager.getDefaultProviderId();
      if (!providerId) throw new Error('No LLM providers configured');

      const provider = this.llmManager.listProviders().find(p => p.id === providerId);
      const resolvedModel = req.model || provider?.models[0] || '';

      let fullContent = '';
      let toolRounds = 0;

      // Streaming tool calling loop
      while (toolRounds < MAX_TOOL_ROUNDS) {
        if (signal.aborted) break;

        const result = await this.llmManager.chatStreamWithTools(
          providerId,
          messages,
          resolvedModel,
          toolDefs.length > 0 ? toolDefs : undefined,
          callbacks.onChunk,
          callbacks.onDebug,
          signal,
        );

        fullContent += result.fullContent;

        if (result.toolCalls.length === 0) break;

        // Execute tool calls
        const toolResults = await this.executeToolCalls(result.toolCalls, callbacks);
        messages.push({ role: 'assistant', content: result.fullContent || `[Calling tools: ${result.toolCalls.map(tc => tc.function.name).join(', ')}]` });
        for (const tr of toolResults) {
          messages.push({ role: 'user', content: `Tool ${tr.name} result:\n${tr.result}` });
        }

        toolRounds++;
      }

      callbacks.onEnd({ fullContent, toolRounds });
    } catch (error) {
      if (signal.aborted) {
        callbacks.onEnd({ fullContent: '', toolRounds: 0 });
        return;
      }
      const msg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('ChatEngine error:', error);
      callbacks.onError(msg);
    }
  }

  private buildContext(req: ChatRequest): { messages: ChatMessage[]; toolDefs: ToolDefinition[] } {
    const agent = req.agentId ? this.loadAgent(req.agentId) : undefined;

    // System prompt
    let systemContent = agent?.systemPrompt || 'You are a helpful assistant.';

    // Inject skills
    if (req.injectedSkills && req.injectedSkills.length > 0) {
      const skills = this.loadSkills(req.injectedSkills);
      if (skills.length > 0) {
        const skillContent = skills.map(s => `Skill: ${s.name}\n${s.prompt}`).join('\n\n');
        systemContent = `${systemContent}\n\nEnabled skills:\n${skillContent}`;
      }
    } else if (agent?.skills && agent.skills.length > 0) {
      const skills = this.loadSkills(agent.skills);
      if (skills.length > 0) {
        const skillContent = skills.map(s => `Skill: ${s.name}\n${s.prompt}`).join('\n\n');
        systemContent = `${systemContent}\n\nEnabled skills:\n${skillContent}`;
      }
    }

    // History
    const history = this.loadHistory(req.conversationId, DEFAULT_HISTORY_LIMIT);
    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...history,
    ];

    // Tool definitions
    const toolDefs = agent
      ? this.toolExecutor.getToolsForAgent(agent.tools)
      : this.toolExecutor.getDefinitions();

    return { messages, toolDefs };
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
    callbacks: ChatCallbacks,
  ): Promise<{ name: string; result: string }[]> {
    const results: { name: string; result: string }[] = [];

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      let parsedArgs: Record<string, any>;
      try { parsedArgs = JSON.parse(toolCall.function.arguments); } catch { parsedArgs = {}; }

      const start = Date.now();
      callbacks.onToolEvent({ event: 'tool_start', toolName, args: parsedArgs, timestamp: start });

      try {
        const result = await this.toolExecutor.execute(toolCall);
        const duration = Date.now() - start;
        callbacks.onToolEvent({ event: 'tool_result', toolName, args: parsedArgs, result: result.slice(0, 2000), duration, timestamp: Date.now() });
        results.push({ name: toolName, result });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Tool execution failed';
        callbacks.onToolEvent({ event: 'tool_error', toolName, error: errMsg, timestamp: Date.now() });
        results.push({ name: toolName, result: `Error: ${errMsg}` });
      }
    }

    return results;
  }
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: May fail because `getDefaultProviderId()` and `listProviders()` need to be confirmed as public. Check LLMProviderManager — they are already public.

**Step 3: Commit**

```bash
git add src/main/chat/ChatEngine.ts
git commit -m "feat: add ChatEngine with streaming tool calling loop"
```

---

## Task 3: Create ChatService

Thin orchestrator that wires ChatEngine to Electron IPC and SQLite.

**Files:**
- Create: `src/main/chat/ChatService.ts`

**Step 1: Create the ChatService class**

```typescript
// src/main/chat/ChatService.ts

import { Electron } from 'electron';
import { IPCChannels } from '../../shared/ipc-channels';
import { ChatMessage, Skill, Agent } from '../../shared/types';
import { ChatEngine, ChatRequest, ChatCallbacks, ToolStreamEvent } from './ChatEngine';
import { ToolExecutor } from '../tools/ToolExecutor';
import { SkillManager } from '../skill/SkillManager';
import { AgentManager } from '../agent/AgentManager';
import { getDatabase } from '../database/connection';
import { Logger } from '../utils/Logger';

export class ChatService {
  private activeStreams: Map<string, AbortController> = new Map();
  private chatEngine: ChatEngine;

  constructor(
    private agentManager: AgentManager,
    private skillManager: SkillManager,
    private toolExecutor: ToolExecutor,
    private recordDebugEvent?: (event: import('../../shared/types').DebugModelCall, webContents?: Electron.WebContents) => void,
  ) {
    this.chatEngine = new ChatEngine(
      // These are injected as functions so ChatEngine stays decoupled from managers
      (agentManager as any).llmManager,
      toolExecutor,
      (id: string) => (agentManager as any).agents.get(id),
      (ids: string[]) => {
        const allSkills = skillManager.listSkills();
        return allSkills.filter(s => ids.includes(s.id));
      },
      (conversationId: string, limit: number) => {
        const db = getDatabase();
        const rows = db.prepare(`
          SELECT role, content, timestamp FROM chat_messages
          WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?
        `).all(conversationId, limit) as any[];
        return rows.reverse().map(r => ({ role: r.role, content: r.content, timestamp: r.timestamp }));
      },
    );
  }

  async handleChat(
    conversationId: string,
    agentId: string | null,
    userMessage: string,
    model: string | undefined,
    webContents: Electron.WebContents,
  ): Promise<void> {
    const db = getDatabase();

    // Auto-generate title from first message
    const existingMessages = db.prepare(
      'SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = ?'
    ).get(conversationId) as any;
    if (existingMessages.count === 0) {
      const title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
      db.prepare("UPDATE conversations SET title = ?, agent_id = ?, updated_at = datetime('now') WHERE id = ?")
        .run(title, agentId || null, conversationId);
    }

    // Save user message
    db.prepare(`
      INSERT INTO chat_messages (agent_id, role, content, conversation_id) VALUES (?, 'user', ?, ?)
    `).run(agentId || null, userMessage, conversationId);

    // Setup abort
    const abortController = new AbortController();
    this.activeStreams.set(conversationId, abortController);

    const send = (channel: string, data: any) => {
      if (!webContents.isDestroyed()) {
        webContents.send(channel, data);
      }
    };

    const callbacks: ChatCallbacks = {
      onChunk: (text: string) => {
        send(IPCChannels.CONVERSATION_STREAM_CHUNK, { conversationId, content: text });
      },
      onToolEvent: (event: ToolStreamEvent) => {
        send(IPCChannels.CONVERSATION_STREAM_TOOL_EVENT, { conversationId, ...event });
      },
      onDebug: (event) => {
        this.recordDebugEvent?.({ ...event, conversationId }, webContents);
      },
      onEnd: (result) => {
        db.prepare(`INSERT INTO chat_messages (agent_id, role, content, conversation_id) VALUES (?, 'assistant', ?, ?)`)
          .run(agentId || null, result.fullContent, conversationId);
        db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);
        send(IPCChannels.CONVERSATION_STREAM_END, {
          conversationId, fullContent: result.fullContent, usage: result.usage,
        });
        this.activeStreams.delete(conversationId);
      },
      onError: (error: string) => {
        send(IPCChannels.CONVERSATION_STREAM_ERROR, { conversationId, error });
        this.activeStreams.delete(conversationId);
      },
    };

    try {
      const req: ChatRequest = {
        conversationId,
        userMessage,
        agentId: agentId || undefined,
        model,
      };

      await this.chatEngine.chatStream(req, callbacks, abortController.signal);
    } catch (error) {
      Logger.error('ChatService error:', error);
      this.activeStreams.delete(conversationId);
    }
  }

  abortChat(conversationId: string): void {
    const controller = this.activeStreams.get(conversationId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(conversationId);
    }
  }
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: May need minor adjustments — `Electron` import should be `import type { WebContents } from 'electron'`. Fix if needed.

**Step 3: Commit**

```bash
git add src/main/chat/ChatService.ts
git commit -m "feat: add ChatService — IPC/DB adapter for ChatEngine"
```

---

## Task 4: Wire ChatService into main.ts

Replace the `agentManager.chatInConversationStream()` call with `chatService.handleChat()`.

**Files:**
- Modify: `src/main/main.ts:34,296-303`

**Step 1: Add ChatService import and initialization**

In `src/main/main.ts`, after line 30 (the existing imports), add:

```typescript
import { ChatService } from './chat/ChatService';
```

After the existing manager declarations (around line 42), add:

```typescript
let chatService: ChatService;
```

In the initialization section (after `agentManager` is created and toolExecutor is set up), instantiate ChatService:

```typescript
chatService = new ChatService(agentManager, skillManager, toolExecutor, recordDebugEvent);
```

The `recordDebugEvent` function is the one already defined in main.ts. Note where it's defined — it may be a local function or inline. Reference it the same way the existing code does.

**Step 2: Replace CONVERSATION_CHAT handler**

Replace the current handler (lines 296-299):

```typescript
// OLD:
ipcMain.on(IPCChannels.CONVERSATION_CHAT, (event, conversationId: string, agentId: string | null, message: string, model?: string) => {
  const webContents = event.sender;
  agentManager.chatInConversationStream(conversationId, agentId || null, message, model, webContents);
});

// NEW:
ipcMain.on(IPCChannels.CONVERSATION_CHAT, (event, conversationId: string, agentId: string | null, message: string, model?: string) => {
  const webContents = event.sender;
  chatService.handleChat(conversationId, agentId || null, message, model, webContents);
});
```

**Step 3: Replace CONVERSATION_CHAT_ABORT handler**

Replace the current handler (lines 301-303):

```typescript
// OLD:
ipcMain.on(IPCChannels.CONVERSATION_CHAT_ABORT, (_, conversationId: string) => {
  agentManager.abortConversationChat(conversationId);
});

// NEW:
ipcMain.on(IPCChannels.CONVERSATION_CHAT_ABORT, (_, conversationId: string) => {
  chatService.abortChat(conversationId);
});
```

**Step 4: Verify compilation and run**

Run: `npx tsc --noEmit`
Expected: No errors

Then run the app: `npm run dev`

Test: Open the chat, send a message. Verify:
- Streaming text works
- Conversation history loads
- Abort works

**Step 5: Commit**

```bash
git add src/main/main.ts src/main/chat/ChatService.ts
git commit -m "feat: wire ChatService as the new chat handler in main.ts"
```

---

## Task 5: Test tool calling end-to-end

Manual integration test to verify the full tool loop works.

**Files:**
- No new files

**Step 1: Start the app**

Run: `npm run dev`

**Step 2: Test basic chat (no tools)**

1. Open the Chat page
2. Send "Hello, what can you do?"
3. Verify: streaming text response appears
4. Verify: response is saved in conversation history

**Step 3: Test tool calling**

1. Ensure tools are enabled (read_file, list_directory, etc.)
2. Send "Read the contents of package.json in the current project"
3. Verify: tool_start event appears in UI
4. Verify: tool_result event appears with file contents
5. Verify: LLM uses the tool result to answer

**Step 4: Test destructive tool approval**

1. Send "Write 'hello' to a file called /tmp/test.txt"
2. Verify: approval dialog appears
3. Approve → verify tool executes
4. Deny → verify tool returns "user denied" error

**Step 5: Test abort**

1. Send a long message
2. Click abort while streaming
3. Verify: streaming stops, partial content saved

**Step 6: Commit test results (if any fixes needed)**

```bash
git add -A
git commit -m "fix: adjustments from end-to-end testing"
```

---

## Task 6: Clean up AgentManager — remove chat methods

Now that ChatService handles all chat, remove the dead code from AgentManager.

**Files:**
- Modify: `src/main/agent/AgentManager.ts` (remove lines 408-790)

**Step 1: Remove chat-related methods from AgentManager**

Remove these methods entirely:
- `buildConversationContext()` (lines 408-449)
- `buildSystemContent()` (lines 451-462)
- `chatInConversationStream()` (lines 531-790)
- `abortConversationChat()` (find and remove)
- `getConversationMessages()` — keep if still used by IPC for listing messages
- Any helper methods only used by the above

Keep:
- Agent CRUD methods (create, update, delete, list, etc.)
- Conversation CRUD (create, list, delete, rename)
- `getConversationMessages()` (still used by IPC)
- `activeStreams` map can be removed (now in ChatService)

**Step 2: Remove unused imports**

After removing chat methods, check for unused imports:
- `IPCChannels` — may no longer be needed
- `ChatMessage` — check if still used

**Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors. All IPC handlers in main.ts still work because they call `chatService` now.

**Step 4: Verify the app still works**

Run: `npm run dev`
Test: send a message, verify streaming still works.

**Step 5: Commit**

```bash
git add src/main/agent/AgentManager.ts
git commit -m "refactor: remove chat logic from AgentManager, now handled by ChatEngine"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | `chatStreamWithTools()` on LLMProviderManager | `LLMProviderManager.ts` |
| 2 | ChatEngine class | `src/main/chat/ChatEngine.ts` |
| 3 | ChatService class | `src/main/chat/ChatService.ts` |
| 4 | Wire into main.ts | `src/main/main.ts` |
| 5 | End-to-end testing | Manual |
| 6 | Clean up AgentManager | `AgentManager.ts` |

All existing behavior preserved. The key change: tool calling now streams instead of blocking silently.
