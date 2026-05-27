import type { WebContents } from 'electron';
import { IPCChannels } from '../../shared/ipc-channels';
import type { DebugModelCall } from '../../shared/types';
import { ChatEngine, ChatRequest, ChatCallbacks, ToolStreamEvent } from './ChatEngine';
import { LLMProviderManager } from '../llm/LLMProviderManager';
import { ToolExecutor } from '../tools/ToolExecutor';
import { SkillManager } from '../skill/SkillManager';
import { AgentManager } from '../agent/AgentManager';
import { getDatabase } from '../database/connection';
import { MemoryManager } from '../services/MemoryManager';
import { Logger } from '../utils/Logger';

export class ChatService {
  private activeStreams: Map<string, AbortController> = new Map();
  private chatEngine: ChatEngine;

  constructor(
    private agentManager: AgentManager,
    private skillManager: SkillManager,
    llmManager: LLMProviderManager,
    toolExecutor: ToolExecutor,
    private memoryManager: MemoryManager,
    private recordDebugEvent?: (event: DebugModelCall, webContents?: WebContents) => void,
  ) {
    this.chatEngine = new ChatEngine(
      llmManager,
      toolExecutor,
      (id: string) => agentManager.getAgent(id),
      (ids: string[]) => {
        const allSkills = skillManager.listSkills();
        return allSkills.filter(s => ids.includes(s.id));
      },
      (conversationId: string, limit: number) => {
        const db = getDatabase();
        const rows = db.prepare(`
          SELECT role, content, timestamp FROM chat_messages
          WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?
        `).all(conversationId, limit) as any[];
        return rows.reverse().map(r => ({ role: r.role, content: r.content, timestamp: r.timestamp }));
      },
      (recentMessages: string[]) => memoryManager.formatMemoriesForPromptWithContext(recentMessages),
    );
  }

  async handleChat(
    conversationId: string,
    agentId: string | null,
    userMessage: string,
    model: string | undefined,
    webContents: WebContents,
    injectedSkills?: string[],
  ): Promise<void> {
    const db = getDatabase();

    const existingMessages = db.prepare(
      'SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = ?'
    ).get(conversationId) as any;
    if (existingMessages.count === 0) {
      const title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
      db.prepare("UPDATE conversations SET title = ?, agent_id = ?, updated_at = datetime('now') WHERE id = ?")
        .run(title, agentId || null, conversationId);
    }

    db.prepare(`
      INSERT INTO chat_messages (agent_id, role, content, conversation_id) VALUES (?, 'user', ?, ?)
    `).run(agentId || null, userMessage, conversationId);

    const abortController = new AbortController();
    this.activeStreams.set(conversationId, abortController);

    const send = (channel: string, data: any) => {
      if (!webContents.isDestroyed()) {
        webContents.send(channel, data);
      }
    };

    const callbacks: ChatCallbacks = {
      onChunk: (text: string) => {
        send(IPCChannels.CONVERSATION_STREAM_CHUNK, { conversationId, content: text });
      },
      onToolEvent: (event: ToolStreamEvent) => {
        send(IPCChannels.CONVERSATION_STREAM_TOOL_EVENT, { conversationId, ...event });
      },
      onDebug: (event) => {
        this.recordDebugEvent?.({ ...event, conversationId }, webContents);
      },
      onEnd: (result) => {
        db.prepare(`INSERT INTO chat_messages (agent_id, role, content, reasoning_content, conversation_id) VALUES (?, 'assistant', ?, ?, ?)`)
          .run(agentId || null, result.fullContent, result.reasoningContent || null, conversationId);
        db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);
        send(IPCChannels.CONVERSATION_STREAM_END, {
          conversationId, fullContent: result.fullContent, reasoningContent: result.reasoningContent, usage: result.usage,
        });
        this.activeStreams.delete(conversationId);
      },
      onError: (error: string) => {
        send(IPCChannels.CONVERSATION_STREAM_ERROR, { conversationId, error });
        this.activeStreams.delete(conversationId);
      },
    };

    try {
      const req: ChatRequest = {
        conversationId,
        userMessage,
        agentId: agentId || undefined,
        model,
        injectedSkills,
      };

      await this.chatEngine.chatStream(req, callbacks, abortController.signal);
    } catch (error) {
      Logger.error('ChatService error:', error);
      this.activeStreams.delete(conversationId);
    }
  }

  abortChat(conversationId: string): void {
    const controller = this.activeStreams.get(conversationId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(conversationId);
    }
  }
}
