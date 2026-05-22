# assistant-ui Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hand-built chat UI (ChatMessages, MessageBubble, ChatInput) with `@assistant-ui/react` components, using a custom runtime adapter to bridge Electron IPC streaming.

**Architecture:** assistant-ui's `useExternalStoreRuntime` wraps our existing Electron IPC chat protocol. ConversationList and session management stay unchanged. A message format mapper converts our `{role, content}` to assistant-ui's structured message format.

**Tech Stack:** @assistant-ui/react, React 18, Tailwind CSS, Electron IPC, Zustand (existing)

---

### Task 1: Install assistant-ui and peer dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install packages**

Run: `npm install @assistant-ui/react`

**Step 2: Verify installation**

Run: `npm ls @assistant-ui/react`
Expected: Version displayed without errors

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @assistant-ui/react dependency"
```

---

### Task 2: Create message format mapping utilities

**Files:**
- Create: `src/renderer/components/chat/assistant-ui/messageAdapter.ts`

**Step 1: Create the message adapter**

This module converts our `{role, content, timestamp}` messages to assistant-ui's format and back.

```typescript
import type { Message } from '../types';

// assistant-ui expects content as an array of content parts
export interface AssistantUIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: AssistantUIContentPart[];
  createdAt: Date;
}

export type AssistantUIContentPart =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown };

let messageCounter = 0;

export function toAssistantUIMessage(msg: Message): AssistantUIMessage {
  const id = `msg-${++messageCounter}-${Date.now()}`;
  return {
    id,
    role: msg.role,
    content: [{ type: 'text', text: msg.content }],
    createdAt: msg.timestamp ? new Date(msg.timestamp) : new Date(),
  };
}

export function toAssistantUIMessages(messages: Message[]): AssistantUIMessage[] {
  return messages.filter(m => m.content !== '').map(toAssistantUIMessage);
}

export function createEmptyAssistantMessage(): AssistantUIMessage {
  return {
    id: `msg-${++messageCounter}-${Date.now()}`,
    role: 'assistant',
    content: [{ type: 'text', text: '' }],
    createdAt: new Date(),
  };
}

export function appendTextToLastContent(
  msg: AssistantUIMessage,
  text: string
): AssistantUIMessage {
  const content = [...msg.content];
  const lastPart = content[content.length - 1];
  if (lastPart?.type === 'text') {
    content[content.length - 1] = { ...lastPart, text: lastPart.text + text };
  }
  return { ...msg, content };
}

export function toNativeMessages(uiMessages: AssistantUIMessage[]): Message[] {
  return uiMessages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join(''),
    timestamp: m.createdAt.toISOString(),
  }));
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/chat/assistant-ui/messageAdapter.ts
git commit -m "feat(chat): add assistant-ui message format adapter"
```

---

### Task 3: Create the IPC chat runtime adapter

**Files:**
- Create: `src/renderer/components/chat/assistant-ui/useIpcChatRuntime.ts`

**Step 1: Create the runtime hook**

This hook bridges Electron IPC streaming events to assistant-ui's `useExternalStoreRuntime`.

```typescript
import { useState, useCallback, useRef } from 'react';
import { useExternalStoreRuntime } from '@assistant-ui/react';
import type { Message } from '../types';
import {
  type AssistantUIMessage,
  toAssistantUIMessages,
  createEmptyAssistantMessage,
  appendTextToLastContent,
} from './messageAdapter';

interface UseIpcChatRuntimeOptions {
  messages: Message[];
  isLoading: boolean;
  selectedModel: string | null;
  currentConversationId: string | null;
  activeSkills: Map<string, string[]>;
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  onLoadingChange: (loading: boolean) => void;
  onConversationCreated: (id: string) => void;
  onStreamEnd: () => void;
}

