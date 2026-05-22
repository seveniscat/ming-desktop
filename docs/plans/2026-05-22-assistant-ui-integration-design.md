# assistant-ui Integration Design

## Context

Current chat UI (ChatMessages, MessageBubble, ChatInput) is hand-built with basic markdown rendering. Message display quality (markdown, code blocks, thinking chain, tool execution details) is the primary pain point. We're integrating `@assistant-ui/react` as a mature, full-featured chat component library.

## Decision

**Approach A: Full replacement** with `useExternalStoreRuntime` bridge to existing Electron IPC backend.

- Replace: ChatMessages, MessageBubble, ChatInput
- Keep: ConversationList, ChatLayout (simplified), all backend/IPC/store logic

## Architecture

```
ChatLayout (simplified container)
├── ConversationList (unchanged)
└── AssistantRuntimeProvider
    └── Thread (replaces ChatMessages + ChatInput)
        ├── Message list (auto-scroll, streaming)
        ├── Composer (input + send)
        └── Tool call display (built-in)
```

## Runtime Adapter

Bridge Electron IPC streaming to assistant-ui's `useExternalStoreRuntime`:

```
Electron IPC                  assistant-ui Runtime
─────────────                 ────────────────────
chat()              →         onNew(message)
stream-chunk        →         messages update (append text)
stream-tool-event   →         tool-call content part
stream-end          →         isRunning = false
stream-error        →         error state
abort               →         onCancel()
```

### Message Format Mapping

```
{role, content} → {id, role, content: [{type: 'text', text}], createdAt}
```

- User messages: simple text content part
- Assistant messages: text content parts (with thinking prefix)
- Tool calls: `{type: 'tool-call', toolName, args}` content parts

## Component Mapping

| Current               | Replacement                | Notes                     |
|-----------------------|----------------------------|---------------------------|
| ChatMessages.tsx      | `<Thread>`                 | Message list + auto-scroll|
| MessageBubble.tsx     | Built-in Thread rendering  | Markdown, code, avatars   |
| ChatInput.tsx         | `<Composer>`               | Input + send button       |
| ExecutionDetails      | Built-in tool call display | Tool execution rendering  |
| ChatLayout.tsx        | Simplified ChatLayout      | Keep sidebar layout       |
| ConversationList.tsx  | Unchanged                  | Keep as-is                |

## Custom Components Needed

1. **Welcome page** - Empty state for new conversations
2. **Composer extensions** - Model selector, skill badges, slash menu
3. **Tool call renderer** - Match existing execution details style

## Implementation Steps

1. Install `@assistant-ui/react` and peer dependencies
2. Create IpcChatRuntime adapter (bridge Electron IPC → assistant-ui runtime)
3. Create message format mapping utilities
4. Integrate AssistantRuntimeProvider + Thread in ChatLayout
5. Customize Composer (model selector, skill system, slash menu)
6. Customize message rendering (thinking chain, tool calls)
7. Migrate streaming logic to use runtime adapter
8. Remove old ChatMessages, MessageBubble, ChatInput
9. Test and debug

## What Stays Unchanged

- ConversationList (session CRUD)
- useChatConversations hook
- Electron IPC protocol (backend)
- SQLite storage
- Agent/Skill system logic
