# Prompts Management Design

## Overview

Rewrite the existing basic `PromptManager` into a full-featured Prompts management page with left-right split layout (matching ToolsPage), variable support, test capability, and Chatbox integration.

## Data Model

### Migration: extend `prompt_templates` table

Add columns to the existing `prompt_templates` table:

```sql
ALTER TABLE prompt_templates ADD COLUMN type TEXT NOT NULL DEFAULT 'task';  -- 'system' | 'task'
ALTER TABLE prompt_templates ADD COLUMN variables TEXT DEFAULT '[]';        -- JSON array of variable names
ALTER TABLE prompt_templates ADD COLUMN category TEXT;                      -- e.g. 'coding', 'writing', 'analysis'
ALTER TABLE prompt_templates ADD COLUMN tags TEXT DEFAULT '[]';             -- JSON array of tag strings
ALTER TABLE prompt_templates ADD COLUMN usage_count INTEGER DEFAULT 0;
```

### Updated TypeScript types

```typescript
export interface PromptTemplate {
  id: string;
  name: string;
  type: 'system' | 'task';
  trigger: string;
  description: string;
  content: string;
  variables: string[];     // extracted from content like {var_name}
  category: string | null;
  tags: string[];
  enabled: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}
```

### Variable extraction

When saving a prompt, the backend automatically extracts all `{variable_name}` patterns from `content` and stores them in `variables` as a JSON array. The frontend also extracts them for preview.

## Page Structure

### Left Panel: Prompt List

- Search bar (filters by name, trigger, description)
- Type filter pills: All / System / Task
- Category filter pills
- Tag filter (dropdown or pills)
- Card list showing: name, type badge, trigger, description, variable count, usage count, enabled badge
- "New" button
- Resizable panel (matching ToolsPage pattern)

### Right Panel: Prompt Detail (Tabs)

**Basic Info tab:**
- Name (Input)
- Type (Select: system / task)
- Trigger (Input, with / prefix shown)
- Description (Input)
- Category (Input or Select with common presets)
- Tags (Badge input — type to add, click to remove)
- Content (Textarea, multiline, monospace font)
- Enabled toggle (Switch)

**Test tab:**
- Auto-detects variables from content, shows input fields for each
- "Run Test" button — calls LLM with the rendered prompt
- Shows streaming response in a preview area
- Uses the currently selected model from chat settings

### Components

```
src/renderer/pages/PromptsPage.tsx
src/renderer/components/prompts/
  PromptDetail.tsx
  PromptBasicForm.tsx
  PromptTester.tsx
src/renderer/components/chat/VariableFillDialog.tsx
```

## Chatbox Integration

### Current flow (already works)
- User types `/` in chat input
- `useChatInput` hook shows prompt suggestions from enabled prompt templates
- User selects one, content replaces input

### New flow with variables
1. User selects a prompt with variables (e.g. `Please review {project_name}'s code`)
2. `VariableFillDialog` pops up showing input fields for each variable
3. User fills in values, clicks "Insert"
4. Variables are replaced: `Please review ReactApp's code`
5. Rendered content is inserted into the chat input

### System prompt handling
- When user selects a system-type prompt, it is set as the conversation's system message
- A small indicator shows the active system prompt
- The system prompt is prepended to the messages array when sending to LLM

## Backend Changes

### IPC channels (reuse existing)
- `PROMPT_CREATE`, `PROMPT_LIST`, `PROMPT_UPDATE`, `PROMPT_DELETE` — all already defined

### Handler changes
- `PROMPT_UPDATE` / `PROMPT_CREATE`: auto-extract variables from content before saving
- `PROMPT_LIST`: return full records including new fields
- Add `PROMPT_TEST` channel for the test feature (calls LLM with rendered prompt)

## Priority

1. Database migration + type updates
2. PromptsPage with left-right split layout
3. PromptDetail with Basic Info + Test tabs
4. VariableFillDialog for Chatbox
5. System prompt injection in chat
