import type { ThreadMessageLike } from '@assistant-ui/react';
import type { Message, ToolCallRecord } from '../types';

let nextId = 1;

/**
 * Parse <think ...</think tags from content string (backward compat for old messages).
 * Returns extracted reasoning text and remaining content.
 */
function parseThinkTags(content: string): { reasoning?: string; text: string } {
  const match = content.match(/<think([\s\S]*?)<\/think>\n?/);
  if (!match) return { text: content };
  const reasoning = match[1].trim();
  const text = content.replace(/<think[\s\S]*?<\/think>\n?/g, '').trim();
  return { reasoning: reasoning || undefined, text };
}

/**
 * Convert a native Message to assistant-ui's ThreadMessageLike format.
 *
 * For assistant messages:
 * - Emits reasoning parts, tool-call parts, and text parts in order.
 * - Falls back to parsing <think tags from content for backward compatibility.
 */
export function toThreadMessageLike(msg: Message): ThreadMessageLike {
  if (msg.role === 'assistant') {
    const parts: ThreadMessageLike['content'] = [];

    let reasoning = msg.reasoningContent;
    let textContent = msg.content;

    // Backward compat: parse <think tags from old messages
    if (!reasoning && msg.content.includes('<think')) {
      const parsed = parseThinkTags(msg.content);
      reasoning = parsed.reasoning;
      textContent = parsed.text;
    }

    if (reasoning) {
      parts.push({ type: 'reasoning', text: reasoning });
    }

    // Add tool-call parts
    if (msg.toolCalls?.length) {
      for (const tc of msg.toolCalls) {
        parts.push({
          type: 'tool-call',
          toolName: tc.toolName,
          toolCallId: tc.id,
          argsText: tc.argsText || (tc.args ? JSON.stringify(tc.args, null, 2) : undefined),
          result: tc.result,
          status: { type: tc.status },
        } as any);
      }
    }

    if (textContent) {
      parts.push({ type: 'text', text: textContent });
    }

    return {
      role: 'assistant',
      content: parts,
      id: `msg-${nextId++}`,
      createdAt: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      status: msg.content === '' && !msg.toolCalls?.length ? { type: 'running' as const } : { type: 'complete' as const, reason: 'stop' as const },
    };
  }

  return {
    role: msg.role,
    content: msg.content
      ? [{ type: 'text' as const, text: msg.content }]
      : [],
    id: `msg-${nextId++}`,
    createdAt: msg.timestamp ? new Date(msg.timestamp) : new Date(),
  };
}

/**
 * Convert an array of native Messages to ThreadMessageLike[].
 */
export function toThreadMessageLikes(messages: Message[]): ThreadMessageLike[] {
  return messages.map(toThreadMessageLike);
}

/**
 * Create an empty assistant message (streaming placeholder).
 */
export function createEmptyAssistantMessage(): Message {
  return {
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Append streaming text to the last assistant message in the array.
 * Returns a new array (immutable update).
 */
export function appendStreamText(
  messages: Message[],
  text: string,
): Message[] {
  const updated = [...messages];
  const last = updated[updated.length - 1];
  if (last && last.role === 'assistant') {
    updated[updated.length - 1] = {
      ...last,
      content: last.content + text,
    };
  }
  return updated;
}

/**
 * Append an error to the last assistant message.
 * Returns a new array (immutable update).
 */
export function appendStreamError(
  messages: Message[],
  error: string,
): Message[] {
  const updated = [...messages];
  const last = updated[updated.length - 1];
  if (last && last.role === 'assistant') {
    updated[updated.length - 1] = {
      ...last,
      content: last.content
        ? `${last.content}\n\nError: ${error}`
        : `Error: ${error}`,
    };
  }
  return updated;
}

/**
 * Upsert a ToolCallRecord into the last assistant message's toolCalls array.
 * Returns a new array (immutable update).
 */
export function upsertToolCall(
  messages: Message[],
  record: ToolCallRecord,
): Message[] {
  const updated = [...messages];
  const last = updated[updated.length - 1];
  if (last && last.role === 'assistant') {
    const existing = last.toolCalls ?? [];
    const idx = existing.findIndex((tc) => tc.id === record.id);
    const toolCalls = [...existing];
    if (idx >= 0) {
      toolCalls[idx] = record;
    } else {
      toolCalls.push(record);
    }
    updated[updated.length - 1] = { ...last, toolCalls };
  }
  return updated;
}

/**
 * Convert a ThreadMessageLike back to our native Message format.
 */
export function fromThreadMessageLike(threadMsg: ThreadMessageLike): Message {
  let content = '';

  if (typeof threadMsg.content === 'string') {
    content = threadMsg.content;
  } else if (Array.isArray(threadMsg.content)) {
    for (const part of threadMsg.content) {
      if (part.type === 'text') {
        content += (part as { type: 'text'; text: string }).text;
      }
    }
  }

  return {
    role: threadMsg.role as 'user' | 'assistant',
    content,
    timestamp: threadMsg.createdAt?.toISOString(),
  };
}
