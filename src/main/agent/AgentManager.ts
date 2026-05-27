import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { Agent, AgentConfig, ChatMessage, Conversation, Skill } from '../../shared/types';
import { Logger } from '../utils/Logger';
import { LLMProviderManager } from '../llm/LLMProviderManager';
import { ToolExecutor } from '../tools/ToolExecutor';
import { ConfigManager } from '../services/ConfigManager';
import { getDatabase } from '../database/connection';

export class AgentManager extends EventEmitter {
  private agents: Map<string, Agent> = new Map();

  constructor(
    private configManager: ConfigManager,
    private llmManager: LLMProviderManager,
    private toolExecutor: ToolExecutor,
    private getEnabledSkills: () => Skill[],
    private recordDebugEvent?: (event: import('../../shared/types').DebugModelCall, webContents?: Electron.WebContents) => void
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
        systemPrompt: this.normalizeText(row.system_prompt),
        tools: JSON.parse(row.tools || '[]'),
        skills: JSON.parse(row.skills || '[]'),
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

  private normalizeText(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (Buffer.isBuffer(value)) {
      return value.toString('utf-8');
    }

    return value == null ? '' : String(value);
  }

  private async createDefaultAgents(): Promise<void> {
    const defaultAgents: AgentConfig[] = [
      {
        name: 'Code Assistant',
        description: 'Help with coding, debugging, and code reviews',
        model: '',
        systemPrompt: `You are a helpful coding assistant. You help users write, debug, and review code.`,
        tools: []
      },
      {
        name: 'Research Assistant',
        description: 'Help with research, documentation, and knowledge gathering',
        model: '',
        systemPrompt: `You are a research assistant. You help users gather information, research topics, and create documentation.`,
        tools: []
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
      skills: config.skills ?? [],
      enabled: true,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.agents.set(agent.id, agent);

    // Save to SQLite
    const db = getDatabase();
    db.prepare(`
      INSERT INTO agents (id, name, description, model, system_prompt, tools, skills, enabled, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agent.id,
      agent.name,
      agent.description,
      agent.model,
      agent.systemPrompt,
      JSON.stringify(agent.tools),
      JSON.stringify(agent.skills),
      agent.enabled !== false ? 1 : 0,
      (agent as any).isDefault ? 1 : 0
    );

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

    const systemContent = this.buildSystemContent(agent);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...history
    ];

    try {
      const providerId = this.llmManager.getDefaultProviderId();
      if (!providerId) {
        throw new Error('No LLM providers configured');
      }

      const provider = this.llmManager.listProviders().find((item) => item.id === providerId);
      const startedAt = Date.now();
      this.recordDebugEvent?.({
        type: 'request',
        timestamp: startedAt,
        data: {
          provider: provider?.name,
          model: provider?.models[0],
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        },
      });

      const response = this.ensureTextResponse(await this.llmManager.chat(providerId, messages));
      this.recordDebugEvent?.({
        type: 'response',
        timestamp: Date.now(),
        data: {
          provider: provider?.name,
          model: provider?.models[0],
          content: response.slice(0, 200) + (response.length > 200 ? '...' : ''),
          duration: Date.now() - startedAt,
        },
      });

      // Save assistant response to DB
      db.prepare(`
        INSERT INTO chat_messages (agent_id, role, content, reasoning_content) VALUES (?, 'assistant', ?, NULL)
      `).run(agentId, response);

      this.emit('agent-message', { agentId, message: { role: 'assistant', content: response, timestamp: new Date().toISOString() } });
      Logger.info(`Agent ${agent.name} responded`);

      return response;

    } catch (error) {
      this.recordDebugEvent?.({
        type: 'error',
        timestamp: Date.now(),
        data: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
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
      const updated = {
        ...agent,
        ...updates,
        tools: updates.tools ?? agent.tools,
        skills: updates.skills ?? agent.skills,
        updatedAt: new Date().toISOString(),
      };
      this.agents.set(agentId, updated);

      // Update in SQLite
      const db = getDatabase();
      db.prepare(`
        UPDATE agents
        SET name = ?, description = ?, model = ?, system_prompt = ?, tools = ?, skills = ?, enabled = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        updated.name,
        updated.description,
        updated.model,
        updated.systemPrompt,
        JSON.stringify(updated.tools),
        JSON.stringify(updated.skills),
        updated.enabled !== false ? 1 : 0,
        agentId
      );

      this.emit('agent-updated', updated);
      Logger.info(`Agent updated: ${updated.name}`);
    }
  }

  getChatHistory(agentId: string): (ChatMessage & { reasoning_content?: string })[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT role, content, reasoning_content, timestamp FROM chat_messages
      WHERE agent_id = ? ORDER BY timestamp ASC
    `).all(agentId) as any[];
    return rows.map(r => ({
      role: r.role,
      content: r.content,
      reasoning_content: r.reasoning_content || undefined,
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

  getConversationMessages(conversationId: string): (ChatMessage & { reasoning_content?: string })[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT role, content, reasoning_content, timestamp FROM chat_messages
      WHERE conversation_id = ? ORDER BY timestamp ASC LIMIT 100
    `).all(conversationId) as any[];
    return rows.map(r => ({
      role: r.role,
      content: r.content,
      reasoning_content: r.reasoning_content || undefined,
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

  private buildSystemContent(agent: Agent): string {
    const selectedSkills = this.getEnabledSkills().filter((skill) => agent.skills.includes(skill.id));
    if (selectedSkills.length === 0) {
      return agent.systemPrompt;
    }

    const skillContent = selectedSkills
      .map((skill) => `Skill: ${skill.name}\n${skill.prompt}`)
      .join('\n\n');

    return `${agent.systemPrompt}\n\nEnabled skills:\n${skillContent}`;
  }

  private ensureTextResponse(response: string | { toolCalls: import('../../shared/types').ToolCall[] }): string {
    if (typeof response === 'string') {
      return response;
    }

    throw new Error('Unexpected tool call response in non-tool chat flow');
  }
}
