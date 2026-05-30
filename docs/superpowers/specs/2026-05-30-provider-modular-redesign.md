# Provider 模块化重设计

## 问题

当前 `LLMProviderManager` 存在双重痛点：

- **开发者侧**：新增 provider 类型需改类型定义、UI 下拉、client 初始化、chat 分支逻辑等 6+ 处代码
- **用户侧**：添加 provider 的 Dialog 体验差 — 需手动填 base URL、model 列表，无连接验证

核心问题：`openai | custom | qwen | deepseek` 本质上全是 OpenAI-compatible API，但代码里各自硬编码。

## 方案：文件模块化 + 预设 + 独立子页面

### 1. Provider 类型简化

从 7 种 type 简化为 3 种 module type：

| module type | 覆盖范围 |
|---|---|
| `openai-compatible` | OpenAI, Qwen, DeepSeek, Groq, OpenRouter, Ollama, 自定义等 |
| `anthropic` | Anthropic Claude（支持 extended thinking） |
| `claude-agent-sdk` | Claude Agent SDK 集成 |

通过 **预设（Preset）** 区分具体 provider，每个预设自带 defaultBaseURL 和 defaultModels。

### 2. Provider 模块架构

```
src/main/llm/
  providers/
    types.ts                    # ILLMProviderModule 接口 + ProviderPreset 类型
    registry.ts                 # SYSTEM_PRESETS[] + getModule() 工厂
    openai-compatible.ts        # OpenAI-compatible provider 模块
    anthropic.ts                # Anthropic provider 模块
    claude-agent-sdk.ts         # Claude Agent SDK 模块
  LLMProviderManager.ts         # 精简为路由层，委托给 provider 模块
```

#### 接口定义

```typescript
// providers/types.ts

export type ModuleType = 'openai-compatible' | 'anthropic' | 'claude-agent-sdk';

export interface ProviderPreset {
  id: string;                // e.g. 'openai', 'qwen', 'deepseek', 'custom'
  label: string;             // 显示名称
  moduleType: ModuleType;
  defaultBaseURL?: string;
  defaultModels: string[];
  requiresApiKey: boolean;   // Ollama 等本地服务不需要
}

export interface ChatStreamResult {
  fullContent: string;
  reasoningContent?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

export interface StreamWithToolsResult extends ChatStreamResult {
  toolCalls: StreamToolCall[];
  chunkCount?: number;
}

export interface ILLMProviderModule {
  createClient(config: { apiKey?: string; baseURL?: string }): unknown;
  chat(client: unknown, messages: ChatMessage[], model: string, tools?: ToolDefinition[]): Promise<string | { toolCalls: ToolCall[] }>;
  chatStream(client: unknown, messages: ChatMessage[], model: string, onChunk: (text: string) => void, signal?: AbortSignal): Promise<ChatStreamResult>;
  chatStreamWithTools(client: unknown, messages: ChatMessage[], model: string, tools: ToolDefinition[] | undefined, onChunk: (text: string) => void, signal?: AbortSignal): Promise<StreamWithToolsResult>;
  fetchModels?(client: unknown): Promise<string[]>;
  testConnection?(client: unknown): Promise<{ success: boolean; message: string }>;
}
```

#### 预设列表

```typescript
// providers/registry.ts
export const SYSTEM_PRESETS: ProviderPreset[] = [
  { id: 'openai', label: 'OpenAI', moduleType: 'openai-compatible',
    defaultBaseURL: 'https://api.openai.com/v1',
    defaultModels: ['gpt-4', 'gpt-4-turbo-preview', 'gpt-3.5-turbo'],
    requiresApiKey: true },
  { id: 'anthropic', label: 'Anthropic', moduleType: 'anthropic',
    defaultBaseURL: 'https://api.anthropic.com',
    defaultModels: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
    requiresApiKey: true },
  { id: 'qwen', label: 'Qwen', moduleType: 'openai-compatible',
    defaultBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModels: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
    requiresApiKey: true },
  { id: 'deepseek', label: 'DeepSeek', moduleType: 'openai-compatible',
    defaultBaseURL: 'https://api.deepseek.com/v1',
    defaultModels: ['deepseek-chat', 'deepseek-coder'],
    requiresApiKey: true },
  { id: 'groq', label: 'Groq', moduleType: 'openai-compatible',
    defaultBaseURL: 'https://api.groq.com/openai/v1',
    defaultModels: ['llama-3.1-70b-versatile', 'mixtral-8x7b-32768'],
    requiresApiKey: true },
  { id: 'openrouter', label: 'OpenRouter', moduleType: 'openai-compatible',
    defaultBaseURL: 'https://openrouter.ai/api/v1',
    defaultModels: ['openai/gpt-4', 'anthropic/claude-3-opus'],
    requiresApiKey: true },
  { id: 'ollama', label: 'Ollama (Local)', moduleType: 'openai-compatible',
    defaultBaseURL: 'http://localhost:11434/v1',
    defaultModels: [],
    requiresApiKey: false },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', moduleType: 'openai-compatible',
    defaultModels: [],
    requiresApiKey: true },
  { id: 'claude-agent-sdk', label: 'Claude Agent SDK', moduleType: 'claude-agent-sdk',
    defaultModels: ['claude-sonnet-4-6', 'claude-opus-4-7'],
    requiresApiKey: false },
];
```

