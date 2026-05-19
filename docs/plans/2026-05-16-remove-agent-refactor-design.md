# Remove Agent, Refactor to Tools + Skills

## Concept Taxonomy

- **Tool**: Atomic, stateless function. No prompt. (read_file, execute_command, etc.)
- **Skill**: Prompt + tool combination. Pre-defined workflow. (daily report, code review)
- **Agent**: Autonomous reasoner. (not yet implemented)

## Changes

### 1. Remove Agent page from sidebar navigation

### 2. Remove Agent selector from ChatHeader, keep model selector

### 3. Bypass AgentManager for chat
- Extract tool loop logic from AgentManager into standalone function
- Chat IPC handler calls LLM directly with all enabled tools
- No fixed system prompt

### 4. Slash menu in Chatbox
- Type `/` to open grouped menu: Tools + Skills/Prompts
- Select tool → fills input (e.g. `/read_file `)
- Select skill/prompt → fills input with prompt content

### 5. Daily Reporter Agent → Skill
- System prompt becomes a Skill prompt
- Uses `daily-report` tool via LLM tool calling

## Files affected

- Sidebar navigation (remove Agents entry)
- ChatHeader (remove Agent dropdown)
- ChatLayout (remove Agent logic)
- AgentManager (extract tool loop, keep for future use)
- main.ts chat IPC handler
- useChatInput (slash menu with Tools + Skills)
- New: standalone chatStream function with tool loop
