import type { ThreadMessageLike } from '@assistant-ui/react';
import type { Message } from '../types';

let nextId = 1;

/**
 * Convert a native Message to assistant-ui's ThreadMessageLike format.
 *
 * Our format: { role, content, timestamp? }
 * assistant-ui format: { role, content: TextMessagePart[] | string, id?, createdAt?, status? }
 */
export function toThreadMessageLike(msg: Message): ThreadMessageLike {
  return {
    role: msg.role,
    content: msg.content
      ? [{ type: 'text' as const, text: msg.content }]
      : [],
    id: `msg-${nextId++}`,
    createdAt: msg.timestamp ? new Date(msg.timestamp) : new Date(),
    status:
      msg.role === 'assistant' && msg.content === ''
        ? { type: 'running' }
        : { type: 'complete', reason: 'stop' as const },
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
