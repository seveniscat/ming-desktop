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