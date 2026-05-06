# Agent Chat Persistence — Design Doc

**Date**: 2026-05-07
**Status**: Approved

## Problem

Agent chat messages are stored flat per `agent_id` with no conversation grouping. The UI does not load history on startup. Users cannot browse past conversations or start new ones.

## Requirements

- Organize messages into conversation sessions (global, not per-agent)
- Allow agent switching mid-conversation
- Sidebar + chat layout (like ChatGPT/Claude)
- Load conversation history on app open
- New chat, rename, delete conversations

## Approach

Add a `conversations` table and link `chat_messages` via `conversation_id`. Each message retains its own `agent_id` for mid-conversation agent flexibility.

## 1. Database Schema

### New table: `conversations`

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  agent_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Migration: add `conversation_id` to `chat_messages`

1. Add `conversation_id TEXT` column
2. Backfill: group existing messages by `agent_id`, create one conversation per agent, link them

### Message model

Each message has `conversation_id`. `agent_id` stays on the message level so agent can change mid-conversation.

## 2. Data Flow & Architecture

### Main process (`AgentManager.ts`)

New methods:
- `createConversation()` — creates a new conversation row
- `listConversations()` — returns all conversations sorted by updated_at desc
- `getConversationMessages(conversationId)` — loads messages for a conversation (last 100)
- `deleteConversation(conversationId)` — cascade-deletes conversation + messages
- `renameConversation(conversationId, title)` — updates title

Updated:
- `chat()` accepts `conversationId` — appends message, auto-generates title from first user message, bumps `updated_at`

### IPC channels

Add: `conversation:create`, `conversation:list`, `conversation:messages`, `conversation:delete`, `conversation:rename`, `conversation:chat`

### Preload API

Expose matching functions under `window.electronAPI.conversations`.

### Renderer state

- `currentConversationId` — active conversation
- Sidebar fetches conversation list on mount and after mutations
- Selecting a conversation loads its messages
- "New Chat" creates a conversation, sets as current, clears message view

## 3. UI Layout

### Sidebar (left panel)

- Top: "New Chat" button
- Conversation list sorted by `updated_at` desc — title + timestamp
- Context menu (...): rename, delete
- Current conversation highlighted

### Main chat area (right)

- Agent selector dropdown at top (switch agent mid-conversation)
- Message list loaded from `getConversationMessages()`
- Input bar — sends via `conversation:chat`

### Behavior

- On app open: load conversation list, auto-select most recent conversation
- Empty state: "Start a new conversation" prompt
- Auto-title: first user message truncated to ~30 chars (no LLM call)

## 4. Error Handling

- **Missing provider**: error banner, prompt to reconfigure
- **Delete conversation**: confirm dialog, cascade-delete messages
- **Large history**: load last 100 messages, scroll-to-load-more later if needed
- **Auto-title**: truncate first user message to 30 chars, upgrade to LLM-generated later
