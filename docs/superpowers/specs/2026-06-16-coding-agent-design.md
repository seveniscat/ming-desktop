# Coding Agent（类 Claude Code）设计

> 日期：2026-06-16
> 方案：A（独立 `CodingAgent` 模块 + 复用现有基建，完全增量）
> 目标：手搓一套模型无关、跑在任意 LLM provider 上的 agentic coding loop，提供类 Claude Code 的代码编辑能力。

## 1. 背景与现状

ming-desktop 已有的家底：

- **LLM 多 provider**：`LLMProviderManager` 支持 `openai-compatible` / `anthropic` / `claude-agent-sdk`，`chatStreamWithTools()` 已能返回结构化 `toolCalls`。
- **工具系统**：`ToolExecutor`（注册/执行/审批），已有 `read_file` / `write_file` / `execute_command` / `list_directory` / `search_files` 等工具。
- **agentic loop**：`ChatEngine` 含 `MAX_TOOL_ROUNDS=5` 的工具循环。
- **权限框架**：`toolApproval.ts` 的 `ToolApprovalManager`（弹窗审批）。

离真正 coding agent 的差距：

1. 无 `edit_file`（部分替换）——`write_file` 仅整文件覆盖。
2. 工具结果被字符串化塞进 `user` 消息（`ChatEngine.ts:117-119`），丢失结构化 `tool_use`/`tool_result`。
3. 无 workspace 概念——工具路径"绝对或相对"，相对基准含糊。
4. 无权限模式——仅布尔 `requiresApproval`，无 `acceptEdits`/`bypass`。

## 2. 范围

**本 spec 做（MVP）**：

- 结构化 tool 消息模型（tool_use / tool_result）。
- agentic loop：流式、`maxTurns` 可配、可中止。
- 核心工具：复用 read/write/bash/list/search；新增 `edit_file`、`glob`、升级 `grep`。
- per-session workspace（cwd）。
- 权限模式：`ask` / `acceptEdits` / `bypass`。
- 流式事件 + 基础 coding UI（工具调用折叠、edit inline diff、审批弹窗）。
- 模型无关：支持任意具备 function/tool calling 能力的 provider。

**后续 spec（不在本范围内）**：

- subagent / ACP 多 agent 编排。
- MCP 工具接入 coding agent。
- plan 模式。
- 文件 checkpoint / rewind。
- hooks。
- diff 审批 UX 打磨、项目级会话管理 UI。
- token / context 预算管理。

## 3. 架构

```
src/main/coding/
  types.ts            # 结构化消息、事件、PermissionMode、CodingSession 状态
  CodingAgent.ts      # 单会话编排器：buildContext → loop → 执行工具 → 回填结果
  CodingToolSet.ts    # 现有工具 + 新 edit/glob/grep，按会话 workspace 绑定
  codingTools/
    editFileTool.ts   # 新：old_string/new_string 部分替换
    globTool.ts       # 新：glob 模式匹配文件
    grepTool.ts       # 升级 search_files 为 ripgrep 风格内容搜索
  CodingService.ts    # IPC 接线 + 会话生命周期（create/list/dispose）
```

**复用不改**：`LLMProviderManager`（`chatStreamWithTools`）、`ToolExecutor`（注册/执行）、`toolApproval`（弹窗审批）。

## 4. 组件设计

### 4.1 结构化消息模型（脊柱改动）

内部消息在 coding 流程中带结构化工具块：

```ts
interface CodingMessage {
  role: 'system' | 'user' | 'assistant';
  content?: string;
  toolCalls?: ToolCall[];                 // assistant 消息携带的 tool_use
  toolResults?: CodingToolResult[];        // user 消息携带的结构化 tool_result
}
interface CodingToolResult {
  id: string;        // 对应 tool_use 的 id
  name: string;
  result: string;    // 成功或错误文本（错误也作为 result 回填，供模型自我纠错）
  isError?: boolean;
}
```

provider 适配层（已存在 `chatStreamWithTools` 的入参/出参）负责把内部格式翻译成各家 API：

- OpenAI 兼容：assistant 带 `tool_calls`，结果走 `{ role: 'tool', tool_call_id, content }`。
- Anthropic：assistant content 含 `tool_use` block，结果走 `tool_result` block。

`LLMProviderManager.chatStreamWithTools` 需扩展：接受 `CodingMessage[]`（而非纯 `string` content），内部按 moduleType 序列化。这是质量提升最大的改动。

### 4.2 CodingAgent（单会话编排器）

职责：持有会话状态（workspace、provider/model、permissionMode、消息历史、maxTurns），跑 agentic loop。

```
chatStream(userMessage, callbacks, signal):
  messages = buildContext()              // system + 历史 + 新 user
  turns = 0
  while turns < maxTurns:
    if signal.aborted: break
    result = llmManager.chatStreamWithTools(providerId, messages, model, toolDefs, onChunk, ...)
    追加 assistant 消息（content + toolCalls）
    if result.toolCalls 空: break
    for each toolCall:
      按模式 + requiresApproval 决定是否审批（emit tool_approval_request）
      执行工具（emit tool_use / tool_result，edit 带 diff）
    追加 user 消息（toolResults 结构化）
    turns++
  emit end / max_turns_reached
```

