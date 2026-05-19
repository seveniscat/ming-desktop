# Skill Injection Design

## Problem

Skills are currently pasted as text into the input field. The design intent is for skills to be **temporary context injections** that silently influence the LLM's system prompt without cluttering the user's message.

## Requirements

- Skills inject silently into conversation system context
- Conversation-scoped: stays active for the entire conversation
- Multiple skills can be active simultaneously
- User sees a badge bar showing active skills with ability to remove
- `ChatRequest.injectedSkills` already exists in ChatEngine but is unused

## Architecture: Frontend State Only

Active skills are tracked in `useChatMessages` as a `Map<conversationId, skillId[]>`. No database schema changes — skill injection is a per-session concern. Persistence can be added later if needed.

## Data Flow

```
User selects skill from slash menu
  → add to activeSkills[conversationId]
  → show badge bar with active skills

User types message and sends
  → IPC payload includes { conversationId, message, model, injectedSkills: [...] }
  → ChatService passes injectedSkills to ChatEngine
  → ChatEngine.buildContext() merges skill prompts into system message (already implemented)
```

## Changes

### 1. Frontend — useChatMessages hook
- Add `activeSkills: Map<string, string[]>` state
- Add `activateSkill(convId, skillId)` and `deactivateSkill(convId, skillId)`
- Include `injectedSkills` in the `window.electronAPI.conversations.chat()` call

### 2. Frontend — useChatInput hook
- When a skill is selected from slash menu: call `activateSkill()` instead of pasting text into input
- Close slash menu after selection

### 3. Frontend — ActiveSkillBadges component
- Rendered above the chat input
- Shows active skill names as removable badges
- Each badge has an X button to deactivate

### 4. IPC — Preload (src/main/preload.ts)
- Update `chat()` signature to accept `injectedSkills?: string[]`

### 5. IPC — Main handler (src/main/main.ts)
- Extract `injectedSkills` from IPC payload
- Pass through to `ChatService.handleChat()`

### 6. ChatService (src/main/chat/ChatService.ts)
- Accept `injectedSkills` parameter in `handleChat()`
- Pass to `ChatRequest`

## What's Already Done

- ChatEngine.buildContext() handles `injectedSkills` — merges skill prompts into system content
- ChatRequest type has `injectedSkills?: string[]`
- SkillManager and skill CRUD infrastructure exist
- Slash menu shows skills
