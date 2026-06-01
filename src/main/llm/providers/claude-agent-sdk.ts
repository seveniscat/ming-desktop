import { randomUUID } from 'crypto';
import { ChatMessage, ClaudeAgentSDKConfig } from '../../../shared/types';
import { ILLMProviderModule, ChatStreamResult, StreamWithToolsResult } from './types';

export class ClaudeAgentSDKModule implements ILLMProviderModule {
  private sdkSessions: Map<string, string> = new Map();

  createClient(): null {
    return null;
  }

  async chat(): Promise<string> {
    throw new Error('Claude Agent SDK does not support non-streaming chat');
  }

  async chatStream(): Promise<ChatStreamResult> {
    throw new Error('Use chatStreamSDK instead');
  }

  async chatStreamWithTools(): Promise<StreamWithToolsResult> {
    throw new Error('Use chatStreamSDK instead');
  }

  async chatStreamSDK(
    sdkConfig: ClaudeAgentSDKConfig,
    providerId: string,
    messages: ChatMessage[],
    model: string,
    onChunk: (text: string) => void,
    onDebug: (event: import('../../../shared/types').DebugModelCall) => void,
    signal?: AbortSignal,
    conversationId?: string,
    _onReasoningChunk?: (text: string) => void,
  ): Promise<{ fullContent: string; reasoningContent?: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }> {
    const callId = randomUUID().slice(0, 12);
    const startTime = Date.now();

    const systemContent = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role === 'user');

    const sessionKey = conversationId ? `${providerId}:${conversationId}` : '';
    const existingSessionId = sessionKey ? this.sdkSessions.get(sessionKey) : undefined;
    const isResuming = !!existingSessionId;

    const promptText = isResuming
      ? (userMessages[userMessages.length - 1]?.content || '')
      : userMessages.map(m => m.content).join('\n');

    onDebug({
      type: 'request',
      timestamp: Date.now(),
      callId,
      data: {
        provider: providerId,
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content.slice(0, 200) })),
        ...(isResuming && { sdkResumeSession: existingSessionId }),
      },
    });

    try {
      const options: any = {
        model,
        ...(!isResuming && systemContent && { systemPrompt: systemContent }),
        ...(sdkConfig.cwd && { cwd: sdkConfig.cwd }),
        ...(sdkConfig.permissionMode && { permissionMode: sdkConfig.permissionMode }),
        ...(sdkConfig.allowedTools && { allowedTools: sdkConfig.allowedTools }),
        ...(sdkConfig.maxTurns && { maxTurns: sdkConfig.maxTurns }),
        ...(isResuming && { resume: existingSessionId }),
        ...(!isResuming && sdkConfig.sessionId && { resume: sdkConfig.sessionId }),
        ...(sdkConfig.forkSessionId && { resume: sdkConfig.forkSessionId, forkSession: true }),
      };

      if (sdkConfig.mcpServers && Object.keys(sdkConfig.mcpServers).length > 0) {
        options.mcpServers = sdkConfig.mcpServers;
      }

      if (sdkConfig.agents && sdkConfig.agents.length > 0) {
        const agentMap: Record<string, any> = {};
        for (const agent of sdkConfig.agents) {
          agentMap[agent.name] = {
            description: agent.description,
            ...(agent.prompt && { prompt: agent.prompt }),
            ...(agent.model && { model: agent.model }),
          };
        }
        options.agents = agentMap;
      }

      const sdkModule = require('@anthropic-ai/claude-agent-sdk') as any;
      const q = sdkModule.query({ prompt: promptText, options });

      let fullContent = '';

      for await (const message of q) {
        if (signal?.aborted) break;

        const sid = (message as any).session_id;
        if (sid && sessionKey) {
          this.sdkSessions.set(sessionKey, sid);
        }

        if (message.type === 'assistant') {
          const betaMessage = (message as any).message;
          if (betaMessage?.content) {
            const text = betaMessage.content
              .filter((block: any) => block.type === 'text')
              .map((block: any) => block.text)
              .join('');
            if (text) {
              fullContent += text;
              onChunk(text);
            }
          }
        } else if (message.type === 'result') {
          const resultMsg = message as any;
          if (resultMsg.usage) {
            onDebug({
              type: 'response',
              timestamp: Date.now(),
              callId,
              data: {
                provider: providerId,
                model,
                usage: {
                  promptTokens: resultMsg.usage.input_tokens,
                  completionTokens: resultMsg.usage.output_tokens,
                  totalTokens: (resultMsg.usage.input_tokens || 0) + (resultMsg.usage.output_tokens || 0),
                },
                duration: Date.now() - startTime,
              },
            });
          }
        } else {
          onDebug({
            type: 'tool',
            timestamp: Date.now(),
            callId,
            data: {
              provider: providerId,
              model,
              sdkEvent: message.type,
              sdkEventData: JSON.stringify(message).slice(0, 500),
            },
          });
        }
      }

      if (!fullContent) {
        fullContent = '[SDK completed with no text output]';
      }

      return { fullContent };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      onDebug({
        type: 'error',
        timestamp: Date.now(),
        callId,
        data: { provider: providerId, model, error: errorMsg, duration: Date.now() - startTime },
      });
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      require('@anthropic-ai/claude-agent-sdk');
      return { success: true, message: 'Claude Agent SDK is available' };
    } catch {
      return { success: false, message: 'Claude Agent SDK module not found' };
    }
  }
}