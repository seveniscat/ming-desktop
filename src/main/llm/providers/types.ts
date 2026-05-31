import { ChatMessage, ToolDefinition, ToolCall, type ModuleType } from '../../../shared/types';

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