- `maxTurns` 默认 25（不再写死 5），会话可配。
- 全程支持 `signal` 中止。
- 工具执行失败：错误字符串作为该工具的 `tool_result(isError:true)` 回填，**不中断 loop**，模型可重试。

### 4.3 CodingToolSet

每个 coding 会话构建一组绑定到本会话 `workspace` 的工具，注册到一个 per-session `ToolExecutor` 实例（或复用共享 executor + 工作区上下文）。

工具 handler 签名扩展：

```ts
type ToolHandler = (params: Record<string, any>, ctx?: ToolContext) => Promise<string>;
interface ToolContext {
  workspace: string;        // 会话 cwd
  signal?: AbortSignal;
  permissionMode?: PermissionMode;
}
```

现有工具签名改为 `(params, _ctx?)`，忽略 `ctx`；coding 工具用 `ctx.workspace` 解析相对路径（`path.resolve(ctx.workspace, p)`）。这样多会话不同 workspace 不会互相干扰。

### 4.4 工具集

| 工具 | 来源 | 说明 |
|---|---|---|
| `read_file` | 复用 | 路径相对 workspace 解析 |
| `write_file` | 复用 | 整文件写 |
| **`edit_file`** | **新增** | `old_string`/`new_string` 精确替换，唯一匹配校验；零匹配/多匹配返回带上下文提示；支持跨行 |
| `execute_command` | 复用 | cwd 锁定 workspace |
| `glob` | 新增 | 文件名模式匹配（picomatch 风格） |
| `grep` | 升级 `search_files` | 内容正则/字面搜索，返回匹配行+行号 |

`edit_file` 算法：读取文件 → 统计 `old_string` 出现次数 → 1 次则替换、0 次报错（附文件片段提示）、N 次（N>1）报错（要求补充上下文使匹配唯一）→ 写回。

### 4.5 Workspace

per-session cwd。新建会话时用户选择文件夹，存入会话状态。UI 顶部显示当前 workspace。工具把相对路径 `path.resolve(ctx.workspace, p)`。越界访问（解析到 workspace 之外的敏感操作）记日志，按工具策略处理（MVP 不强制 jail，但相对路径默认锁在 workspace 内）。

### 4.6 权限模式

`PermissionMode = 'ask' | 'acceptEdits' | 'bypass'`。结合工具的 `requiresApproval`：

- `ask`（默认）：所有 `requiresApproval` 工具走 `ToolApprovalManager` 弹窗。
- `acceptEdits`：`edit_file` / `write_file` 自动放行；`execute_command` 仍弹窗。
- `bypass`：全部放行。

模式存在会话状态，执行前由 `CodingAgent` 决定是否调用审批。`ToolApprovalManager` 复用现有弹窗 UI。

### 4.7 流式事件

扩展 `ToolStreamEvent`（coding 专属）：

- `tool_use`：带解析后的参数。
- `tool_approval_request` / `tool_approval_result`。
- `tool_result`：edit 带 diff 片段。
- `turn_end`：每轮结束。
- `max_turns_reached`。
- 复用现有 `tool_start` / `tool_error` / `context`。

## 5. IPC + UI

**新增 IPC**（`src/shared/ipc-channels.ts`）：

- `CODING_SESSION_CREATE`：`{ workspace, model, providerId?, permissionMode?, maxTurns? }` → `{ sessionId }`
- `CODING_SESSION_SEND`：`{ sessionId, message }` → 流式事件
- `CODING_SESSION_STOP`：`{ sessionId }`
- `CODING_SESSION_LIST` / `_DISPOSE`
- 审批结果回传复用现有 `toolApproval` 通道。

**UI**（`src/renderer/components/CodingWorkspace.tsx`）：

- workspace 选择器 + 模型/权限模式选择。
- 消息流：可折叠工具调用、edit 的 inline diff、审批弹窗。
- 停止按钮、maxTurns 显示。
- 复用现有 chat 样式与 electronAPI 注入。

`vite-env.d.ts` 补 `coding` 相关类型。

## 6. 错误处理

- 工具失败 → 错误文本作为 `tool_result(isError:true)` 回填，loop 继续。
- edit 唯一性失败 → 返回带上下文提示，模型重试。
- 模型连续无效 toolCalls → 限流重试 + 计数，超阈值终止并报错。
- provider 报错 → 冒泡 `onError`，会话状态保留，用户可重发。
- abort → 优雅终止当前轮，保留已生成内容。

## 7. 测试

- **edit_file**：单匹配替换、零匹配报错、多匹配报错、跨行替换、文件不存在。
- **loop**：mock provider 返回固定 toolCalls，验证结构化回填格式、maxTurns 截断、abort。
- **权限模式**：`ask`/`acceptEdits`/`bypass` 下 write/edit/bash 的审批走向。
- **workspace**：相对路径解析正确性。
- **provider 适配**：OpenAI / Anthropic 两种格式下 tool_result 序列化正确。

## 8. 不做的事（YAGNI）

不做 subagent、MCP 接入、plan 模式、checkpoint/rewind、hooks、token 预算——留给后续 spec。
