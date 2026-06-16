import { describe, it, expect } from 'vitest';
import { serializeOpenAIMessages } from './serialize-openai';
import { ChatMessage } from '@shared/types';

describe('serializeOpenAIMessages', () => {
  it('maps plain messages to {role, content}', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ];
    expect(serializeOpenAIMessages(messages)).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('emits assistant tool_calls', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'thinking',
        toolCalls: [
          { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"file_path":"a.ts"}' } },
        ],
      },
    ];
    expect(serializeOpenAIMessages(messages)).toEqual([
      { role: 'assistant', content: 'thinking', tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"file_path":"a.ts"}' } },
      ] },
    ]);
  });

  it('emits tool role messages for toolResults', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: '',
        toolResults: [
          { id: 'call_1', name: 'read_file', result: 'file contents', isError: false },
          { id: 'call_2', name: 'edit_file', result: 'Error: not found', isError: true },
        ],
      },
    ];
    expect(serializeOpenAIMessages(messages)).toEqual([
      { role: 'tool', tool_call_id: 'call_1', content: 'file contents' },
      { role: 'tool', tool_call_id: 'call_2', content: 'Error: not found' },
    ]);
  });
});