#### LLMProvider 类型变更

```typescript
// shared/types.ts
export interface LLMProvider {
  id: string;
  name: string;
  presetId: string;           // NEW: 关联的预设 ID（如 'openai', 'qwen'）
  moduleType: ModuleType;     // RENAMED from 'type': 模块类型
  apiKey?: string;
  baseURL?: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  sdkConfig?: ClaudeAgentSDKConfig;
}
```

### 3. LLMProviderManager 精简

Manager 不再包含 provider-specific 逻辑，只做路由：

```typescript
class LLMProviderManager {
  private modules: Map<ModuleType, ILLMProviderModule>;  // 3 个模块实例

  private getModule(provider: LLMProvider): ILLMProviderModule {
    return this.modules.get(provider.moduleType);
  }

  async chat(providerId, messages, model, tools?) {
    const provider = this.providers.get(providerId);
    const client = this.clients.get(providerId);
    const module = this.getModule(provider);
    return module.chat(client, messages, model, tools);
  }
  // chatStream, chatStreamWithTools 同理
}
```

### 4. 测试连接

新增 IPC handler `llm:testConnection`：

```typescript
// 在 LLMProviderManager 中
async testConnection(providerId: string): Promise<{ success: boolean; message: string }> {
  const provider = this.providers.get(providerId);
  const client = this.clients.get(providerId);
  const module = this.getModule(provider);
  if (module.testConnection) {
    return module.testConnection(client);
  }
  // 默认：尝试 fetchModels
  try {
    await this.fetchModels(providerId);
    return { success: true, message: 'Connection successful' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}
```

各模块的 `testConnection` 实现：
- **openai-compatible**: 调用 `GET /v1/models`，成功即连接正常
- **anthropic**: 调用 `client.messages.create` 发一条最小请求
- **claude-agent-sdk**: 检查 SDK 模块是否可加载

### 5. UI：独立设置子页面

Settings 新增子页面导航模式。LLMConfiguration 从嵌入式组件升级为独立子页面。

#### 导航模式

Settings 页面内新增 `subPage` state：

```
Settings 主页
  → 点击 "LLM Providers" 卡片
  → 进入 LLM Providers 子页面（带 ← 返回按钮）
```

#### 子页面结构

```
┌──────────────────────────────────┐
│ ← LLM Providers                  │
│                                   │
│ Default for Agent chat: [Select]  │
│                                   │
│ [+ Add Provider]                  │
│                                   │
│ ┌───────────────────────────────┐ │
│ │ ● OpenAI               Active │ │
│ │   gpt-4, gpt-3.5-turbo       │ │
│ │   [Edit] [Test ✓]            │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ ● Qwen                 Active │ │
│ │   qwen-turbo, qwen-plus      │ │
│ │   [Edit] [Test …]            │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ ○ Anthropic           Off     │ │
│ │   [Edit] [Test]              │ │
│ └───────────────────────────────┘ │
└──────────────────────────────────┘
```

#### Add Provider 流程（子页面内展开，非 Dialog）

1. 点击 [+ Add Provider] → 页面内展开添加表单
2. 先选预设（图标网格）：OpenAI / Anthropic / Qwen / DeepSeek / Groq / OpenRouter / Ollama / Custom / Claude Agent SDK
3. 选完后自动填充 base URL 和默认 models
4. 用户填 API key（如需要）
5. 点击 [Test Connection] 验证
6. 验证成功后 [Save]

#### Edit Provider 流程

点击 [Edit] → 页面内展开编辑表单（同 add 类似），包含 [Test Connection] 按钮。

#### Test Connection 按钮状态

- 默认：灰色 [Test Connection]
- 测试中：加载动画 [Testing…]
- 成功：绿色 [✓ Connected]
- 失败：红色 [✗ Failed - error message]

### 6. 数据迁移

LLM Provider 数据库新增 `preset_id` 列，`type` 列改名为 `module_type`：

```sql
-- Migration
ALTER TABLE llm_providers ADD COLUMN preset_id TEXT;
UPDATE llm_providers SET preset_id = type;
UPDATE llm_providers SET type = 'openai-compatible' WHERE type IN ('openai', 'custom', 'qwen', 'deepseek', 'local');
```

### 7. 涉及文件

**新增**：
- `src/main/llm/providers/types.ts`
- `src/main/llm/providers/registry.ts`
- `src/main/llm/providers/openai-compatible.ts`
- `src/main/llm/providers/anthropic.ts`
- `src/main/llm/providers/claude-agent-sdk.ts`

**修改**：
- `src/shared/types.ts` — LLMProvider 类型更新
- `src/main/llm/LLMProviderManager.ts` — 精简为路由层
- `src/main/services/ConfigManager.ts` — 新增 testConnection IPC
- `src/renderer/components/LLMConfiguration.tsx` — 重写为子页面
- `src/renderer/components/Settings.tsx` — 新增子页面导航
- `src/main/database/connection.ts` — 数据库迁移
