# Agent Tool Calling 框架 + 日报迁移

## 背景

当前日报功能通过 PluginManager 实现：Python 脚本收集 git commits → 代码调用 LLM 生成报告。Plugin 系统只有 daily-report 一个实际实现，其余为空壳。Agent 系统有完整聊天 UI 和会话持久化，但 tools 只是标签，没有执行框架。

## 目标

1. 给 Agent 增加 tool calling 能力（可扩展框架）
2. 将日报生成从 Plugin 迁移到 Agent 对话式 tool calling
3. 统一日报配置到 Agent（systemPrompt / model），移除 Settings 中的重复配置
4. 删除 Plugin 系统

## 设计

### Tool Calling 框架

新增 `ToolExecutor` 类（`src/main/tools/ToolExecutor.ts`）：

- 注册 tool：名称 → `{ description, parameters, execute }` 映射
- 执行循环：LLM 返回 `tool_calls` → 执行 → 结果追加 messages → 再调 LLM → 直到 LLM 直接输出文本
- 使用 OpenAI function calling 格式定义 tools

LLM 调用改造（`LLMProviderManager`）：
- `chat` / `chatStream` 支持 `tools` 参数
- 检测 LLM 响应中的 `tool_calls`
- 循环执行直到获得最终文本响应

### daily-report Tool

从 PluginManager 提取数据收集逻辑为独立 tool：
- Tool 调用 Python 脚本收集 git commits（保留现有 Python 脚本）
- 返回 commits JSON 给 LLM
- LLM 在对话中根据 systemPrompt 整理成日报

### Agent 配置统一

- Agent `model` 字段生效，不再硬编码 `gpt-4`
- Agent `systemPrompt` 生效，移除 `agent.name === 'Daily Reporter'` 特殊处理
- Daily Reporter systemPrompt 改为中文日报生成指引

移除的 Settings 配置：
- `dailyReportProvider` / `dailyReportModel` — 改用 Agent model
- `dailyReporterSystemPrompt` — 改用 Agent systemPrompt

保留的 Settings 配置：
- `dailyReportTemplate` — tool 非 LLM fallback 仍需要
- `workPaths` — tool 收集数据需要

### 删除 Plugin 系统

- 删除 `src/main/plugins/PluginManager.ts`
- 删除 Settings 中日报专用的 provider/model/systemPrompt 配置 UI
- 移除 `main.ts` 中 PluginManager 初始化
- 移除 `AppConfig` 中 `dailyReportProvider` / `dailyReportModel` / `dailyReporterSystemPrompt`
- 移除 `AgentManager` 对 `PluginManager` 的依赖

### 数据流

```
用户: "生成今天的日报"
  → AgentChat 发消息
  → AgentManager 构建 messages（systemPrompt + history）+ tools 定义
  → LLM 返回 tool_call: daily-report({timeRange: "today"})
  → ToolExecutor 执行 daily-report → 返回 commits JSON
  → 结果追加到 messages，再调 LLM
  → LLM 根据 systemPrompt 整理 commits → 返回中文日报文本
  → 显示在 AgentChat
```

## 不做的事

- 不实现 git、file-system 等其他 tool（框架可扩展，但本次只做 daily-report）
- 不修改 Python 脚本逻辑
- 不改 Agent 的 UI 组件（AgentChat）
