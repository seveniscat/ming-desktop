# Coding Agent（类 Claude Code）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手搓一套模型无关的 agentic coding loop（类 Claude Code），跑在任意 LLM provider 上，提供 read/write/**edit**/bash/glob/grep 工具、per-session workspace、权限模式与流式 UI。

**Architecture:** 方案 A——独立 `src/main/coding/` 模块，复用 `LLMProviderManager` / `ToolExecutor` / `ToolApprovalManager`，完全增量，不破坏现有 chat 流程。核心改动：结构化 `tool_use`/`tool_result` 消息模型（让 provider 正确序列化工具调用历史），新增 `edit_file` 部分替换工具，per-session workspace 通过 `ToolContext` 注入工具。

**Tech Stack:** TypeScript, Electron (main + preload + renderer), React + Zustand, Vitest, OpenAI SDK, Anthropic SDK。

---

## 文件结构

**新建：**

| 文件 | 职责 |
|---|---|
| `vitest.config.ts` | Vitest 配置（node 环境 + `@shared` 别名） |
| `src/main/tools/tool-types.ts` | 工具相关纯类型（`ToolHandler`/`ToolEntry`/`ToolContext`），不依赖 electron，保证可单测 |
| `src/main/llm/providers/serialize-openai.ts` | 纯函数：`ChatMessage[]` → OpenAI 请求消息（含 tool_calls / tool 结果） |
| `src/main/llm/providers/serialize-anthropic.ts` | 纯函数：`ChatMessage[]` → Anthropic 请求消息（含 tool_use / tool_result block） |
| `src/main/coding/types.ts` | coding 专属类型：`PermissionMode`、`CodingSession`、`CodingStreamEvent`、agent 依赖接口 |
| `src/main/coding/CodingAgent.ts` | 单会话编排器：agentic loop（注入式依赖，可单测） |
| `src/main/coding/CodingToolSet.ts` | 构建 coding 工具集 + `ToolRuntime` 实现 |
| `src/main/coding/CodingService.ts` | IPC 接线 + 会话生命周期（create/send/stop/list） |
| `src/main/coding/codingTools/editFileTool.ts` | 新工具：`old_string`/`new_string` 部分替换 |
| `src/main/coding/codingTools/globTool.ts` | 新工具：文件名 glob 匹配 |
| `src/main/coding/codingTools/grepTool.ts` | 新工具：内容搜索（文件:行号:匹配） |
| `src/renderer/components/CodingWorkspace.tsx` | coding 工作台 UI |
| 各 `*.test.ts` | 对应单测 |

**修改：**

| 文件 | 改动 |
|---|---|
| `src/shared/types.ts` | `ChatMessage` 加可选 `toolCalls`/`toolResults`；新增 `CodingToolResult` |
| `src/main/llm/providers/openai-compatible.ts` | `chat`/`chatStreamWithTools` 改用 `serializeOpenAIMessages` |
| `src/main/llm/providers/anthropic.ts` | `chat`/`chatStreamWithTools` 改用 `serializeAnthropicMessages` |
| `src/main/tools/ToolExecutor.ts` | 类型改为从 `tool-types` 导入；新增 `runHandler(name, params, ctx)`（不做审批） |
| `src/main/tools/*.ts`（8 个工具） | handler 签名加可选 `ctx` 参数 |
| `src/shared/ipc-channels.ts` | 新增 `CODING_*` 通道 |
| `src/main/preload.ts` | 暴露 `electronAPI.coding` 命名空间 |
| `src/main/main.ts` | 实例化 `CodingService`、注册 IPC |
| `src/renderer/vite-env.d.ts` | `coding` API 类型 |
| `src/renderer/App.tsx` / `NavRail.tsx` | 新增 coding tab |

---

## Task 1: 测试基础设施

**Files:**
- Create: `vitest.config.ts`
- Create: `src/main/tools/tool-types.sanity.test.ts`（临时，验证 runner）

- [ ] **Step 1: 创建 vitest 配置**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: 写一个临时 sanity 测试**

Create `src/main/tools/tool-types.sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: 运行测试，确认 runner 可用**

Run: `npx vitest run`
Expected: 1 test passed（`vitest sanity > runs`）。

- [ ] **Step 4: 删除临时测试并提交**

Delete `src/main/tools/tool-types.sanity.test.ts`.

```bash
git add vitest.config.ts
git commit -m "chore(test): 接入 vitest 测试基础设施"
```

---

## Task 2: 结构化消息类型

**Files:**
- Modify: `src/shared/types.ts`（`ChatMessage` 接口，约第 99-103 行）

- [ ] **Step 1: 扩展 `ChatMessage` 并新增 `CodingToolResult`**

Modify `src/shared/types.ts` —— 把现有 `ChatMessage`：

```ts
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string;
}
```

替换为：

```ts
export interface CodingToolResult {
  id: string;
  name: string;
  result: string;
  isError?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string;
  /** assistant 消息：模型本轮产出的工具调用 */
  toolCalls?: ToolCall[];
  /** user 消息：回填给模型的结构化工具结果 */
  toolResults?: CodingToolResult[];
}
```

- [ ] **Step 2: 类型检查**

Run: `npm run type-check`
Expected: 无新增错误（新增字段均为可选，不破坏现有消费方）。

- [ ] **Step 3: 提交**

```bash
git add src/shared/types.ts
git commit -m "feat(types): ChatMessage 支持结构化 tool_calls/tool_results"
```

---

## Task 3: OpenAI 消息序列化

**Files:**
- Create: `src/main/llm/providers/serialize-openai.ts`
- Create: `src/main/llm/providers/serialize-openai.test.ts`
- Modify: `src/main/llm/providers/openai-compatible.ts`（`chat` 第 17 行、`chatStreamWithTools` 第 78 行）

- [ ] **Step 1: 写失败测试**

Create `src/main/llm/providers/serialize-openai.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeOpenAIMessages } from './serialize-openai';
import { ChatMessage } from '@shared/types';

describe('serializeOpenAIMessages', () => {
  it('maps plain messages to {role, content}', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ];
    expect(serializeOpenAIMessages(messages)).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('emits assistant tool_calls', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'thinking',
        toolCalls: [
          { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"file_path":"a.ts"}' } },
        ],
      },
    ];
    expect(serializeOpenAIMessages(messages)).toEqual([
      { role: 'assistant', content: 'thinking', tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"file_path":"a.ts"}' } },
      ] },
    ]);
  });

  it('emits tool role messages for toolResults', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: '',
        toolResults: [
          { id: 'call_1', name: 'read_file', result: 'file contents', isError: false },
          { id: 'call_2', name: 'edit_file', result: 'Error: not found', isError: true },
        ],
      },
    ];
    expect(serializeOpenAIMessages(messages)).toEqual([
      { role: 'tool', tool_call_id: 'call_1', content: 'file contents' },
      { role: 'tool', tool_call_id: 'call_2', content: 'Error: not found' },
    ]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run src/main/llm/providers/serialize-openai.test.ts`
Expected: FAIL（`serializeOpenAIMessages` 未定义）。

- [ ] **Step 3: 实现**

Create `src/main/llm/providers/serialize-openai.ts`:

```ts
import { ChatMessage } from '@shared/types';

/**
 * 把内部 ChatMessage[] 序列化为 OpenAI Chat Completions 的 messages 数组。
 * - assistant.toolCalls → message.tool_calls
 * - user.toolResults   → 多条 { role:'tool', tool_call_id, content }
 */
export function serializeOpenAIMessages(messages: ChatMessage[]): any[] {
  const out: any[] = [];
  for (const m of messages) {
    if (m.role === 'user' && m.toolResults && m.toolResults.length > 0) {
      for (const tr of m.toolResults) {
        out.push({ role: 'tool', tool_call_id: tr.id, content: tr.result });
      }
      continue;
    }
    const entry: any = { role: m.role, content: m.content };
    if (m.toolCalls && m.toolCalls.length > 0) {
      entry.tool_calls = m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
    }
    out.push(entry);
  }
  return out;
}
```

- [ ] **Step 4: 测试通过**

Run: `npx vitest run src/main/llm/providers/serialize-openai.test.ts`
Expected: 3 tests passed。

- [ ] **Step 5: 接入 openai-compatible.ts**

Modify `src/main/llm/providers/openai-compatible.ts`：

顶部加 import：

```ts
import { serializeOpenAIMessages } from './serialize-openai';
```

`chat` 方法中（第 17 行）：

```ts
      messages: messages.map(m => ({ role: m.role, content: m.content })),
```

改为：

```ts
      messages: serializeOpenAIMessages(messages),
```

`chatStreamWithTools` 方法中（第 78 行）同样把：

```ts
      messages: messages.map(m => ({ role: m.role, content: m.content })),
```

改为：

```ts
      messages: serializeOpenAIMessages(messages),
```

（`chatStream` 第 42 行**不改**——它不支持工具，保持纯文本。）

- [ ] **Step 6: 类型检查并提交**

Run: `npm run type-check`
Expected: 无错误。

```bash
git add src/main/llm/providers/serialize-openai.ts src/main/llm/providers/serialize-openai.test.ts src/main/llm/providers/openai-compatible.ts
git commit -m "feat(llm): OpenAI provider 支持结构化 tool 消息序列化"
```

---

## Task 4: Anthropic 消息序列化

**Files:**
- Create: `src/main/llm/providers/serialize-anthropic.ts`
- Create: `src/main/llm/providers/serialize-anthropic.test.ts`
- Modify: `src/main/llm/providers/anthropic.ts`（`chat` 第 18-21 行、`chatStreamWithTools` 第 82-85 行）

- [ ] **Step 1: 写失败测试**

Create `src/main/llm/providers/serialize-anthropic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeAnthropicMessages } from './serialize-anthropic';
import { ChatMessage } from '@shared/types';

