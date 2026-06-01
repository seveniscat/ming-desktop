import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { LLMProvider, LLMProviderConfig, ChatMessage, ToolDefinition, ModuleType } from '../../shared/types';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../services/ConfigManager';
import { getDatabase } from '../database/connection';
import { getModule, getPreset } from './providers/registry';
import { StreamWithToolsResult } from './providers/types';
import { ClaudeAgentSDKModule } from './providers/claude-agent-sdk';

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
