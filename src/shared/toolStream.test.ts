import { describe, expect, it } from 'vitest';
import {
  applyToolStreamEventToMessages,
  applyToolStreamEventToRecords,
  parsePersistedToolCalls,
  upsertToolCallRecord,
  type ToolCallRecord,
} from './toolStream';

describe('applyToolStreamEventToRecords', () => {
  it('starts a running daily-report tool call', () => {
    const next = applyToolStreamEventToRecords([], {
      event: 'tool_start',
      toolName: 'daily-report',
      args: { timeRange: 'today' },
      timestamp: 1000,
    });

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'daily-report-1000',
      toolName: 'daily-report',
      status: 'running',
      args: { timeRange: 'today' },
      startedAt: 1000,
    });
    expect(next[0].argsText).toContain('today');
  });

  it('ignores context events used only for debug', () => {
    const next = applyToolStreamEventToRecords([], {
      event: 'context',
      timestamp: 1,
      args: { tools: ['daily-report'] },
    });
    expect(next).toEqual([]);
  });

  it('completes the matching running tool with result', () => {
    const started = applyToolStreamEventToRecords([], {
      event: 'tool_start',
      toolName: 'daily-report',
      args: { timeRange: 'today' },
      timestamp: 1000,
    });
    const completed = applyToolStreamEventToRecords(started, {
      event: 'tool_result',
      toolName: 'daily-report',
      result: '{"commits":[]}',
      duration: 42,
      timestamp: 1042,
    });

    expect(completed).toHaveLength(1);
    expect(completed[0].status).toBe('complete');
    expect(completed[0].result).toBe('{"commits":[]}');
    expect(completed[0].duration).toBe(42);
  });

  it('marks a running tool incomplete on error', () => {
    const started = applyToolStreamEventToRecords([], {
      event: 'tool_start',
      toolName: 'daily-report',
      timestamp: 1,
    });
    const failed = applyToolStreamEventToRecords(started, {
      event: 'tool_error',
      toolName: 'daily-report',
      error: 'python failed',
      timestamp: 2,
    });

    expect(failed[0].status).toBe('incomplete');
    expect(failed[0].error).toBe('python failed');
  });
});

describe('applyToolStreamEventToMessages', () => {
  it('attaches tool calls to the last assistant message', () => {
    const messages: Array<{
      role: 'user' | 'assistant';
      content: string;
      toolCalls?: ToolCallRecord[];
    }> = [
      { role: 'user', content: '生成今天的工作日报' },
      { role: 'assistant', content: '' },
    ];

    const withStart = applyToolStreamEventToMessages(messages, {
      event: 'tool_start',
      toolName: 'daily-report',
      args: { timeRange: 'today' },
      timestamp: 9,
    });

    expect(withStart[1].toolCalls).toHaveLength(1);
    expect(withStart[1].toolCalls?.[0].toolName).toBe('daily-report');
    expect(withStart[1].toolCalls?.[0].status).toBe('running');

    const withResult = applyToolStreamEventToMessages(withStart, {
      event: 'tool_result',
      toolName: 'daily-report',
      result: '{"commits":[{"repo":"ming-desktop"}]}',
      duration: 12,
      timestamp: 21,
    });

    expect(withResult[1].toolCalls?.[0].status).toBe('complete');
    expect(withResult[1].toolCalls?.[0].result).toContain('ming-desktop');
  });

  it('does not mutate messages when the last turn is the user', () => {
    const messages = [{ role: 'user' as const, content: 'hi' }];
    const next = applyToolStreamEventToMessages(messages, {
      event: 'tool_start',
      toolName: 'daily-report',
      timestamp: 1,
    });
    expect(next).toBe(messages);
  });
});

describe('parsePersistedToolCalls', () => {
  it('parses stored JSON records', () => {
    const records: ToolCallRecord[] = [
      { id: 'daily-report-1', toolName: 'daily-report', status: 'complete', result: '{}' },
    ];
    expect(parsePersistedToolCalls(JSON.stringify(records))).toEqual(records);
  });

  it('returns undefined for empty or invalid payloads', () => {
    expect(parsePersistedToolCalls(null)).toBeUndefined();
    expect(parsePersistedToolCalls('')).toBeUndefined();
    expect(parsePersistedToolCalls('not-json')).toBeUndefined();
    expect(parsePersistedToolCalls('[]')).toBeUndefined();
  });
});

describe('upsertToolCallRecord', () => {
  it('replaces a record with the same id', () => {
    const first: ToolCallRecord = { id: 't1', toolName: 'daily-report', status: 'running' };
    const updated = upsertToolCallRecord([first], { ...first, status: 'complete' });
    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe('complete');
  });
});
