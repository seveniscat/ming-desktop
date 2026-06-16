import { ChatMessage } from '@shared/types';

/**
 * 把内部 ChatMessage[] 序列化为 OpenAI Chat Completions 的 messages 数组。
 * - assistant.toolCalls → message.tool_calls
 * - user.toolResults   → 多条 { role:'tool', tool_call_id, content }
 */
export function serializeOpenAIMessages(messages: ChatMessage[]): any[] {
  const out: any[] = [];
  for (const m of messages) {
    if (m.role === 'user' && m.toolResults && m.toolResults.length > 0) {
      for (const tr of m.toolResults) {
        out.push({ role: 'tool', tool_call_id: tr.id, content: tr.result });
      }
      continue;
    }
    const entry: any = { role: m.role, content: m.content };
    if (m.toolCalls && m.toolCalls.length > 0) {
      entry.tool_calls = m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
    }
    out.push(entry);
  }
  return out;
}
