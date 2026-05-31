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