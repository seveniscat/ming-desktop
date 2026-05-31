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