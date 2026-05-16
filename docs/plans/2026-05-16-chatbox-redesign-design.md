# ChatBox Redesign: Streaming-First ChatEngine

## Concept Definitions

| Concept | Definition | Trigger | Lifecycle |
|---------|-----------|---------|-----------|
| Agent | Preset config (system prompt + tools + model). Like ChatGPT GPTs. | Chat UI selector | Persistent |
| Tool | Executable function for LLM function calling | LLM auto-calls via tool_calls | Persistent registration |
| Skill | Temporary context injection via system prompt | Slash menu → inject into conversation | Per-conversation temporary |
| Prompt Template | Input box quick-fill with `{variables}` | Slash menu → fill input | One-shot |

Slash menu contains: Prompt Templates + Skills (NOT Tools).

## Problem Statement

Current `AgentManager.chatInConversationStream()` has a fundamental flaw: **the tool calling loop is non-streaming**. It calls `llmManager.chat()` (non-streaming) for tool rounds, then only the final text response streams. During tool execution, the user sees nothing — just a long pause.

Additionally, the concepts of Agent/Skill/Tool/Prompt have blurry boundaries. This redesign clarifies them while rebuilding the chat engine.

## Architecture

### New Module Layout

```
src/main/
  chat/
    ChatEngine.ts    ← NEW: LLM call + streaming tool calling loop
    ChatService.ts   ← NEW: thin IPC/DB orchestrator
  agent/AgentManager.ts    ← KEEP: Agent CRUD only (chat logic removed)
  skill/SkillManager.ts    ← KEEP: Skill CRUD
  tools/ToolExecutor.ts    ← KEEP: Tool registration and execution
  services/PromptTemplateManager ← KEEP: Prompt Template CRUD
  llm/LLMProviderManager.ts      ← MODIFY: add streaming + tool support
```

### ChatEngine Core Loop

```
chatStream(request, callbacks, signal)
  │
  ├─ Phase 1: Prepare context
  │   ├─ Load agent config (system prompt, model, enabled tools)
  │   ├─ Inject selected skills into system prompt
  │   └─ Build message history (last N messages from DB)
  │
  ├─ Phase 2: Streaming tool calling loop
  │   └─ WHILE rounds < MAX_ROUNDS (5):
  │       ├─ LLM.chatStreamWithTools() — streaming with tool_call detection
  │       ├─ Stream text chunks to renderer via onChunk
  │       ├─ IF response contains tool_calls:
  │       │   ├─ For each tool_call:
  │       │   │   ├─ Send tool_start event
  │       │   │   ├─ Check approval (write_file, execute_command)
  │       │   │   ├─ Execute via ToolExecutor
  │       │   │   ├─ Send tool_result event
  │       │   │   └─ Append result to messages
  │       │   └─ rounds++
  │       └─ ELSE: break (LLM gave text-only answer)
  │
  └─ Phase 3: Finalize
      ├─ Save messages to DB
      └─ Emit stream_end
```

### Streaming + Tool Calling

Current flow (broken):
```
LLM.chat() → tool calls → execute → LLM.chat() → ... → LLM.chatStream() → stream
^non-streaming                                                 ^only this streams
```

New flow:
```
LLM.chatStreamWithTools() → accumulate text + detect tool_calls → execute tools → repeat
^everything streams
```

`LLMProviderManager` gets a new method `chatStreamWithTools()` that:
- Streams text chunks as they arrive (same as current chatStream)
- Simultaneously accumulates the full response to detect tool_calls structures
- Returns both the streamed text AND any tool_calls found

### ChatEngine API

```typescript
interface ChatRequest {
  conversationId: string;
  userMessage: string;
  agentId?: string;
  injectedSkills?: string[];
  model?: string;
}

interface ChatCallbacks {
  onChunk: (text: string) => void;
  onToolEvent: (event: ToolStreamEvent) => void;
  onDebug: (event: DebugModelCall) => void;
  onEnd: (result: ChatResult) => void;
  onError: (error: string) => void;
}

class ChatEngine {
  constructor(
    private llmManager: LLMProviderManager,
    private toolExecutor: ToolExecutor,
    private agentManager: AgentManager,
    private skillManager: SkillManager,
  ) {}

  async chatStream(req: ChatRequest, cb: ChatCallbacks, signal: AbortSignal): Promise<void>;
}
```

### ChatService — Thin Orchestrator

```typescript
class ChatService {
  constructor(private chatEngine: ChatEngine, private db: Database) {}

  async handleChat(
    conversationId: string,
    agentId: string | null,
    userMessage: string,
    model: string | undefined,
    webContents: Electron.WebContents
  ): Promise<void> {
    // 1. Save user message to DB
    // 2. Build ChatRequest from params
    // 3. Create AbortController, register it
    // 4. Wire IPC callbacks (webContents.send)
    // 5. Call chatEngine.chatStream()
    // 6. Cleanup
  }
}
```

ChatEngine is pure logic (testable without Electron). ChatService is the IPC/DB adapter.

### Data Flow

```
Renderer sends CONVERSATION_CHAT
    ↓
main.ts IPC handler → chatService.handleChat()
    ↓ saves user message, builds ChatRequest
chatEngine.chatStream()
    ↓ loads agent, skills, builds context
    ↓ loops: stream LLM → detect tools → execute → stream LLM → ...
    ↓ callbacks → webContents.send() → renderer
    ↓ saves assistant message
Renderer receives stream events (chunks, tool events, end)
```

### Message History Strategy

- Default: last 20 messages (configurable per agent)
- Tool round messages saved with special marker for optional context exclusion
- System prompt rebuilt each time (not stored in history)

## Implementation Phases

### Phase 1: ChatEngine Core

**New files:**
| File | Purpose |
|------|---------|
| `src/main/chat/ChatEngine.ts` | LLM + streaming tool loop |
| `src/main/chat/ChatService.ts` | IPC/DB orchestration |

**Modified files:**
| File | Change |
|------|--------|
| `src/main/llm/LLMProviderManager.ts` | Add `chatStreamWithTools()` |
| `src/main/main.ts` | Wire CONVERSATION_CHAT to ChatService |

**Success criteria:**
1. Streaming text works (same as current)
2. Tool calling: LLM invokes tools, results feed back, multi-round
3. Tool events stream to UI in real-time
4. Approval flow for destructive tools (write_file, execute_command)
5. Agent selector works (system prompt + tool set)
6. Abort/cancel works

### Phase 2: Slash Menu Cleanup

- Remove Tools from slash menu
- Skill slash: inject skill prompt into conversation context
- Prompt Template slash: fill input box (unchanged)

### Phase 3: Context & Memory

- Token-aware context window management
- Conversation summarization for long histories
- Cross-conversation memory

## Design Principles (from industry research)

1. **Stream everything** — never leave the user staring at a blank screen
2. **Fewer, thoughtful tools** — each tool should be significant, not a thin wrapper
3. **Return meaningful context** — tool results should give LLM enough to reason
4. **Optimize token usage** — truncate tool results, exclude old tool rounds from context
5. **Clean separation** — ChatEngine is pure logic, ChatService is Electron adapter
