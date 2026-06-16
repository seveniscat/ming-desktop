import { ChatMessage } from '@shared/types';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: any;
}

export interface AnthropicSerialized {
  system: string;
  conversation: AnthropicMessage[];
}

/**
 * 把内部 ChatMessage[] 序列化为 Anthropic Messages API 格式。
 * system 抽离；assistant.toolCalls → tool_use block；user.toolResults → tool_result block。
 */
export function serializeAnthropicMessages(messages: ChatMessage[]): AnthropicSerialized {
  const system = messages.find((m) => m.role === 'system')?.content || '';
  const conversation: AnthropicMessage[] = [];

  for (const m of messages) {
    if (m.role === 'system') continue;

    if (m.role === 'user' && m.toolResults && m.toolResults.length > 0) {
      conversation.push({
        role: 'user',
        content: m.toolResults.map((tr) => ({
          type: 'tool_result',
          tool_use_id: tr.id,
          content: tr.result,
          is_error: tr.isError === true,
        })),
      });
      continue;
    }

    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      const blocks: any[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls) {
        let input: any = {};
        try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
      }
      conversation.push({ role: 'assistant', content: blocks });
      continue;
    }

    conversation.push({ role: m.role as 'user' | 'assistant', content: m.content });
  }

  return { system, conversation };
}
