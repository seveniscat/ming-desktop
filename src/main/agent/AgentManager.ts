import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { Agent, AgentConfig, ChatMessage, Conversation } from '../../shared/types';
import { IPCChannels } from '../../shared/ipc-channels';
import { DEFAULT_DAILY_REPORTER_SYSTEM_PROMPT } from '../../shared/dailyReportDefaults';
import { Logger } from '../utils/Logger';
import { LLMProviderManager } from '../llm/LLMProviderManager';
import { PluginManager } from '../plugins/PluginManager';
import { ConfigManager } from '../services/ConfigManager';
import { getDatabase } from '../database/connection';

export class AgentManager extends EventEmitter {
  private agents: Map<string, Agent> = new Map();

  constructor(
    private configManager: ConfigManager,
    private llmManager: LLMProviderManager,
    private pluginManager: PluginManager
  ) {
    super();
  }

  async initialize(): Promise<void> {
    Logger.info('Initializing Agent Manager...');

    // Load agents from SQLite
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM agents').all() as any[];

    for (const row of rows) {
      const agent: Agent = {
        id: row.id,
        name: row.name,
        description: row.description || '',
        model: row.model,
        systemPrompt: row.system_prompt,
        tools: JSON.parse(row.tools || '[]'),
        enabled: !!row.enabled,
        isDefault: !!row.is_default,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
      this.agents.set(agent.id, agent);
    }

    // Seed default agents if none exist
    if (this.agents.size === 0) {
      await this.createDefaultAgents();
    }

    Logger.info(`Initialized ${this.agents.size} agents`);
  }

  private async createDefaultAgents(): Promise<void> {
    const dailyReporterPrompt =
      (this.configManager.get('dailyReporterSystemPrompt') as string | undefined)?.trim() ||
      DEFAULT_DAILY_REPORTER_SYSTEM_PROMPT;

    const defaultAgents: AgentConfig[] = [
      {
        name: 'Code Assistant',
        description: 'Help with coding, debugging, and code reviews',
        model: 'gpt-4',
        systemPrompt: `You are a helpful coding assistant. You help users write, debug, and review code.
You have access to various tools including:
- Git operations
- File system operations
- Code analysis tools
- Documentation search

When appropriate, use these tools to help users more effectively.`,
        tools: ['git', 'file-system', 'code-analysis']
      },
      {
        name: 'Daily Reporter',
        description: 'Generate daily work reports from Git commits',
        model: 'gpt-4',
        systemPrompt: dailyReporterPrompt,
        tools: ['daily-report', 'git']
      },
      {
        name: 'Research Assistant',
        description: 'Help with research, documentation, and knowledge gathering',
        model: 'gpt-4',
        systemPrompt: `You are a research assistant. You help users gather information, research topics, and create documentation.
You have access to:
- Web search
- Documentation search
- Academic paper search (arXiv)
- Note-taking tools`,
        tools: ['web-search', 'arxiv', 'notes']
      }
    ];

    for (const config of defaultAgents) {
      await this.createAgent(config);
    }
  }

  async createAgent(config: AgentConfig): Promise<string> {
    const agent: Agent = {
      id: `agent-${randomUUID().slice(0, 8)}`,
      ...config,
      description: config.description ?? '',
      tools: config.tools ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.agents.set(agent.id, agent);

    // Save to SQLite
    const db = getDatabase();
    db.prepare(`
      INSERT INTO agents (id, name, description, model, system_prompt, tools, enabled, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(agent.id, agent.name, agent.description, agent.model, agent.systemPrompt, JSON.stringify(agent.tools), agent.enabled !== false ? 1 : 0, (agent as any).isDefault ? 1 : 0);

    this.emit('agent-created', agent);
    Logger.info(`Agent created: ${agent.name}`);

    return agent.id;
  }

  async chat(agentId: string, userMessage: string): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const db = getDatabase();

    // Save user message to DB
    db.prepare(`
      INSERT INTO chat_messages (agent_id, role, content) VALUES (?, 'user', ?)
    `).run(agentId, userMessage);

    // Load recent history from DB (last 10 messages)
    const rows = db.prepare(`
      SELECT role, content, timestamp FROM chat_messages
      WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 10
    `).all(agentId) as any[];
    const history: ChatMessage[] = rows.reverse().map(r => ({
      role: r.role,
      content: r.content,
      timestamp: r.timestamp
    }));

    const systemContent =
      agent.name === 'Daily Reporter'
        ? (this.configManager.get('dailyReporterSystemPrompt') as string | undefined)?.trim() ||
          agent.systemPrompt
        : agent.systemPrompt;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...history
    ];

    try {
      const providerId = this.llmManager.getDefaultProviderId();
      if (!providerId) {
        throw new Error('No LLM providers configured');
      }

      const response = await this.llmManager.chat(providerId, messages);

      // Save assistant response to DB
      db.prepare(`
        INSERT INTO chat_messages (agent_id, role, content) VALUES (?, 'assistant', ?)
      `).run(agentId, response);

      this.emit('agent-message', { agentId, message: { role: 'assistant', content: response, timestamp: new Date().toISOString() } });
      Logger.info(`Agent ${agent.name} responded`);

      return response;

    } catch (error) {
      Logger.error(`Agent ${agent.name} chat failed:`, error);
      throw error;
    }
  }

  listAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  async deleteAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);

      // Delete from SQLite (cascades to chat_messages)
      const db = getDatabase();
      db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);

      this.emit('agent-deleted', agentId);
      Logger.info(`Agent deleted: ${agent.name}`);
    }
  }

  async updateAgent(agentId: string, updates: Partial<Agent>): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      const updated = { ...agent, ...updates, updatedAt: new Date().toISOString() };
      this.agents.set(agentId, updated);

      // Update in SQLite
      const db = getDatabase();
      db.prepare(`
        UPDATE agents
        SET name = ?, description = ?, model = ?, system_prompt = ?, tools = ?, enabled = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(updated.name, updated.description, updated.model, updated.systemPrompt, JSON.stringify(updated.tools), updated.enabled !== false ? 1 : 0, agentId);

      this.emit('agent-updated', updated);
      Logger.info(`Agent updated: ${updated.name}`);
    }
  }

  getChatHistory(agentId: string): ChatMessage[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT role, content, timestamp FROM chat_messages
      WHERE agent_id = ? ORDER BY timestamp ASC
    `).all(agentId) as any[];
    return rows.map(r => ({
      role: r.role,
      content: r.content,
      timestamp: r.timestamp
    }));
  }

  clearChatHistory(agentId: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM chat_messages WHERE agent_id = ?').run(agentId);
    this.emit('chat-cleared', agentId);
    Logger.info(`Chat history cleared for agent: ${agentId}`);
  }

  // Conversation methods
  createConversation(): Conversation {
    const db = getDatabase();
    const id = `conv-${randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, 'New Conversation', datetime('now'), datetime('now'))
    `).run(id);
    const row = db.prepare('SELECT id, title, agent_id, created_at, updated_at FROM conversations WHERE id = ?').get(id) as any;
    return {
      id: row.id,
      title: row.title,
      agentId: row.agent_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  listConversations(): Conversation[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id, title, agent_id, created_at, updated_at FROM conversations
      ORDER BY updated_at DESC
    `).all() as any[];
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      agentId: r.agent_id || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  getConversationMessages(conversationId: string): ChatMessage[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT role, content, timestamp FROM chat_messages
      WHERE conversation_id = ? ORDER BY timestamp ASC LIMIT 100
    `).all(conversationId) as any[];
    return rows.map(r => ({
      role: r.role,
      content: r.content,
      timestamp: r.timestamp
    }));
  }

  deleteConversation(conversationId: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM chat_messages WHERE conversation_id = ?').run(conversationId);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId);
    Logger.info(`Conversation deleted: ${conversationId}`);
  }

  renameConversation(conversationId: string, title: string): void {
    const db = getDatabase();
    db.prepare("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, conversationId);
  }

  private buildConversationContext(conversationId: string, agentId: string, userMessage: string): ChatMessage[] {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const db = getDatabase();

    // Auto-generate title from first user message
    const existingMessages = db.prepare(
      'SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = ?'
    ).get(conversationId) as any;
    if (existingMessages.count === 0) {
      const title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
      db.prepare("UPDATE conversations SET title = ?, agent_id = ?, updated_at = datetime('now') WHERE id = ?")
        .run(title, agentId, conversationId);
    }

    // Save user message
    db.prepare(`
      INSERT INTO chat_messages (agent_id, role, content, conversation_id) VALUES (?, 'user', ?, ?)
    `).run(agentId, userMessage, conversationId);

    // Load recent history from DB (last 10 messages in this conversation)
    const rows = db.prepare(`
      SELECT role, content, timestamp FROM chat_messages
      WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT 10
    `).all(conversationId) as any[];
    const history: ChatMessage[] = rows.reverse().map(r => ({
      role: r.role,
      content: r.content,
      timestamp: r.timestamp
    }));

    const systemContent =
      agent.name === 'Daily Reporter'
        ? (this.configManager.get('dailyReporterSystemPrompt') as string | undefined)?.trim() ||
          agent.systemPrompt
        : agent.systemPrompt;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...history
    ];

    return messages;
  }

  async chatInConversation(conversationId: string, agentId: string, userMessage: string, model?: string): Promise<string> {
    const messages = this.buildConversationContext(conversationId, agentId, userMessage);
    const db = getDatabase();

    try {
      const providerId = this.llmManager.getDefaultProviderId();
      if (!providerId) {
        throw new Error('No LLM providers configured');
      }

      const response = await this.llmManager.chat(providerId, messages, model);

      // Save assistant response
      db.prepare(`
        INSERT INTO chat_messages (agent_id, role, content, conversation_id) VALUES (?, 'assistant', ?, ?)
      `).run(agentId, response, conversationId);

      // Bump conversation updated_at
      db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);

      return response;
    } catch (error) {
      Logger.error(`Conversation chat failed:`, error);
      throw error;
    }
  }

  async chatInConversationStream(
    conversationId: string,
    agentId: string,
    userMessage: string,
    model: string | undefined,
    webContents: Electron.WebContents
  ): Promise<void> {
    let messages: ChatMessage[];
    try {
      messages = this.buildConversationContext(conversationId, agentId, userMessage);
    } catch (error) {
      if (!webContents.isDestroyed()) {
        webContents.send(IPCChannels.CONVERSATION_STREAM_ERROR, {
          conversationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return;
    }

    const db = getDatabase();

    try {
      const providerId = this.llmManager.getDefaultProviderId();
      if (!providerId) {
        throw new Error('No LLM providers configured');
      }

      const result = await this.llmManager.chatStream(
        providerId,
        messages,
        model,
        // onChunk: push to renderer
        (text: string) => {
          if (!webContents.isDestroyed()) {
            webContents.send(IPCChannels.CONVERSATION_STREAM_CHUNK, {
              conversationId,
              content: text,
            });
          }
        },
        // onDebug: push debug event to renderer
        (event) => {
          if (!webContents.isDestroyed()) {
            webContents.send(IPCChannels.DEBUG_MODEL_CALL, event);
          }
        }
      );

      // Save assistant response
      db.prepare(`
        INSERT INTO chat_messages (agent_id, role, content, conversation_id) VALUES (?, 'assistant', ?, ?)
      `).run(agentId, result.fullContent, conversationId);

      // Bump conversation updated_at
      db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);

      // Send stream end
      if (!webContents.isDestroyed()) {
        webContents.send(IPCChannels.CONVERSATION_STREAM_END, {
          conversationId,
          fullContent: result.fullContent,
          usage: result.usage,
        });
      }

    } catch (error) {
      Logger.error(`Conversation streaming chat failed:`, error);
      if (!webContents.isDestroyed()) {
        webContents.send(IPCChannels.CONVERSATION_STREAM_ERROR, {
          conversationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }
}
