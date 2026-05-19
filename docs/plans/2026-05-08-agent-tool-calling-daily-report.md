# Agent Tool Calling + Daily Report Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add tool calling to the Agent system, migrate daily report from Plugin to Agent conversation, remove Plugin system.

**Architecture:** New `ToolExecutor` class registers tools and handles the LLM tool_call loop. `LLMProviderManager` gains `tools` parameter support. Daily report data collection becomes a `daily-report` tool. Agent's own `systemPrompt`/`model` fields replace Settings-level daily report config. Plugin system is deleted entirely.

**Tech Stack:** Electron, TypeScript, OpenAI SDK, Anthropic SDK, SQLite (better-sqlite3)

---

### Task 1: Add `tools` parameter support to `LLMProviderManager.chat()`

**Files:**
- Modify: `src/main/llm/LLMProviderManager.ts:170-193` (chat method)
- Modify: `src/main/llm/LLMProviderManager.ts:385-409` (chatWithOpenAI)
- Modify: `src/main/llm/LLMProviderManager.ts:411-438` (chatWithAnthropic)

**Step 1: Add Tool types to `src/shared/types.ts`**

Append to end of file:

```typescript
// Tool Calling 相关类型
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolCallResult {
  toolCallId: string;
  result: string;
}
```

**Step 2: Add `tools` param to `chat()` and internal methods**

In `LLMProviderManager.ts`, update the `chat()` method signature:

```typescript
async chat(
  providerId: string,
  messages: ChatMessage[],
  model?: string,
  tools?: ToolDefinition[]
): Promise<string | { toolCalls: ToolCall[] }>
```

When `tools` is provided and the LLM returns `tool_calls`, return `{ toolCalls }` instead of text.

Update `chatWithOpenAI` to pass `tools` to `client.chat.completions.create()`. If response has `tool_calls`, return them. Otherwise return text.

Update `chatWithAnthropic` similarly — pass `tools` to `client.messages.create()`. If response has `tool_use` blocks, return them.

**Step 3: Commit**

```bash
git add src/shared/types.ts src/main/llm/LLMProviderManager.ts
git commit -m "feat: add tools parameter support to LLMProviderManager.chat()"
```

---

### Task 2: Create `ToolExecutor` with `daily-report` tool

**Files:**
- Create: `src/main/tools/ToolExecutor.ts`
- Create: `src/main/tools/dailyReportTool.ts`

**Step 1: Create `ToolExecutor.ts`**

```typescript
import { ToolDefinition, ToolCall } from '../../shared/types';
import { Logger } from '../utils/Logger';

export type ToolHandler = (params: Record<string, any>) => Promise<string>;

export interface ToolEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export class ToolExecutor {
  private tools: Map<string, ToolEntry> = new Map();

  register(entry: ToolEntry): void {
    this.tools.set(entry.definition.function.name, entry);
    Logger.info(`Tool registered: ${entry.definition.function.name}`);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  getToolsForAgent(agentTools: string[]): ToolDefinition[] {
    return agentTools
      .map(name => this.tools.get(name))
      .filter(Boolean)
      .map(t => t!.definition);
  }

  async execute(toolCall: ToolCall): Promise<string> {
    const entry = this.tools.get(toolCall.function.name);
    if (!entry) {
      throw new Error(`Unknown tool: ${toolCall.function.name}`);
    }
    const params = JSON.parse(toolCall.function.arguments);
    Logger.info(`Executing tool: ${toolCall.function.name}`, params);
    return entry.handler(params);
  }
}
```

**Step 2: Create `dailyReportTool.ts`**

Extract the Python script invocation logic from `PluginManager.executeDailyReport` (lines 182-298 of `src/main/plugins/PluginManager.ts`). Only the data collection part (run Python, parse commits JSON). No LLM call — LLM will handle report generation in the conversation.

