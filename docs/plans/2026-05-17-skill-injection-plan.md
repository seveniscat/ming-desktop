# Skill Injection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make skills inject silently into conversation system context instead of pasting text into the input field.

**Architecture:** Frontend tracks active skills per conversation in a `Map<convId, skillId[]>`. When the user sends a message, the active skill IDs flow through IPC → ChatService → ChatEngine.buildContext(), which already merges skill prompts into the system message. A badge bar above the input shows active skills.

**Tech Stack:** React state, Electron IPC, existing ChatEngine

---

### Task 1: Update IPC Layer — Preload

**Files:**
- Modify: `src/main/preload.ts:52-54` (chat function)
- Modify: `src/main/preload.ts:209` (ElectronAPI type)

**Step 1: Update preload bridge**

In `src/main/preload.ts`, change the `chat` function to accept `injectedSkills`:

```typescript
// Line 52-54: Change from:
chat: (conversationId: string, agentId: string | null, message: string, model?: string) => {
  ipcRenderer.send(IPCChannels.CONVERSATION_CHAT, conversationId, agentId, message, model);
},

// To:
chat: (conversationId: string, agentId: string | null, message: string, model?: string, injectedSkills?: string[]) => {
  ipcRenderer.send(IPCChannels.CONVERSATION_CHAT, conversationId, agentId, message, model, injectedSkills);
},
```

**Step 2: Update ElectronAPI type**

In `src/main/preload.ts`, change line 209:

```typescript
// From:
chat: (conversationId: string, agentId: string | null, message: string, model?: string) => void;

// To:
chat: (conversationId: string, agentId: string | null, message: string, model?: string, injectedSkills?: string[]) => void;
```

**Step 3: Commit**

```bash
git add src/main/preload.ts
git commit -m "feat(skill-injection): update IPC chat to accept injectedSkills"
```

---

### Task 2: Update Main Handler — main.ts

**Files:**
- Modify: `src/main/main.ts:300-303`

**Step 1: Extract and pass injectedSkills**

In `src/main/main.ts`, change the CONVERSATION_CHAT handler:

```typescript
// Line 300-303: Change from:
ipcMain.on(IPCChannels.CONVERSATION_CHAT, (event, conversationId: string, agentId: string | null, message: string, model?: string) => {
  const webContents = event.sender;
  chatService.handleChat(conversationId, agentId || null, message, model, webContents);
});

// To:
ipcMain.on(IPCChannels.CONVERSATION_CHAT, (event, conversationId: string, agentId: string | null, message: string, model?: string, injectedSkills?: string[]) => {
  const webContents = event.sender;
  chatService.handleChat(conversationId, agentId || null, message, model, webContents, injectedSkills);
});
```

**Step 2: Commit**

```bash
git add src/main/main.ts
git commit -m "feat(skill-injection): pass injectedSkills through IPC handler"
```

---

### Task 3: Update ChatService

**Files:**
- Modify: `src/main/chat/ChatService.ts:48-111`

**Step 1: Update handleChat signature and pass injectedSkills**

In `src/main/chat/ChatService.ts`, change `handleChat`:

```typescript
// Line 48: Change signature from:
async handleChat(
  conversationId: string,
  agentId: string | null,
  userMessage: string,
  model: string | undefined,
  webContents: WebContents,
): Promise<void> {

// To:
async handleChat(
  conversationId: string,
  agentId: string | null,
  userMessage: string,
  model: string | undefined,
  webContents: WebContents,
  injectedSkills?: string[],
): Promise<void> {
```

```typescript
// Line 99-104: Change ChatRequest from:
const req: ChatRequest = {
  conversationId,
  userMessage,
  agentId: agentId || undefined,
  model,
};

// To:
const req: ChatRequest = {
  conversationId,
  userMessage,
  agentId: agentId || undefined,
  model,
  injectedSkills,
};
```

**Step 2: Commit**

```bash
git add src/main/chat/ChatService.ts
git commit -m "feat(skill-injection): pass injectedSkills to ChatEngine via ChatRequest"
```