describe('serializeAnthropicMessages', () => {
  it('splits system out and maps plain content', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ];
    const { system, conversation } = serializeAnthropicMessages(messages);
    expect(system).toBe('sys');
    expect(conversation).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('emits assistant tool_use blocks', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'thinking',
        toolCalls: [
          { id: 'toolu_1', type: 'function', function: { name: 'read_file', arguments: '{"file_path":"a"}' } },
        ],
      },
    ];
    const { conversation } = serializeAnthropicMessages(messages);
    expect(conversation).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'thinking' },
          { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { file_path: 'a' } },
        ],
      },
    ]);
  });

  it('emits a user message with tool_result blocks', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: '',
        toolResults: [
          { id: 'toolu_1', name: 'read_file', result: 'contents' },
          { id: 'toolu_2', name: 'edit_file', result: 'boom', isError: true },
        ],
      },
    ];
    const { conversation } = serializeAnthropicMessages(messages);
    expect(conversation).toEqual([
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_1', content: 'contents', is_error: false },
          { type: 'tool_result', tool_use_id: 'toolu_2', content: 'boom', is_error: true },
        ],
      },
    ]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run src/main/llm/providers/serialize-anthropic.test.ts`
Expected: FAIL（未定义）。

- [ ] **Step 3: 实现**

Create `src/main/llm/providers/serialize-anthropic.ts`:

```ts
import { ChatMessage } from '@shared/types';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: any;
}

export interface AnthropicSerialized {
  system: string;
  conversation: AnthropicMessage[];
}

/**
 * 把内部 ChatMessage[] 序列化为 Anthropic Messages API 格式。
 * system 抽离；assistant.toolCalls → tool_use block；user.toolResults → tool_result block。
 */
export function serializeAnthropicMessages(messages: ChatMessage[]): AnthropicSerialized {
  const system = messages.find((m) => m.role === 'system')?.content || '';
  const conversation: AnthropicMessage[] = [];

  for (const m of messages) {
    if (m.role === 'system') continue;

    if (m.role === 'user' && m.toolResults && m.toolResults.length > 0) {
      conversation.push({
        role: 'user',
        content: m.toolResults.map((tr) => ({
          type: 'tool_result',
          tool_use_id: tr.id,
          content: tr.result,
          is_error: tr.isError === true,
        })),
      });
      continue;
    }

    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      const blocks: any[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls) {
        let input: any = {};
        try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
      }
      conversation.push({ role: 'assistant', content: blocks });
      continue;
    }

    conversation.push({ role: m.role as 'user' | 'assistant', content: m.content });
  }

  return { system, conversation };
}
```

- [ ] **Step 4: 测试通过**

Run: `npx vitest run src/main/llm/providers/serialize-anthropic.test.ts`
Expected: 3 tests passed。

- [ ] **Step 5: 接入 anthropic.ts**

Modify `src/main/llm/providers/anthropic.ts`：

顶部加 import：

```ts
import { serializeAnthropicMessages } from './serialize-anthropic';
```

`chat` 方法中（第 15-22 行）把 `createOptions` 的 messages/system 部分：

```ts
      messages: messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      system: messages.find(m => m.role === 'system')?.content || '',
```

改为：

```ts
      messages: serializeAnthropicMessages(messages).conversation,
      system: serializeAnthropicMessages(messages).system,
```

`chatStream`（第 50-53 行）、`chatStreamWithTools`（第 82-85 行）同样替换为 `serializeAnthropicMessages`。

- [ ] **Step 6: 类型检查并提交**

Run: `npm run type-check`
Expected: 无错误。

```bash
git add src/main/llm/providers/serialize-anthropic.ts src/main/llm/providers/serialize-anthropic.test.ts src/main/llm/providers/anthropic.ts
git commit -m "feat(llm): Anthropic provider 支持结构化 tool 消息序列化"
```

---

## Task 5: 工具上下文与 handler 签名

把工具类型从 electron 耦合的 `ToolExecutor` 抽到纯类型模块，并给 handler 加可选 `ctx`，新增不做审批的 `runHandler`。

**Files:**
- Create: `src/main/tools/tool-types.ts`
- Modify: `src/main/tools/ToolExecutor.ts`
- Modify: 8 个工具文件（各 handler 签名）

- [ ] **Step 1: 创建纯类型模块**

Create `src/main/tools/tool-types.ts`:

```ts
import { ToolDefinition } from '../../shared/types';

/** 注入工具 handler 的运行时上下文（coding agent 用 workspace 锁定相对路径） */
export interface ToolContext {
  workspace: string;
  signal?: AbortSignal;
  permissionMode?: 'ask' | 'acceptEdits' | 'bypass';
}

export type ToolHandler = (
  params: Record<string, any>,
  ctx?: ToolContext,
) => Promise<string>;

export interface ToolEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
  requiresApproval?: boolean;
}
```

- [ ] **Step 2: 改造 ToolExecutor**

Modify `src/main/tools/ToolExecutor.ts`：

把顶部自定义类型块（第 6-12 行）：

```ts
export type ToolHandler = (params: Record<string, any>) => Promise<string>;

export interface ToolEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
  requiresApproval?: boolean;
}
```

替换为：

```ts
import { ToolHandler, ToolEntry, ToolContext } from './tool-types';
export type { ToolHandler, ToolEntry, ToolContext };
```

在 `executeByName` 方法之后（第 102 行 `}` 之后）新增 `runHandler`：

```ts
  /** 直接执行 handler（含 ToolContext），不做审批。coding agent 自行处理权限。 */
  async runHandler(name: string, params: Record<string, any>, ctx?: ToolContext): Promise<string> {
    const entry = this.tools.get(name);
    if (!entry) {
      throw new Error(`Unknown tool: ${name}`);
    }
    Logger.info(`Running tool: ${name}`, params);
    return entry.handler(params, ctx);
  }
