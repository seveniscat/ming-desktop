# Provider Modular Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the LLM provider system from hardcoded types to a modular, file-based architecture with presets, test connection, and a dedicated Settings sub-page.

**Architecture:** Provider logic is split into independent modules (`openai-compatible`, `anthropic`, `claude-agent-sdk`) implementing a unified `ILLMProviderModule` interface. `LLMProviderManager` becomes a thin router. A `SYSTEM_PRESETS` registry provides zero-config provider templates. The UI moves from inline Dialog to a drill-down Settings sub-page.

**Tech Stack:** Electron (IPC), SQLite (migrations), React, shadcn/ui, OpenAI SDK, Anthropic SDK

---

## File Structure

**New files:**
| File | Responsibility |
|---|---|
| `src/main/llm/providers/types.ts` | `ModuleType`, `ProviderPreset`, `ILLMProviderModule` interface, result types |
| `src/main/llm/providers/registry.ts` | `SYSTEM_PRESETS[]`, `getModule()` factory |
| `src/main/llm/providers/openai-compatible.ts` | OpenAI-compatible provider module |
| `src/main/llm/providers/anthropic.ts` | Anthropic provider module |
| `src/main/llm/providers/claude-agent-sdk.ts` | Claude Agent SDK module |

**Modified files:**
| File | Change |
|---|---|
| `src/shared/types.ts` | `LLMProvider` type: add `presetId`, rename `type` → `moduleType` |
| `src/shared/ipc-channels.ts` | Add `LLM_TEST_CONNECTION` channel |
| `src/main/llm/LLMProviderManager.ts` | Replace hardcoded logic with module delegation |
| `src/main/preload.ts` | Add `testConnection` to `llm` bridge |
| `src/main/main.ts` | Add `LLM_TEST_CONNECTION` IPC handler |
| `src/main/database/schema.ts` | Migration 20: add `preset_id`, relax `type` CHECK constraint |
| `src/renderer/components/Settings.tsx` | Add sub-page navigation state |
| `src/renderer/components/LLMConfiguration.tsx` | Rewrite as full sub-page with preset grid, inline forms, test button |

---

## Task 1: Provider Module Types & Registry

**Files:**
- Create: `src/main/llm/providers/types.ts`
- Create: `src/main/llm/providers/registry.ts`

- [ ] **Step 1: Create `src/main/llm/providers/types.ts`**

```typescript
import { ChatMessage, ToolDefinition, ToolCall } from '../../../shared/types';

export type ModuleType = 'openai-compatible' | 'anthropic' | 'claude-agent-sdk';

export interface ProviderPreset {
  id: string;
  label: string;
  moduleType: ModuleType;
  defaultBaseURL?: string;
  defaultModels: string[];
  requiresApiKey: boolean;
}

export interface ChatStreamResult {
  fullContent: string;
  reasoningContent?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

export interface StreamToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
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
  testConnection(client: unknown): Promise<{ success: boolean; message: string }>;
}
```

- [ ] **Step 2: Create `src/main/llm/providers/registry.ts`**

```typescript
import { ProviderPreset, ModuleType, ILLMProviderModule } from './types';
import { OpenAICompatibleModule } from './openai-compatible';
import { AnthropicModule } from './anthropic';
import { ClaudeAgentSDKModule } from './claude-agent-sdk';

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

const moduleInstances = new Map<ModuleType, ILLMProviderModule>();

export function getModule(moduleType: ModuleType): ILLMProviderModule {
  let mod = moduleInstances.get(moduleType);
  if (!mod) {
    switch (moduleType) {
      case 'openai-compatible':
        mod = new OpenAICompatibleModule();
        break;
      case 'anthropic':
        mod = new AnthropicModule();
        break;
      case 'claude-agent-sdk':
        mod = new ClaudeAgentSDKModule();
        break;
      default:
        throw new Error(`Unknown module type: ${moduleType}`);
    }
    moduleInstances.set(moduleType, mod);
  }
  return mod;
}

export function getPreset(presetId: string): ProviderPreset | undefined {
  return SYSTEM_PRESETS.find(p => p.id === presetId);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Errors only about missing module imports (OpenAICompatibleModule, AnthropicModule, ClaudeAgentSDKModule not yet created). No errors in types.ts or registry.ts itself.

- [ ] **Step 4: Commit**

```bash
git add src/main/llm/providers/types.ts src/main/llm/providers/registry.ts
git commit -m "feat(providers): add provider module types and preset registry"
```

---

## Task 2: OpenAI-Compatible Module

**Files:**
- Create: `src/main/llm/providers/openai-compatible.ts`

This module extracts all OpenAI-compatible logic from `LLMProviderManager.ts` (lines 74-83, 208-218, 265-266, 350-351, 534-613, 682-735, 785-824, 896-931).

- [ ] **Step 1: Create `src/main/llm/providers/openai-compatible.ts`**

```typescript
import OpenAI from 'openai';
import { ChatMessage, ToolDefinition, ToolCall } from '../../../shared/types';
import { ILLMProviderModule, ChatStreamResult, StreamWithToolsResult, StreamToolCall } from './types';

export class OpenAICompatibleModule implements ILLMProviderModule {
  createClient(config: { apiKey?: string; baseURL?: string }): OpenAI {
    return new OpenAI({
      apiKey: config.apiKey || undefined,
      baseURL: config.baseURL || 'https://api.openai.com/v1',
    });
  }