---

### Task 4: Add Active Skills State to useChatMessages

**Files:**
- Modify: `src/renderer/components/chat/hooks/useChatMessages.ts`

**Step 1: Add activeSkills state and methods**

Add after line 42 (`const [isLoading, setIsLoading] = useState(false);`):

```typescript
const [activeSkills, setActiveSkills] = useState<Map<string, string[]>>(new Map());
```

Add `activateSkill` and `deactivateSkill` callbacks (after `sendConversationMessage`):

```typescript
const activateSkill = useCallback((convId: string, skillId: string) => {
  setActiveSkills(prev => {
    const next = new Map(prev);
    const existing = next.get(convId) || [];
    if (!existing.includes(skillId)) {
      next.set(convId, [...existing, skillId]);
    }
    return next;
  });
}, []);

const deactivateSkill = useCallback((convId: string, skillId: string) => {
  setActiveSkills(prev => {
    const next = new Map(prev);
    const existing = next.get(convId) || [];
    next.set(convId, existing.filter(id => id !== skillId));
    return next;
  });
}, []);

const getActiveSkills = useCallback((convId: string) => {
  return activeSkills.get(convId) || [];
}, [activeSkills]);
```

**Step 2: Include injectedSkills in the chat IPC call**

Change line 233:

```typescript
// From:
window.electronAPI.conversations.chat(convId, null, message, model || selectedModel || undefined);

// To:
const skillIds = activeSkills.get(convId) || [];
window.electronAPI.conversations.chat(convId, null, message, model || selectedModel || undefined, skillIds.length > 0 ? skillIds : undefined);
```

**Step 3: Export new methods**

Update the return statement (line 257-264):

```typescript
return {
  messages,
  setMessages,
  isLoading,
  setIsLoading,
  sendConversationMessage,
  handleAbortChat,
  activeSkills,
  activateSkill,
  deactivateSkill,
  getActiveSkills,
};
```

**Step 4: Commit**

```bash
git add src/renderer/components/chat/hooks/useChatMessages.ts
git commit -m "feat(skill-injection): add activeSkills state management"
```

---

### Task 5: Change Slash Menu Skill Selection to Inject

**Files:**
- Modify: `src/renderer/components/chat/hooks/useChatInput.ts`

**Step 1: Accept onActivateSkill callback**

Add `onActivateSkill` to the hook parameters:

```typescript
export function useChatInput({
  promptTemplates,
  isLoading,
  onActivateSkill,
}: {
  promptTemplates: PromptTemplate[];
  isLoading: boolean;
  onActivateSkill?: (skillId: string) => void;
}) {
```

**Step 2: Change applyPromptSuggestion for skills**

Change the `applyPromptSuggestion` callback (line 85-94):

```typescript
const applyPromptSuggestion = useCallback((suggestion: PromptSuggestion) => {
  if (suggestion.type === 'skill') {
    // Extract skill ID from the suggestion ID format "skill-{id}"
    const skillId = suggestion.id.replace('skill-', '');
    onActivateSkill?.(skillId);
    setInput(''); // Clear the slash input
    requestAnimationFrame(() => inputRef.current?.focus());
    setSelectedPromptIndex(0);
    return;
  }

  const vars = extractVariables(suggestion.content);
  if (vars.length > 0 && suggestion.type === 'prompt') {
    setPendingVariablePrompt(suggestion);
  } else {
    setInput(suggestion.content);
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  setSelectedPromptIndex(0);
}, [onActivateSkill]);
```

**Step 3: Commit**

```bash
git add src/renderer/components/chat/hooks/useChatInput.ts
git commit -m "feat(skill-injection): inject skills from slash menu instead of pasting"
```

---

### Task 6: Create ActiveSkillBadges Component

**Files:**
- Create: `src/renderer/components/chat/ActiveSkillBadges.tsx`

**Step 1: Create the badge component**

