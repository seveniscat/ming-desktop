# Chat Tool Call & Reasoning Pipeline Fix

## Problem

The chat UI has complete rendering components for thinking process and tool calls (`reasoning.tsx`, `tool-fallback.tsx`, `tool-group.tsx`), but none of this information appears in the chat bubbles. The root cause is a broken data pipeline: the frontend ignores tool call events and reasoning data that the backend already sends.

## Root Cause Analysis

### Backend (works correctly)
- `ChatEngine` emits `ToolStreamEvent` via `callbacks.onToolEvent()` including `tool_start`, `tool_result`, `tool_error`
- `ChatService` forwards these via IPC `CONVERSATION_STREAM_TOOL_EVENT`
- Reasoning content is captured from Anthropic's `thinking` blocks and sent via `CONVERSATION_STREAM_END`

### Frontend (broken)
1. **`useIpcChatRuntime.ts`**: `onStreamToolEvent` only processes `suggest_memory`, discards all other tool events
2. **`Message` type**: No `toolCalls` field — tool call data has nowhere to go
3. **`messageAdapter.ts`**: Only converts `reasoning` and `text` parts, no `tool-call` conversion

## Solution

### 1. Extend `Message` type (`src/renderer/components/chat/types.ts`)

Add `ToolCallRecord` interface and `toolCalls` field to `Message`:

```typescript
interface ToolCallRecord {
  id: string;
  toolName: string;
  args?: Record<string, any>;
  argsText?: string;
  result?: string;
  error?: string;
  status: 'running' | 'complete' | 'incomplete';
  startedAt?: number;
  duration?: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCallRecord[];   // NEW
  timestamp?: string;
}
```

### 2. Fix IPC Runtime (`src/renderer/components/chat/assistant-ui/useIpcChatRuntime.ts`)

Process all tool events instead of ignoring them:

- `tool_start` → Append a `running` ToolCallRecord to the current assistant message's `toolCalls`
- `tool_result` → Update matching record to `complete` with result + duration
- `tool_error` → Update matching record to `incomplete` with error
- `suggest_memory` → Keep existing callback logic (unchanged)

New helper function `upsertToolCall(messages, toolCallRecord)` for immutable array updates.

### 3. Fix Message Adapter (`src/renderer/components/chat/assistant-ui/messageAdapter.ts`)

In `toThreadMessageLike`, convert `msg.toolCalls` to assistant-ui `tool-call` parts:

```typescript
if (msg.toolCalls?.length) {
  for (const tc of msg.toolCalls) {
    parts.push({
      type: 'tool-call',
      toolName: tc.toolName,
      toolCallId: tc.id,
      argsText: tc.argsText || JSON.stringify(tc.args, null, 2),
      result: tc.result,
      status: { type: tc.status },
    });
  }
}
```

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/components/chat/types.ts` | Add `ToolCallRecord`, add `toolCalls` to `Message` |
| `src/renderer/components/chat/assistant-ui/useIpcChatRuntime.ts` | Process all tool events, add `upsertToolCall` helper |
| `src/renderer/components/chat/assistant-ui/messageAdapter.ts` | Convert tool calls to assistant-ui `tool-call` parts |

## Out of Scope

- Reasoning real-time streaming (currently received at stream end only — separate backend change needed)
- assistant-ui version upgrade (Part 2, deferred)
- ZIP drag-drop Skill installation (separate task)