  async chat(client: unknown, messages: ChatMessage[], model: string, tools?: ToolDefinition[]): Promise<string | { toolCalls: ToolCall[] }> {
    const openai = client as OpenAI;
    const createOptions: any = {
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: 0.7,
      max_tokens: 2048,
    };
    if (tools && tools.length > 0) {
      createOptions.tools = tools;
    }
    const response = await openai.chat.completions.create(createOptions);
    const msg = response.choices[0]?.message;
    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      const toolCalls: ToolCall[] = msg.tool_calls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
      return { toolCalls };
    }
    return msg?.content || '';
  }

  async chatStream(client: unknown, messages: ChatMessage[], model: string, onChunk: (text: string) => void, signal?: AbortSignal): Promise<ChatStreamResult> {
    const openai = client as OpenAI;
    const isReasoningModel = /deepseek|qwq|o[134]/i.test(model);
    const createOpts: any = {
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: isReasoningModel ? undefined : 0.7,
      max_tokens: isReasoningModel ? 8192 : 4096,
      stream: true,
    };
    if (isReasoningModel) delete createOpts.temperature;

    const stream = await openai.chat.completions.create(createOpts, { signal });
    let fullContent = '';
    let reasoningContent = '';
    let usage: any = undefined;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      const reasoning = (delta as any)?.reasoning_content;
      if (reasoning) reasoningContent += reasoning;
      if (delta?.content) {
        fullContent += delta.content;
        onChunk(delta.content);
      }
      if ((chunk as any).usage) {
        usage = {
          promptTokens: (chunk as any).usage.prompt_tokens,
          completionTokens: (chunk as any).usage.completion_tokens,
          totalTokens: (chunk as any).usage.total_tokens,
        };
      }
    }
    return { fullContent, reasoningContent: reasoningContent || undefined, usage };
  }

  async chatStreamWithTools(client: unknown, messages: ChatMessage[], model: string, tools: ToolDefinition[] | undefined, onChunk: (text: string) => void, signal?: AbortSignal): Promise<StreamWithToolsResult> {
    const openai = client as OpenAI;
    const isReasoningModel = /deepseek|qwq|o[134]/i.test(model);
    const createOptions: any = {
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: isReasoningModel ? undefined : 0.7,
      max_tokens: isReasoningModel ? 8192 : 4096,
      stream: true,
    };
    if (isReasoningModel) delete createOptions.temperature;
    if (tools && tools.length > 0) createOptions.tools = tools;

    const stream = await openai.chat.completions.create(createOptions, { signal });
    let fullContent = '';
    let reasoningContent = '';
    let chunkCount = 0;
    let usage: any = undefined;
    const toolCallAccumulators: Map<number, { id: string; name: string; arguments: string }> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      chunkCount++;
      const reasoning = (delta as any)?.reasoning_content;
      if (reasoning) reasoningContent += reasoning;
      if (delta?.content) { fullContent += delta.content; onChunk(delta.content); }
      if ((delta as any)?.tool_calls) {
        for (const tc of (delta as any).tool_calls) {
          const idx = tc.index;
          if (!toolCallAccumulators.has(idx)) {
            toolCallAccumulators.set(idx, { id: tc.id || '', name: tc.function?.name || '', arguments: '' });
          }
          const acc = toolCallAccumulators.get(idx)!;
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name = tc.function.name;
          if (tc.function?.arguments) acc.arguments += tc.function.arguments;
        }
      }
      if ((chunk as any).usage) {
        usage = {
          promptTokens: (chunk as any).usage.prompt_tokens,
          completionTokens: (chunk as any).usage.completion_tokens,
          totalTokens: (chunk as any).usage.total_tokens,
        };
      }
    }

    const toolCalls: StreamToolCall[] = Array.from(toolCallAccumulators.values())
      .filter(acc => acc.id && acc.name)
      .map(acc => ({ id: acc.id, type: 'function' as const, function: { name: acc.name, arguments: acc.arguments } }));

    return { fullContent, reasoningContent: reasoningContent || undefined, chunkCount, toolCalls, usage };
  }

  async fetchModels(client: unknown): Promise<string[]> {
    const openai = client as OpenAI;
    const response = await openai.models.list();
    return response.data.map(m => m.id).sort();
  }

  async testConnection(client: unknown): Promise<{ success: boolean; message: string }> {
    try {
      const models = await this.fetchModels(client);
      return { success: true, message: `Connected — ${models.length} models available` };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Connection failed: ${msg}` };
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -i "openai-compatible" || echo "No errors in openai-compatible.ts"`
Expected: No errors in this file.

- [ ] **Step 3: Commit**

```bash
git add src/main/llm/providers/openai-compatible.ts
git commit -m "feat(providers): add OpenAI-compatible provider module"
```

---

## Task 3: Anthropic Module

**Files:**
- Create: `src/main/llm/providers/anthropic.ts`

Extracts Anthropic logic from `LLMProviderManager.ts` (lines 84-88, 210-211, 267-268, 353-354, 616-680, 738-783, 827-873).

- [ ] **Step 1: Create `src/main/llm/providers/anthropic.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { ChatMessage, ToolDefinition, ToolCall } from '../../../shared/types';
import { ILLMProviderModule, ChatStreamResult, StreamWithToolsResult, StreamToolCall } from './types';

export class AnthropicModule implements ILLMProviderModule {
  createClient(config: { apiKey?: string; baseURL?: string }): Anthropic {
    return new Anthropic({
      apiKey: config.apiKey || undefined,
      baseURL: config.baseURL || undefined,
    });
  }

  async chat(client: unknown, messages: ChatMessage[], model: string, tools?: ToolDefinition[]): Promise<string | { toolCalls: ToolCall[] }> {
    const anthropic = client as Anthropic;
    const createOptions: any = {
      model,
      max_tokens: 2048,
      messages: messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      system: messages.find(m => m.role === 'system')?.content || '',
    };
    if (tools && tools.length > 0) {
      createOptions.tools = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }
    const response = await anthropic.messages.create(createOptions);
    const toolUseBlocks = response.content.filter((block: any) => block.type === 'tool_use');
    if (toolUseBlocks.length > 0) {
      const toolCalls: ToolCall[] = toolUseBlocks.map((block: any) => ({
        id: block.id,
        type: 'function' as const,
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      }));
      return { toolCalls };
    }
    const textParts = (response.content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === 'text').map(b => b.text || '');
    return textParts.join('\n');
  }

  async chatStream(client: unknown, messages: ChatMessage[], model: string, onChunk: (text: string) => void, signal?: AbortSignal): Promise<ChatStreamResult> {
    const anthropic = client as Anthropic;
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 2048,
      messages: messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      system: messages.find(m => m.role === 'system')?.content || '',
    }, { signal });

    let fullContent = '';
    let thinkingContent = '';

    stream.on('text', (text: string) => { fullContent += text; onChunk(text); });
    stream.on('thinking', (thinking: string) => { if (typeof thinking === 'string') thinkingContent += thinking; });

    const finalMessage = await stream.finalMessage();
    const usage = finalMessage.usage ? {
      promptTokens: finalMessage.usage.input_tokens,
      completionTokens: finalMessage.usage.output_tokens,
      totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
    } : undefined;

    return { fullContent, reasoningContent: thinkingContent || undefined, usage };
  }

  async chatStreamWithTools(client: unknown, messages: ChatMessage[], model: string, tools: ToolDefinition[] | undefined, onChunk: (text: string) => void, signal?: AbortSignal): Promise<StreamWithToolsResult> {
    const anthropic = client as Anthropic;
    const createOptions: any = {
      model,
      max_tokens: 2048,
      messages: messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      system: messages.find(m => m.role === 'system')?.content || '',
    };
    if (tools && tools.length > 0) {
      createOptions.tools = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    const stream = anthropic.messages.stream(createOptions, { signal });
    let fullContent = '';
    let thinkingContent = '';
    let chunkCount = 0;

    stream.on('text', (text: string) => { fullContent += text; onChunk(text); chunkCount++; });
    stream.on('thinking', (thinking: string) => { if (typeof thinking === 'string') thinkingContent += thinking; });

    const finalMessage = await stream.finalMessage();
    const toolCalls: StreamToolCall[] = finalMessage.content
      .filter((block: any) => block.type === 'tool_use')
      .map((block: any) => ({
        id: block.id,
        type: 'function' as const,
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      }));
    const usage = finalMessage.usage ? {
      promptTokens: finalMessage.usage.input_tokens,
      completionTokens: finalMessage.usage.output_tokens,
      totalTokens: (finalMessage.usage.input_tokens || 0) + (finalMessage.usage.output_tokens || 0),
    } : undefined;

    return { fullContent, reasoningContent: thinkingContent || undefined, chunkCount, toolCalls, usage };
  }

  async testConnection(client: unknown): Promise<{ success: boolean; message: string }> {
    try {
      const anthropic = client as Anthropic;
      // Send a minimal request to verify credentials
      await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return { success: true, message: 'Connected to Anthropic' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Connection failed: ${msg}` };
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/llm/providers/anthropic.ts
git commit -m "feat(providers): add Anthropic provider module"
```

---

## Task 4: Claude Agent SDK Module

**Files:**
- Create: `src/main/llm/providers/claude-agent-sdk.ts`

Extracts SDK logic from `LLMProviderManager.ts` (lines 389-532). Note: SDK chat methods have a different signature — they need `provider` (for sdkConfig) and `sessionKey` state, not just `client`. This module manages its own session state.

- [ ] **Step 1: Create `src/main/llm/providers/claude-agent-sdk.ts`**

```typescript
import { randomUUID } from 'crypto';
import { ChatMessage } from '../../../shared/types';
import { ILLMProviderModule, ChatStreamResult, StreamWithToolsResult } from './types';
import { ClaudeAgentSDKConfig } from '../../../shared/types';
import { Logger } from '../../utils/Logger';

export class ClaudeAgentSDKModule implements ILLMProviderModule {
  private sdkSessions: Map<string, string> = new Map();

  createClient(): null {
    // SDK doesn't use a persistent client
    return null;
  }

  async chat(): Promise<string> {
    throw new Error('Claude Agent SDK does not support non-streaming chat');
  }

  async chatStream(
    _client: unknown,
    messages: ChatMessage[],
    model: string,
    onChunk: (text: string) => void,
    _signal?: AbortSignal,
    _extra?: { provider?: any; conversationId?: string; onDebug?: (event: any) => void }
  ): Promise<ChatStreamResult> {
    // SDK module needs extra context — called directly from manager
    throw new Error('Use chatStreamSDK instead');
  }

  async chatStreamWithTools(
    _client: unknown,
    messages: ChatMessage[],
    model: string,
    tools: any,
    onChunk: (text: string) => void,
    _signal?: AbortSignal,
    _extra?: { provider?: any; conversationId?: string; onDebug?: (event: any) => void }
  ): Promise<StreamWithToolsResult> {
    throw new Error('Use chatStreamSDK instead');
  }

  async chatStreamSDK(
    sdkConfig: ClaudeAgentSDKConfig,
    providerId: string,
    messages: ChatMessage[],
    model: string,
    onChunk: (text: string) => void,
    onDebug: (event: import('../../../shared/types').DebugModelCall) => void,
    signal?: AbortSignal,
    conversationId?: string
  ): Promise<{ fullContent: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }> {
    const callId = randomUUID().slice(0, 12);
    const startTime = Date.now();

    const systemContent = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role === 'user');

    const sessionKey = conversationId ? `${providerId}:${conversationId}` : '';
    const existingSessionId = sessionKey ? this.sdkSessions.get(sessionKey) : undefined;
    const isResuming = !!existingSessionId;

    const promptText = isResuming
      ? (userMessages[userMessages.length - 1]?.content || '')
      : userMessages.map(m => m.content).join('\n');

    onDebug({
      type: 'request',
      timestamp: Date.now(),
      callId,
      data: {
        provider: providerId,
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content.slice(0, 200) })),
        ...(isResuming && { sdkResumeSession: existingSessionId }),
      },
    });

    try {
      const options: any = {
        model,
        ...(!isResuming && systemContent && { systemPrompt: systemContent }),
        ...(sdkConfig.cwd && { cwd: sdkConfig.cwd }),
        ...(sdkConfig.permissionMode && { permissionMode: sdkConfig.permissionMode }),
        ...(sdkConfig.allowedTools && { allowedTools: sdkConfig.allowedTools }),
        ...(sdkConfig.maxTurns && { maxTurns: sdkConfig.maxTurns }),
        ...(isResuming && { resume: existingSessionId }),
        ...(!isResuming && sdkConfig.sessionId && { resume: sdkConfig.sessionId }),
        ...(sdkConfig.forkSessionId && { resume: sdkConfig.forkSessionId, forkSession: true }),
      };

      if (sdkConfig.mcpServers && Object.keys(sdkConfig.mcpServers).length > 0) {
        options.mcpServers = sdkConfig.mcpServers;
      }

      if (sdkConfig.agents && sdkConfig.agents.length > 0) {
        const agentMap: Record<string, any> = {};
        for (const agent of sdkConfig.agents) {
          agentMap[agent.name] = {
            description: agent.description,
            ...(agent.prompt && { prompt: agent.prompt }),
            ...(agent.model && { model: agent.model }),
          };
        }
        options.agents = agentMap;
      }

      const sdkModule = require('@anthropic-ai/claude-agent-sdk') as any;
      const q = sdkModule.query({ prompt: promptText, options });

      let fullContent = '';

      for await (const message of q) {
        if (signal?.aborted) break;

        const sid = (message as any).session_id;
        if (sid && sessionKey) {
          this.sdkSessions.set(sessionKey, sid);
        }

        if (message.type === 'assistant') {
          const betaMessage = (message as any).message;
          if (betaMessage?.content) {
            const text = betaMessage.content
              .filter((block: any) => block.type === 'text')
              .map((block: any) => block.text)
              .join('');
            if (text) {
              fullContent += text;
              onChunk(text);
            }
          }
        } else if (message.type === 'result') {
          const resultMsg = message as any;
          if (resultMsg.usage) {
            onDebug({
              type: 'response',
              timestamp: Date.now(),
              callId,
              data: {
                provider: providerId,
                model,
                usage: {
                  promptTokens: resultMsg.usage.input_tokens,
                  completionTokens: resultMsg.usage.output_tokens,
                  totalTokens: (resultMsg.usage.input_tokens || 0) + (resultMsg.usage.output_tokens || 0),
                },
                duration: Date.now() - startTime,
              },
            });
          }
        } else {
          onDebug({
            type: 'tool',
            timestamp: Date.now(),
            callId,
            data: {
              provider: providerId,
              model,
              sdkEvent: message.type,
              sdkEventData: JSON.stringify(message).slice(0, 500),
            },
          });
        }
      }

      if (!fullContent) {
        fullContent = '[SDK completed with no text output]';
      }

      return { fullContent };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      onDebug({
        type: 'error',
        timestamp: Date.now(),
        callId,
        data: { provider: providerId, model, error: errorMsg, duration: Date.now() - startTime },
      });
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      require('@anthropic-ai/claude-agent-sdk');
      return { success: true, message: 'Claude Agent SDK is available' };
    } catch {
      return { success: false, message: 'Claude Agent SDK module not found' };
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/llm/providers/claude-agent-sdk.ts
git commit -m "feat(providers): add Claude Agent SDK provider module"
```

---

## Task 5: Update Shared Types & IPC Channels

**Files:**
- Modify: `src/shared/types.ts` — lines 143-163 (LLMProvider and LLMProviderConfig interfaces)
- Modify: `src/shared/ipc-channels.ts` — add `LLM_TEST_CONNECTION`

- [ ] **Step 1: Update `LLMProvider` and `LLMProviderConfig` in `src/shared/types.ts`**

Replace the existing `LLMProvider` and `LLMProviderConfig` interfaces (lines 143-162) with:

```typescript
import { ModuleType } from '../main/llm/providers/types';

// LLM Provider 相关类型
export interface LLMProvider {
  id: string;
  name: string;
  presetId: string;
  moduleType: ModuleType;
  apiKey?: string;
  baseURL?: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  sdkConfig?: ClaudeAgentSDKConfig;
}

export interface LLMProviderConfig {
  name: string;
  presetId: string;
  moduleType: ModuleType;
  apiKey?: string;
  baseURL?: string;
  models?: string[];
  sdkConfig?: ClaudeAgentSDKConfig;
}
```

**Important:** The `ModuleType` import from `../main/llm/providers/types` will cause a cross-boundary import issue in shared types. Instead, inline the type:

```typescript
export type ModuleType = 'openai-compatible' | 'anthropic' | 'claude-agent-sdk';

// LLM Provider 相关类型
export interface LLMProvider {
  id: string;
  name: string;
  presetId: string;
  moduleType: ModuleType;
  apiKey?: string;
  baseURL?: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  sdkConfig?: ClaudeAgentSDKConfig;
}

export interface LLMProviderConfig {
  name: string;
  presetId: string;
  moduleType: ModuleType;
  apiKey?: string;
  baseURL?: string;
  models?: string[];
  sdkConfig?: ClaudeAgentSDKConfig;
}
```

Then update `src/main/llm/providers/types.ts` to import `ModuleType` from shared:

```typescript
export type { ModuleType } from '../../../shared/types';
```

(Remove the local `ModuleType` definition from `providers/types.ts` and use the one from `shared/types.ts` instead.)

- [ ] **Step 2: Add `LLM_TEST_CONNECTION` to `src/shared/ipc-channels.ts`**

After `LLM_FETCH_MODELS` (line 30), add:

```typescript
LLM_TEST_CONNECTION = 'llm:test-connection',
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts src/main/llm/providers/types.ts
git commit -m "feat(providers): update shared types with ModuleType, presetId; add test connection IPC channel"
```

---

## Task 6: Database Migration

**Files:**
- Modify: `src/main/database/schema.ts` — add migration 20 after migration 19

- [ ] **Step 1: Add migration 20 at the end of `runMigrations()` in `src/main/database/schema.ts`**

```typescript
// Migration: modular provider system — add preset_id, relax type constraint
const migration20Name = 'modular-provider-system';
const applied20 = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(migration20Name);
if (!applied20) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_providers_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      preset_id TEXT NOT NULL DEFAULT '',
      module_type TEXT NOT NULL,
      api_key TEXT,
      base_url TEXT,
      models TEXT DEFAULT '[]',
      enabled INTEGER DEFAULT 1,
      enabled_models TEXT DEFAULT '[]',
      sdk_config TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO llm_providers_new (id, name, preset_id, module_type, api_key, base_url, models, enabled, enabled_models, sdk_config, created_at, updated_at)
      SELECT id, name, type, type, api_key, base_url, models, enabled, enabled_models, sdk_config, created_at, updated_at FROM llm_providers;
    UPDATE llm_providers_new SET module_type = 'openai-compatible' WHERE module_type IN ('openai','custom','qwen','deepseek','local');
    UPDATE llm_providers_new SET preset_id = 'custom' WHERE preset_id = 'custom';
    DROP TABLE llm_providers;
    ALTER TABLE llm_providers_new RENAME TO llm_providers;
  `);
  db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration20Name);
}
```

Key points:
- New table uses `preset_id` and `module_type` columns (replacing old `type`)
- Migration copies old `type` value into both `preset_id` and `module_type`
- Then updates `module_type` to `'openai-compatible'` for all OpenAI-compatible providers
- Drops old table and renames new one

- [ ] **Step 2: Commit**

```bash
git add src/main/database/schema.ts
git commit -m "feat(providers): add migration 20 for modular provider schema"
```

---

## Task 7: Rewrite LLMProviderManager

**Files:**
- Modify: `src/main/llm/LLMProviderManager.ts` — full rewrite as thin router

This is the biggest change. The manager delegates all provider-specific logic to modules. It keeps its responsibilities for: provider CRUD (SQLite), client lifecycle, and routing to modules.

- [ ] **Step 1: Rewrite `src/main/llm/LLMProviderManager.ts`**

```typescript
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { LLMProvider, LLMProviderConfig, ChatMessage, ToolDefinition, ModuleType } from '../../shared/types';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../services/ConfigManager';
import { getDatabase } from '../database/connection';
import { getModule, getPreset, SYSTEM_PRESETS } from './providers/registry';
import { ILLMProviderModule, StreamWithToolsResult } from './providers/types';
import { ClaudeAgentSDKModule } from './providers/claude-agent-sdk';

export interface StreamToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export { StreamWithToolsResult };

export class LLMProviderManager extends EventEmitter {
  private providers: Map<string, LLMProvider> = new Map();
  private clients: Map<string, unknown> = new Map();

  constructor(private configManager: ConfigManager) {
    super();
  }

  async initialize(): Promise<void> {
    Logger.info('Initializing LLM Provider Manager...');

    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM llm_providers').all() as any[];

    for (const row of rows) {
      const provider: LLMProvider = {
        id: row.id,
        name: row.name,
        presetId: row.preset_id,
        moduleType: row.module_type,
        apiKey: row.api_key,
        baseURL: row.base_url,
        models: JSON.parse(row.models || '[]'),
        enabledModels: JSON.parse(row.enabled_models || '[]'),
        enabled: !!row.enabled,
        sdkConfig: row.sdk_config ? JSON.parse(row.sdk_config) : undefined,
      };
      this.providers.set(provider.id, provider);
      if (provider.enabled) {
        this.initializeProviderClient(provider);
      }
    }

    Logger.info(`Loaded ${this.providers.size} LLM providers`);
  }

  private initializeProviderClient(provider: LLMProvider): void {
    try {
      if (provider.moduleType === 'claude-agent-sdk') {
        this.clients.set(provider.id, null);
        Logger.info(`SDK provider ready: ${provider.name}`);
        return;
      }

      const mod = getModule(provider.moduleType);
      const client = mod.createClient({ apiKey: provider.apiKey, baseURL: provider.baseURL });
      this.clients.set(provider.id, client);
      Logger.info(`Initialized client for provider: ${provider.name}`);
    } catch (error) {
      Logger.error(`Failed to initialize client for ${provider.name}:`, error);
    }
  }

  listProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  getDefaultProviderId(): string | null {
    const configured = this.configManager.get('defaultLLMProvider') as string | undefined;
    if (configured && this.providers.has(configured) && this.providers.get(configured)!.enabled) {
      return configured;
    }
    const first = Array.from(this.providers.values()).find(p => p.enabled);
    return first?.id ?? null;
  }

  async addProvider(config: LLMProviderConfig): Promise<LLMProvider> {
    const preset = getPreset(config.presetId);
    const defaultModels = config.models?.length
      ? config.models
      : (preset?.defaultModels || []);

    const provider: LLMProvider = {
      id: `provider-${randomUUID().slice(0, 8)}`,
      name: config.name,
      presetId: config.presetId,
      moduleType: config.moduleType,
      apiKey: config.apiKey,
      baseURL: config.baseURL || preset?.defaultBaseURL,
      enabled: true,
      models: defaultModels,
      enabledModels: defaultModels,
      sdkConfig: config.sdkConfig,
    };

    this.providers.set(provider.id, provider);

    if (provider.enabled) {
      this.initializeProviderClient(provider);
    }

    const db = getDatabase();
    db.prepare(`
      INSERT INTO llm_providers (id, name, preset_id, module_type, api_key, base_url, models, enabled, enabled_models, sdk_config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      provider.id, provider.name, provider.presetId, provider.moduleType,
      provider.apiKey || null, provider.baseURL || null,
      JSON.stringify(provider.models), 1,
      JSON.stringify(provider.enabledModels),
      provider.sdkConfig ? JSON.stringify(provider.sdkConfig) : null
    );

    this.emit('provider-added', provider);
    Logger.info(`LLM provider added: ${provider.name}`);
    return provider;
  }

  async removeProvider(providerId: string): Promise<void> {
    const provider = this.providers.get(providerId);
    if (provider) {
      this.providers.delete(providerId);
      this.clients.delete(providerId);

      const currentDefault = this.configManager.get('defaultLLMProvider') as string | undefined;
      if (currentDefault === providerId) {
        this.configManager.delete('defaultLLMProvider');
      }

      const db = getDatabase();
      db.prepare('DELETE FROM llm_providers WHERE id = ?').run(providerId);

      this.emit('provider-removed', providerId);
      Logger.info(`LLM provider removed: ${provider.name}`);
    }
  }

  async updateProvider(providerId: string, updates: Partial<LLMProvider>): Promise<void> {
    const provider = this.providers.get(providerId);
    if (provider) {
      const updated = { ...provider, ...updates };
      this.providers.set(providerId, updated);

      if (
        updates.apiKey !== undefined ||
        updates.baseURL !== undefined ||
        updates.moduleType !== undefined ||
        updates.enabled !== undefined ||
        updates.sdkConfig !== undefined
      ) {
        this.clients.delete(providerId);
        if (updated.enabled) {
          this.initializeProviderClient(updated);
        }
      }

      const db = getDatabase();
      db.prepare(`
        UPDATE llm_providers
        SET name = ?, preset_id = ?, module_type = ?, api_key = ?, base_url = ?, models = ?, enabled = ?, enabled_models = ?, sdk_config = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        updated.name, updated.presetId, updated.moduleType,
        updated.apiKey || null, updated.baseURL || null,
        JSON.stringify(updated.models),
        updated.enabled ? 1 : 0,
        JSON.stringify(updated.enabledModels),
        updated.sdkConfig ? JSON.stringify(updated.sdkConfig) : null,
        providerId
      );

      this.emit('provider-updated', updated);
      Logger.info(`LLM provider updated: ${updated.name}`);
    }
  }

  async chat(providerId: string, messages: ChatMessage[], model?: string, tools?: ToolDefinition[]): Promise<string | { toolCalls: ToolDefinition[] }> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);

    const client = this.clients.get(providerId);
    if (!client && provider.moduleType !== 'claude-agent-sdk') {
      throw new Error(`Provider client not initialized: ${providerId}`);
    }

    try {
      const mod = getModule(provider.moduleType);
      const resolvedModel = model || provider.models[0] || 'gpt-4';
      return await mod.chat(client, messages, resolvedModel, tools);
    } catch (error) {
      Logger.error(`Chat failed with provider ${provider.name}:`, error);
      throw error;
    }
  }

  async chatStream(
    providerId: string,
    messages: ChatMessage[],
    model: string | undefined,
    onChunk: (text: string) => void,
    onDebug: (event: import('../../shared/types').DebugModelCall) => void,
    signal?: AbortSignal,
    conversationId?: string
  ): Promise<{ fullContent: string; reasoningContent?: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);

    if (provider.moduleType === 'claude-agent-sdk') {
      const resolvedModel = model || provider.models[0] || 'claude-sonnet-4-6';
      const sdkModule = getModule('claude-agent-sdk') as ClaudeAgentSDKModule;
      return sdkModule.chatStreamSDK(
        provider.sdkConfig || {},
        provider.id,
        messages,
        resolvedModel,
        onChunk,
        onDebug,
        signal,
        conversationId
      );
    }

    const client = this.clients.get(providerId);
    if (!client) throw new Error(`Provider client not initialized: ${providerId}`);

    const resolvedModel = model || provider.models[0] || 'gpt-4';
    const callId = randomUUID().slice(0, 12);

    onDebug({
      type: 'request',
      timestamp: Date.now(),
      callId,
      data: {
        provider: provider.name,
        model: resolvedModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      },
    });

    const startTime = Date.now();

    try {
      const mod = getModule(provider.moduleType);
      const result = await mod.chatStream(client, messages, resolvedModel, onChunk, signal);

      const shortPreview = result.fullContent.slice(0, 200) + (result.fullContent.length > 200 ? '...' : '');
      onDebug({
        type: 'response',
        timestamp: Date.now(),
        callId,
        data: {
          provider: provider.name,
          model: resolvedModel,
          content: shortPreview,
          rawContent: result.fullContent || undefined,
          reasoningContent: result.reasoningContent || undefined,
          usage: result.usage,
          duration: Date.now() - startTime,
        },
      });

      return { fullContent: result.fullContent, reasoningContent: result.reasoningContent, usage: result.usage };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      onDebug({
        type: 'error',
        timestamp: Date.now(),
        callId,
        data: { provider: provider.name, model: resolvedModel, error: errorMsg, duration: Date.now() - startTime },
      });
      throw error;
    }
  }

  async chatStreamWithTools(
    providerId: string,
    messages: ChatMessage[],
    model: string | undefined,
    tools: ToolDefinition[] | undefined,
    onChunk: (text: string) => void,
    onDebug: (event: import('../../shared/types').DebugModelCall) => void,
    signal?: AbortSignal,
    conversationId?: string
  ): Promise<StreamWithToolsResult> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);

    if (provider.moduleType === 'claude-agent-sdk') {
      const resolvedModel = model || provider.models[0] || 'claude-sonnet-4-6';
      const sdkModule = getModule('claude-agent-sdk') as ClaudeAgentSDKModule;
      const result = await sdkModule.chatStreamSDK(
        provider.sdkConfig || {},
        provider.id,
        messages,
        resolvedModel,
        onChunk,
        onDebug,
        signal,
        conversationId
      );
      return { ...result, toolCalls: [] };
    }

    const client = this.clients.get(providerId);
    if (!client) throw new Error(`Provider client not initialized: ${providerId}`);

    const resolvedModel = model || provider.models[0] || 'gpt-4';
    const callId = randomUUID().slice(0, 12);

    onDebug({
      type: 'request',
      timestamp: Date.now(),
      callId,
      data: {
        provider: provider.name,
        model: resolvedModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        tools: tools?.map(t => t.function.name),
      },
    });

    const startTime = Date.now();

    try {
      const mod = getModule(provider.moduleType);
      const result = await mod.chatStreamWithTools(client, messages, resolvedModel, tools, onChunk, signal);

      const shortPreview = result.fullContent.slice(0, 200) + (result.fullContent.length > 200 ? '...' : '');
      onDebug({
        type: 'response',
        timestamp: Date.now(),
        callId,
        data: {
          provider: provider.name,
          model: resolvedModel,
          content: shortPreview,
          rawContent: result.fullContent || undefined,
          reasoningContent: result.reasoningContent || undefined,
          chunkCount: result.chunkCount,
          tools: result.toolCalls.map(tc => tc.function.name),
          usage: result.usage,
          duration: Date.now() - startTime,
        },
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      onDebug({
        type: 'error',
        timestamp: Date.now(),
        callId,
        data: { provider: provider.name, model: resolvedModel, error: errorMsg, duration: Date.now() - startTime },
      });
      throw error;
    }
  }

  async fetchModels(providerId: string): Promise<string[]> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);

    const client = this.clients.get(providerId);
    if (!client) throw new Error(`Provider client not initialized: ${providerId}`);

    const mod = getModule(provider.moduleType);
    if (!mod.fetchModels) {
      return provider.models;
    }

    try {
      const modelIds = await mod.fetchModels(client);
      provider.models = modelIds;
      const db = getDatabase();
      db.prepare('UPDATE llm_providers SET models = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(JSON.stringify(modelIds), providerId);
      Logger.info(`Fetched ${modelIds.length} models for provider ${provider.name}`);
      return modelIds;
    } catch (error) {
      Logger.error(`Failed to fetch models for ${provider.name}:`, error);
      throw error;
    }
  }

  async testConnection(providerId: string): Promise<{ success: boolean; message: string }> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);

    const client = this.clients.get(providerId);
    const mod = getModule(provider.moduleType);
    return mod.testConnection(client);
  }

  async testConnectionFromConfig(config: { moduleType: ModuleType; apiKey?: string; baseURL?: string }): Promise<{ success: boolean; message: string }> {
    const mod = getModule(config.moduleType);
    const client = mod.createClient({ apiKey: config.apiKey, baseURL: config.baseURL });
    return mod.testConnection(client);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: No errors related to `LLMProviderManager.ts`. There may be errors in consumers referencing old `type` field — fix those inline.

- [ ] **Step 3: Fix any consumer references to old `type` field**

Search for any references to `provider.type` or `p.type` in renderer components and update them to use `provider.presetId` or `provider.moduleType` as appropriate. Key files to check:
- `src/renderer/components/LLMConfiguration.tsx` (will be rewritten in Task 9)
- `src/renderer/components/chat/ChatLayout.tsx` or similar chat components

Run: `grep -rn '\.type' src/renderer/ --include='*.tsx' | grep -i 'provider\|llm'`

- [ ] **Step 4: Commit**

```bash
git add src/main/llm/LLMProviderManager.ts
git commit -m "refactor(providers): rewrite LLMProviderManager as thin router delegating to modules"
```

---

## Task 8: Add Test Connection IPC

**Files:**
- Modify: `src/main/preload.ts` — add `testConnection` to `llm` bridge
- Modify: `src/main/main.ts` — add `LLM_TEST_CONNECTION` handler

- [ ] **Step 1: Add `testConnection` to preload `llm` object in `src/main/preload.ts`**

After the `fetchModels` line (line 110), add:

```typescript
    testConnection: (providerId: string) =>
      ipcRenderer.invoke(IPCChannels.LLM_TEST_CONNECTION, providerId),
```

Also find the TypeScript interface for the electron API (search for `llm:` in the type definitions in the same file) and add:

```typescript
testConnection: (providerId: string) => Promise<{ success: boolean; message: string }>;
```

- [ ] **Step 2: Add IPC handler in `src/main/main.ts`**

After the `LLM_FETCH_MODELS` handler (line 417), add:

```typescript
ipcMain.handle(IPCChannels.LLM_TEST_CONNECTION, async (_, providerId: string) => {
  return llmManager.testConnection(providerId);
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to preload or main.ts

- [ ] **Step 4: Commit**

```bash
git add src/main/preload.ts src/main/main.ts
git commit -m "feat(providers): add testConnection IPC channel"
```

---

## Task 9: Rewrite LLMConfiguration as Settings Sub-Page

**Files:**
- Modify: `src/renderer/components/LLMConfiguration.tsx` — full rewrite
- Modify: `src/renderer/components/Settings.tsx` — add sub-page navigation

This is the largest UI task. The LLMConfiguration component becomes a full page with: preset grid for adding providers, inline edit forms, and test connection buttons.

- [ ] **Step 1: Update `src/renderer/components/Settings.tsx` to support sub-page navigation**

Add a `subPage` state. When user clicks the LLM Configuration card, navigate to the sub-page instead of expanding inline.

```typescript
import { useState, useEffect } from 'react';
import { Save, RotateCcw, Key, Palette, Globe, ChevronRight } from 'lucide-react';
import LLMConfiguration from './LLMConfiguration';
import { useTheme } from './ThemeProvider';
import { themePresets } from '@/lib/themes';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { cn } from '@/lib/utils';

type SubPage = 'llm' | null;

export default function Settings() {
  const { theme, setTheme: setCtxTheme, colorTheme, setColorTheme } = useTheme();
  const [language, setLanguage] = useState('zh-CN');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [subPage, setSubPage] = useState<SubPage>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const config = await window.electronAPI.config.getAll();
      setLanguage(config.language || 'zh-CN');
      setAutoUpdate(config.autoUpdate !== false);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await window.electronAPI.config.set('language', language);
      await window.electronAPI.config.set('autoUpdate', autoUpdate);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      try {
        setCtxTheme('dark');
        await window.electronAPI.config.set('language', 'zh-CN');
        await window.electronAPI.config.set('autoUpdate', true);
        await loadSettings();
      } catch (error) {
        console.error('Failed to reset settings:', error);
      }
    }
  };

  // Sub-page: LLM Providers
  if (subPage === 'llm') {
    return <LLMConfiguration onBack={() => setSubPage(null)} />;
  }

  // Main Settings page
  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1 text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Configure your 铭</p>
        </div>

        {/* Appearance */}
        <Card className="mb-4 rounded-xl bg-[var(--surface)] border-[hsl(var(--border))]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Palette size={18} className="text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Appearance</CardTitle>
                <CardDescription>Customize the look and feel</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Theme</Label>
                <Select value={theme} onValueChange={(v) => setCtxTheme(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">Auto (System)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Color Theme</Label>
                <div className="grid grid-cols-5 gap-2">
                  {themePresets.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => setColorTheme(preset.name)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors',
                        colorTheme === preset.name
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <div
                        className="w-6 h-6 rounded-full border border-border"
                        style={{ background: `hsl(${preset.dark['--primary']})` }}
                      />
                      <span className="text-xs text-muted-foreground">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Language</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh-CN">简体中文</SelectItem>
                    <SelectItem value="en-US">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* General */}
        <Card className="mb-4 rounded-xl bg-[var(--surface)] border-[hsl(var(--border))]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10">
                <Globe size={18} className="text-emerald-500" />
              </div>
              <div>
                <CardTitle className="text-base">General</CardTitle>
                <CardDescription>General application settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-foreground">Auto Update</div>
                <div className="text-sm text-muted-foreground">Automatically check for updates</div>
              </div>
              <Switch checked={autoUpdate} onCheckedChange={setAutoUpdate} />
            </div>
          </CardContent>
        </Card>

        {/* LLM Configuration - clickable card */}
        <button
          type="button"
          onClick={() => setSubPage('llm')}
          className="w-full text-left mb-4"
        >
          <Card className="rounded-xl bg-[var(--surface)] border-[hsl(var(--border))] hover:border-primary/50 transition-colors">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-warning/10">
                    <Key size={18} className="text-warning" />
                  </div>
                  <div>
                    <CardTitle className="text-base">LLM Configuration</CardTitle>
                    <CardDescription>API keys, models, and default provider for Agent chat</CardDescription>
                  </div>
                </div>
                <ChevronRight size={18} className="text-muted-foreground" />
              </div>
            </CardHeader>
          </Card>
        </button>

        {/* Actions */}
        <div className="flex gap-3 justify-end pb-8">
          <Button
            variant="secondary"
            onClick={handleReset}
            className="flex items-center gap-2 rounded-xl"
          >
            <RotateCcw size={16} />
            Reset to Defaults
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 rounded-xl"
          >
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `src/renderer/components/LLMConfiguration.tsx`**

This is a full rewrite. The component now receives `onBack` prop and renders as a full page with:

- Back button header
- Default provider selector
- Provider list with test connection buttons
- Inline add form with preset grid
- Inline edit form

```typescript
import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, Pencil, Trash2, RefreshCw, ChevronDown, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { LLMProvider, LLMProviderConfig, ModuleType } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

interface ProviderPreset {
  id: string;
  label: string;
  moduleType: ModuleType;
  defaultBaseURL?: string;
  defaultModels: string[];
  requiresApiKey: boolean;
}

// Mirrors SYSTEM_PRESETS from main process
const PRESETS: ProviderPreset[] = [
  { id: 'openai', label: 'OpenAI', moduleType: 'openai-compatible', defaultBaseURL: 'https://api.openai.com/v1', defaultModels: ['gpt-4', 'gpt-4-turbo-preview', 'gpt-3.5-turbo'], requiresApiKey: true },
  { id: 'anthropic', label: 'Anthropic', moduleType: 'anthropic', defaultBaseURL: 'https://api.anthropic.com', defaultModels: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'], requiresApiKey: true },
  { id: 'qwen', label: 'Qwen', moduleType: 'openai-compatible', defaultBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModels: ['qwen-turbo', 'qwen-plus', 'qwen-max'], requiresApiKey: true },
  { id: 'deepseek', label: 'DeepSeek', moduleType: 'openai-compatible', defaultBaseURL: 'https://api.deepseek.com/v1', defaultModels: ['deepseek-chat', 'deepseek-coder'], requiresApiKey: true },
  { id: 'groq', label: 'Groq', moduleType: 'openai-compatible', defaultBaseURL: 'https://api.groq.com/openai/v1', defaultModels: ['llama-3.1-70b-versatile', 'mixtral-8x7b-32768'], requiresApiKey: true },
  { id: 'openrouter', label: 'OpenRouter', moduleType: 'openai-compatible', defaultBaseURL: 'https://openrouter.ai/api/v1', defaultModels: ['openai/gpt-4', 'anthropic/claude-3-opus'], requiresApiKey: true },
  { id: 'ollama', label: 'Ollama (Local)', moduleType: 'openai-compatible', defaultBaseURL: 'http://localhost:11434/v1', defaultModels: [], requiresApiKey: false },
  { id: 'custom', label: 'Custom', moduleType: 'openai-compatible', defaultModels: [], requiresApiKey: true },
  { id: 'claude-agent-sdk', label: 'Claude Agent SDK', moduleType: 'claude-agent-sdk', defaultModels: ['claude-sonnet-4-6', 'claude-opus-4-7'], requiresApiKey: false },
];

function maskApiKey(key?: string): string {
  if (!key) return '—';
  if (key.length <= 4) return '••••';
  return `••••${key.slice(-4)}`;
}

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'success'; message: string } | { status: 'error'; message: string };

interface Props {
  onBack: () => void;
}

export default function LLMConfiguration({ onBack }: Props) {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultProviderId, setDefaultProviderId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset | null>(null);
  const [addName, setAddName] = useState('');
  const [addApiKey, setAddApiKey] = useState('');
  const [addBaseURL, setAddBaseURL] = useState('');
  const [addModels, setAddModels] = useState('');
  const [saving, setSaving] = useState(false);
  const [addTestState, setAddTestState] = useState<TestState>({ status: 'idle' });

  // Edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBaseURL, setEditBaseURL] = useState('');
  const [editModels, setEditModels] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [editTestState, setEditTestState] = useState<TestState>({ status: 'idle' });

  // Expanded models
  const [expandedModelsId, setExpandedModelsId] = useState<string | null>(null);
  const [fetchingModelsId, setFetchingModelsId] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, def] = await Promise.all([
        window.electronAPI.llm.listProviders(),
        window.electronAPI.config.get('defaultLLMProvider') as Promise<string | undefined>,
      ]);
      setProviders(list);
      const enabled = list.find((p: LLMProvider) => p.enabled);
      setDefaultProviderId(
        def && list.some((p: LLMProvider) => p.id === def && p.enabled)
          ? def
          : (enabled?.id ?? '')
      );
    } catch (e) {
      console.error(e);
      setError('Failed to load LLM providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // Preset selection handlers
  const handleSelectPreset = (preset: ProviderPreset) => {
    setSelectedPreset(preset);
    setAddName(preset.label);
    setAddBaseURL(preset.defaultBaseURL || '');
    setAddModels(preset.defaultModels.join(', '));
    setAddApiKey('');
    setAddTestState({ status: 'idle' });
  };

  // Add provider
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPreset) { setError('Select a provider type'); return; }
    if (!addName.trim()) { setError('Name is required'); return; }
    if (selectedPreset.requiresApiKey && !addApiKey?.trim()) { setError('API key is required'); return; }

    setSaving(true);
    setError(null);
    try {
      const models = addModels.split(',').map(s => s.trim()).filter(Boolean);
      const config: LLMProviderConfig = {
        name: addName.trim(),
        presetId: selectedPreset.id,
        moduleType: selectedPreset.moduleType,
        apiKey: selectedPreset.requiresApiKey ? addApiKey.trim() : undefined,
        baseURL: addBaseURL.trim() || undefined,
        models: models.length ? models : undefined,
      };
      await window.electronAPI.llm.addProvider(config);
      setShowAdd(false);
      setSelectedPreset(null);
      setAddName('');
      setAddApiKey('');
      setAddBaseURL('');
      setAddModels('');
      setAddTestState({ status: 'idle' });
      await loadProviders();
    } catch (e) {
      console.error(e);
      setError('Failed to add provider');
    } finally {
      setSaving(false);
    }
  };

  // Test connection (for add form)
  const handleTestAddConnection = async () => {
    if (!selectedPreset) return;
    setAddTestState({ status: 'testing' });
    try {
      // Add provider first (temporarily), test, then we could remove it
      // OR: use the provider's testConnection if already saved
      // For simplicity, we add the provider first then test
      const models = addModels.split(',').map(s => s.trim()).filter(Boolean);
      const config: LLMProviderConfig = {
        name: addName.trim() || 'test',
        presetId: selectedPreset.id,
        moduleType: selectedPreset.moduleType,
        apiKey: selectedPreset.requiresApiKey ? addApiKey.trim() : undefined,
        baseURL: addBaseURL.trim() || undefined,
        models: models.length ? models : undefined,
      };
      const provider = await window.electronAPI.llm.addProvider(config);
      const result = await window.electronAPI.llm.testConnection(provider.id);
      if (result.success) {
        setAddTestState({ status: 'success', message: result.message });
      } else {
        setAddTestState({ status: 'error', message: result.message });
        // Remove the test provider if connection failed
        await window.electronAPI.llm.removeProvider(provider.id);
      }
      await loadProviders();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAddTestState({ status: 'error', message: msg });
    }
  };

  // Test connection (for existing provider)
  const handleTestConnection = async (providerId: string) => {
    setEditTestState({ status: 'testing' });
    try {
      const result = await window.electronAPI.llm.testConnection(providerId);
      if (result.success) {
        setEditTestState({ status: 'success', message: result.message });
      } else {
        setEditTestState({ status: 'error', message: result.message });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setEditTestState({ status: 'error', message: msg });
    }
  };

  // Edit provider
  const openEdit = (p: LLMProvider) => {
    setEditingId(p.id);
    setEditBaseURL(p.baseURL ?? '');
    setEditModels(p.models?.join(', ') ?? '');
    setEditApiKey('');
    setEditTestState({ status: 'idle' });
    setError(null);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const modelList = editModels.split(',').map(s => s.trim()).filter(Boolean);
      const updates: Partial<LLMProvider> = {
        baseURL: editBaseURL.trim() || undefined,
      };
      if (modelList.length) updates.models = modelList;
      if (editApiKey.trim()) updates.apiKey = editApiKey.trim();
      await window.electronAPI.llm.updateProvider(editingId, updates);
      setEditingId(null);
      await loadProviders();
    } catch (e) {
      console.error(e);
      setError('Failed to save provider');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Remove provider "${name}"?`)) return;
    setError(null);
    try {
      await window.electronAPI.llm.removeProvider(id);
      await loadProviders();
    } catch (e) {
      console.error(e);
      setError('Failed to remove provider');
    }
  };

  const handleToggle = async (p: LLMProvider) => {
    setError(null);
    try {
      await window.electronAPI.llm.updateProvider(p.id, { enabled: !p.enabled });
      await loadProviders();
    } catch (e) {
      console.error(e);
      setError('Failed to update provider');
    }
  };

  const handleDefaultChange = async (id: string) => {
    setDefaultProviderId(id);
    setError(null);
    try {
      await window.electronAPI.config.set('defaultLLMProvider', id || undefined);
    } catch (e) {
      console.error(e);
      setError('Failed to set default provider');
    }
  };

  const handleFetchModels = async (p: LLMProvider) => {
    setFetchingModelsId(p.id);
    setError(null);
    try {
      await window.electronAPI.llm.fetchModels(p.id);
      await loadProviders();
      setExpandedModelsId(p.id);
    } catch (e) {
      console.error(e);
      setError('Failed to fetch models');
    } finally {
      setFetchingModelsId(null);
    }
  };

  const handleToggleModel = async (p: LLMProvider, model: string) => {
    const current = p.enabledModels || [];
    const updated = current.includes(model) ? current.filter(m => m !== model) : [...current, model];
    try {
      await window.electronAPI.llm.updateProvider(p.id, { enabledModels: updated });
      await loadProviders();
    } catch (e) {
      console.error(e);
      setError('Failed to update model');
    }
  };

  const editingProvider = editingId ? providers.find(p => p.id === editingId) : null;

  const renderTestButton = (testState: TestState, onTest: () => void, size: 'sm' | 'default' = 'sm') => {
    const iconSize = size === 'sm' ? 14 : 16;
    if (testState.status === 'testing') {
      return <Button type="button" variant="outline" size={size} disabled><Loader2 size={iconSize} className="animate-spin" />Testing...</Button>;
    }
    if (testState.status === 'success') {
      return <Button type="button" variant="outline" size={size} className="text-emerald-500 border-emerald-500/30"><CheckCircle size={iconSize} />{testState.message}</Button>;
    }
    if (testState.status === 'error') {
      return <Button type="button" variant="outline" size={size} className="text-destructive border-destructive/30"><XCircle size={iconSize} />{testState.message}</Button>;
    }
    return <Button type="button" variant="outline" size={size} onClick={onTest}>Test Connection</Button>;
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button type="button" variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">LLM Providers</h1>
            <p className="text-sm text-muted-foreground">API keys, models, and default provider</p>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive mb-3" role="alert">{error}</p>
        )}

        {/* Default provider selector */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
          <Label className="shrink-0">Default for Agent chat</Label>
          <Select
            value={defaultProviderId}
            onValueChange={handleDefaultChange}
            disabled={loading || !providers.some(p => p.enabled)}
          >
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {!providers.some(p => p.enabled) && <SelectItem value="__none__">—</SelectItem>}
              {providers.filter(p => p.enabled).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name} ({p.presetId})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Add Provider Button / Form */}
        {!showAdd ? (
          <div className="mb-6">
            <Button type="button" onClick={() => { setShowAdd(true); setSelectedPreset(null); setError(null); }} className="flex items-center gap-2">
              <Plus size={18} />
              Add Provider
            </Button>
          </div>
        ) : (
          <Card className="mb-6">
            <CardContent className="pt-4 pb-4 space-y-4">
              <h3 className="font-medium text-foreground">Add Provider</h3>

              {/* Preset grid */}
              {!selectedPreset ? (
                <div className="grid grid-cols-3 gap-2">
                  {PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={cn(
                        'p-3 rounded-lg border text-sm text-left transition-colors',
                        'border-border hover:border-primary/50 hover:bg-primary/5'
                      )}
                    >
                      <div className="font-medium">{preset.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{preset.moduleType}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleAdd} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Type:</span>
                    <span className="font-medium">{selectedPreset.label}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedPreset(null)}>Change</Button>
                  </div>
                  <div>
                    <Label className="block mb-1.5">Name</Label>
                    <Input value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. OpenAI Production" />
                  </div>
                  {selectedPreset.requiresApiKey && (
                    <div>
                      <Label className="block mb-1.5">API Key</Label>
                      <Input type="password" autoComplete="off" value={addApiKey} onChange={e => setAddApiKey(e.target.value)} placeholder="sk-…" />
                    </div>
                  )}
                  {selectedPreset.moduleType !== 'claude-agent-sdk' && (
                    <div>
                      <Label className="block mb-1.5">Base URL</Label>
                      <Input value={addBaseURL} onChange={e => setAddBaseURL(e.target.value)} placeholder={selectedPreset.defaultBaseURL || 'https://api.openai.com/v1'} />
                    </div>
                  )}
                  <div>
                    <Label className="block mb-1.5">Models (comma-separated)</Label>
                    <Input value={addModels} onChange={e => setAddModels(e.target.value)} placeholder="gpt-4, gpt-3.5-turbo" />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    {renderTestButton(addTestState, handleTestAddConnection, 'default')}
                    <div className="flex-1" />
                    <Button type="button" variant="secondary" onClick={() => { setShowAdd(false); setSelectedPreset(null); setAddTestState({ status: 'idle' }); }}>Cancel</Button>
                    <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add'}</Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {/* Provider List */}
        {loading ? (
          <div className="text-center py-10 text-muted-foreground">Loading…</div>
        ) : providers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
            <p>No LLM providers yet. Add an API key to get started.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {providers.map(p => (
              <li key={p.id}>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    {editingId === p.id ? (
                      /* Inline Edit Form */
                      <form onSubmit={handleEditSave} className="space-y-3">
                        {p.moduleType !== 'claude-agent-sdk' && (
                          <div>
                            <Label className="block mb-1.5">Base URL</Label>
                            <Input value={editBaseURL} onChange={e => setEditBaseURL(e.target.value)} />
                          </div>
                        )}
                        <div>
                          <Label className="block mb-1.5">Models (comma-separated)</Label>
                          <Input value={editModels} onChange={e => setEditModels(e.target.value)} />
                        </div>
                        {p.moduleType !== 'claude-agent-sdk' && (
                          <div>
                            <Label className="block mb-1.5">New API key (optional)</Label>
                            <Input type="password" autoComplete="off" value={editApiKey} onChange={e => setEditApiKey(e.target.value)} placeholder="Leave blank to keep current key" />
                          </div>
                        )}
                        <div className="flex items-center gap-2 pt-2">
                          {p.enabled && renderTestButton(editTestState, () => handleTestConnection(p.id))}
                          <div className="flex-1" />
                          <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                        </div>
                      </form>
                    ) : (
                      /* Provider Card */
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn('w-2 h-2 rounded-full', p.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
                            <span className="font-medium text-foreground">{p.name}</span>
                            <span className="text-xs text-muted-foreground">{p.presetId}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 ml-4">
                            {maskApiKey(p.apiKey)}
                            {p.baseURL && <span className="block truncate mt-1" title={p.baseURL}>{p.baseURL}</span>}
                          </div>
                          {p.models?.length > 0 && (
                            <button
                              type="button"
                              className="flex items-center gap-1 text-xs text-muted-foreground mt-1 ml-4 hover:text-foreground transition-colors"
                              onClick={() => setExpandedModelsId(expandedModelsId === p.id ? null : p.id)}
                            >
                              <ChevronDown size={12} className={cn(expandedModelsId === p.id && 'rotate-180')} />
                              {p.enabledModels?.length || 0} / {p.models.length} models enabled
                            </button>
                          )}
                          {expandedModelsId === p.id && p.models?.length > 0 && (
                            <div className="mt-2 space-y-1 pl-5">
                              {p.models.map(model => {
                                const isEnabled = (p.enabledModels || []).includes(model);
                                return (
                                  <div key={model} className="flex items-center gap-2">
                                    <Switch checked={isEnabled} onCheckedChange={() => handleToggleModel(p, model)} className="scale-75" />
                                    <span className="text-xs">{model}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleFetchModels(p)} disabled={!p.enabled || fetchingModelsId === p.id} title="Fetch models">
                            <RefreshCw size={16} className={cn(fetchingModelsId === p.id && 'animate-spin')} />
                          </Button>
                          <Label htmlFor={`switch-${p.id}`} className="text-xs text-muted-foreground mr-1">Enabled</Label>
                          <Switch id={`switch-${p.id}`} checked={p.enabled} onCheckedChange={() => handleToggle(p)} />
                          <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(p)} title="Edit">
                            <Pencil size={16} />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleRemove(p.id, p.name)} title="Remove" className="text-destructive hover:text-destructive">
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the app builds and runs**

Run: `npm run dev` (or the project's dev command) and check:
1. Settings page shows LLM Configuration as a clickable card with chevron
2. Clicking navigates to the sub-page with back button
3. Add Provider shows preset grid
4. Selecting a preset shows the form with pre-filled values
5. Test Connection button works
6. Provider list shows cards with edit/test/toggle/remove actions

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/LLMConfiguration.tsx src/renderer/components/Settings.tsx
git commit -m "feat(providers): rewrite LLM config as Settings sub-page with preset grid and test connection"
```

---

## Task 10: Fix Consumer References & Final Verification

**Files:**
- Various files that reference old `LLMProvider.type` field

- [ ] **Step 1: Search for all references to old `type` field**

Run: `grep -rn '\.type' src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -i 'provider\|llm' | grep -v 'moduleType\|presetId'`

Fix any remaining references:
- `provider.type` → `provider.presetId` (for display) or `provider.moduleType` (for logic)
- `p.type` → `p.presetId` or `p.moduleType`
- `config.type` → `config.moduleType`

- [ ] **Step 2: Search for references to old `LLMProviderConfig` type field**

Run: `grep -rn "type:" src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -i 'provider'`

- [ ] **Step 3: Full TypeScript check**

Run: `npx tsc --noEmit --pretty 2>&1`
Expected: Zero errors

- [ ] **Step 4: Full app smoke test**

Run: `npm run dev` and verify:
1. Existing providers load correctly after migration
2. Can add new provider via preset grid
3. Can edit, test, toggle, remove providers
4. Chat functionality still works with existing providers
5. Default provider selector works

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(providers): update consumer references from type to presetId/moduleType"
```