export function useIpcChatRuntime({
  messages,
  isLoading,
  selectedModel,
  currentConversationId,
  activeSkills,
  onMessagesUpdate,
  onLoadingChange,
  onConversationCreated,
  onStreamEnd,
}: UseIpcChatRuntimeOptions) {
  const convIdRef = useRef<string | null>(currentConversationId);
  convIdRef.current = currentConversationId;

  const uiMessages = toAssistantUIMessages(messages);

  const runtime = useExternalStoreRuntime({
    isRunning: isLoading,
    messages: uiMessages,
    onNew: async (message) => {
      const text = message.content
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('');

      if (!text.trim()) return;

      let convId = convIdRef.current;

      // Create conversation if needed
      if (!convId) {
        const conv = await window.electronAPI.conversations.create();
        convId = conv.id;
        onConversationCreated(convId);
      }

      // Add user message and empty assistant message
      const userMessage: Message = {
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      onMessagesUpdate((prev) => [...prev, userMessage, { role: 'assistant', content: '', timestamp: new Date().toISOString() }]);
      onLoadingChange(true);

      // Register IPC listeners
      const removeChunk = window.electronAPI.conversations.onStreamChunk((data: any) => {
        if (data.conversationId !== convId) return;
        onMessagesUpdate((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + data.content };
          }
          return updated;
        });
      });

      const cleanup = () => {
        removeChunk();
        removeEnd();
        removeError();
        removeToolEvent();
      };

      const removeEnd = window.electronAPI.conversations.onStreamEnd((data: any) => {
        cleanup();
        if (data.conversationId !== convId) return;
        onLoadingChange(false);
        onStreamEnd();
      });

      const removeError = window.electronAPI.conversations.onStreamError((data: any) => {
        cleanup();
        if (data.conversationId !== convId) return;
        onMessagesUpdate((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content ? `${last.content}\n\nError: ${data.error}` : `Error: ${data.error}` };
          }
          return updated;
        });
        onLoadingChange(false);
      });

      const removeToolEvent = window.electronAPI.conversations.onStreamToolEvent(() => {});

      // Get skills for this conversation
      const skillIds = activeSkills.get(convId!) || [];

      // Send the message via IPC
      window.electronAPI.conversations.chat(
        convId!,
        null,
        text,
        selectedModel || undefined,
        skillIds.length > 0 ? skillIds : undefined
      );
    },
    onCancel: () => {
      const convId = convIdRef.current;
      if (!convId) return;
      window.electronAPI.conversations.abort(convId);
      onLoadingChange(false);
    },
  });

  return runtime;
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/chat/assistant-ui/useIpcChatRuntime.ts
git commit -m "feat(chat): add IPC runtime adapter for assistant-ui"
```

---

### Task 4: Create the assistant-ui theme wrapper

**Files:**
- Create: `src/renderer/components/chat/assistant-ui/AssistantTheme.tsx`

**Step 1: Create theme wrapper to match existing app styles**

```tsx
import '@assistant-ui/react/styles';
import './assistant-theme.css';

export { default as AssistantThread } from './AssistantThread';
export { default as AssistantComposer } from './AssistantComposer';
export { useIpcChatRuntime } from './useIpcChatRuntime';
```

**Step 2: Create CSS overrides file**

Create: `src/renderer/components/chat/assistant-ui/assistant-theme.css`

```css
/* Override assistant-ui defaults to match our app theme */
.aui-thread {
  --aui-bg: var(--background);
  --aui-border: hsl(var(--border));
  --aui-text: hsl(var(--foreground));
  --aui-primary: hsl(var(--primary));
  --aui-primary-foreground: hsl(var(--primary-foreground));
  --aui-muted: hsl(var(--muted));
  --aui-muted-foreground: hsl(var(--muted-foreground));
  --aui-surface: var(--surface);
  --aui-surface-hover: var(--surface-hover);
}