```typescript
import * as path from 'path';
import * as fs from 'fs/promises';
import { ToolDefinition } from '../../shared/types';
import { ToolEntry } from './ToolExecutor';
import { ExecutorService } from '../services/ExecutorService';
import { ConfigManager } from '../services/ConfigManager';
import { Logger } from '../utils/Logger';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'daily-report',
    description: '收集 Git 仓库的提交记录。返回 JSON 格式的提交数据（按仓库分组），用于生成工作日报。',
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          description: '时间范围',
          enum: ['today', 'yesterday', 'week'],
          default: 'today',
        },
        sinceDate: {
          type: 'string',
          description: '自定义起始日期 (YYYY-MM-DD)',
        },
        untilDate: {
          type: 'string',
          description: '自定义结束日期 (YYYY-MM-DD)',
        },
        repoPaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Git 仓库路径列表。留空则使用 Settings 中配置的 workPaths',
        },
      },
    },
  },
};

export function createDailyReportTool(
  configManager: ConfigManager,
  executorService: ExecutorService
): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params: Record<string, any>) => {
      const storedPaths = configManager.get('workPaths', []) as string[];
      const home = process.env.HOME || '';

      const repoPaths: string[] =
        params.repoPaths?.length > 0
          ? params.repoPaths
          : storedPaths.filter(Boolean);

      const scriptPath = path.join(__dirname, '../../scripts/generate_daily_report.py');

      const env: Record<string, string> = {
        REPO_PATHS: repoPaths.join(','),
        TIME_RANGE: params.timeRange || 'today',
        INCLUDE_ALL_BRANCHES: 'true',
        DAILY_REPORT_TEMPLATE: '',
        DAILY_REPORT_OUTPUT_DIR: path.join(home, 'daily-reports'),
        DAILY_REPORT_OUTPUT_FORMAT: 'json',
      };

      if (params.sinceDate) env.SINCE_DATE = params.sinceDate;
      if (params.untilDate) env.UNTIL_DATE = params.untilDate;

      const result = await executorService.executeCommand(`python3 ${scriptPath}`, {
        cwd: home || undefined,
        env,
      });

      if (result.exitCode !== 0) {
        Logger.error('Daily report tool failed:', result.stderr);
        return JSON.stringify({ error: result.stderr, commits: [] });
      }

      const stdout = result.stdout || '';
      const outputMatch = stdout.match(/__OUTPUT_FILE__:(.+)/);
      const reportPath = outputMatch ? outputMatch[1].trim() : '';

      let commits: any[] = [];
      if (reportPath && reportPath.endsWith('.json')) {
        try {
          const jsonStr = await fs.readFile(reportPath, 'utf-8');
          const jsonData = JSON.parse(jsonStr);
          commits = jsonData.commits || [];
        } catch {
          // Fall through
        }
      }

      return JSON.stringify({ commits });
    },
  };
}
```

**Step 3: Commit**

```bash
git add src/main/tools/ToolExecutor.ts src/main/tools/dailyReportTool.ts
git commit -m "feat: add ToolExecutor framework and daily-report tool"
```

---

### Task 3: Integrate tool calling loop into `AgentManager`

**Files:**
- Modify: `src/main/agent/AgentManager.ts:1-453` (full rewrite of chat methods)
- Modify: `src/main/main.ts:53-81` (service init — pass ToolExecutor to AgentManager)

**Step 1: Add ToolExecutor dependency to AgentManager constructor**

Update constructor to accept `toolExecutor: ToolExecutor` instead of `pluginManager: PluginManager`.

Remove the `pluginManager` import, add `toolExecutor` import.

**Step 2: Rewrite `buildConversationContext`**

Remove the `agent.name === 'Daily Reporter'` special case. Use `agent.systemPrompt` directly:

```typescript
const messages: ChatMessage[] = [
  { role: 'system', content: agent.systemPrompt },
  ...history
];
```

**Step 3: Add tool calling loop to `chatInConversationStream`**

After the LLM responds, check if response contains `toolCalls`. If yes:
1. Execute each tool call via `this.toolExecutor.execute(call)`
2. Append tool results as `tool` role messages
3. Re-call LLM (continue streaming)
4. Repeat until LLM returns plain text

The tool calling should happen **before** streaming to the renderer. After all tools are resolved, stream the final LLM response.

Actually, a better approach: use `chat()` (non-streaming) for the tool call rounds, then use `chatStream()` for the final text response to get streaming in the UI.

**Step 4: Update `main.ts` service initialization**

Replace:
```typescript
pluginManager = new PluginManager(configManager, executorService, llmManager);
await pluginManager.initialize();

agentManager = new AgentManager(configManager, llmManager, pluginManager);
```

With:
```typescript
const toolExecutor = new ToolExecutor();
toolExecutor.register(createDailyReportTool(configManager, executorService));

agentManager = new AgentManager(configManager, llmManager, toolExecutor);
```

Remove `pluginManager` variable and PluginManager import.

**Step 5: Commit**

```bash
git add src/main/agent/AgentManager.ts src/main/main.ts
git commit -m "feat: integrate tool calling loop into AgentManager"
```

---

### Task 4: Update Daily Reporter Agent defaults

**Files:**
- Modify: `src/main/agent/AgentManager.ts:54-98` (createDefaultAgents)
- Modify: `src/shared/dailyReportDefaults.ts`

