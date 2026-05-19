# Memory Management Page Design

## Goal

Add a dedicated Memory Management page where users can view, create, edit, and debug AI Agent memories (user profile, preferences, project context). The Agent can also suggest memories during conversations via tool calls.

## Memory Type

User profile memories — who the user is, their role, tech stack preferences, work habits, reply style preferences, etc.

## Creation Mechanism

Hybrid: users can manually add memories on the management page, and the Agent can suggest memories during conversations ("Want to remember this?"). User confirmation required for Agent-suggested memories.

## Usage

MVP: full injection — all active memories are appended to the system prompt at conversation start. Future iteration: semantic retrieval.

---

## Data Model

SQLite table `memories`:

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PRIMARY KEY | UUID |
| content | TEXT NOT NULL | Memory content (short factual statement) |
| category | TEXT NOT NULL | `profile` \| `preference` \| `context` \| `custom` |
| source | TEXT NOT NULL DEFAULT 'manual' | `manual` \| `agent_suggested` |
| status | TEXT NOT NULL DEFAULT 'active' | `active` \| `archived` |
| created_at | TEXT NOT NULL | ISO timestamp |
| updated_at | TEXT NOT NULL | ISO timestamp |

---

## Management Page UI

Three areas:

### 1. Memory List (left main area)
- Filter by category and source
- Keyword search on content
- Each item shows: content, category tag, source tag, timestamp
- Inline edit, archive (not delete)

### 2. Preview Panel (right side)
- **System prompt injection preview**: formatted text showing exactly what the Agent will see
- **Token count**: estimated token usage
- **Recall test**: input a simulated message, see which memories match (MVP: all active)

### 3. Memory Creation (top bar or modal)
- Manual: content input + category selector
- Agent-suggested: via tool call in Chat page, shows confirmation card

---

## Agent Tools

### suggest_memory
Agent calls when it identifies memorable user info:
```json
{
  "name": "suggest_memory",
  "parameters": {
    "content": "string",
    "category": "profile | preference | context | custom",
    "reason": "string"
  }
}
```
Frontend shows confirmation card with: content, category, reason. User can confirm, edit+confirm, or dismiss.

### recall_memories
MVP returns all active memories. Future: semantic search.
```json
{
  "name": "recall_memories",
  "parameters": {
    "query": "string",
    "limit": 5
  }
}
```

---

## Injection Mechanism

At conversation start, main process queries all active memories, formats them as:

```
## User Memories

The following are facts and preferences you should remember about the user:

- [profile] 用户是前端工程师，精通 React 和 TypeScript
- [preference] 回复偏好：简洁，中文为主
- [context] 当前项目使用 Electron + Vite 技术栈
```

Appended to system prompt. Order: profile → preference → context → custom. Token limit check: if total exceeds threshold (~500 tokens), truncate and warn user to clean up on management page.

---

## Data Flow

```
New conversation
  → Main process queries memories (status=active)
  → Format as text block
  → Append to system prompt
  → Send to LLM

Agent identifies user info during chat
  → Calls suggest_memory tool
  → Frontend shows confirmation card
  → User confirms → write to database
  → Takes effect next conversation
```