.aui-thread {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Message list area */
.aui-thread-viewport {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

/* User message bubbles */
.aui-message-user .aui-message-content {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-radius: 1rem;
  padding: 0.75rem 1rem;
}

/* Assistant message bubbles */
.aui-message-assistant .aui-message-content {
  background: var(--surface);
  border: 1px solid hsl(var(--border));
  border-radius: 1rem;
  padding: 0.75rem 1rem;
}

/* Composer */
.aui-composer {
  padding: 1rem;
}

.aui-composer-input {
  background: var(--surface);
  border: 1px solid hsl(var(--border));
  border-radius: 1rem;
  padding: 0.75rem;
  color: hsl(var(--foreground));
  font-size: 0.875rem;
  resize: none;
  min-height: 24px;
  max-height: 160px;
}

.aui-composer-input:focus {
  border-color: hsl(var(--primary) / 0.5);
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.1);
  outline: none;
}

/* Markdown inside messages */
.aui-message-content .prose {
  font-size: 0.875rem;
  line-height: 1.6;
}

/* Code blocks */
.aui-message-content pre {
  background: hsl(var(--muted));
  border-radius: 0.5rem;
  padding: 1rem;
  overflow-x: auto;
  font-size: 0.8rem;
}

.aui-message-content code {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
  font-size: 0.8rem;
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/chat/assistant-ui/AssistantTheme.tsx src/renderer/components/chat/assistant-ui/assistant-theme.css
git commit -m "feat(chat): add assistant-ui theme matching app styles"
```

---

### Task 5: Create the Thread component wrapper

**Files:**
- Create: `src/renderer/components/chat/assistant-ui/AssistantThread.tsx`

**Step 1: Create Thread wrapper with welcome state**

```tsx
import { Thread } from '@assistant-ui/react';
import { Sparkles, Code, MessageSquare, Lightbulb } from 'lucide-react';

interface AssistantThreadProps {
  onSuggestionClick?: (text: string) => void;
}

const suggestions = [
  { icon: Code, title: 'Write code', text: 'Help me write a React component' },
  { icon: MessageSquare, title: 'Explain', text: 'Explain how this codebase works' },
  { icon: Lightbulb, title: 'Debug', text: 'Help me fix this error' },
];

export default function AssistantThread({ onSuggestionClick }: AssistantThreadProps) {
  return (
    <Thread
      welcome={{
        message: 'How can I help?',
        suggestions: suggestions.map((s) => ({
          text: s.text,
          icon: <s.icon size={18} />,
        })),
        onSuggestionClick: (text) => onSuggestionClick?.(text),
      }}
    />
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/chat/assistant-ui/AssistantThread.tsx
git commit -m "feat(chat): add Thread wrapper with welcome state"
```

---

### Task 6: Create the Composer component wrapper

**Files:**
- Create: `src/renderer/components/chat/assistant-ui/AssistantComposer.tsx`

**Step 1: Create Composer wrapper preserving model selector and skill badges**

```tsx
import { Composer } from '@assistant-ui/react';
import { Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActiveSkillBadges } from '../ActiveSkillBadges';
import type { LLMProvider } from '../types';

interface AssistantComposerProps {
  providers: LLMProvider[];
  selectedModel: string | null;
  setSelectedModel: (model: string | null) => void;
  activeSkillBadges: { id: string; name: string }[];
  onRemoveSkill: (skillId: string) => void;
}

export default function AssistantComposer({
  providers,
  selectedModel,
  setSelectedModel,
  activeSkillBadges,
  onRemoveSkill,
}: AssistantComposerProps) {
  return (
    <div className="p-4 bg-background">
      {/* Model selector */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface)] text-xs text-muted-foreground">
          <Cpu size={12} />
          <select
            value={selectedModel || ''}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-transparent border-none text-xs text-muted-foreground cursor-pointer focus:outline-none"
          >
            {providers.map((provider) =>
              (provider.enabledModels || []).map((model) => (
                <option key={`${provider.id}-${model}`} value={model}>
                  {model}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Skill badges */}
      {activeSkillBadges.length > 0 && (
        <div className="mb-2">
          <ActiveSkillBadges skills={activeSkillBadges} onRemove={onRemoveSkill} />
        </div>
      )}

      {/* assistant-ui Composer */}
      <Composer>
        <Composer.Input
          placeholder="Message... (type / for tools & prompts)"
          className="flex-1 bg-[var(--surface)] border border-[hsl(var(--border))] rounded-2xl p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:shadow-[0_0_0_2px_hsl(var(--primary)/0.1)] resize-none min-h-[24px] max-h-[160px]"
        />
        <Composer.Send className="h-9 w-9 rounded-xl shrink-0 self-end" />
        <Composer.Cancel className="h-9 w-9 rounded-xl shrink-0 self-end" />
      </Composer>

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">Enter to send, type / for tools & prompts</span>
        <span>{selectedModel || 'No model'}</span>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/chat/assistant-ui/AssistantComposer.tsx
git commit -m "feat(chat): add Composer wrapper with model selector and skills"
```

---

### Task 7: Rewrite ChatLayout to use assistant-ui

**Files:**
- Modify: `src/renderer/components/chat/ChatLayout.tsx`

**Step 1: Rewrite ChatLayout**

Replace the entire ChatLayout to use `AssistantRuntimeProvider` + `Thread`. Keep ConversationList and resizable sidebar logic unchanged. Keep the hooks that manage conversation state, skills, input suggestions, and dialogs. The main change is replacing `<ChatMessages>` + `<ChatInput>` + `<AgentStatusBar>` with `<AssistantRuntimeProvider>` + `<AssistantThread>` + `<AssistantComposer>`.

Key changes:
- Import `AssistantRuntimeProvider` from `@assistant-ui/react`
- Import `useIpcChatRuntime` from our adapter
- Replace `<ChatMessages>`, `<ChatInput>`, `<AgentStatusBar>` with assistant-ui components
- Keep ConversationList, dialogs, and all hooks
- Remove imports for deleted components (ChatMessages, MessageBubble, ChatInput)

The new ChatLayout should:
1. Use `useIpcChatRuntime` to create a runtime that bridges IPC
2. Wrap the chat area in `<AssistantRuntimeProvider>`
3. Render `<AssistantThread>` for message display
4. Render `<AssistantComposer>` for input with model selector
5. Keep VariableFillDialog and SkillParameterDialog

**Step 2: Commit**

```bash
git add src/renderer/components/chat/ChatLayout.tsx
git commit -m "feat(chat): integrate assistant-ui into ChatLayout"
```

---

### Task 8: Clean up old components

**Files:**
- Delete: `src/renderer/components/chat/ChatMessages.tsx`
- Delete: `src/renderer/components/chat/MessageBubble.tsx`
- Delete: `src/renderer/components/chat/ChatInput.tsx`
- Delete: `src/renderer/components/chat/AgentStatusBar.tsx`
- Delete: `src/renderer/components/chat/EmptyState.tsx`

**Step 1: Verify no imports remain**

Run: `grep -r "from.*'\\.\\/ChatMessages'" src/ || echo "No imports found"`
Run: `grep -r "from.*'\\.\\/MessageBubble'" src/ || echo "No imports found"`
Run: `grep -r "from.*'\\.\\/ChatInput'" src/ || echo "No imports found"`
Run: `grep -r "from.*'\\.\\/AgentStatusBar'" src/ || echo "No imports found"`
Run: `grep -r "from.*'\\.\\/EmptyState'" src/ || echo "No imports found"`
Expected: "No imports found" for each

**Step 2: Delete old files**

```bash
rm src/renderer/components/chat/ChatMessages.tsx
rm src/renderer/components/chat/MessageBubble.tsx
rm src/renderer/components/chat/ChatInput.tsx
rm src/renderer/components/chat/AgentStatusBar.tsx
rm src/renderer/components/chat/EmptyState.tsx
```

**Step 3: Commit**

```bash
git add -A src/renderer/components/chat/
git commit -m "chore(chat): remove old UI components replaced by assistant-ui"
```

---

### Task 9: Build and verify

**Step 1: Run the build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 2: Run the dev server and manually test**

Run: `npm run dev`

Test these flows:
- Open chat tab → see welcome state
- Send a message → see streaming response
- Check markdown rendering (headers, code blocks, lists)
- Check thinking chain display (if using thinking model)
- Switch conversations in sidebar
- Create new conversation
- Model selector works
- Skill badges display and remove
- Abort during streaming
- Slash menu for prompts/skills
- Variable fill dialog
- Skill parameter dialog

**Step 3: Fix any TypeScript or runtime errors**

Address any issues found during build/dev testing.

**Step 4: Commit**

```bash
git add -A
git commit -m "fix(chat): address integration issues from testing"
```

---

## File Inventory

### New Files
- `src/renderer/components/chat/assistant-ui/messageAdapter.ts`
- `src/renderer/components/chat/assistant-ui/useIpcChatRuntime.ts`
- `src/renderer/components/chat/assistant-ui/AssistantTheme.tsx`
- `src/renderer/components/chat/assistant-ui/assistant-theme.css`
- `src/renderer/components/chat/assistant-ui/AssistantThread.tsx`
- `src/renderer/components/chat/assistant-ui/AssistantComposer.tsx`

### Modified Files
- `package.json` (new dependency)
- `src/renderer/components/chat/ChatLayout.tsx` (major rewrite)

### Deleted Files
- `src/renderer/components/chat/ChatMessages.tsx`
- `src/renderer/components/chat/MessageBubble.tsx`
- `src/renderer/components/chat/ChatInput.tsx`
- `src/renderer/components/chat/AgentStatusBar.tsx`
- `src/renderer/components/chat/EmptyState.tsx`

### Unchanged Files
- `src/renderer/components/chat/ConversationList.tsx`
- `src/renderer/components/chat/ConversationItem.tsx`
- `src/renderer/components/chat/ChatHeader.tsx`
- `src/renderer/components/chat/ExecutionDetails.tsx`
- `src/renderer/components/chat/ActiveSkillBadges.tsx`
- `src/renderer/components/chat/VariableFillDialog.tsx`
- `src/renderer/components/chat/SkillParameterDialog.tsx`
- `src/renderer/components/chat/types.ts`
- `src/renderer/components/chat/hooks/useChatConversations.ts`
- `src/renderer/components/chat/hooks/useChatInput.ts`
- `src/renderer/components/chat/hooks/useChatMessages.ts`
- `src/renderer/components/chat/hooks/useExecutionState.ts`