**Step 1: Rewrite Daily Reporter default systemPrompt in `dailyReportDefaults.ts`**

Replace the English prompt with a Chinese one that works for conversation-based report generation:

```typescript
export const DEFAULT_DAILY_REPORTER_SYSTEM_PROMPT = `你是一个工作日报生成助手。用户会提供 Git 提交记录，你需要将其整理为一份专业的中文工作日报。

规则：
- 按项目分类罗列完成的工作事项
- 用简洁清晰的语言描述每项工作
- 不需要展示提交次数、代码变更行数等统计信息
- 保持专业语气
- 用户可能会追问或要求修改，灵活响应`;
```

**Step 2: Update default agent model to not hardcode `gpt-4`**

In `createDefaultAgents`, set model to empty string `''` — this signals "use provider default". Update the chat methods to resolve `model || providerDefault`.

**Step 3: Commit**

```bash
git add src/main/agent/AgentManager.ts src/shared/dailyReportDefaults.ts
git commit -m "feat: update Daily Reporter default prompt to Chinese, remove hardcoded model"
```

---

### Task 5: Remove Plugin system

**Files:**
- Delete: `src/main/plugins/PluginManager.ts`
- Modify: `src/main/main.ts` — remove PluginManager import, IPC handlers (lines 85-92)
- Modify: `src/shared/ipc-channels.ts` — remove `PLUGIN_*` channels (lines 3-7)
- Modify: `src/main/preload.ts` — remove `plugins` API (lines 7-11, 105-108)
- Modify: `src/shared/types.ts` — remove `Plugin`, `PluginConfig`, `PluginExecutionResult` types (lines 1-25)

**Step 1: Remove PluginManager file and all references**

Delete `src/main/plugins/PluginManager.ts`.

Remove from `main.ts`: PluginManager import, `pluginManager` variable, PLUGIN_LIST and PLUGIN_EXECUTE IPC handlers.

Remove from `ipc-channels.ts`: `PLUGIN_LIST`, `PLUGIN_EXECUTE`, `PLUGIN_INSTALL`, `PLUGIN_UNINSTALL`.

Remove from `preload.ts`: `plugins` section from both `exposeInMainWorld` and `ElectronAPI` interface.

Remove from `types.ts`: `Plugin`, `PluginConfig`, `PluginExecutionResult` interfaces.

**Step 2: Commit**

```bash
git add -A
git commit -m "refactor: remove Plugin system, all functionality migrated to Agent tools"
```

---

### Task 6: Clean up Settings — remove daily report provider/model/prompt config

**Files:**
- Modify: `src/renderer/components/Settings.tsx` — remove provider/model/prompt UI (lines 29-31, 50-56, 68-74, 89-95, 300-345, 359-366)
- Modify: `src/main/services/ConfigManager.ts` — remove `dailyReportProvider`, `dailyReportModel`, `dailyReporterSystemPrompt` defaults
- Modify: `src/shared/types.ts` — remove those fields from `AppConfig`

**Step 1: Remove from AppConfig**

Remove `dailyReportProvider`, `dailyReportModel`, `dailyReporterSystemPrompt` from `AppConfig` interface and `ConfigManager` defaults.

**Step 2: Remove from Settings.tsx**

Remove the provider/model Select UI and the system prompt textarea. Keep the Markdown template textarea (tool fallback uses it) and workPaths.

Remove state variables: `dailyReportProvider`, `dailyReportModel`, `dailyReporterSystemPrompt`, `llmProviders`.
Remove their load/save/reset logic.

Simplify the card to only contain the Markdown template.

**Step 3: Commit**

```bash
git add src/renderer/components/Settings.tsx src/main/services/ConfigManager.ts src/shared/types.ts
git commit -m "refactor: remove daily report provider/model/prompt from Settings, now managed by Agent"
```

---

### Task 7: Manual smoke test

**Step 1: Build and run**

```bash
npm run dev
```

**Step 2: Verify Agent chat works**

1. Open AgentChat, select Daily Reporter agent
2. Send "生成今天的日报"
3. Verify: LLM calls `daily-report` tool, receives commit data, generates Chinese daily report in conversation
4. Verify streaming works (text appears incrementally)

**Step 3: Verify Settings cleaned up**

1. Open Settings
2. Verify no daily report provider/model/prompt fields
3. Verify Markdown template and workPaths still present

**Step 4: Verify Plugin system removed**

1. Verify no plugin-related errors in console
2. Verify no plugin UI anywhere
