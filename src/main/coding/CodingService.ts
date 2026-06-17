import type { WebContents } from 'electron';
import { randomUUID } from 'crypto';
import { IPCChannels } from '../../shared/ipc-channels';
import { ChatMessage, ToolDefinition } from '../../shared/types';
import { LLMProviderManager } from '../llm/LLMProviderManager';
import { ExecutorService } from '../services/ExecutorService';
import { Logger } from '../utils/Logger';
import { CodingAgent, AgentLLM, CodingAgentCallbacks } from './CodingAgent';
import { CodingToolSet } from './CodingToolSet';

const DEFAULT_SYSTEM_PROMPT = `You are an autonomous coding agent operating inside a code workspace.
You can read, write, and edit files, run shell commands, and search the codebase. Work in small verifiable steps.
Prefer the edit_file tool for targeted changes. Always treat file paths as relative to the workspace.
When a task is done, briefly summarize what you changed.`;

/** 适配 LLMProviderManager → AgentLLM（每轮非流式返回 fullContent + toolCalls）。 */
class ProviderAgentLLM implements AgentLLM {
  constructor(
    private llmManager: LLMProviderManager,
    private providerId: string,
  ) {}

  async chat(messages: ChatMessage[], tools: ToolDefinition[], model: string) {
    const result = await this.llmManager.chatStreamWithTools(
      this.providerId,
      messages,
      model,
      tools.length > 0 ? tools : undefined,
      () => {
        // 忽略逐 token 流；CodingAgent 按轮发 onChunk
      },
      () => {},
      undefined,
    );
    return { fullContent: result.fullContent, toolCalls: result.toolCalls };
  }
}

interface CodingSession {
  id: string;
  workspace: string;
  model: string;
  agent: CodingAgent;
  abort?: AbortController;
}

/**
 * 管理 coding agent 会话生命周期；把 CodingAgent 的事件流转发到渲染进程。
 */
export class CodingService {
  private sessions: Map<string, CodingSession> = new Map();

  constructor(
    private llmManager: LLMProviderManager,
    private executorService: ExecutorService,
  ) {}

  create(workspace: string, model: string | undefined, systemPrompt?: string, maxTurns?: number): string {
    const providerId = this.llmManager.getDefaultProviderId();
    if (!providerId) {
      throw new Error('No LLM providers configured');
    }
    const provider = this.llmManager.listProviders().find((p) => p.id === providerId);
    const resolvedModel = model || provider?.models[0] || '';

    const llm = new ProviderAgentLLM(this.llmManager, providerId);
    const tools = new CodingToolSet(workspace, this.executorService);
    const agent = new CodingAgent(
      llm,
      tools,
      workspace,
      resolvedModel,
      systemPrompt || DEFAULT_SYSTEM_PROMPT,
      maxTurns ?? 25,
    );

    const id = `coding-${randomUUID().slice(0, 8)}`;
    this.sessions.set(id, { id, workspace, model: resolvedModel, agent });
    Logger.info(`Coding session created: ${id} (workspace=${workspace})`);
    return id;
  }

  list(): { id: string; workspace: string; model: string }[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      workspace: s.workspace,
      model: s.model,
    }));
  }

  dispose(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (s?.abort) s.abort.abort();
    this.sessions.delete(sessionId);
  }

  stop(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (s?.abort) s.abort.abort();
  }

  async handleSend(sessionId: string, prompt: string, webContents: WebContents): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      Logger.error(`Coding session not found: ${sessionId}`);
      return;
    }

    const abort = new AbortController();
    session.abort = abort;

    const send = (channel: string, data: any) => {
      if (!webContents.isDestroyed()) {
        webContents.send(channel, data);
      }
    };

    const callbacks: CodingAgentCallbacks = {
      onChunk: (text: string) => send(IPCChannels.CODING_STREAM_CHUNK, { sessionId, content: text }),
      onToolEvent: (event) => send(IPCChannels.CODING_STREAM_TOOL_EVENT, { sessionId, ...event }),
    };

    try {
      await session.agent.run(prompt, callbacks, abort.signal);
      send(IPCChannels.CODING_STREAM_END, { sessionId });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      Logger.error(`Coding session ${sessionId} error:`, error);
      send(IPCChannels.CODING_STREAM_ERROR, { sessionId, error: msg });
    } finally {
      if (session.abort === abort) session.abort = undefined;
    }
  }
}