```

- [ ] **Step 3: 给 8 个工具的 handler 加 ctx 参数**

每个工具 factory 的 `handler: async (params: Record<string, any>) =>` 改为 `handler: async (params: Record<string, any>, _ctx?) =>`。涉及文件与函数：

- `src/main/tools/readFileTool.ts`
- `src/main/tools/writeFileTool.ts`
- `src/main/tools/listDirectoryTool.ts`
- `src/main/tools/executeCommandTool.ts`
- `src/main/tools/searchFilesTool.ts`
- `src/main/tools/dailyReportTool.ts`
- `src/main/tools/suggestMemoryTool.ts`
- `src/main/tools/recallMemoriesTool.ts`

例：`writeFileTool.ts` 第 37 行 `handler: async (params: Record<string, any>) => {` 改为 `handler: async (params: Record<string, any>, _ctx?) => {`。其余 7 个同改（参数名保持各自原样，仅追加 `, _ctx?`）。

- [ ] **Step 4: 类型检查**

Run: `npm run type-check`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/main/tools/tool-types.ts src/main/tools/ToolExecutor.ts src/main/tools/readFileTool.ts src/main/tools/writeFileTool.ts src/main/tools/listDirectoryTool.ts src/main/tools/executeCommandTool.ts src/main/tools/searchFilesTool.ts src/main/tools/dailyReportTool.ts src/main/tools/suggestMemoryTool.ts src/main/tools/recallMemoriesTool.ts
git commit -m "refactor(tools): 抽离纯类型 tool-types，handler 支持 ToolContext，新增 runHandler"
```

---

## Task 6: edit_file 工具

**Files:**
- Create: `src/main/coding/codingTools/editFileTool.ts`
- Create: `src/main/coding/codingTools/editFileTool.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/main/coding/codingTools/editFileTool.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createEditFileTool } from './editFileTool';

describe('edit_file', () => {
  let dir: string;
  const tool = createEditFileTool();

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edit-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function write(name: string, content: string) {
    const p = path.join(dir, name);
    await fs.writeFile(p, content, 'utf-8');
    return p;
  }

  async function run(file: string, oldStr: string, newStr: string) {
    return JSON.parse(
      await tool.handler(
        { file_path: file, old_string: oldStr, new_string: newStr },
        { workspace: dir },
      ),
    );
  }

  it('replaces a unique single match', async () => {
    const f = await write('a.ts', 'foo\nbar\nbaz');
    const res = await run(f, 'bar', 'BAR');
    expect(res.success).toBe(true);
    expect(await fs.readFile(f, 'utf-8')).toBe('foo\nBAR\nbaz');
  });

  it('errors on zero matches with context hint', async () => {
    const f = await write('a.ts', 'foo\nbar');
    const res = await run(f, 'nope', 'x');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no match/i);
  });

  it('errors on multiple matches demanding more context', async () => {
    const f = await write('a.ts', 'dup\nline\ndup');
    const res = await run(f, 'dup', 'x');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/multiple|2/i);
  });

  it('supports multi-line (cross-line) replacement', async () => {
    const f = await write('a.ts', 'start\nmiddle\nend');
    const res = await run(f, 'start\nmiddle', 'BEGIN');
    expect(res.success).toBe(true);
    expect(await fs.readFile(f, 'utf-8')).toBe('BEGIN\nend');
  });

  it('creates file when old_string is empty and file missing', async () => {
    const f = path.join(dir, 'new.ts');
    const res = await run(f, '', 'hello');
    expect(res.success).toBe(true);
    expect(await fs.readFile(f, 'utf-8')).toBe('hello');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run src/main/coding/codingTools/editFileTool.test.ts`
Expected: FAIL（`createEditFileTool` 未定义）。

- [ ] **Step 3: 实现**

Create `src/main/coding/codingTools/editFileTool.ts`:

```ts
import * as path from 'path';
import * as fs from 'fs/promises';
import { ToolDefinition } from '../../../shared/types';
import { ToolEntry } from '../../tools/tool-types';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'edit_file',
    description:
      'Perform a precise string replacement in a file. old_string must match exactly once in the file (provide enough surrounding context to be unique). If old_string is empty and the file does not exist, creates the file with new_string.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file (relative to workspace or absolute).' },
        old_string: { type: 'string', description: 'The exact text to replace. Empty to create a new file.' },
        new_string: { type: 'string', description: 'The replacement text.' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
};

function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

export function createEditFileTool(): ToolEntry {
  return {
    definition: DEFINITION,
    requiresApproval: true,
    handler: async (params, ctx) => {
      const filePath = path.resolve(ctx?.workspace ?? process.cwd(), params.file_path);
      const oldString: string = params.old_string ?? '';
      const newString: string = params.new_string ?? '';

      // Create-new-file path
      if (oldString === '') {
        try {
          await fs.readFile(filePath);
          return JSON.stringify({ success: false, error: 'File already exists; provide a non-empty old_string to edit it.' });
        } catch {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, newString, 'utf-8');
          return JSON.stringify({ success: true, file_path: filePath, created: true });
        }
      }

      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch {
        return JSON.stringify({ success: false, error: `File not found: ${filePath}` });
      }

      const occurrences = countOccurrences(content, oldString);
      if (occurrences === 0) {
        const preview = content.slice(0, 300);
        return JSON.stringify({ success: false, error: `No match found for old_string. File starts with:\n${preview}` });
      }
      if (occurrences > 1) {
        return JSON.stringify({ success: false, error: `old_string matched ${occurrences} times; include more surrounding context so it is unique.` });
      }

      const updated = content.replace(oldString, newString);
      await fs.writeFile(filePath, updated, 'utf-8');
      return JSON.stringify({ success: true, file_path: filePath });
    },
  };
}
```

- [ ] **Step 4: 测试通过**

Run: `npx vitest run src/main/coding/codingTools/editFileTool.test.ts`
Expected: 5 tests passed。

- [ ] **Step 5: 提交**

```bash
git add src/main/coding/codingTools/editFileTool.ts src/main/coding/codingTools/editFileTool.test.ts
git commit -m "feat(coding): 新增 edit_file 工具（精确部分替换）"
```

---

## Task 7: glob 工具

**Files:**
- Create: `src/main/coding/codingTools/globTool.ts`
- Create: `src/main/coding/codingTools/globTool.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/main/coding/codingTools/globTool.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createGlobTool } from './globTool';

describe('glob', () => {
  let dir: string;
  const tool = createGlobTool();

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'glob-'));
    await fs.writeFile(path.join(dir, 'a.ts'), '');
    await fs.writeFile(path.join(dir, 'b.js'), '');
    await fs.mkdir(path.join(dir, 'sub'));
    await fs.writeFile(path.join(dir, 'sub', 'c.ts'), '');
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function run(pattern: string) {
    return JSON.parse(await tool.handler({ pattern }, { workspace: dir }));
  }

  it('matches by extension with *', async () => {
    const res = await run('*.ts');
    expect(res.success).toBe(true);
    const names = (res.matches as string[]).map((p) => path.basename(p)).sort();
    expect(names).toEqual(['a.ts', 'c.ts']);
  });

  it('matches recursively with **', async () => {
    const res = await run('**/*.js');
    expect(res.success).toBe(true);
    expect((res.matches as string[]).map((p) => path.basename(p))).toEqual(['b.js']);
  });

  it('returns empty (not error) when nothing matches', async () => {
    const res = await run('*.py');
    expect(res.success).toBe(true);
    expect(res.matches).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run src/main/coding/codingTools/globTool.test.ts`
Expected: FAIL（未定义）。

- [ ] **Step 3: 实现**

Create `src/main/coding/codingTools/globTool.ts`:

```ts
import * as path from 'path';
import * as fs from 'fs/promises';
import { ToolDefinition } from '../../../shared/types';
import { ToolEntry } from '../../tools/tool-types';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'glob',
    description: 'Find files under the workspace by glob pattern (supports *, **, ?). Returns matching file paths.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. "**/*.ts" or "src/*.json".' },
      },
      required: ['pattern'],
    },
  },
};

function globToRegex(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i++;
        if (pattern[i + 1] === '/') i++; // consume '**/'
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^$(){}|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

async function walk(root: string, base: string, out: string[]): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(root, e.name);
    const rel = path.relative(base, full);
    if (e.isDirectory()) {
      await walk(full, base, out);
    } else {
      out.push(rel);
    }
  }
}

export function createGlobTool(): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params, ctx) => {
      const workspace = ctx?.workspace ?? process.cwd();
      const pattern: string = params.pattern;
      const regex = globToRegex(pattern);
      const all: string[] = [];
      await walk(workspace, workspace, all);
      const matches = all
        .filter((rel) => regex.test(rel))
        .map((rel) => path.resolve(workspace, rel))
        .sort();
      return JSON.stringify({ success: true, matches });
    },
  };
}
```

- [ ] **Step 4: 测试通过**

Run: `npx vitest run src/main/coding/codingTools/globTool.test.ts`
Expected: 3 tests passed。

- [ ] **Step 5: 提交**

```bash
git add src/main/coding/codingTools/globTool.ts src/main/coding/codingTools/globTool.test.ts
git commit -m "feat(coding): 新增 glob 工具"
```

---

## Task 8: grep 工具

**Files:**
- Create: `src/main/coding/codingTools/grepTool.ts`
- Create: `src/main/coding/codingTools/grepTool.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/main/coding/codingTools/grepTool.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createGrepTool } from './grepTool';

describe('grep', () => {
  let dir: string;
  const tool = createGrepTool();

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-'));
    await fs.writeFile(path.join(dir, 'a.ts'), 'hello\nworld\nhello again');
    await fs.mkdir(path.join(dir, 'sub'));
    await fs.writeFile(path.join(dir, 'sub', 'b.ts'), 'world\nfoo');
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function run(pattern: string) {
    return JSON.parse(await tool.handler({ pattern }, { workspace: dir }));
  }

  it('finds matches with file:line:content', async () => {
    const res = await run('world');
    expect(res.success).toBe(true);
    const lines = res.matches as string[];
    expect(lines.some((l) => l.includes('a.ts') && l.includes(':1:'))).toBe(true);
    expect(lines.some((l) => l.includes('sub/b.ts') && l.includes(':1:'))).toBe(true);
  });

  it('respects regex patterns', async () => {
    const res = await run('hel{2}o');
    expect(res.success).toBe(true);
    const lines = res.matches as string[];
    expect(lines.filter((l) => l.includes('a.ts')).length).toBe(2);
  });

  it('returns empty when no match', async () => {
    const res = await run('zzzzz');
    expect(res.success).toBe(true);
    expect(res.matches).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run src/main/coding/codingTools/grepTool.test.ts`
Expected: FAIL（未定义）。

- [ ] **Step 3: 实现**

Create `src/main/coding/codingTools/grepTool.ts`:

```ts
import * as path from 'path';
import * as fs from 'fs/promises';
import { ToolDefinition } from '../../../shared/types';
import { ToolEntry } from '../../tools/tool-types';

const DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'grep',
    description: 'Search file contents under the workspace by regex. Returns matches as <relative_path>:<line>:<content>.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression to search for.' },
        maxResults: { type: 'number', description: 'Cap on number of matches (default 200).' },
      },
      required: ['pattern'],
    },
  },
};

async function walk(root: string, base: string, out: string[]): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      await walk(full, base, out);
    } else {
      out.push(full);
    }
  }
}

export function createGrepTool(): ToolEntry {
  return {
    definition: DEFINITION,
    handler: async (params, ctx) => {
      const workspace = ctx?.workspace ?? process.cwd();
      const pattern: string = params.pattern;
      const maxResults: number = params.maxResults ?? 200;
      let regex: RegExp;
      try {
        regex = new RegExp(pattern);
      } catch {
        return JSON.stringify({ success: false, error: `Invalid regex: ${pattern}` });
      }

      const files: string[] = [];
      await walk(workspace, workspace, files);
      const matches: string[] = [];

      for (const file of files) {
        if (matches.length >= maxResults) break;
        let content: string;
        try {
          content = await fs.readFile(file, 'utf-8');
        } catch {
          continue;
        }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            const rel = path.relative(workspace, file);
            matches.push(`${rel}:${i + 1}:${lines[i]}`);
            if (matches.length >= maxResults) break;
          }
        }
      }

      return JSON.stringify({ success: true, matches });
    },
  };
}
```

- [ ] **Step 4: 测试通过**

Run: `npx vitest run src/main/coding/codingTools/grepTool.test.ts`
Expected: 3 tests passed。

- [ ] **Step 5: 提交**

```bash
git add src/main/coding/codingTools/grepTool.ts src/main/coding/codingTools/grepTool.test.ts
git commit -m "feat(coding): 新增 grep 工具"
```

---

## Task 9: CodingAgent 编排器

注入式依赖，可单测：loop、结构化回填、maxTurns、abort、工具错误回填、权限门控。

**Files:**
- Create: `src/main/coding/types.ts`
- Create: `src/main/coding/CodingAgent.ts`
- Create: `src/main/coding/CodingAgent.test.ts`

- [ ] **Step 1: 定义 coding 类型**

Create `src/main/coding/types.ts`:

```ts
import { ChatMessage, ToolDefinition, ToolCall } from '../../shared/types';

export type PermissionMode = 'ask' | 'acceptEdits' | 'bypass';

export interface CodingSession {
  id: string;
  workspace: string;
  model: string;
  permissionMode: PermissionMode;
  maxTurns: number;
  systemPrompt?: string;
  providerId?: string;
}

/** 注入的 LLM 调用（可单测） */
export interface AgentLLMCall {
  (
    messages: ChatMessage[],
    tools: ToolDefinition[],
    opts: { signal: AbortSignal; onChunk: (text: string) => void },
  ): Promise<{ fullContent: string; toolCalls: ToolCall[] }>;
}

export interface ToolRuntime {
  getDefinitions(): ToolDefinition[];
  runHandler(name: string, params: Record<string, any>, ctx?: any): Promise<string>;
  isMutating(name: string): boolean;
}

export interface ApprovalProvider {
  request(toolName: string, params: Record<string, any>): Promise<boolean>;
}

export interface AgentDeps {
  llm: AgentLLMCall;
  tools: ToolRuntime;
  approval?: ApprovalProvider;
}

export interface AgentOptions {
  workspace: string;
  model: string;
  systemPrompt?: string;
  maxTurns?: number;
  permissionMode?: PermissionMode;
}

export type CodingEvent =
  | { event: 'context'; toolNames: string[]; messageCount: number; timestamp: number }
  | { event: 'text'; text: string; timestamp: number }
  | { event: 'tool_use'; toolName: string; args: Record<string, any>; timestamp: number }
  | { event: 'tool_approval_request'; requestId: string; toolName: string; args: Record<string, any>; timestamp: number }
  | { event: 'tool_approval_result'; requestId: string; approved: boolean; timestamp: number }
  | { event: 'tool_result'; toolName: string; result: string; diff?: string; isError?: boolean; timestamp: number }
  | { event: 'turn_end'; turn: number; timestamp: number }
  | { event: 'max_turns_reached'; maxTurns: number; timestamp: number }
  | { event: 'end'; timestamp: number }
  | { event: 'error'; error: string; timestamp: number };
```

- [ ] **Step 2: 写失败测试**

Create `src/main/coding/CodingAgent.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { CodingAgent } from './CodingAgent';
import { ChatMessage, ToolCall } from '@shared/types';

function tc(id: string, name: string, args: object): ToolCall {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

/** Scripted LLM: returns queued responses per call. */
function scriptedLLM(responses: Array<{ content: string; toolCalls?: ToolCall[] }>) {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return { fullContent: r.content, toolCalls: r.toolCalls ?? [] };
  }) as any;
}

function fakeTools(handlers: Record<string, (p: any) => Promise<string>>, mutating = new Set<string>()) {
  return {
    getDefinitions: () => Object.keys(handlers).map((name) => ({ type: 'function' as const, function: { name, description: name, parameters: { type: 'object' as const, properties: {} } } })),
    runHandler: async (name: string, p: any) => handlers[name](p),
    isMutating: (name: string) => mutating.has(name),
  };
}

describe('CodingAgent', () => {
  const opts = { workspace: '/ws', model: 'm', systemPrompt: 'sys' };

  it('stops when model returns no tool calls', async () => {
    const events: any[] = [];
    const agent = new CodingAgent(
      { llm: scriptedLLM([{ content: 'done' }]), tools: fakeTools({}) },
      opts,
    );
    await agent.run({ role: 'user', content: 'hi' }, (e) => events.push(e));
    expect(events.some((e) => e.event === 'end')).toBe(true);
    expect(agent.getHistory().filter((m) => m.role === 'assistant').length).toBe(1);
  });

  it('runs a tool and feeds structured result back', async () => {
    const readHandler = vi.fn(async () => 'file-contents');
    const llm = scriptedLLM([
      { content: '', toolCalls: [tc('1', 'read_file', { file_path: 'a' })] },
      { content: 'summary' },
    ]);
    const events: any[] = [];
    const agent = new CodingAgent({ llm, tools: fakeTools({ read_file: readHandler }) }, opts);
    await agent.run({ role: 'user', content: 'read' }, (e) => events.push(e));

    expect(readHandler).toHaveBeenCalledWith({ file_path: 'a' }, expect.objectContaining({ workspace: '/ws' }));
    // history: user, assistant(toolCalls), user(toolResults), assistant
    const userResults = agent.getHistory().filter((m) => m.toolResults && m.toolResults.length);
    expect(userResults.length).toBe(1);
    expect(userResults[0].toolResults![0]).toMatchObject({ id: '1', name: 'read_file', result: 'file-contents' });
  });

  it('truncates at maxTurns', async () => {
    const llm = scriptedLLM([
      { content: '', toolCalls: [tc('1', 'read_file', {})] },
      { content: '', toolCalls: [tc('2', 'read_file', {})] },
      { content: '', toolCalls: [tc('3', 'read_file', {})] },
    ]);
    const events: any[] = [];
    const agent = new CodingAgent({ llm, tools: fakeTools({ read_file: async () => 'x' }) }, { ...opts, maxTurns: 2 });
    await agent.run({ role: 'user', content: 'go' }, (e) => events.push(e));
    expect(events.some((e) => e.event === 'max_turns_reached' && e.maxTurns === 2)).toBe(true);
  });

  it('feeds tool errors back as isError result, loop continues', async () => {
    const llm = scriptedLLM([
      { content: '', toolCalls: [tc('1', 'bad', {})] },
      { content: 'recovered' },
    ]);
    const events: any[] = [];
    const agent = new CodingAgent(
      { llm, tools: fakeTools({ bad: async () => { throw new Error('boom'); } }) },
      opts,
    );
    await agent.run({ role: 'user', content: 'go' }, (e) => events.push(e));
    const resultEvt = events.find((e) => e.event === 'tool_result');
    expect(resultEvt?.isError).toBe(true);
    const userResults = agent.getHistory().filter((m) => m.toolResults && m.toolResults.length);
    expect(userResults[0].toolResults![0].isError).toBe(true);
  });

  it('bypass mode skips approval for mutating tools', async () => {
    const approval = { request: vi.fn(async () => true) };
    const writeHandler = vi.fn(async () => 'ok');
    const llm = scriptedLLM([{ content: '', toolCalls: [tc('1', 'write_file', {})] }, { content: 'done' }]);
    const agent = new CodingAgent(
      { llm, tools: fakeTools({ write_file: writeHandler }, new Set(['write_file'])), approval },
      { ...opts, permissionMode: 'bypass' },
    );
    await agent.run({ role: 'user', content: 'go' }, () => {});
    expect(approval.request).not.toHaveBeenCalled();
    expect(writeHandler).toHaveBeenCalled();
  });

  it('ask mode prompts approval for mutating tools and skips on deny', async () => {
    const approval = { request: vi.fn(async () => false) };
    const writeHandler = vi.fn(async () => 'ok');
    const llm = scriptedLLM([{ content: '', toolCalls: [tc('1', 'write_file', {})] }, { content: 'done' }]);
    const agent = new CodingAgent(
      { llm, tools: fakeTools({ write_file: writeHandler }, new Set(['write_file'])), approval },
      { ...opts, permissionMode: 'ask' },
    );
    const events: any[] = [];
    await agent.run({ role: 'user', content: 'go' }, (e) => events.push(e));
    expect(approval.request).toHaveBeenCalled();
    expect(writeHandler).not.toHaveBeenCalled();
    const resultEvt = events.find((e) => e.event === 'tool_result');
    expect(resultEvt?.isError).toBe(true);
  });

  it('acceptEdits auto-approves edits but asks for execute_command', async () => {
    const approval = { request: vi.fn(async () => true) };
    const editHandler = vi.fn(async () => 'ok');
    const llm = scriptedLLM([{ content: '', toolCalls: [tc('1', 'edit_file', {})] }, { content: 'done' }]);
    const agent = new CodingAgent(
      { llm, tools: fakeTools({ edit_file: editHandler, execute_command: async () => 'x' }, new Set(['edit_file', 'execute_command'])), approval },
      { ...opts, permissionMode: 'acceptEdits' },
    );
    await agent.run({ role: 'user', content: 'go' }, () => {});
    expect(approval.request).not.toHaveBeenCalled();
    expect(editHandler).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `npx vitest run src/main/coding/CodingAgent.test.ts`
Expected: FAIL（`CodingAgent` 未定义）。

- [ ] **Step 4: 实现**

Create `src/main/coding/CodingAgent.ts`:

```ts
import { ChatMessage } from '../../shared/types';
import {
  AgentDeps,
  AgentOptions,
  CodingEvent,
  PermissionMode,
} from './types';

const DEFAULT_MAX_TURNS = 25;

export class CodingAgent {
  private history: ChatMessage[] = [];
  private readonly maxTurns: number;
  private readonly permissionMode: PermissionMode;
  private readonly workspace: string;

  constructor(private deps: AgentDeps, opts: AgentOptions) {
    this.maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
    this.permissionMode = opts.permissionMode ?? 'ask';
    this.workspace = opts.workspace;
    if (opts.systemPrompt) {
      this.history.push({ role: 'system', content: opts.systemPrompt });
    }
  }

  getHistory(): ChatMessage[] {
    return this.history;
  }

  private shouldApprove(toolName: string): boolean {
    if (this.permissionMode === 'bypass') return false;
    if (this.permissionMode === 'acceptEdits') {
      return toolName === 'execute_command';
    }
    // 'ask'
    return this.deps.tools.isMutating(toolName);
  }

  private now(): number {
    return Date.now();
  }

  async run(userMessage: ChatMessage, emit: (e: CodingEvent) => void, signal?: AbortSignal): Promise<void> {
    try {
      this.history.push(userMessage);

      emit({
        event: 'context',
        toolNames: this.deps.tools.getDefinitions().map((t) => t.function.name),
        messageCount: this.history.length,
        timestamp: this.now(),
      });

      const toolDefs = this.deps.tools.getDefinitions();
      let turns = 0;

      while (turns < this.maxTurns) {
        if (signal?.aborted) break;

        const { fullContent, toolCalls } = await this.deps.llm(
          this.history,
          toolDefs,
          { signal: signal ?? new AbortController().signal, onChunk: (text) => emit({ event: 'text', text, timestamp: this.now() }) },
        );

        this.history.push({ role: 'assistant', content: fullContent, toolCalls: toolCalls.length ? toolCalls : undefined });

        if (!toolCalls || toolCalls.length === 0) {
          break;
        }

        const results: ChatMessage[] = [];
        const toolResults: NonNullable<ChatMessage['toolResults']> = [];

        for (const call of toolCalls) {
          const toolName = call.function.name;
          let parsedArgs: Record<string, any> = {};
          try { parsedArgs = JSON.parse(call.function.arguments); } catch { parsedArgs = {}; }

          emit({ event: 'tool_use', toolName, args: parsedArgs, timestamp: this.now() });

          // Approval gating
          if (this.shouldApprove(toolName) && this.deps.approval) {
            const requestId = `coding-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            emit({ event: 'tool_approval_request', requestId, toolName, args: parsedArgs, timestamp: this.now() });
            const approved = await this.deps.approval.request(toolName, parsedArgs);
            emit({ event: 'tool_approval_result', requestId, approved, timestamp: this.now() });
            if (!approved) {
              const denied = 'User denied tool execution';
              emit({ event: 'tool_result', toolName, result: denied, isError: true, timestamp: this.now() });
              toolResults.push({ id: call.id, name: toolName, result: denied, isError: true });
              continue;
            }
          }

          // Execute
          try {
            const result = await this.deps.tools.runHandler(toolName, parsedArgs, {
              workspace: this.workspace,
              signal,
              permissionMode: this.permissionMode,
            });
            emit({ event: 'tool_result', toolName, result: result.slice(0, 4000), timestamp: this.now() });
            toolResults.push({ id: call.id, name: toolName, result });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            emit({ event: 'tool_result', toolName, result: errMsg, isError: true, timestamp: this.now() });
            toolResults.push({ id: call.id, name: toolName, result: errMsg, isError: true });
          }
        }

        this.history.push({ role: 'user', content: '', toolResults });
        turns++;
        emit({ event: 'turn_end', turn: turns, timestamp: this.now() });
      }

      if (turns >= this.maxTurns) {
        emit({ event: 'max_turns_reached', maxTurns: this.maxTurns, timestamp: this.now() });
      }

      emit({ event: 'end', timestamp: this.now() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({ event: 'error', error: msg, timestamp: this.now() });
    }
  }
}
```

- [ ] **Step 5: 测试通过**

Run: `npx vitest run src/main/coding/CodingAgent.test.ts`
Expected: 7 tests passed。

- [ ] **Step 6: 提交**

```bash
git add src/main/coding/types.ts src/main/coding/CodingAgent.ts src/main/coding/CodingAgent.test.ts
git commit -m "feat(coding): CodingAgent 编排器（agentic loop + 结构化消息 + 权限门控）"
```

---

## Task 10: CodingToolSet

构建绑定 workspace 的 coding 工具集 + `ToolRuntime` 实现（复用 6 个工具，其中 read/write/list/execute/search 复用现有 factory，edit/glob/grep 用新 factory）。

**Files:**
- Create: `src/main/coding/CodingToolSet.ts`
- Create: `src/main/coding/CodingToolSet.test.ts`
- Read first: `src/main/tools/readFileTool.ts`、`executeCommandTool.ts`（确认 factory 签名）

- [ ] **Step 1: 确认现有工具 factory 签名**

Run: `grep -n "export function create" src/main/tools/readFileTool.ts src/main/tools/writeFileTool.ts src/main/tools/listDirectoryTool.ts src/main/tools/executeCommandTool.ts src/main/tools/searchFilesTool.ts`
Expected: 列出 `createReadFileTool()` / `createWriteFileTool()` / `createListDirectoryTool()` / `createExecuteCommandTool(executorService)` / `createSearchFilesTool()`。`execute_command` 需要 `executorService` 注入——CodingToolSet 暂用现有 createExecuteCommandTool（需传入 executorService）。

- [ ] **Step 2: 写失败测试**

Create `src/main/coding/CodingToolSet.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createCodingToolSet } from './CodingToolSet';

describe('createCodingToolSet', () => {
  it('registers the 6 coding tools', () => {
    const set = createCodingToolSet({ workspace: '/ws', executorService: {} as any });
    const names = set.getDefinitions().map((d) => d.function.name).sort();
    expect(names).toEqual(['edit_file', 'execute_command', 'glob', 'grep', 'list_directory', 'read_file', 'search_files', 'write_file']);
  });

  it('marks mutating tools', () => {
    const set = createCodingToolSet({ workspace: '/ws', executorService: {} as any });
    expect(set.isMutating('write_file')).toBe(true);
    expect(set.isMutating('edit_file')).toBe(true);
    expect(set.isMutating('execute_command')).toBe(true);
    expect(set.isMutating('read_file')).toBe(false);
    expect(set.isMutating('grep')).toBe(false);
  });

  it('runHandler resolves paths against workspace', async () => {
    // read_file on a missing path returns an error JSON, proving workspace is wired
    const set = createCodingToolSet({ workspace: '/nonexistent-ws-xyz', executorService: {} as any });
    const res = await set.runHandler('read_file', { path: 'nope.ts' });
    expect(res).toMatch(/error|Error|ENOENT|not found/i);
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `npx vitest run src/main/coding/CodingToolSet.test.ts`
Expected: FAIL（未定义）。

- [ ] **Step 4: 实现**

Create `src/main/coding/CodingToolSet.ts`:

```ts
import { ToolDefinition } from '../../shared/types';
import { ToolExecutor } from '../tools/ToolExecutor';
import { createReadFileTool } from '../tools/readFileTool';
import { createWriteFileTool } from '../tools/writeFileTool';
import { createListDirectoryTool } from '../tools/listDirectoryTool';
import { createSearchFilesTool } from '../tools/searchFilesTool';
import { createExecuteCommandTool } from '../tools/executeCommandTool';
import { ExecutorService } from '../services/ExecutorService';
import { createEditFileTool } from './codingTools/editFileTool';
import { createGlobTool } from './codingTools/globTool';
import { createGrepTool } from './codingTools/grepTool';
import { ToolRuntime } from './types';

const MUTATING = new Set(['write_file', 'edit_file', 'execute_command']);

export interface CodingToolSetOptions {
  workspace: string;
  executorService: ExecutorService;
}

export function createCodingToolSet(opts: CodingToolSetOptions): ToolRuntime {
  const executor = new ToolExecutor();
  executor.register(createReadFileTool());
  executor.register(createWriteFileTool());
  executor.register(createListDirectoryTool());
  executor.register(createSearchFilesTool());
  executor.register(createExecuteCommandTool(opts.executorService));
  executor.register(createEditFileTool());
  executor.register(createGlobTool());
  executor.register(createGrepTool());

  return {
    getDefinitions: () => executor.getDefinitions(),
    runHandler: (name, params, ctx) => executor.runHandler(name, params, ctx),
    isMutating: (name) => MUTATING.has(name),
  };
}
```

> 注：测试只验证工具名集合、mutating 标记与 read_file 的 workspace 接线，**不调用 execute_command**，因此可传 `{} as any` 作为 executorService。生产路径由 CodingService 注入真实 ExecutorService。

- [ ] **Step 5: 确认导入路径（已核实）**

`ExecutorService` 定义在 `src/main/services/ExecutorService.ts`，main.ts 已用 `import { ExecutorService } from './services/ExecutorService'`。`CodingToolSet.ts` / `CodingService.ts` 顶部 import 沿用该路径即可，无需调整。

- [ ] **Step 6: 测试通过**

Run: `npx vitest run src/main/coding/CodingToolSet.test.ts`
Expected: 3 tests passed。

- [ ] **Step 7: 提交**

```bash
git add src/main/coding/CodingToolSet.ts src/main/coding/CodingToolSet.test.ts
git commit -m "feat(coding): CodingToolSet 构建绑定 workspace 的工具集"
```

---

## Task 11: IPC 通道 + preload 桥 + 渲染端类型

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/vite-env.d.ts`

- [ ] **Step 1: 新增 IPC 通道**

In `src/shared/ipc-channels.ts`，在 `Update 相关` 区块之前（约第 146 行 `// Memory 相关` 之后或文件末尾 `}` 之前）加：

```ts
  // Coding Agent 相关
  CODING_SESSION_CREATE = 'coding:session-create',
  CODING_SESSION_SEND = 'coding:session-send',
  CODING_SESSION_STOP = 'coding:session-stop',
  CODING_SESSION_LIST = 'coding:session-list',
  CODING_SESSION_STREAM = 'coding:session-stream',
```

- [ ] **Step 2: preload 暴露 coding 命名空间**

In `src/main/preload.ts`，在 `conversations` 命名空间之后（约第 60 行后）新增 `coding` 命名空间：

```ts
  // Coding Agent API
  coding: {
    createSession: (opts: any) => ipcRenderer.invoke(IPCChannels.CODING_SESSION_CREATE, opts),
    send: (sessionId: string, message: string) =>
      ipcRenderer.send(IPCChannels.CODING_SESSION_SEND, sessionId, message),
    stop: (sessionId: string) =>
      ipcRenderer.send(IPCChannels.CODING_SESSION_STOP, sessionId),
    listSessions: () => ipcRenderer.invoke(IPCChannels.CODING_SESSION_LIST),
    onStream: (cb: (data: any) => void) => {
      const handler = (_event: unknown, data: any) => cb(data);
      ipcRenderer.on(IPCChannels.CODING_SESSION_STREAM, handler);
      return () => { ipcRenderer.off(IPCChannels.CODING_SESSION_STREAM, handler); };
    },
  },
```

- [ ] **Step 3: 渲染端类型**

Read `src/renderer/vite-env.d.ts` 找到 `electronAPI` 的 interface 定义。

在 interface 内（与 `conversations` 同级）追加：

```ts
    coding: {
      createSession: (opts: {
        workspace: string;
        model: string;
        providerId?: string;
        systemPrompt?: string;
        permissionMode?: 'ask' | 'acceptEdits' | 'bypass';
        maxTurns?: number;
      }) => Promise<{ sessionId: string }>;
      send: (sessionId: string, message: string) => void;
      stop: (sessionId: string) => void;
      listSessions: () => Promise<Array<{ id: string; workspace: string; model: string }>>;
      onStream: (cb: (data: any) => void) => () => void;
    };
```

- [ ] **Step 4: 类型检查**

Run: `npm run type-check`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/shared/ipc-channels.ts src/main/preload.ts src/renderer/vite-env.d.ts
git commit -m "feat(ipc): coding agent IPC 通道 + preload 桥 + 渲染端类型"
```

---

## Task 12: CodingService + main.ts 接线

**Files:**
- Create: `src/main/coding/CodingService.ts`
- Modify: `src/main/main.ts`（实例化 + IPC 注册）

- [ ] **Step 1: 实现 CodingService**

Create `src/main/coding/CodingService.ts`:

```ts
import type { WebContents } from 'electron';
import { IPCChannels } from '../../shared/ipc-channels';
import { ChatMessage, ToolCall } from '../../shared/types';
import { LLMProviderManager } from '../llm/LLMProviderManager';
import { ToolApprovalManager } from '../tools/toolApproval';
import { ExecutorService } from '../services/ExecutorService';
import { Logger } from '../utils/Logger';
import { CodingAgent } from './CodingAgent';
import { createCodingToolSet } from './CodingToolSet';
import { CodingSession, PermissionMode, AgentLLMCall, CodingEvent } from './types';

interface SessionState {
  session: CodingSession;
  agent: CodingAgent;
  abort: AbortController;
}

export class CodingService {
  private sessions: Map<string, SessionState> = new Map();
  private mainWindow: any = null;

  constructor(
    private llmManager: LLMProviderManager,
    private executorService: ExecutorService,
    private approvalManager?: ToolApprovalManager,
  ) {}

  setMainWindow(win: any): void {
    this.mainWindow = win;
  }

  listSessions(): CodingSession[] {
    return Array.from(this.sessions.values()).map((s) => s.session);
  }

  createSession(opts: {
    workspace: string;
    model: string;
    providerId?: string;
    systemPrompt?: string;
    permissionMode?: PermissionMode;
    maxTurns?: number;
  }): string {
    const id = `coding-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const providerId = opts.providerId || this.llmManager.getDefaultProviderId();
    if (!providerId) throw new Error('No LLM provider configured');

    const session: CodingSession = {
      id,
      workspace: opts.workspace,
      model: opts.model,
      providerId,
      systemPrompt: opts.systemPrompt,
      permissionMode: opts.permissionMode ?? 'ask',
      maxTurns: opts.maxTurns ?? 25,
    };

    const toolRuntime = createCodingToolSet({ workspace: opts.workspace, executorService: this.executorService });

    const llm: AgentLLMCall = async (messages, _tools, { signal, onChunk }) => {
      const noop = () => {};
      const result = await this.llmManager.chatStreamWithTools(
        providerId, messages, opts.model, toolRuntime.getDefinitions(),
        onChunk, noop, signal, id, noop,
      );
      const toolCalls: ToolCall[] = (result.toolCalls as any[]).map((t) => ({
        id: t.id, type: 'function', function: { name: t.function.name, arguments: t.function.arguments },
      }));
      return { fullContent: result.fullContent, toolCalls };
    };

    const agent = new CodingAgent(
      {
        llm,
        tools: toolRuntime,
        approval: this.approvalManager
          ? { request: (toolName, params) => this.approvalManager!.requestApproval(this.mainWindow, toolName, params) }
          : undefined,
      },
      {
        workspace: session.workspace,
        model: session.model,
        systemPrompt: session.systemPrompt || this.defaultSystemPrompt(session.workspace),
        maxTurns: session.maxTurns,
        permissionMode: session.permissionMode,
      },
    );

    this.sessions.set(id, { session, agent, abort: new AbortController() });
    Logger.info(`Coding session created: ${id} (workspace=${opts.workspace})`);
    return id;
  }

  private defaultSystemPrompt(workspace: string): string {
    return [
      'You are a coding agent operating inside the workspace.',
      `Workspace: ${workspace}`,
      'Use read_file/grep/glob to explore, edit_file/write_file to change code, execute_command to run builds/tests.',
      'For edit_file, provide enough context that old_string matches exactly once.',
      'When done, summarize the changes you made.',
    ].join('\n');
  }

  async handleSend(sessionId: string, userMessage: string, webContents: WebContents): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      this.send(webContents, { sessionId, event: 'error', error: `Session not found: ${sessionId}`, timestamp: Date.now() });
      return;
    }

    const send = (e: CodingEvent) => this.send(webContents, { sessionId, ...e });

    // fresh abort per message
    state.abort = new AbortController();
    const signal = state.abort.signal;

    try {
      await state.agent.run({ role: 'user', content: userMessage }, send, signal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Logger.error('CodingService send error:', err);
      this.send(webContents, { sessionId, event: 'error', error: msg, timestamp: Date.now() });
    }
  }

  stop(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) state.abort.abort();
  }

  private send(webContents: WebContents, data: any): void {
    if (!webContents.isDestroyed()) {
      webContents.send(IPCChannels.CODING_SESSION_STREAM, data);
    }
  }
}
```

> 确认 `ExecutorService` 的真实导入路径与 `ToolApprovalManager.requestApproval` 签名（`(mainWindow, toolName, params)`，见 `toolApproval.ts`）一致。

- [ ] **Step 2: 确认 ExecutorService 导入路径**

Run: `grep -rn "export class ExecutorService\|class ExecutorService" src/main`
Expected: 找到定义。把 `CodingService.ts` 与 `CodingToolSet.ts` 的 import 改为真实路径。若类名不是 `ExecutorService`（例如叫 `ExecutionService`），同步改名。

同时确认 main.ts 现有 executorService 变量名：

Run: `grep -n "executorService\|ExecutorService\|ExecutionService\|new.*Service" src/main/main.ts | head`
Expected: 看到 main.ts 里 executor service 的实例变量名。

- [ ] **Step 3: main.ts 实例化与注册**

In `src/main/main.ts`：

顶部 import 区加：

```ts
import { CodingService } from './coding/CodingService';
```

声明变量（与 `let chatService` 同区，约第 42 行）：

```ts
let codingService: CodingService;
```

在 `initializeServices()` 内 `chatService = new ChatService(...)`（约第 203 行）之后加：

```ts
  codingService = new CodingService(llmManager, executorService, toolApprovalManager);
```

> 注意：`toolApprovalManager` 当前是 `initializeServices` 内的局部变量（第 177 行）。需把它提升为模块级 `let toolApprovalManager: ToolApprovalManager;`，或把 `CodingService` 的审批改为延迟注入。**采用提升**：把第 177 行 `const toolApprovalManager = new ToolApprovalManager();` 改为赋值给模块级变量（删除 `const`，使用上面声明的模块级 `let toolApprovalManager`）。

在 `createWindow()` 中 `toolExecutor.setMainWindow(mainWindow)`（第 85-86 行）之后加：

```ts
  if (codingService) codingService.setMainWindow(mainWindow);
```

在 `setupIPCHandlers()` 中（CONVERSATION 区块之后，约第 355 行后）加：

```ts
  ipcMain.handle(IPCChannels.CODING_SESSION_CREATE, async (_e, opts: any) => {
    return { sessionId: codingService.createSession(opts) };
  });
  ipcMain.on(IPCChannels.CODING_SESSION_SEND, (event, sessionId: string, message: string) => {
    codingService.handleSend(sessionId, message, event.sender);
  });
  ipcMain.on(IPCChannels.CODING_SESSION_STOP, (_e, sessionId: string) => {
    codingService.stop(sessionId);
  });
  ipcMain.handle(IPCChannels.CODING_SESSION_LIST, async () => {
    return codingService.listSessions();
  });
```

- [ ] **Step 4: 类型检查**

Run: `npm run type-check`
Expected: 无错误（如有 ExecutorService/变量名不符，按 Step 2 修正）。

- [ ] **Step 5: 提交**

```bash
git add src/main/coding/CodingService.ts src/main/main.ts
git commit -m "feat(coding): CodingService 会话管理 + main.ts IPC 接线"
```

---

## Task 13: CodingWorkspace UI + 导航接入

**Files:**
- Create: `src/renderer/components/CodingWorkspace.tsx`
- Modify: `src/renderer/components/NavRail.tsx`（navItems）
- Modify: `src/renderer/App.tsx`（条件渲染）

- [ ] **Step 1: 创建 CodingWorkspace 组件**

Create `src/renderer/components/CodingWorkspace.tsx`:

```tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { FolderOpen, Send, Square, Play } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface StreamEvent {
  sessionId?: string;
  event: string;
  text?: string;
  toolName?: string;
  args?: Record<string, any>;
  result?: string;
  isError?: boolean;
  requestId?: string;
  approved?: boolean;
  turn?: number;
  error?: string;
  toolNames?: string[];
  maxTurns?: number;
  timestamp: number;
}

interface Entry {
  id: string;
  kind: 'user' | 'text' | 'tool' | 'error' | 'system';
  content: string;
  toolName?: string;
  args?: Record<string, any>;
  isError?: boolean;
}

export default function CodingWorkspace() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState('');
  const [model, setModel] = useState('');
  const [mode, setMode] = useState<'ask' | 'acceptEdits' | 'bypass'>('ask');
  const [input, setInput] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [running, setRunning] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{ requestId: string; toolName: string; params: any } | null>(null);
  const [providerId, setProviderId] = useState<string | undefined>();
  const seq = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const pushEntry = useCallback((e: Omit<Entry, 'id'>) => {
    setEntries((prev) => [...prev, { ...e, id: `e${seq.current++}` }]);
  }, []);

  useEffect(() => {
    const off = window.electronAPI?.coding?.onStream((data: StreamEvent) => {
      if (data.sessionId && data.sessionId !== sessionId) return;
      switch (data.event) {
        case 'text':
          // accumulate into the latest text entry
          setEntries((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.kind === 'text') {
              return [...prev.slice(0, -1), { ...last, content: last.content + (data.text || '') }];
            }
            return [...prev, { id: `e${seq.current++}`, kind: 'text', content: data.text || '' }];
          });
          break;
        case 'tool_use':
          pushEntry({ kind: 'tool', content: '', toolName: data.toolName, args: data.args });
          break;
        case 'tool_result':
          setEntries((prev) => {
            const copy = [...prev];
            for (let i = copy.length - 1; i >= 0; i--) {
              if (copy[i].kind === 'tool' && copy[i].toolName === data.toolName && copy[i].content === '') {
                copy[i] = { ...copy[i], content: (data.result || '').slice(0, 1000), isError: data.isError };
                break;
              }
            }
            return copy;
          });
          break;
        case 'max_turns_reached':
          pushEntry({ kind: 'system', content: `Max turns (${data.maxTurns}) reached.` });
          break;
        case 'error':
          pushEntry({ kind: 'error', content: data.error || 'Unknown error' });
          break;
        case 'end':
          setRunning(false);
          break;
      }
    });
    return () => { off?.(); };
  }, [sessionId, pushEntry]);

  // 权限审批：Coding tab 没有挂载 chat 的审批监听，这里独立订阅全局 ToolApproval 请求。
  // ask 模式下 CodingAgent 通过 approvalManager.requestApproval() 发出请求，由这里响应。
  useEffect(() => {
    const off = window.electronAPI?.tools?.onApprovalRequest((data: any) => {
      setPendingApproval({ requestId: data.requestId, toolName: data.toolName, params: data.params });
    });
    return () => { off?.(); };
  }, []);

  const respondApproval = (approved: boolean) => {
    if (!pendingApproval) return;
    window.electronAPI?.tools?.respondApproval(pendingApproval.requestId, approved);
    setPendingApproval(null);
  };

  const pickFolder = async () => {
    const result = await window.electronAPI?.dialog?.showOpenDialog({ properties: ['openDirectory'] });
    if (result && !result.canceled && result.filePaths[0]) {
      setWorkspace(result.filePaths[0]);
    }
  };

  const startSession = async () => {
    if (!workspace || !model) return;
    const { sessionId: sid } = await window.electronAPI.coding.createSession({
      workspace, model, providerId, permissionMode: mode,
    });
    setSessionId(sid);
    setEntries([]);
  };

  const send = () => {
    const msg = input.trim();
    if (!msg || !sessionId || running) return;
    pushEntry({ kind: 'user', content: msg });
    setInput('');
    setRunning(true);
    window.electronAPI.coding.send(sessionId, msg);
  };

  const stop = () => {
    if (sessionId) window.electronAPI.coding.stop(sessionId);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-[hsl(var(--border))]">
        <Button variant="outline" size="sm" onClick={pickFolder}>
          <FolderOpen size={14} className="mr-1.5" /> {workspace ? workspace.split('/').pop() : '选择工作目录'}
        </Button>
        <input
          className="h-8 px-2 text-sm rounded-md border border-[hsl(var(--border))] bg-transparent"
          placeholder="model id"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <select
          className="h-8 px-2 text-sm rounded-md border border-[hsl(var(--border))] bg-transparent"
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
        >
          <option value="ask">ask</option>
          <option value="acceptEdits">acceptEdits</option>
          <option value="bypass">bypass</option>
        </select>
        <Button size="sm" onClick={startSession} disabled={!workspace || !model || !!sessionId}>
          <Play size={14} />
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">权限审批复用全局 ToolApproval 弹窗</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {entries.map((e) => (
          <div key={e.id} className={cn('rounded-lg p-3 text-sm', entryClass(e))}>
            {e.kind === 'tool' ? (
              <ToolBlock entry={e} />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-sans">{e.content}</pre>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 审批弹层 */}
      {pendingApproval && (
        <div className="mx-3 mb-2 rounded-lg border border-[hsl(var(--border))] bg-[var(--surface)] p-3 text-sm">
          <div className="font-medium mb-1">请求执行工具：<code>{pendingApproval.toolName}</code></div>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-40 overflow-auto mb-2">
            {JSON.stringify(pendingApproval.params, null, 2)}
          </pre>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => respondApproval(false)}>拒绝</Button>
            <Button size="sm" onClick={() => respondApproval(true)}>批准</Button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-[hsl(var(--border))]">
        <div className="flex gap-2">
          <textarea
            className="flex-1 min-h-[40px] max-h-32 p-2 text-sm rounded-md border border-[hsl(var(--border))] bg-transparent resize-y"
            placeholder={sessionId ? '描述要做的改动…' : '先选择目录、填写 model 并启动会话'}
            value={input}
            disabled={!sessionId}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          {running ? (
            <Button variant="destructive" size="icon" onClick={stop}><Square size={16} /></Button>
          ) : (
            <Button size="icon" onClick={send} disabled={!sessionId}><Send size={16} /></Button>
          )}
        </div>
      </div>
    </div>
  );
}

function entryClass(e: Entry): string {
  switch (e.kind) {
    case 'user': return 'bg-primary/5 ml-auto max-w-[80%]';
    case 'error': return 'bg-destructive/10 text-destructive';
    case 'system': return 'bg-muted text-muted-foreground';
    case 'tool': return 'bg-[var(--surface)] border border-[hsl(var(--border))]';
    default: return 'bg-[var(--surface-hover)]';
  }
}

function ToolBlock({ entry }: { entry: Entry }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className="font-medium text-xs flex items-center gap-1" onClick={() => setOpen(!open)}>
        <span>{entry.isError ? '⚠' : '🔧'}</span> {entry.toolName}
      </button>
      <div className="text-xs text-muted-foreground mt-0.5">{JSON.stringify(entry.args)}</div>
      {entry.content && (
        <pre className={cn('mt-1 text-xs whitespace-pre-wrap break-words overflow-hidden', !open && 'max-h-24')}>
          {entry.content}
        </pre>
      )}
      {entry.content && entry.content.length > 200 && (
        <button className="text-xs text-primary" onClick={() => setOpen(!open)}>{open ? '收起' : '展开'}</button>
      )}
    </div>
  );
}
```

> 修正：上面 `<Play size={14" />` 笔误，应为 `<Play size={14} />`。保存前改正。同时确认 `window.electronAPI.dialog.showOpenDialog` 在 preload 中存在（`DIALOG_SHOW_OPEN_DIALOG` 通道）。若命名不同，按实际调整。

- [ ] **Step 2: 确认 dialog API（已核实）**

`window.electronAPI.dialog.showOpenDialog(options)` 已存在于 preload（返回 `Electron.OpenDialogReturnValue`，含 `canceled` 与 `filePaths`）。`pickFolder` 直接可用，无需调整。

- [ ] **Step 3: 接入导航**

Modify `src/renderer/components/NavRail.tsx`：

第 2 行 import 的 lucide 图标里加 `Terminal`（或用已有的 `Search`），并在 `navItems`（第 13-24 行）数组中 `chat` 之后插入：

```ts
  { id: 'coding', icon: Terminal, label: 'Coding' },
```

（确保 `Terminal` 已在 import 列表中。）

Modify `src/renderer/App.tsx`：

顶部 import 区加：

```ts
import CodingWorkspace from './components/CodingWorkspace';
```

在 `activeTab === 'chat'` 的条件渲染块之后（约第 117 行后）加：

```tsx
              {activeTab === 'coding' && <CodingWorkspace />}
```

- [ ] **Step 4: 类型检查**

Run: `npm run type-check`
Expected: 无错误。

- [ ] **Step 5: 构建验证**

Run: `npm run build`
Expected: 构建成功（electron-vite 打包 main/preload/renderer 三端）。

- [ ] **Step 6: 运行应用手测（记录在 commit body）**

Run: `npm run dev`
手测：
1. 进入 Coding tab → 选目录、填 model、启动会话。
2. 发送「列出当前目录所有 ts 文件」→ 应触发 `glob`/`list_directory`，工具块折叠展示结果。
3. 发送「在 src 下新建 hello.ts，内容写 export const hi = 1」→ `ask` 模式应弹审批，批准后 `write_file` 执行。
4. 切 `acceptEdits`，再让 agent 改文件 → 不弹审批。
5. 点停止 → 中止。

- [ ] **Step 7: 提交**

```bash
git add src/renderer/components/CodingWorkspace.tsx src/renderer/components/NavRail.tsx src/renderer/App.tsx
git commit -m "feat(ui): CodingWorkspace 工作台 + 导航接入"
```

---

## 完成验收

- [ ] 全部单测通过：`npx vitest run`
- [ ] 类型检查通过：`npm run type-check`
- [ ] 构建通过：`npm run build`
- [ ] 手测（Task 13 Step 6）的核心流程跑通

## 不在本计划范围（YAGNI，后续 spec）

subagent/ACP 编排、MCP 工具接入 coding、plan 模式、checkpoint/rewind、hooks、coding 会话持久化（重启丢失）、token 预算、diff 审批 UI 打磨。
