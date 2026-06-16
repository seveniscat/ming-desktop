import { ChatMessage, ToolDefinition, ToolCall, CodingToolResult } from '@shared/types';
import { ToolContext } from '../tools/tool-types';

/** LLM 客户端抽象：接收消息+工具定义，返回本轮文本与工具调用。注入式，便于 fake。 */
export interface AgentLLM {
  chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    model: string,
  ): Promise<{ fullContent: string; toolCalls?: ToolCall[] }>;
}

/** 工具运行时抽象：列出定义 + 执行单个工具。注入式。 */
export interface ToolRuntime {
  getDefinitions(): ToolDefinition[];
  execute(name: string, params: Record<string, any>, ctx: ToolContext): Promise<string>;
}

export type CodingToolEvent =
  | { event: 'tool_start'; name: string; args: Record<string, any>; timestamp: number }
  | { event: 'tool_result'; name: string; result: string; isError?: boolean; duration?: number; timestamp: number }
  | { event: 'max_turns'; timestamp: number };

export interface CodingAgentCallbacks {
  onChunk: (text: string) => void;
  onToolEvent: (event: CodingToolEvent) => void;
  onTurnEnd?: (turn: number) => void;
}

export interface CodingRunResult {
  fullContent: string;
  turns: number;
}

function safeParse(s: string): Record<string, any> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/**
 * 模型无关的 agentic loop。
 * - 每轮：LLM 返回文本+toolCalls → 执行工具 → 结构化回填 toolResults → 下一轮
 * - 无 toolCalls 即结束；撞 maxTurns 发 max_turns 事件；signal 中止即停
 * - 工具抛错：作为 isError toolResult 回填，loop 继续（模型可自我纠错）
 */
export class CodingAgent {
  constructor(
    private llm: AgentLLM,
    private tools: ToolRuntime,
    private workspace: string,
    private model: string,
    private systemPrompt: string,
    private maxTurns: number = 25,
  ) {}

  async run(
    userPrompt: string,
    callbacks: CodingAgentCallbacks,
    signal?: AbortSignal,
  ): Promise<CodingRunResult> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    const ctx: ToolContext = { workspace: this.workspace, signal, permissionMode: 'ask' };
    let fullContent = '';

    let turn = 0;
    for (; turn < this.maxTurns; turn++) {
      if (signal?.aborted) break;

      const result = await this.llm.chat(messages, this.tools.getDefinitions(), this.model);
      if (result.fullContent) {
        fullContent += result.fullContent;
        callbacks.onChunk(result.fullContent);
      }

      const toolCalls = result.toolCalls ?? [];
      if (toolCalls.length === 0) {
        messages.push({ role: 'assistant', content: result.fullContent });
        callbacks.onTurnEnd?.(turn);
        return { fullContent, turns: turn + 1 };
      }

      messages.push({ role: 'assistant', content: result.fullContent, toolCalls });

      const toolResults: CodingToolResult[] = [];
      for (const tc of toolCalls) {
        const params = safeParse(tc.function.arguments);
        const start = Date.now();
        callbacks.onToolEvent({ event: 'tool_start', name: tc.function.name, args: params, timestamp: start });

        let resultStr: string;
        let isError = false;
        try {
          resultStr = await this.tools.execute(tc.function.name, params, ctx);
        } catch (e) {
          resultStr = `Error: ${e instanceof Error ? e.message : String(e)}`;
          isError = true;
        }

        callbacks.onToolEvent({
          event: 'tool_result',
          name: tc.function.name,
          result: resultStr,
          isError,
          duration: Date.now() - start,
          timestamp: Date.now(),
        });
        toolResults.push({ id: tc.id, name: tc.function.name, result: resultStr, isError });
      }

      messages.push({ role: 'user', content: '', toolResults });
      callbacks.onTurnEnd?.(turn);
    }

    if (turn >= this.maxTurns && !signal?.aborted) {
      callbacks.onToolEvent({ event: 'max_turns', timestamp: Date.now() });
    }
    return { fullContent, turns: turn };
  }
}
