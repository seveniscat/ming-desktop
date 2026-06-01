import { ChatMessage, Agent, Skill, ToolDefinition, ToolCall, DebugModelCall } from '../../shared/types';
import { LLMProviderManager } from '../llm/LLMProviderManager';
import { ToolExecutor } from '../tools/ToolExecutor';
import { Logger } from '../utils/Logger';

export interface ToolStreamEvent {
  event: 'tool_start' | 'tool_result' | 'tool_error' | 'context';
  toolName?: string;
  args?: Record<string, any>;
  result?: string;
  error?: string;
  duration?: number;
  timestamp: number;
  detail?: string;
}

export interface ChatRequest {
  conversationId: string;
  userMessage: string;
  agentId?: string;
  injectedSkills?: string[];
  model?: string;
}

export interface ChatResult {
  fullContent: string;
  reasoningContent?: string;
  toolRounds: number;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

export interface ChatCallbacks {
  onChunk: (text: string) => void;
  onToolEvent: (event: ToolStreamEvent) => void;
  onDebug: (event: DebugModelCall) => void;
  onEnd: (result: ChatResult) => void;
  onError: (error: string) => void;
}

const MAX_TOOL_ROUNDS = 5;
const DEFAULT_HISTORY_LIMIT = 20;

export class ChatEngine {
  constructor(
    private llmManager: LLMProviderManager,
    private toolExecutor: ToolExecutor,
    private loadAgent: (id: string) => Agent | undefined,
    private loadSkills: (ids: string[]) => Skill[],
    private loadHistory: (conversationId: string, limit: number) => ChatMessage[],
    private getMemoryPrompt: (recentMessages: string[]) => string,
  ) {}

  async chatStream(
    req: ChatRequest,
    callbacks: ChatCallbacks,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const { messages, toolDefs } = this.buildContext(req);

      callbacks.onToolEvent({
        event: 'context',
        timestamp: Date.now(),
        detail: messages[0]?.content || '',
        args: { tools: toolDefs.map(t => t.function.name), messageCount: messages.length },
      });

      const providerId = this.llmManager.getDefaultProviderId();
      if (!providerId) throw new Error('No LLM providers configured');

      const provider = this.llmManager.listProviders().find(p => p.id === providerId);
      const resolvedModel = req.model || provider?.models[0] || '';

      let fullContent = '';
      let reasoningContent = '';
      let toolRounds = 0;

      const isSdkProvider = provider?.type === 'claude-agent-sdk';

      if (isSdkProvider) {
        const result = await this.llmManager.chatStreamWithTools(
          providerId, messages, resolvedModel,
          undefined, callbacks.onChunk, callbacks.onDebug, signal,
          req.conversationId,
        );
        fullContent = result.fullContent;
        reasoningContent = result.reasoningContent || '';
        callbacks.onEnd({ fullContent, reasoningContent: reasoningContent || undefined, toolRounds: 0 });
        return;
      }

      while (toolRounds < MAX_TOOL_ROUNDS) {
        if (signal.aborted) break;

        const result = await this.llmManager.chatStreamWithTools(
          providerId,
          messages,
          resolvedModel,
          toolDefs.length > 0 ? toolDefs : undefined,
          callbacks.onChunk,
          callbacks.onDebug,
          signal,
        );

        fullContent += result.fullContent;
        if (result.reasoningContent) {
          reasoningContent += result.reasoningContent;
        }

        if (result.toolCalls.length === 0) break;

        const toolResults = await this.executeToolCalls(result.toolCalls, callbacks);
        messages.push({ role: 'assistant', content: result.fullContent || `[Calling tools: ${result.toolCalls.map(tc => tc.function.name).join(', ')}]` });
        for (const tr of toolResults) {
          messages.push({ role: 'user', content: `Tool ${tr.name} result:\n${tr.result}` });
        }

        toolRounds++;
      }

      callbacks.onEnd({ fullContent, reasoningContent: reasoningContent || undefined, toolRounds });
    } catch (error) {
      if (signal.aborted) {
        callbacks.onEnd({ fullContent: '', toolRounds: 0 });
        return;
      }
      const msg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('ChatEngine error:', error);
      callbacks.onError(msg);
    }
  }

  private buildContext(req: ChatRequest): { messages: ChatMessage[]; toolDefs: ToolDefinition[] } {
    const agent = req.agentId ? this.loadAgent(req.agentId) : undefined;

    let systemContent: string;
    const injectedSkills = req.injectedSkills?.length ? this.loadSkills(req.injectedSkills) : [];
    const agentSkills = !injectedSkills.length && agent?.skills?.length ? this.loadSkills(agent.skills) : [];
    const activeSkills = injectedSkills.length ? injectedSkills : agentSkills;

    if (agent) {
      systemContent = agent.systemPrompt;
      if (activeSkills.length > 0) {
        const prompts = this.getSkillPrompt
          ? activeSkills.map(s => this.getSkillPrompt!(s.id)).filter(Boolean)
          : activeSkills.map(s => s.prompt).filter(Boolean);
        if (prompts.length > 0) {
          systemContent += '\n\n' + prompts.join('\n\n');
        }
      }
    } else if (activeSkills.length > 0) {
      const prompts = this.getSkillPrompt
        ? activeSkills.map(s => this.getSkillPrompt!(s.id)).filter(Boolean)
        : activeSkills.map(s => s.prompt).filter(Boolean);
      systemContent = prompts.length > 0 ? prompts.join('\n\n') : 'You are a helpful assistant.';
    } else {
      systemContent = 'You are a helpful assistant.';
    }

    const history = this.loadHistory(req.conversationId, DEFAULT_HISTORY_LIMIT);

    const recentUserMessages = history
      .filter(m => m.role === 'user')
      .slice(-5)
      .map(m => m.content);
    const memoryPrompt = this.getMemoryPrompt(recentUserMessages);
    if (memoryPrompt) {
      systemContent += '\n' + memoryPrompt;
    }
    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...history,
    ];

    const toolDefs = agent
      ? this.toolExecutor.getToolsForAgent(agent.tools)
      : this.toolExecutor.getDefinitions();

    return { messages, toolDefs };
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
    callbacks: ChatCallbacks,
  ): Promise<{ name: string; result: string }[]> {
    const results: { name: string; result: string }[] = [];

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      let parsedArgs: Record<string, any>;
      try { parsedArgs = JSON.parse(toolCall.function.arguments); } catch { parsedArgs = {}; }

      const start = Date.now();
      callbacks.onToolEvent({ event: 'tool_start', toolName, args: parsedArgs, timestamp: start });

      try {
        const result = await this.toolExecutor.execute(toolCall);
        const duration = Date.now() - start;
        callbacks.onToolEvent({ event: 'tool_result', toolName, args: parsedArgs, result: result.slice(0, 2000), duration, timestamp: Date.now() });
        results.push({ name: toolName, result });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Tool execution failed';
        callbacks.onToolEvent({ event: 'tool_error', toolName, error: errMsg, timestamp: Date.now() });
        results.push({ name: toolName, result: `Error: ${errMsg}` });
      }
    }

    return results;
  }
}
}