```tsx
import { X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActiveSkill {
  id: string;
  name: string;
}

interface ActiveSkillBadgesProps {
  skills: ActiveSkill[];
  onRemove: (skillId: string) => void;
}

export function ActiveSkillBadges({ skills, onRemove }: ActiveSkillBadgesProps) {
  if (skills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {skills.map(skill => (
        <span
          key={skill.id}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium"
        >
          <Zap size={10} />
          {skill.name}
          <button
            type="button"
            onClick={() => onRemove(skill.id)}
            className="ml-0.5 hover:text-destructive transition-colors"
          >
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/chat/ActiveSkillBadges.tsx
git commit -m "feat(skill-injection): add ActiveSkillBadges component"
```

---

### Task 7: Wire ActiveSkillBadges into ChatInput

**Files:**
- Modify: `src/renderer/components/chat/ChatInput.tsx`

**Step 1: Add new props to ChatInputProps**

Add to the interface (after `onApplyPromptSuggestion`):

```typescript
activeSkillBadges: { id: string; name: string }[];
onRemoveSkill: (skillId: string) => void;
```

**Step 2: Destructure new props**

Add to the destructured props:

```typescript
activeSkillBadges,
onRemoveSkill,
```

**Step 3: Render ActiveSkillBadges above textarea**

Add import:

```typescript
import { ActiveSkillBadges } from './ActiveSkillBadges';
```

Inside the input container div (line 130, the rounded-2xl div), add the badges before the `<div className="relative flex gap-3">`:

```tsx
<ActiveSkillBadges skills={activeSkillBadges} onRemove={onRemoveSkill} />
<div className="relative flex gap-3">
```

**Step 4: Commit**

```bash
git add src/renderer/components/chat/ChatInput.tsx
git commit -m "feat(skill-injection): render active skill badges in chat input"
```

---

### Task 8: Wire Everything Together in Parent Component

**Files:**
- Find the parent component that renders ChatInput and useChatMessages/useChatInput
- Wire the new props and callbacks

**Step 1: Find the parent component**

Search for the component that calls `useChatMessages`, `useChatInput`, and renders `<ChatInput>`. It's likely in `src/renderer/components/chat/` directory.

**Step 2: Pass activateSkill/getActiveSkills/deactivateSkill**

- Create `onActivateSkill` callback that calls `activateSkill(currentConversationId, skillId)` (guard against null convId by creating one first or queuing)
- Load skill names for badge display from the skills already loaded in `useChatInput`
- Pass `activeSkillBadges` and `onRemoveSkill` to `<ChatInput>`
- Pass `onActivateSkill` to `useChatInput`

**Step 3: Handle skill activation before conversation exists**

When the user activates a skill but no conversation exists yet, create a temporary conversation first, or queue the skill activation and apply it when a conversation is created.

Simplest approach: create a conversation on skill activation if none exists:

```typescript
const handleActivateSkill = useCallback(async (skillId: string) => {
  let convId = currentConversationId;
  if (!convId) {
    const conv = await window.electronAPI.conversations.create();
    convId = conv.id;
    setConversations(prev => [conv, ...prev]);
    setCurrentConversationId(convId);
  }
  activateSkill(convId, skillId);
}, [currentConversationId, activateSkill, setConversations, setCurrentConversationId]);
```

**Step 4: Commit**

```bash
git add <parent-component-file>
git commit -m "feat(skill-injection): wire skill injection end-to-end in chat"
```

---

### Task 9: Verify End-to-End

**Step 1: Build the app**

Run: `npm run build` (or whatever the build command is)
Expected: No TypeScript errors

**Step 2: Manual test flow**

1. Open the app, start a new conversation
2. Type `/` in the input, select a skill from the menu
3. Verify: badge appears above input, input is cleared
4. Type a message and send
5. Check debug panel or logs: verify the system message includes the skill prompt
6. Click X on the badge to deactivate
7. Send another message: verify skill prompt is NOT in the system message

**Step 3: Final commit if any fixes needed**
