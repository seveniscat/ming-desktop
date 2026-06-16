import { describe, it, expect } from 'vitest';
import { serializeAnthropicMessages } from './serialize-anthropic';
import { ChatMessage } from '@shared/types';

describe('serializeAnthropicMessages', () => {
  it('splits system out and maps plain content', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ];
    const { system, conversation } = serializeAnthropicMessages(messages);
    expect(system).toBe('sys');
    expect(conversation).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('emits assistant tool_use blocks', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'thinking',
        toolCalls: [
          { id: 'toolu_1', type: 'function', function: { name: 'read_file', arguments: '{"file_path":"a"}' } },
        ],
      },
    ];
    const { conversation } = serializeAnthropicMessages(messages);
    expect(conversation).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'thinking' },
          { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { file_path: 'a' } },
        ],
      },
    ]);
  });

  it('emits a user message with tool_result blocks', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: '',
        toolResults: [
          { id: 'toolu_1', name: 'read_file', result: 'contents' },
          { id: 'toolu_2', name: 'edit_file', result: 'boom', isError: true },
        ],
      },
    ];
    const { conversation } = serializeAnthropicMessages(messages);
    expect(conversation).toEqual([
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_1', content: 'contents', is_error: false },
          { type: 'tool_result', tool_use_id: 'toolu_2', content: 'boom', is_error: true },
        ],
      },
    ]);
  });
});
