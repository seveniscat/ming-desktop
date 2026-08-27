# Ming - 架构文档

单 Electron 应用，三层结构：渲染进程（React UI）↔ preload（类型化 IPC 桥）↔ 主进程（业务服务 + SQLite）。没有独立后端服务。

```
┌──────────────────────────────────────────────────────────────┐
│ 渲染进程 (React 18 + Vite + Tailwind + assistant-ui)          │
│   NavRail 切换页面：WorkGround / Chat / Skills / MCP /        │
│   Memories / Prompts / Providers / Tools / DevTools / Settings│
└──────────────────────────┬───────────────────────────────────┘
                           │ window.electronAPI.*（preload 类型化封装）
┌──────────────────────────┴───────────────────────────────────┐
│ 主进程 (Node)                                                 │
│   ChatEngine/ChatService · LLMProviderManager · MCPManager    │
│   SkillManager · MemoryManager · Git 缓存/日报 · ToolExecutor │
│   ExecutorService · UpdateService · 调试日志                   │
└──────────────────────────┬───────────────────────────────────┘
                           │ better-sqlite3
┌──────────────────────────┴───────────────────────────────────┐
│ SQLite（userData/ming-desktop.db，顺序命名迁移，当前 24 个）    │
└──────────────────────────────────────────────────────────────┘
```

## 主进程模块（src/main/）

| 模块 | 文件 | 职责 |
|---|---|---|
| 入口/IPC | `main.ts` | 窗口创建、服务初始化、全部 IPC handler 注册（git 扫描/热力图/技术栈分析内联于此） |
| IPC 桥 | `preload.ts` | `contextBridge` 暴露 `electronAPI`；文件底部 `ElectronAPI` 接口是渲染层的唯一类型来源（`vite-env.d.ts` 引用它） |
| 对话引擎 | `chat/ChatEngine.ts` | 流式对话 + 工具调用循环（最多 5 轮），系统提示词由 agent + skills + memories 组装 |
| 会话编排 | `chat/ChatService.ts` | 会话消息持久化、流式事件转发、中止 |
| LLM 层 | `llm/` | `LLMProviderManager`（provider CRUD、默认 provider、chatStreamWithTools）；`providers/registry.ts` 9 个预设 × 3 种模块类型（openai-compatible / anthropic / claude-agent-sdk）；双端结构化 tool 消息序列化；`CcSwitchImporter` 从 ~/.cc-switch 只读导入 |
| MCP | `mcp/` | `MCPManager`（服务器 CRUD、连接、工具目录）+ `McpClient`（@modelcontextprotocol/sdk，stdio/SSE，协议日志）；MCP 工具以 `mcp__<server>__<tool>` 名称注入对话 |
| 技能 | `skill/SkillManager.ts` | userData/skills 下文件夹式技能（SKILL.md frontmatter），CRUD、ZIP 导入、本地同步、IDE 打开 |
| 记忆 | `services/MemoryManager.ts` | 长期记忆 CRUD + FTS5 检索 + 上下文格式化与 token 估算 |
| 工具 | `tools/` | `ToolExecutor`（内置工具注册/执行/审批门控）、`ToolPersistenceManager`（工具注册表 + 用量统计）、8 个内置工具（含 daily-report） |
| 执行 | `services/ExecutorService.ts` | 子进程命令/脚本执行（超时、输出捕获） |
| Git | `services/GitCacheManager.ts` + `main.ts` 内联 | 仓库扫描、作者识别、提交聚合、热力图，SQLite 持久缓存 |
| 其他 | `services/{ConfigManager,PromptTemplateManager,DebugLogService}`、`techstack/`、`updater/`、`database/` | 应用配置（electron-store）、提示词模板、调试环形缓冲、依赖指纹识别、自动更新、schema/迁移 |
| coding（实验） | `coding/` | 自研模型无关 agentic loop + workspace 工具集（read/write/edit/glob/grep/bash），学习性质，未接入 UI |

## 渲染层（src/renderer/）

`App.tsx` 以 tab 状态切换页面（NavRail）。主要页面：

| 页面 | 组件 | 说明 |
|---|---|---|
| Home | `Welcome.tsx` | 问候 + git 身份/仓库概览 |
| WorkGround | `Dashboard.tsx` | 日报中心：时间范围、多身份过滤、提交明细、热力图、报告历史；可一键转交 Chat 续写 |
| Chat | `chat/ChatLayout.tsx` + `assistant-ui/*` | 基于 @assistant-ui/react 的会话式 UI：流式文本/思考、工具调用卡片、slash 命令（技能+模板）、变量填充卡 |
| Skills / Prompts / Memories | 对应管理页 | 各子系统的 CRUD 与测试 |
| MCP / MCP Debug | `pages/Mcp*.tsx` | 服务器管理、工具测试、协议日志实时查看 |
| Providers | `LLMConfiguration.tsx` | provider CRUD、拉模型、测连接、cc-switch 导入 |
| Tools / DevTools / Settings | — | 工具注册表、技术栈分析器、主题/更新 |

## IPC 概览

通道常量在 `src/shared/ipc-channels.ts`（约 110 个），按命名空间分组：`agent` / `skill` / `prompt` / `llm` / `conversation`（含 5 个流式事件通道）/ `coding` / `mcp-server` / `mcp-debug` / `memory` / `tools` / `git` / `daily-report` / `config` / `executor` / `dialog` / `debug` / `update` / `techstack` / `platform`。请求走 `ipcMain.handle`，推送事件由服务经 `webContents.send` 发出、preload 返回取消订阅函数。

## 数据库（src/main/database/schema.ts）

24 个顺序命名迁移，主要表：`agents`、`conversations`、`chat_messages`（含 reasoning 与结构化 tool_calls 持久化）、`llm_providers`、`skills`、`prompt_templates`、`daily_reports`、`tools`、`user_identities`（"哪些 git 身份是我"）、`mcp_servers` / `mcp_tools` / `mcp_protocol_log`、`memories` + `memories_fts`（FTS5）、`git_commits_cache` / `git_heatmap_cache`。

## 关键数据流（日报）

`Dashboard` → `daily-report:fetch` → `dailyReportTool`（解析 user_identities → 环境变量注入）→ `scripts/generate_daily_report.py`（递归发现仓库、git log 聚合、模板渲染）→ stdout 输出 `__OUTPUT_FILE__:` 标记 → 主进程读回 JSON 提交列表 → 缓存入 `git_commits_cache` → 渲染 + 可存 `daily_reports` → 可携带上下文转交 Chat。

## 设计文档

每个功能先有 spec 再实施，见 `docs/plans/`（`*-design.md` 为设计，`*.md` 为任务清单）。
